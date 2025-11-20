import { promisePool } from '../config/db.js';
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
        const [bookings] = await promisePool.query(
            'SELECT * FROM bookings WHERE booking_id = ? AND passenger_id = ?',
            [booking_id, user_id]
        );

        if (bookings.length === 0) {
            return errorResponse(res, 404, 'Booking not found');
        }

        const booking = bookings[0];

        // Check if payment already exists
        const [existingPayments] = await promisePool.query(
            'SELECT * FROM payments WHERE booking_id = ?',
            [booking_id]
        );

        if (existingPayments.length > 0 && existingPayments[0].payment_status === 'completed') {
            return errorResponse(res, 400, 'Payment already completed for this booking');
        }

        // Generate transaction ID
        const transaction_id = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // If payment method is wallet, deduct from wallet balance
        if (payment_method === 'wallet') {
            // Get wallet balance
            const [walletRows] = await promisePool.query(
                'SELECT balance FROM wallet WHERE user_id = ?',
                [user_id]
            );
            
            const walletBalance = walletRows.length > 0 ? Number(walletRows[0].balance) : 0;
            
            if (walletBalance < booking.amount) {
                return errorResponse(res, 400, 'Insufficient wallet balance');
            }
            
            // Deduct from wallet and create transaction
            const conn = await promisePool.getConnection();
            try {
                await conn.beginTransaction();
                
                // Ensure wallet exists
                await conn.query(
                    `INSERT INTO wallet (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE balance = balance`,
                    [user_id]
                );
                
                // Deduct amount
                await conn.query(
                    `UPDATE wallet SET balance = balance - ? WHERE user_id = ?`,
                    [booking.amount, user_id]
                );
                
                // Record transaction
                await conn.query(
                    `INSERT INTO wallet_transaction (user_id, amount, type) VALUES (?, ?, 'debit')`,
                    [user_id, booking.amount]
                );
                
                await conn.commit();
            } catch (e) {
                await conn.rollback();
                throw e;
            } finally {
                conn.release();
            }
        }

        // Create payment
        const [result] = await promisePool.query(
            `INSERT INTO payments (booking_id, amount, payment_method, payment_status, transaction_id)
             VALUES (?, ?, ?, 'completed', ?)`,
            [booking_id, booking.amount, payment_method, transaction_id]
        );

        // Mark booking as confirmed and decrement seats if not already confirmed
        const connection = await promisePool.getConnection();
        try {
            await connection.beginTransaction();

            // Attempt to move booking to confirmed (idempotent)
            const [updateBooking] = await connection.query(
                `UPDATE bookings SET booking_status = 'confirmed' WHERE booking_id = ? AND booking_status = 'pending'`,
                [booking_id]
            );

            if (updateBooking.affectedRows > 0) {
                // Fetch seats_booked and ride_id to decrement seats
                const [rows] = await connection.query(
                    `SELECT ride_id, seats_booked FROM bookings WHERE booking_id = ?`,
                    [booking_id]
                );
                if (rows.length) {
                    const { ride_id, seats_booked } = rows[0];
                    await connection.query(
                        `UPDATE rides SET available_seats = available_seats - ? WHERE ride_id = ?`,
                        [seats_booked, ride_id]
                    );
                }
            }

            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }

        // Get created payment
        const [newPayment] = await promisePool.query(
            'SELECT * FROM payments WHERE payment_id = ?',
            [result.insertId]
        );

        // Notify driver that payment was successful (only on successful payment)
        try {
            const [bookingDetails] = await promisePool.query(
                `SELECT b.ride_id, r.driver_id, b.passenger_id, b.seats_booked, b.amount
                 FROM bookings b
                 JOIN rides r ON b.ride_id = r.ride_id
                 WHERE b.booking_id = ?`,
                [booking_id]
            );
            
            if (bookingDetails.length > 0) {
                const { driver_id, passenger_id, seats_booked, amount } = bookingDetails[0];
                const { sendNotification } = await import('../utils/notifications.js');
                const { getIO } = await import('../utils/socketRegistry.js');
                
                // Send notification to driver
                await sendNotification(
                    driver_id,
                    `✅ Payment received: ₹${amount} for ${seats_booked} seat(s) - Booking #${booking_id}`
                );
                
                // Also emit socket event to driver
                const io = getIO();
                if (io) {
                    const driverSocketId = getSocketIdForUser(driver_id);
                    if (driverSocketId) {
                        io.to(driverSocketId).emit('payment_received', {
                            booking_id: booking_id,
                            amount: amount,
                            seats_booked: seats_booked,
                            passenger_id: passenger_id
                        });
                    }
                }
            }
        } catch (notifError) {
            console.error('Error sending payment notification to driver:', notifError);
            // Don't fail payment if notification fails
        }

        return successResponse(res, 201, 'Payment processed successfully', newPayment[0]);

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
        const [bookings] = await promisePool.query(
            'SELECT * FROM bookings WHERE booking_id = ? AND passenger_id = ?',
            [booking_id, user_id]
        );
        if (bookings.length === 0) {
            return errorResponse(res, 404, 'Booking not found');
        }

        const booking = bookings[0];

        // See if a pending/record exists
        const [existing] = await promisePool.query(
            'SELECT * FROM payments WHERE booking_id = ? ORDER BY payment_id DESC LIMIT 1',
            [booking_id]
        );
        if (existing.length && existing[0].payment_status === 'pending') {
            return successResponse(res, 200, 'Cash payment already initialized', existing[0]);
        }

        // Create a pending payment row for cash
        const [result] = await promisePool.query(
            `INSERT INTO payments (booking_id, amount, payment_method, payment_status, transaction_id)
             VALUES (?, ?, 'cash', 'pending', NULL)`,
            [booking_id, booking.amount]
        );

        // Immediately confirm booking and decrement seats to reflect reserved seats
        const connection = await promisePool.getConnection();
        try {
            await connection.beginTransaction();

            // UPDATE bookings to confirmed if currently pending (idempotent)
            const [upd] = await connection.query(
                `UPDATE bookings SET booking_status = 'confirmed' WHERE booking_id = ? AND booking_status = 'pending'`,
                [booking_id]
            );
            if (upd.affectedRows > 0) {
                const [bk] = await connection.query(
                    `SELECT ride_id, seats_booked FROM bookings WHERE booking_id = ?`,
                    [booking_id]
                );
                if (bk.length) {
                    await connection.query(
                        `UPDATE rides SET available_seats = available_seats - ? WHERE ride_id = ?`,
                        [bk[0].seats_booked, bk[0].ride_id]
                    );
                }
            }

            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }

        const [newPayment] = await promisePool.query('SELECT * FROM payments WHERE payment_id = ?', [result.insertId]);
        return successResponse(res, 201, 'Cash payment initialized and booking confirmed', newPayment[0]);
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
        const [rows] = await promisePool.query(
            `SELECT p.*, b.passenger_id FROM payments p
             JOIN bookings b ON b.booking_id = p.booking_id
             WHERE p.payment_id = ?`,
            [paymentId]
        );
        if (rows.length === 0) {
            return errorResponse(res, 404, 'Payment not found');
        }
        const payment = rows[0];

        if (payment.passenger_id !== user_id) {
            return errorResponse(res, 403, 'Unauthorized to complete this payment');
        }

        if (payment.payment_status === 'completed') {
            return successResponse(res, 200, 'Payment already completed', payment);
        }

        const transaction_id = `CASH${Date.now()}`;
        await promisePool.query(
            `UPDATE payments SET payment_status = 'completed', transaction_id = ? WHERE payment_id = ?`,
            [transaction_id, paymentId]
        );

        // Confirm booking and decrement seats if needed
        const connection = await promisePool.getConnection();
        try {
            await connection.beginTransaction();

            // Get booking id and seats
            const [bk] = await connection.query(
                `SELECT b.booking_id, b.booking_status, b.seats_booked, b.ride_id FROM payments p JOIN bookings b ON b.booking_id = p.booking_id WHERE p.payment_id = ?`,
                [paymentId]
            );
            if (bk.length) {
                const b = bk[0];
                if (b.booking_status === 'pending') {
                    const [upd] = await connection.query(
                        `UPDATE bookings SET booking_status = 'confirmed' WHERE booking_id = ? AND booking_status = 'pending'`,
                        [b.booking_id]
                    );
                    if (upd.affectedRows > 0) {
                        await connection.query(
                            `UPDATE rides SET available_seats = available_seats - ? WHERE ride_id = ?`,
                            [b.seats_booked, b.ride_id]
                        );
                    }
                }
            }

            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }

        const [updated] = await promisePool.query('SELECT * FROM payments WHERE payment_id = ?', [paymentId]);
        return successResponse(res, 200, 'Cash payment completed', updated[0]);
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
        const [bookings] = await promisePool.query(
            'SELECT * FROM bookings WHERE booking_id = ? AND passenger_id = ?',
            [bookingId, user_id]
        );

        if (bookings.length === 0) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // Get payment
        const [payments] = await promisePool.query(
            `SELECT p.*, b.amount as booking_amount
             FROM payments p
             JOIN bookings b ON p.booking_id = b.booking_id
             WHERE p.booking_id = ?`,
            [bookingId]
        );

        if (payments.length === 0) {
            return errorResponse(res, 404, 'Payment not found');
        }

        return successResponse(res, 200, 'Payment retrieved successfully', payments[0]);

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

        const [payments] = await promisePool.query(
            `SELECT p.*, b.booking_id, b.seats_booked,
                    r.source, r.destination, r.date, r.time
             FROM payments p
             JOIN bookings b ON p.booking_id = b.booking_id
             JOIN rides r ON b.ride_id = r.ride_id
             WHERE b.passenger_id = ?
             ORDER BY p.payment_date DESC`,
            [user_id]
        );

        return successResponse(res, 200, 'Payments retrieved successfully', payments);

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
        
        // Ensure tables exist
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet (user_id INT PRIMARY KEY, balance DECIMAL(12,2) NOT NULL DEFAULT 0, FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet_transaction (tx_id INT PRIMARY KEY AUTO_INCREMENT, user_id INT NOT NULL, amount DECIMAL(12,2) NOT NULL, type ENUM('topup','debit','refund') NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        
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
        
        // Ensure tables exist
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet (user_id INT PRIMARY KEY, balance DECIMAL(12,2) NOT NULL DEFAULT 0, FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet_transaction (tx_id INT PRIMARY KEY AUTO_INCREMENT, user_id INT NOT NULL, amount DECIMAL(12,2) NOT NULL, type ENUM('topup','debit','refund') NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        
        // Credit wallet
        const conn = await promisePool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(`INSERT INTO wallet (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE balance = balance`, [user_id]);
            await conn.query(`UPDATE wallet SET balance = balance + ? WHERE user_id = ?`, [amt, user_id]);
            await conn.query(`INSERT INTO wallet_transaction (user_id, amount, type) VALUES (?, ?, 'topup')`, [user_id, amt]);
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
        
        // Get updated wallet balance
        const [wallet] = await promisePool.query(`SELECT user_id, balance FROM wallet WHERE user_id = ?`, [user_id]);
        
        return successResponse(res, 200, 'Wallet topped up successfully', {
            amount: amt,
            balance: wallet[0]?.balance || 0,
            transaction_id: razorpay_payment_id
        });
    } catch (error) {
        console.error('Verify wallet topup error:', error);
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
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet (user_id INT PRIMARY KEY, balance DECIMAL(12,2) NOT NULL DEFAULT 0, FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet_transaction (tx_id INT PRIMARY KEY AUTO_INCREMENT, user_id INT NOT NULL, amount DECIMAL(12,2) NOT NULL, type ENUM('topup','debit','refund') NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        const conn = await promisePool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(`INSERT INTO wallet (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE balance = balance`, [user_id]);
            await conn.query(`UPDATE wallet SET balance = balance + ? WHERE user_id = ?`, [amt, user_id]);
            await conn.query(`INSERT INTO wallet_transaction (user_id, amount, type) VALUES (?, ?, 'refund')`, [user_id, amt]);
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
        return successResponse(res, 201, 'Refund added to wallet', { amount: amt });
    } catch (error) {
        return errorResponse(res, 500, 'Failed to refund to wallet');
    }
};

// @route   GET /api/users/wallet
export const getWallet = async (req, res) => {
    try {
        const user_id = req.user.id;
        // Ensure tables exist
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet (user_id INT PRIMARY KEY, balance DECIMAL(12,2) NOT NULL DEFAULT 0, FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet_transaction (tx_id INT PRIMARY KEY AUTO_INCREMENT, user_id INT NOT NULL, amount DECIMAL(12,2) NOT NULL, type ENUM('topup','debit','refund') NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        
        // Get or create wallet
        await promisePool.query(`INSERT INTO wallet (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE balance = balance`, [user_id]);
        const [rows] = await promisePool.query(`SELECT user_id, balance FROM wallet WHERE user_id = ?`, [user_id]);
        
        return successResponse(res, 200, 'Wallet retrieved', rows[0] || { user_id, balance: 0 });
    } catch (error) {
        console.error('Get wallet error:', error);
        return errorResponse(res, 500, 'Failed to get wallet');
    }
};

// @route   GET /api/users/wallet/transactions
export const getWalletTransactions = async (req, res) => {
    try {
        const user_id = req.user.id;
        // Ensure tables exist
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet (user_id INT PRIMARY KEY, balance DECIMAL(12,2) NOT NULL DEFAULT 0, FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        await promisePool.query(`CREATE TABLE IF NOT EXISTS wallet_transaction (tx_id INT PRIMARY KEY AUTO_INCREMENT, user_id INT NOT NULL, amount DECIMAL(12,2) NOT NULL, type ENUM('topup','debit','refund') NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
        
        const [transactions] = await promisePool.query(
            `SELECT tx_id, user_id, amount, type, created_at FROM wallet_transaction WHERE user_id = ? ORDER BY created_at DESC`,
            [user_id]
        );
        
        return successResponse(res, 200, 'Transactions retrieved', transactions);
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
        const [bookings] = await promisePool.query(
            'SELECT * FROM bookings WHERE booking_id = ? AND passenger_id = ?',
            [booking_id, user_id]
        );
        if (bookings.length === 0) {
            return errorResponse(res, 404, 'Booking not found');
        }
        const booking = bookings[0];

        // If amount is provided, it's already discounted by frontend
        // Otherwise, calculate discount on backend
        let finalAmount;
        
        if (amount) {
            // Amount already discounted, just use it
            finalAmount = Number(amount);
            
            // Just mark promo as used if provided
            if (promo_code) {
                try {
                    await promisePool.query(
                        `INSERT INTO user_promo_codes (user_id, code, is_used) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE is_used = 1`,
                        [user_id, promo_code]
                    );
                } catch (err) {
                    console.error('Promo marking error:', err);
                }
            }
        } else {
            // No amount provided, calculate from booking amount with promo
            finalAmount = Number(booking.amount);
            
            if (promo_code) {
                try {
                    const [pcRows] = await promisePool.query(
                        `SELECT * FROM promo_codes WHERE code = ? AND (expiry_date IS NULL OR expiry_date >= CURDATE())`, 
                        [promo_code]
                    );
                    if (pcRows.length > 0) {
                        const promo = pcRows[0];
                        if (promo.discount_percent) {
                            finalAmount = finalAmount * (1 - Number(promo.discount_percent) / 100);
                        }
                        if (promo.discount_amount) {
                            finalAmount = Math.max(0, finalAmount - Number(promo.discount_amount));
                        }
                        // Mark promo as used
                        await promisePool.query(
                            `INSERT INTO user_promo_codes (user_id, code, is_used) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE is_used = 1`,
                            [user_id, promo_code]
                        );
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

        // Upsert a pending payment row linked to this order (store order_id for now)
        const [existing] = await promisePool.query(
            'SELECT * FROM payments WHERE booking_id = ? ORDER BY payment_id DESC LIMIT 1',
            [booking_id]
        );

        if (!existing.length || existing[0].payment_status !== 'pending') {
            await promisePool.query(
                `INSERT INTO payments (booking_id, amount, payment_method, payment_status, transaction_id)
                 VALUES (?, ?, 'card', 'pending', ?)`,
                [booking_id, finalAmount, order.id]
            );
        } else {
            // refresh existing pending to tie with latest order id
            await promisePool.query(
                `UPDATE payments SET amount = ?, transaction_id = ? WHERE payment_id = ?`,
                [finalAmount, order.id, existing[0].payment_id]
            );
        }

        return successResponse(res, 201, 'Razorpay order created', {
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key: process.env.RAZORPAY_ID_KEY
        });
    } catch (error) {
        console.error('Create Razorpay order error:', error);
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
        const [bookings] = await promisePool.query(
            'SELECT * FROM bookings WHERE booking_id = ? AND passenger_id = ?',
            [booking_id, user_id]
        );
        if (bookings.length === 0) {
            return errorResponse(res, 404, 'Booking not found');
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
        if (finalAmount) {
            await promisePool.query(
                `UPDATE payments SET payment_status = 'completed', transaction_id = ?, amount = ? WHERE booking_id = ?`,
                [razorpay_payment_id, finalAmount, booking_id]
            );
        } else {
            await promisePool.query(
                `UPDATE payments SET payment_status = 'completed', transaction_id = ? WHERE booking_id = ?`,
                [razorpay_payment_id, booking_id]
            );
        }

        // Confirm booking and decrement seats if needed
        const connection = await promisePool.getConnection();
        try {
            await connection.beginTransaction();
            const [bk] = await connection.query(
                `SELECT booking_status, seats_booked, ride_id FROM bookings WHERE booking_id = ?`,
                [booking_id]
            );
            if (bk.length && bk[0].booking_status === 'pending') {
                const [upd] = await connection.query(
                    `UPDATE bookings SET booking_status = 'confirmed' WHERE booking_id = ? AND booking_status = 'pending'`,
                    [booking_id]
                );
                if (upd.affectedRows > 0) {
                    await connection.query(
                        `UPDATE rides SET available_seats = available_seats - ? WHERE ride_id = ?`,
                        [bk[0].seats_booked, bk[0].ride_id]
                    );
                }
            }
            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }

        // Return final payment record
        const [rows] = await promisePool.query(
            `SELECT * FROM payments WHERE booking_id = ? ORDER BY payment_id DESC LIMIT 1`,
            [booking_id]
        );

        return successResponse(res, 200, 'Payment verified successfully', rows[0] || null);
    } catch (error) {
        console.error('Verify Razorpay error:', error);
        return errorResponse(res, 500, 'Failed to verify Razorpay payment');
    }
};