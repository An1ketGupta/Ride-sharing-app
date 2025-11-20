import { prisma } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';
import crypto from 'crypto';
import { getRazorpay } from '../utils/razorpay.js';

// @desc    Create payment for booking
// @route   POST /api/payment/confirm
// @access  Private
export const confirmPayment = async (req, res) => {
    try {
        const { booking_id, payment_method } = req.body;
        const user_id = req.user.id;

        // Get booking details
        const booking = await prisma.booking.findFirst({
            where: {
                bookingId: parseInt(booking_id),
                passengerId: parseInt(user_id)
            }
        });

        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // Check if payment already exists
        const existingPayments = await prisma.payment.findMany({
            where: { bookingId: parseInt(booking_id) }
        });

        if (existingPayments.length > 0 && existingPayments[0].paymentStatus === 'completed') {
            return errorResponse(res, 400, 'Payment already completed for this booking');
        }

        // Generate transaction ID
        const transaction_id = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // If payment method is wallet, deduct from wallet balance
        if (payment_method === 'wallet') {
            // Get wallet balance
            const wallet = await prisma.wallet.findUnique({
                where: { userId: parseInt(user_id) },
                select: { balance: true }
            });
            
            const walletBalance = wallet ? Number(wallet.balance) : 0;
            
            if (walletBalance < Number(booking.amount)) {
                return errorResponse(res, 400, 'Insufficient wallet balance');
            }
            
            // Deduct from wallet and create transaction
            await prisma.$transaction(async (tx) => {
                // Ensure wallet exists
                await tx.wallet.upsert({
                    where: { userId: parseInt(user_id) },
                    update: {},
                    create: {
                        userId: parseInt(user_id),
                        balance: 0
                    }
                });
                
                // Deduct amount
                await tx.wallet.update({
                    where: { userId: parseInt(user_id) },
                    data: {
                        balance: {
                            decrement: Number(booking.amount)
                        }
                    }
                });
                
                // Record transaction
                await tx.walletTransaction.create({
                    data: {
                        userId: parseInt(user_id),
                        amount: Number(booking.amount),
                        type: 'debit'
                    }
                });
            });
        }

        // Create payment and update booking in transaction
        await prisma.$transaction(async (tx) => {
            // Create payment
            await tx.payment.create({
                data: {
                    bookingId: parseInt(booking_id),
                    amount: Number(booking.amount),
                    paymentMethod: payment_method,
                    paymentStatus: 'completed',
                    transactionId: transaction_id
                }
            });

            // Attempt to move booking to confirmed (idempotent)
            const updatedBooking = await tx.booking.updateMany({
                where: {
                    bookingId: parseInt(booking_id),
                    bookingStatus: 'pending'
                },
                data: {
                    bookingStatus: 'confirmed'
                }
            });

            if (updatedBooking.count > 0) {
                // Decrement seats
                await tx.ride.update({
                    where: { rideId: booking.rideId },
                    data: {
                        availableSeats: {
                            decrement: booking.seatsBooked
                        }
                    }
                });
            }
        });

        // Get created payment
        const newPayment = await prisma.payment.findFirst({
            where: { bookingId: parseInt(booking_id) },
            orderBy: { paymentId: 'desc' }
        });

        // Notify driver that payment was successful
        try {
            const bookingDetails = await prisma.booking.findUnique({
                where: { bookingId: parseInt(booking_id) },
                include: {
                    ride: {
                        select: {
                            driverId: true
                        }
                    }
                }
            });
            
            if (bookingDetails) {
                const { sendNotification } = await import('../utils/notifications.js');
                const { getIO, getSocketIdForUser } = await import('../utils/socketRegistry.js');
                
                // Send notification to driver
                await sendNotification(
                    bookingDetails.ride.driverId,
                    `✅ Payment received: ₹${bookingDetails.amount} for ${bookingDetails.seatsBooked} seat(s) - Booking #${booking_id}`
                );
                
                // Also emit socket event to driver
                const io = getIO();
                if (io) {
                    const driverSocketId = getSocketIdForUser(bookingDetails.ride.driverId);
                    if (driverSocketId) {
                        io.to(driverSocketId).emit('payment_received', {
                            booking_id: booking_id,
                            amount: bookingDetails.amount,
                            seats_booked: bookingDetails.seatsBooked,
                            passenger_id: bookingDetails.passengerId
                        });
                    }
                }
            }
        } catch (notifError) {
            console.error('Error sending payment notification to driver:', notifError);
            // Don't fail payment if notification fails
        }

        return successResponse(res, 201, 'Payment processed successfully', {
            payment_id: newPayment.paymentId,
            booking_id: newPayment.bookingId,
            amount: newPayment.amount,
            payment_method: newPayment.paymentMethod,
            payment_status: newPayment.paymentStatus,
            transaction_id: newPayment.transactionId,
            payment_date: newPayment.paymentDate
        });

    } catch (error) {
        console.error('Confirm payment error:', error);
        return errorResponse(res, 500, 'Server error while processing payment');
    }
};

// @desc    Initialize cash payment (pay after ride)
// @route   POST /api/payment/cash-init
// @access  Private (Passenger)
export const cashInit = async (req, res) => {
    try {
        const { booking_id } = req.body || {};
        const user_id = req.user.id;

        if (!booking_id) {
            return errorResponse(res, 400, 'booking_id is required');
        }

        // Ensure booking belongs to passenger
        const booking = await prisma.booking.findFirst({
            where: {
                bookingId: parseInt(booking_id),
                passengerId: parseInt(user_id)
            }
        });
        
        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // See if a pending payment exists
        const existing = await prisma.payment.findFirst({
            where: { bookingId: parseInt(booking_id) },
            orderBy: { paymentId: 'desc' }
        });
        
        if (existing && existing.paymentStatus === 'pending') {
            return successResponse(res, 200, 'Cash payment already initialized', {
                payment_id: existing.paymentId,
                booking_id: existing.bookingId,
                amount: existing.amount,
                payment_method: existing.paymentMethod,
                payment_status: existing.paymentStatus,
                transaction_id: existing.transactionId,
                payment_date: existing.paymentDate
            });
        }

        // Create payment and update booking in transaction
        await prisma.$transaction(async (tx) => {
            // Create a pending payment row for cash
            await tx.payment.create({
                data: {
                    bookingId: parseInt(booking_id),
                    amount: Number(booking.amount),
                    paymentMethod: 'cash',
                    paymentStatus: 'pending',
                    transactionId: null
                }
            });

            // UPDATE bookings to confirmed if currently pending (idempotent)
            const updated = await tx.booking.updateMany({
                where: {
                    bookingId: parseInt(booking_id),
                    bookingStatus: 'pending'
                },
                data: {
                    bookingStatus: 'confirmed'
                }
            });
            
            if (updated.count > 0) {
                // Decrement seats
                await tx.ride.update({
                    where: { rideId: booking.rideId },
                    data: {
                        availableSeats: {
                            decrement: booking.seatsBooked
                        }
                    }
                });
            }
        });

        const newPayment = await prisma.payment.findFirst({
            where: { bookingId: parseInt(booking_id) },
            orderBy: { paymentId: 'desc' }
        });
        
        return successResponse(res, 201, 'Cash payment initialized and booking confirmed', {
            payment_id: newPayment.paymentId,
            booking_id: newPayment.bookingId,
            amount: newPayment.amount,
            payment_method: newPayment.paymentMethod,
            payment_status: newPayment.paymentStatus,
            transaction_id: newPayment.transactionId,
            payment_date: newPayment.paymentDate
        });
    } catch (error) {
        console.error('Cash init error:', error);
        return errorResponse(res, 500, 'Server error while initializing cash payment');
    }
};

// @desc    Complete cash payment after ride
// @route   PUT /api/payment/:paymentId/complete
// @access  Private (Passenger or Driver - depending on policy)
export const completeCashPayment = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const user_id = req.user.id;

        // Ensure payment belongs to a booking owned by the passenger
        const payment = await prisma.payment.findUnique({
            where: { paymentId: parseInt(paymentId) },
            include: {
                booking: {
                    select: {
                        passengerId: true,
                        bookingStatus: true,
                        seatsBooked: true,
                        rideId: true
                    }
                }
            }
        });
        
        if (!payment) {
            return errorResponse(res, 404, 'Payment not found');
        }

        if (Number(payment.booking.passengerId) !== Number(user_id)) {
            return errorResponse(res, 403, 'Unauthorized to complete this payment');
        }

        if (payment.paymentStatus === 'completed') {
            return successResponse(res, 200, 'Payment already completed', {
                payment_id: payment.paymentId,
                booking_id: payment.bookingId,
                amount: payment.amount,
                payment_method: payment.paymentMethod,
                payment_status: payment.paymentStatus,
                transaction_id: payment.transactionId,
                payment_date: payment.paymentDate
            });
        }

        const transaction_id = `CASH${Date.now()}`;
        
        // Update payment and booking in transaction
        await prisma.$transaction(async (tx) => {
            // Update payment
            await tx.payment.update({
                where: { paymentId: parseInt(paymentId) },
                data: {
                    paymentStatus: 'completed',
                    transactionId: transaction_id
                }
            });

            // Confirm booking and decrement seats if needed
            if (payment.booking.bookingStatus === 'pending') {
                await tx.booking.updateMany({
                    where: {
                        bookingId: payment.bookingId,
                        bookingStatus: 'pending'
                    },
                    data: {
                        bookingStatus: 'confirmed'
                    }
                });
                
                await tx.ride.update({
                    where: { rideId: payment.booking.rideId },
                    data: {
                        availableSeats: {
                            decrement: payment.booking.seatsBooked
                        }
                    }
                });
            }
        });

        const updated = await prisma.payment.findUnique({
            where: { paymentId: parseInt(paymentId) }
        });
        
        return successResponse(res, 200, 'Cash payment completed', {
            payment_id: updated.paymentId,
            booking_id: updated.bookingId,
            amount: updated.amount,
            payment_method: updated.paymentMethod,
            payment_status: updated.paymentStatus,
            transaction_id: updated.transactionId,
            payment_date: updated.paymentDate
        });
    } catch (error) {
        console.error('Complete cash payment error:', error);
        return errorResponse(res, 500, 'Server error while completing cash payment');
    }
};

// @desc    Get payment by booking ID
// @route   GET /api/payment/booking/:bookingId
// @access  Private
export const getPaymentByBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const user_id = req.user.id;

        // Check if booking belongs to user
        const booking = await prisma.booking.findFirst({
            where: {
                bookingId: parseInt(bookingId),
                passengerId: parseInt(user_id)
            }
        });

        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // Get payment
        const payment = await prisma.payment.findFirst({
            where: { bookingId: parseInt(bookingId) },
            orderBy: { paymentId: 'desc' }
        });

        if (!payment) {
            return errorResponse(res, 404, 'Payment not found');
        }

        return successResponse(res, 200, 'Payment retrieved successfully', {
            payment_id: payment.paymentId,
            booking_id: payment.bookingId,
            amount: payment.amount,
            booking_amount: Number(booking.amount),
            payment_method: payment.paymentMethod,
            payment_status: payment.paymentStatus,
            transaction_id: payment.transactionId,
            payment_date: payment.paymentDate
        });

    } catch (error) {
        console.error('Get payment error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Get all payments for user
// @route   GET /api/payment/my
// @access  Private
export const getMyPayments = async (req, res) => {
    try {
        const user_id = req.user.id;

        const payments = await prisma.payment.findMany({
            where: {
                booking: {
                    passengerId: parseInt(user_id)
                }
            },
            include: {
                booking: {
                    include: {
                        ride: {
                            select: {
                                source: true,
                                destination: true,
                                date: true,
                                time: true
                            }
                        }
                    }
                }
            },
            orderBy: { paymentDate: 'desc' }
        });

        return successResponse(res, 200, 'Payments retrieved successfully', 
            payments.map(p => ({
                payment_id: p.paymentId,
                booking_id: p.bookingId,
                seats_booked: p.booking.seatsBooked,
                amount: p.amount,
                payment_method: p.paymentMethod,
                payment_status: p.paymentStatus,
                transaction_id: p.transactionId,
                payment_date: p.paymentDate,
                source: p.booking.ride.source,
                destination: p.booking.ride.destination,
                date: p.booking.ride.date,
                time: p.booking.ride.time
            }))
        );

    } catch (error) {
        console.error('Get my payments error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// Wallet - Razorpay Integration
// @route   POST /api/payment/wallet/topup
// @desc    Create Razorpay order for wallet topup
export const walletTopup = async (req, res) => {
    try {
        const user_id = req.user.id;
        const { amount } = req.body || {};
        const amt = Math.max(0, Number(amount || 0));
        
        if (!amt) return errorResponse(res, 400, 'Invalid amount');
        if (amt < 10) return errorResponse(res, 400, 'Minimum topup amount is ₹10');
        
        // Create Razorpay order (amount in paise)
        const amountPaise = Math.round(amt * 100);
        const receipt = `wallet_topup_${user_id}_${Date.now()}`;
        
        const order = await getRazorpay().orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt,
            notes: {
                user_id: String(user_id),
                purpose: 'wallet_topup'
            }
        });
        
        return successResponse(res, 201, 'Razorpay order created for wallet topup', {
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key: process.env.RAZORPAY_ID_KEY
        });
    } catch (error) {
        console.error('Wallet topup order error:', error);
        // Check if it's a Razorpay configuration error
        if (error.message && error.message.includes('Razorpay keys missing')) {
            return errorResponse(res, 503, 'Payment service is not configured. Please contact support.');
        }
        return errorResponse(res, 500, 'Failed to create wallet topup order');
    }
};

// @route   POST /api/payment/wallet/verify
// @desc    Verify Razorpay payment and credit wallet
export const verifyWalletTopup = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body || {};
        const user_id = req.user.id;
        
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
            return errorResponse(res, 400, 'Missing verification parameters');
        }
        
        // Check if Razorpay is configured
        if (!process.env.RAZORPAY_SECRET_KEY) {
            return errorResponse(res, 503, 'Payment service is not configured. Please contact support.');
        }
        
        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_SECRET_KEY);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const expected = hmac.digest('hex');
        const isValid = expected === razorpay_signature;
        
        if (!isValid) {
            return errorResponse(res, 400, 'Invalid payment signature');
        }
        
        const amt = Math.max(0, Number(amount || 0));
        if (!amt) return errorResponse(res, 400, 'Invalid amount');
        
        // Credit wallet
        await prisma.$transaction(async (tx) => {
            await tx.wallet.upsert({
                where: { userId: parseInt(user_id) },
                update: {
                    balance: {
                        increment: amt
                    }
                },
                create: {
                    userId: parseInt(user_id),
                    balance: amt
                }
            });
            
            await tx.walletTransaction.create({
                data: {
                    userId: parseInt(user_id),
                    amount: amt,
                    type: 'topup'
                }
            });
        });
        
        // Get updated wallet balance
        const wallet = await prisma.wallet.findUnique({
            where: { userId: parseInt(user_id) },
            select: { balance: true }
        });
        
        return successResponse(res, 200, 'Wallet topped up successfully', {
            amount: amt,
            balance: wallet ? Number(wallet.balance) : 0,
            transaction_id: razorpay_payment_id
        });
    } catch (error) {
        console.error('Verify wallet topup error:', error);
        // Check if it's a Razorpay configuration error
        if (error.message && error.message.includes('Razorpay keys missing')) {
            return errorResponse(res, 503, 'Payment service is not configured. Please contact support.');
        }
        return errorResponse(res, 500, 'Failed to verify wallet topup');
    }
};

// @route   POST /api/payment/wallet/refund
export const walletRefund = async (req, res) => {
    try {
        const user_id = req.user.id;
        const { amount } = req.body || {};
        const amt = Math.max(0, Number(amount || 0));
        if (!amt) return errorResponse(res, 400, 'Invalid amount');
        
        await prisma.$transaction(async (tx) => {
            await tx.wallet.upsert({
                where: { userId: parseInt(user_id) },
                update: {
                    balance: {
                        increment: amt
                    }
                },
                create: {
                    userId: parseInt(user_id),
                    balance: amt
                }
            });
            
            await tx.walletTransaction.create({
                data: {
                    userId: parseInt(user_id),
                    amount: amt,
                    type: 'refund'
                }
            });
        });
        
        return successResponse(res, 201, 'Refund added to wallet', { amount: amt });
    } catch (error) {
        return errorResponse(res, 500, 'Failed to refund to wallet');
    }
};

// @route   GET /api/users/wallet
export const getWallet = async (req, res) => {
    try {
        const user_id = req.user.id;
        
        // Get or create wallet
        const wallet = await prisma.wallet.upsert({
            where: { userId: parseInt(user_id) },
            update: {},
            create: {
                userId: parseInt(user_id),
                balance: 0
            },
            select: {
                userId: true,
                balance: true
            }
        });
        
        return successResponse(res, 200, 'Wallet retrieved', {
            user_id: wallet.userId,
            balance: Number(wallet.balance)
        });
    } catch (error) {
        console.error('Get wallet error:', error);
        return errorResponse(res, 500, 'Failed to get wallet');
    }
};

// @route   GET /api/users/wallet/transactions
export const getWalletTransactions = async (req, res) => {
    try {
        const user_id = req.user.id;
        
        const transactions = await prisma.walletTransaction.findMany({
            where: { userId: parseInt(user_id) },
            orderBy: { createdAt: 'desc' },
            select: {
                txId: true,
                userId: true,
                amount: true,
                type: true,
                createdAt: true
            }
        });
        
        return successResponse(res, 200, 'Transactions retrieved', 
            transactions.map(t => ({
                tx_id: t.txId,
                user_id: t.userId,
                amount: Number(t.amount),
                type: t.type,
                created_at: t.createdAt
            }))
        );
    } catch (error) {
        console.error('Get wallet transactions error:', error);
        return errorResponse(res, 500, 'Failed to get wallet transactions');
    }
};

// @desc    Create Razorpay order for a booking
// @route   POST /api/payment/razorpay/order
// @access  Private (Passenger)
export const createRazorpayOrder = async (req, res) => {
    try {
        const { booking_id, amount, promo_code } = req.body || {};
        const user_id = req.user.id;

        if (!booking_id) {
            return errorResponse(res, 400, 'booking_id is required');
        }

        // Ensure booking belongs to passenger
        const booking = await prisma.booking.findFirst({
            where: {
                bookingId: parseInt(booking_id),
                passengerId: parseInt(user_id)
            }
        });
        
        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // If amount is provided, it's already discounted by frontend
        // Otherwise, calculate discount on backend
        let finalAmount;
        
        if (amount) {
            // Amount already discounted, just use it
            finalAmount = Number(amount);
            
            // Just mark promo as used if provided
            if (promo_code) {
                try {
                    await prisma.userPromoCode.upsert({
                        where: {
                            userId_code: {
                                userId: parseInt(user_id),
                                code: promo_code
                            }
                        },
                        update: { isUsed: true },
                        create: {
                            userId: parseInt(user_id),
                            code: promo_code,
                            isUsed: true
                        }
                    });
                } catch (err) {
                    console.error('Promo marking error:', err);
                }
            }
        } else {
            // No amount provided, calculate from booking amount with promo
            finalAmount = Number(booking.amount);
            
            if (promo_code) {
                try {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    const promo = await prisma.promoCode.findFirst({
                        where: {
                            code: promo_code,
                            OR: [
                                { expiryDate: null },
                                { expiryDate: { gte: today } }
                            ]
                        }
                    });
                    
                    if (promo) {
                        if (promo.discountPercent) {
                            finalAmount = finalAmount * (1 - Number(promo.discountPercent) / 100);
                        }
                        if (promo.discountAmount) {
                            finalAmount = Math.max(0, finalAmount - Number(promo.discountAmount));
                        }
                        // Mark promo as used
                        await prisma.userPromoCode.upsert({
                            where: {
                                userId_code: {
                                    userId: parseInt(user_id),
                                    code: promo_code
                                }
                            },
                            update: { isUsed: true },
                            create: {
                                userId: parseInt(user_id),
                                code: promo_code,
                                isUsed: true
                            }
                        });
                    }
                } catch (err) {
                    console.error('Promo code validation error:', err);
                }
            }
        }

        // Create an order in Razorpay (amount in paise)
        const amountPaise = Math.round(finalAmount * 100);
        const receipt = `rcpt_${booking_id}_${Date.now()}`;

        const order = await getRazorpay().orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt,
            notes: {
                booking_id: String(booking_id),
                passenger_id: String(user_id),
                promo_code: promo_code || 'none'
            }
        });

        // Upsert a pending payment row linked to this order
        const existing = await prisma.payment.findFirst({
            where: { bookingId: parseInt(booking_id) },
            orderBy: { paymentId: 'desc' }
        });

        if (!existing || existing.paymentStatus !== 'pending') {
            await prisma.payment.create({
                data: {
                    bookingId: parseInt(booking_id),
                    amount: finalAmount,
                    paymentMethod: 'card',
                    paymentStatus: 'pending',
                    transactionId: order.id
                }
            });
        } else {
            // Refresh existing pending to tie with latest order id
            await prisma.payment.update({
                where: { paymentId: existing.paymentId },
                data: {
                    amount: finalAmount,
                    transactionId: order.id
                }
            });
        }

        return successResponse(res, 201, 'Razorpay order created', {
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key: process.env.RAZORPAY_ID_KEY
        });
    } catch (error) {
        console.error('Create Razorpay order error:', error);
        // Check if it's a Razorpay configuration error
        if (error.message && error.message.includes('Razorpay keys missing')) {
            return errorResponse(res, 503, 'Payment service is not configured. Please contact support.');
        }
        return errorResponse(res, 500, 'Failed to create Razorpay order');
    }
};

// @desc    Verify Razorpay payment and mark completed
// @route   POST /api/payment/razorpay/verify
// @access  Private (Passenger)
export const verifyRazorpayPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id, amount, promo_code } = req.body || {};
        const user_id = req.user.id;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !booking_id) {
            return errorResponse(res, 400, 'Missing verification parameters');
        }

        // Ensure booking belongs to passenger
        const booking = await prisma.booking.findFirst({
            where: {
                bookingId: parseInt(booking_id),
                passengerId: parseInt(user_id)
            }
        });
        
        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // Check if Razorpay is configured
        if (!process.env.RAZORPAY_SECRET_KEY) {
            return errorResponse(res, 503, 'Payment service is not configured. Please contact support.');
        }

        // Verify signature
        const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_SECRET_KEY);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const expected = hmac.digest('hex');
        const isValid = expected === razorpay_signature;

        if (!isValid) {
            return errorResponse(res, 400, 'Invalid payment signature');
        }

        // UPDATE payments as completed; store final payment id and updated amount
        const finalAmount = amount ? Number(amount) : null;
        
        await prisma.$transaction(async (tx) => {
            if (finalAmount) {
                await tx.payment.updateMany({
                    where: { bookingId: parseInt(booking_id) },
                    data: {
                        paymentStatus: 'completed',
                        transactionId: razorpay_payment_id,
                        amount: finalAmount
                    }
                });
            } else {
                await tx.payment.updateMany({
                    where: { bookingId: parseInt(booking_id) },
                    data: {
                        paymentStatus: 'completed',
                        transactionId: razorpay_payment_id
                    }
                });
            }

            // Confirm booking and decrement seats if needed
            const bookingData = await tx.booking.findUnique({
                where: { bookingId: parseInt(booking_id) },
                select: {
                    bookingStatus: true,
                    seatsBooked: true,
                    rideId: true
                }
            });
            
            if (bookingData && bookingData.bookingStatus === 'pending') {
                await tx.booking.updateMany({
                    where: {
                        bookingId: parseInt(booking_id),
                        bookingStatus: 'pending'
                    },
                    data: {
                        bookingStatus: 'confirmed'
                    }
                });
                
                await tx.ride.update({
                    where: { rideId: bookingData.rideId },
                    data: {
                        availableSeats: {
                            decrement: bookingData.seatsBooked
                        }
                    }
                });
            }
        });

        // Return final payment record
        const payment = await prisma.payment.findFirst({
            where: { bookingId: parseInt(booking_id) },
            orderBy: { paymentId: 'desc' }
        });

        return successResponse(res, 200, 'Payment verified successfully', payment ? {
            payment_id: payment.paymentId,
            booking_id: payment.bookingId,
            amount: payment.amount,
            payment_method: payment.paymentMethod,
            payment_status: payment.paymentStatus,
            transaction_id: payment.transactionId,
            payment_date: payment.paymentDate
        } : null);
    } catch (error) {
        console.error('Verify Razorpay error:', error);
        // Check if it's a Razorpay configuration error
        if (error.message && error.message.includes('Razorpay keys missing')) {
            return errorResponse(res, 503, 'Payment service is not configured. Please contact support.');
        }
        return errorResponse(res, 500, 'Failed to verify Razorpay payment');
    }
};