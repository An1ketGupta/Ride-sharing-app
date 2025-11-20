import { prisma } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';
import { getIO, getSocketIdForUser } from '../utils/socketRegistry.js';
import { sendNotification } from '../utils/notifications.js';

// @desc    Create a new booking
// @route   POST /api/bookings/create
// @access  Private (Passenger only)
export const createBooking = async (req, res) => {
    try {
        const { ride_id, seats_booked } = req.body;
        const passenger_id = req.user.id;

        // Get ride details
        const ride = await prisma.ride.findFirst({
            where: {
                rideId: parseInt(ride_id),
                status: 'scheduled'
            }
        });

        if (!ride) {
            return errorResponse(res, 404, 'Ride not found or not available');
        }

        // Check if enough seats available
        if (Number(ride.availableSeats) < seats_booked) {
            return errorResponse(res, 400, `Only ${ride.availableSeats} seats available`);
        }

        // Check if user is not the driver
        if (Number(ride.driverId) === Number(passenger_id)) {
            return errorResponse(res, 400, 'Driver cannot book their own ride');
        }

        // Calculate amount - Fixed 10rs per seat per km
        let amount = (10 * Number(ride.distanceKm) * seats_booked);
        const { promo_code, notes, stops, save_location } = req.body || {};
        
        // Optional: apply flat/percent promo if present in promo_codes
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
                        amount = amount * (1 - Number(promo.discountPercent) / 100);
                    }
                    if (promo.discountAmount) {
                        amount = Math.max(0, amount - Number(promo.discountAmount));
                    }
                    // Mark user promo used (upsert)
                    await prisma.userPromoCode.upsert({
                        where: {
                            userId_code: {
                                userId: parseInt(passenger_id),
                                code: promo_code
                            }
                        },
                        update: { isUsed: true },
                        create: {
                            userId: parseInt(passenger_id),
                            code: promo_code,
                            isUsed: true
                        }
                    });
                }
            } catch {}
        }
        amount = parseFloat(amount.toFixed(2));

        // Create booking
        const booking = await prisma.booking.create({
            data: {
                rideId: parseInt(ride_id),
                passengerId: parseInt(passenger_id),
                seatsBooked: seats_booked,
                amount: amount,
                bookingStatus: 'pending',
                notes: notes || null
            },
            include: {
                ride: {
                    include: {
                        driver: {
                            select: {
                                name: true,
                                phone: true
                            }
                        },
                        vehicle: {
                            select: {
                                model: true,
                                color: true,
                                licensePlate: true,
                                vehicleImageUrl: true,
                                capacity: true
                            }
                        }
                    }
                },
                payments: {
                    take: 1,
                    orderBy: { paymentDate: 'desc' },
                    select: {
                        paymentMethod: true,
                        paymentStatus: true,
                        paymentId: true
                    }
                }
            }
        });

        // Optionally save user's location (e.g., Home/Work)
        try {
            if (save_location && save_location.name && typeof save_location.lat === 'number' && typeof save_location.lon === 'number') {
                await prisma.savedLocation.create({
                    data: {
                        userId: parseInt(passenger_id),
                        name: String(save_location.name).slice(0, 50),
                        lat: save_location.lat,
                        lon: save_location.lon
                    }
                });
            }
        } catch (e) {
            // Non-fatal: do not block booking on saved-location failure
            console.warn('Saved location insert failed:', e?.message || e);
        }

        // Notify the driver about the new booking via socket
        try {
            const io = getIO();
            const driverSocketId = getSocketIdForUser(Number(ride.driverId));
            
            if (io && driverSocketId) {
                io.to(driverSocketId).emit('new_booking', {
                    booking_id: booking.bookingId,
                    ride_id: booking.rideId,
                    passenger_id: booking.passengerId,
                    seats_booked: booking.seatsBooked,
                    amount: booking.amount,
                    source: booking.ride.source,
                    destination: booking.ride.destination,
                    date: booking.ride.date,
                    time: booking.ride.time,
                    status: booking.ride.status
                });
                console.log(`📩 Sent booking notification to driver ${ride.driverId}`);
            }

            // Send DB notification to driver
            await sendNotification(
                ride.driverId,
                `New booking request: ${passenger_id} booked ${seats_booked} seat(s) for ${ride.source} → ${ride.destination}`
            );
        } catch (notifError) {
            console.error('Error sending booking notification:', notifError);
            // Don't fail the booking if notification fails
        }

        // Format response
        const formattedBooking = {
            booking_id: booking.bookingId,
            ride_id: booking.rideId,
            passenger_id: booking.passengerId,
            seats_booked: booking.seatsBooked,
            amount: booking.amount,
            booking_status: booking.bookingStatus,
            notes: booking.notes,
            booking_date: booking.bookingDate,
            source: booking.ride.source,
            destination: booking.ride.destination,
            date: booking.ride.date,
            time: booking.ride.time,
            driver_name: booking.ride.driver.name,
            driver_phone: booking.ride.driver.phone,
            vehicle_model: booking.ride.vehicle?.model || null,
            vehicle_color: booking.ride.vehicle?.color || null,
            license_plate: booking.ride.vehicle?.licensePlate || null,
            vehicle_image_url: booking.ride.vehicle?.vehicleImageUrl || null,
            vehicle_capacity: booking.ride.vehicle?.capacity || null,
            payment_method: booking.payments[0]?.paymentMethod || null,
            payment_status: booking.payments[0]?.paymentStatus || null,
            payment_id: booking.payments[0]?.paymentId || null
        };

        return successResponse(res, 201, 'Booking created successfully', formattedBooking);

    } catch (error) {
        console.error('Create booking error:', error);
        return errorResponse(res, 500, 'Server error while creating booking');
    }
};

// @desc    Get user's bookings
// @route   GET /api/bookings/my
// @access  Private
export const getMyBookings = async (req, res) => {
    try {
        const user_id = req.user.id;
        
        // Get user type
        const user = await prisma.user.findUnique({
            where: { userId: parseInt(user_id) },
            select: { userType: true }
        });
        const user_type = user?.userType || 'passenger';

        let bookings;
        
        if (user_type === 'driver' || user_type === 'both') {
            // Get bookings for driver's rides
            bookings = await prisma.booking.findMany({
                where: {
                    ride: {
                        driverId: parseInt(user_id)
                    }
                },
                include: {
                    ride: {
                        include: {
                            vehicle: {
                                select: {
                                    model: true,
                                    color: true,
                                    licensePlate: true,
                                    vehicleImageUrl: true,
                                    capacity: true
                                }
                            }
                        }
                    },
                    passenger: {
                        select: {
                            name: true,
                            phone: true
                        }
                    },
                    payments: {
                        take: 1,
                        orderBy: { paymentDate: 'desc' },
                        select: {
                            paymentMethod: true,
                            paymentStatus: true,
                            transactionId: true,
                            paymentId: true
                        }
                    }
                },
                orderBy: { bookingDate: 'desc' }
            });
        } else {
            // Get bookings for passenger
            bookings = await prisma.booking.findMany({
                where: {
                    passengerId: parseInt(user_id)
                },
                include: {
                    ride: {
                        include: {
                            driver: {
                                select: {
                                    name: true,
                                    phone: true
                                }
                            },
                            vehicle: {
                                select: {
                                    model: true,
                                    color: true,
                                    licensePlate: true,
                                    vehicleImageUrl: true,
                                    capacity: true
                                }
                            }
                        }
                    },
                    payments: {
                        take: 1,
                        orderBy: { paymentDate: 'desc' },
                        select: {
                            paymentMethod: true,
                            paymentStatus: true,
                            transactionId: true,
                            paymentId: true
                        }
                    }
                },
                orderBy: { bookingDate: 'desc' }
            });
        }

        // Format bookings
        const formattedBookings = bookings.map(booking => {
            const base = {
                booking_id: booking.bookingId,
                ride_id: booking.rideId,
                passenger_id: booking.passengerId,
                seats_booked: booking.seatsBooked,
                amount: booking.amount,
                booking_status: booking.bookingStatus,
                booking_date: booking.bookingDate,
                source: booking.ride.source,
                destination: booking.ride.destination,
                date: booking.ride.date,
                time: booking.ride.time,
                ride_status: booking.ride.status,
                driver_id: booking.ride.driverId,
                vehicle_model: booking.ride.vehicle?.model || null,
                vehicle_color: booking.ride.vehicle?.color || null,
                license_plate: booking.ride.vehicle?.licensePlate || null,
                vehicle_image_url: booking.ride.vehicle?.vehicleImageUrl || null,
                vehicle_capacity: booking.ride.vehicle?.capacity || null,
                payment_method: booking.payments[0]?.paymentMethod || null,
                payment_status: booking.payments[0]?.paymentStatus || null,
                transaction_id: booking.payments[0]?.transactionId || null,
                payment_id: booking.payments[0]?.paymentId || null
            };

            if (user_type === 'driver' || user_type === 'both') {
                base.passenger_name = booking.passenger.name;
                base.passenger_phone = booking.passenger.phone;
                base.driver_name = booking.ride.driver?.name || null;
                base.driver_phone = booking.ride.driver?.phone || null;
            } else {
                base.driver_name = booking.ride.driver.name;
                base.driver_phone = booking.ride.driver.phone;
            }

            return base;
        });

        return successResponse(res, 200, 'Bookings retrieved successfully', formattedBookings);

    } catch (error) {
        console.error('Get my bookings error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private
export const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const booking = await prisma.booking.findUnique({
            where: { bookingId: parseInt(id) },
            include: {
                ride: {
                    include: {
                        driver: {
                            select: {
                                name: true,
                                phone: true
                            }
                        },
                        vehicle: {
                            select: {
                                model: true,
                                color: true,
                                licensePlate: true,
                                vehicleImageUrl: true,
                                capacity: true
                            }
                        }
                    }
                },
                payments: {
                    take: 1,
                    orderBy: { paymentDate: 'desc' },
                    select: {
                        paymentMethod: true,
                        paymentStatus: true,
                        paymentId: true
                    }
                }
            }
        });

        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // Check if user is authorized (passenger or driver)
        if (Number(booking.passengerId) !== Number(user_id) && Number(booking.ride.driverId) !== Number(user_id)) {
            return errorResponse(res, 403, 'Unauthorized access');
        }

        const formattedBooking = {
            booking_id: booking.bookingId,
            ride_id: booking.rideId,
            passenger_id: booking.passengerId,
            seats_booked: booking.seatsBooked,
            amount: booking.amount,
            booking_status: booking.bookingStatus,
            booking_date: booking.bookingDate,
            source: booking.ride.source,
            destination: booking.ride.destination,
            date: booking.ride.date,
            time: booking.ride.time,
            driver_id: booking.ride.driverId,
            driver_name: booking.ride.driver.name,
            driver_phone: booking.ride.driver.phone,
            vehicle_model: booking.ride.vehicle?.model || null,
            vehicle_color: booking.ride.vehicle?.color || null,
            license_plate: booking.ride.vehicle?.licensePlate || null,
            vehicle_image_url: booking.ride.vehicle?.vehicleImageUrl || null,
            vehicle_capacity: booking.ride.vehicle?.capacity || null,
            payment_method: booking.payments[0]?.paymentMethod || null,
            payment_status: booking.payments[0]?.paymentStatus || null,
            payment_id: booking.payments[0]?.paymentId || null
        };

        return successResponse(res, 200, 'Booking retrieved successfully', formattedBooking);

    } catch (error) {
        console.error('Get booking error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Get messages for a booking
// @route   GET /api/bookings/:id/messages
// @access  Private
export const getBookingMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        // Verify user has access to this booking (either passenger or driver)
        const booking = await prisma.booking.findUnique({
            where: { bookingId: parseInt(id) },
            include: {
                ride: {
                    select: {
                        driverId: true
                    }
                }
            }
        });

        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        const isPassenger = Number(booking.passengerId) === Number(user_id);
        const isDriver = Number(booking.ride.driverId) === Number(user_id);

        if (!isPassenger && !isDriver) {
            return errorResponse(res, 403, 'Unauthorized to view messages for this booking');
        }

        // Get messages for this booking
        const messages = await prisma.bookingMessage.findMany({
            where: { bookingId: parseInt(id) },
            orderBy: { createdAt: 'asc' },
            select: {
                messageId: true,
                bookingId: true,
                fromUserId: true,
                messageText: true,
                createdAt: true
            }
        });

        // Add metadata for frontend
        const messagesWithMetadata = messages.map(msg => ({
            message_id: msg.messageId,
            booking_id: msg.bookingId,
            text: msg.messageText,
            from_user_id: msg.fromUserId,
            timestamp: msg.createdAt,
            is_from_me: Number(msg.fromUserId) === Number(user_id),
            is_from_driver: Number(msg.fromUserId) === Number(booking.ride.driverId)
        }));

        return successResponse(res, 200, 'Messages retrieved successfully', messagesWithMetadata);

    } catch (error) {
        console.error('Get booking messages error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Get driver location for a booking
// @route   GET /api/bookings/:id/driver-location
// @access  Private
export const getDriverLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        // Get booking with ride details
        const booking = await prisma.booking.findUnique({
            where: { bookingId: parseInt(id) },
            include: {
                ride: {
                    select: {
                        rideId: true,
                        driverId: true,
                        status: true,
                        source: true,
                        destination: true
                    }
                }
            }
        });

        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // Check if user is authorized (passenger)
        if (Number(booking.passengerId) !== Number(user_id)) {
            return errorResponse(res, 403, 'Unauthorized access');
        }

        // Check if ride is actively ongoing (only share location during active ride)
        const rideStatus = (booking.ride.status || '').toLowerCase();
        
        // Only share location when ride is actively ongoing
        if (rideStatus !== 'ongoing') {
            return errorResponse(res, 400, 'Driver location is only available while the ride is ongoing');
        }

        // Get driver's current location from users table
        const driver = await prisma.user.findFirst({
            where: {
                userId: booking.ride.driverId,
                latitude: { not: null },
                longitude: { not: null }
            },
            select: {
                userId: true,
                latitude: true,
                longitude: true,
                name: true
            }
        });

        if (!driver) {
            // Return a response indicating location is not available yet, but don't error
            return successResponse(res, 200, 'Driver location not available yet - waiting for driver to share location', {
                driver_id: booking.ride.driverId,
                ride_id: booking.ride.rideId,
                lat: null,
                lon: null,
                ts: null,
                message: 'Driver location will be available once the driver starts sharing their location'
            });
        }

        return successResponse(res, 200, 'Driver location retrieved successfully', {
            driver_id: driver.userId,
            driver_name: driver.name,
            lat: Number(driver.latitude),
            lon: Number(driver.longitude),
            ride_id: booking.ride.rideId,
            ts: Date.now()
        });

    } catch (error) {
        console.error('Get driver location error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Confirm booking
// @route   PUT /api/bookings/:id/confirm
// @access  Private
export const confirmBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        // Get booking details
        const booking = await prisma.booking.findFirst({
            where: {
                bookingId: parseInt(id),
                passengerId: parseInt(user_id)
            },
            include: {
                ride: true
            }
        });

        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        if (booking.bookingStatus === 'confirmed') {
            return errorResponse(res, 400, 'Booking already confirmed');
        }

        // Check if enough seats available
        if (Number(booking.ride.availableSeats) < booking.seatsBooked) {
            return errorResponse(res, 400, 'Not enough seats available');
        }

        // UPDATE bookings and ride in a transaction
        await prisma.$transaction(async (tx) => {
            // UPDATE bookings status
            await tx.booking.update({
                where: { bookingId: parseInt(id) },
                data: { bookingStatus: 'confirmed' }
            });

            // Update available seats
            await tx.ride.update({
                where: { rideId: booking.rideId },
                data: {
                    availableSeats: {
                        decrement: booking.seatsBooked
                    }
                }
            });
        });

        return successResponse(res, 200, 'Booking confirmed successfully');

    } catch (error) {
        console.error('Confirm booking error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Cancel booking (supports passenger/driver with fee policy)
// @route   PUT /api/bookings/:id/cancel
// @route   POST /api/bookings/:id/cancel
// @access  Private
export const cancelBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        // Get booking joined with ride to determine driver and ride status
        const booking = await prisma.booking.findUnique({
            where: { bookingId: parseInt(id) },
            include: {
                ride: {
                    select: {
                        driverId: true,
                        status: true
                    }
                },
                payments: {
                    where: {
                        paymentStatus: 'completed'
                    },
                    take: 1
                }
            }
        });

        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // Determine actor role
        const isPassenger = Number(booking.passengerId) === Number(user_id);
        const isDriver = Number(booking.ride.driverId) === Number(user_id);
        if (!isPassenger && !isDriver) {
            return errorResponse(res, 403, 'Unauthorized to cancel this booking');
        }

        if (booking.bookingStatus === 'completed') {
            return errorResponse(res, 400, 'Cannot cancel completed booking');
        }
        if (booking.bookingStatus === 'canceled_by_driver' || booking.bookingStatus === 'canceled_by_passenger') {
            return errorResponse(res, 400, 'Booking already cancelled');
        }

        // Define when fee applies: passenger cancels after driver is on the way
        const driverOnTheWay = ['confirmed'].includes(booking.bookingStatus) || ['ongoing'].includes(booking.ride.status);

        // Fee policy: 10% of amount, min 20, max 100
        let cancellationFee = 0.0;
        if (isPassenger && driverOnTheWay) {
            const pct = 0.10 * Number(booking.amount);
            cancellationFee = Math.min(100, Math.max(20, Number(pct.toFixed(2))));
        }

        // Set cancellation status based on who is cancelling
        const nextStatus = isPassenger ? 'canceled_by_passenger' : 'canceled_by_driver';
        const shouldRestoreSeats = ['confirmed'].includes(booking.bookingStatus);

        // Execute transaction
        await prisma.$transaction(async (tx) => {
            // UPDATE bookings status and fee
            await tx.booking.update({
                where: { bookingId: parseInt(id) },
                data: {
                    bookingStatus: nextStatus,
                    cancellationFee: cancellationFee
                }
            });

            // Restore seats if they were reserved by a confirmed booking
            if (shouldRestoreSeats) {
                await tx.ride.update({
                    where: { rideId: booking.rideId },
                    data: {
                        availableSeats: {
                            increment: booking.seatsBooked
                        }
                    }
                });
            }

            // Handle wallet refund if payment was made via wallet
            const payment = booking.payments[0];
            if (payment && payment.paymentMethod === 'wallet') {
                // Calculate refund amount (full amount - cancellation fee)
                const refundAmount = Number(booking.amount) - cancellationFee;
                
                if (refundAmount > 0) {
                    // Ensure wallet exists and refund
                    await tx.wallet.upsert({
                        where: { userId: booking.passengerId },
                        update: {
                            balance: {
                                increment: refundAmount
                            }
                        },
                        create: {
                            userId: booking.passengerId,
                            balance: refundAmount
                        }
                    });
                    
                    // Record refund transaction
                    await tx.walletTransaction.create({
                        data: {
                            userId: booking.passengerId,
                            amount: refundAmount,
                            type: 'refund'
                        }
                    });
                }
            }
            
            // Mark pending payments as failed when booking is cancelled
            await tx.payment.updateMany({
                where: {
                    bookingId: parseInt(id),
                    paymentStatus: 'pending'
                },
                data: {
                    paymentStatus: 'failed'
                }
            });
            
            // If passenger owes a cancellation fee, create a pending payment record
            if (isPassenger && cancellationFee > 0) {
                await tx.payment.create({
                    data: {
                        bookingId: parseInt(id),
                        amount: cancellationFee,
                        paymentMethod: 'cash',
                        paymentStatus: 'pending',
                        transactionId: 'CANCEL_FEE'
                    }
                });
            }
        });

        return successResponse(res, 200, 'Booking canceled successfully', {
            booking_id: Number(id),
            canceled_by: isPassenger ? 'passenger' : 'driver',
            status: nextStatus,
            cancellation_fee: Number(cancellationFee.toFixed(2))
        });
    } catch (error) {
        console.error('Cancel booking error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Apply wait-time and extra charges to a booking
// @route   PUT /api/bookings/:id/wait-time
// @access  Private (Driver)
export const applyWaitTimeCharge = async (req, res) => {
    try {
        const { id } = req.params;
        const driver_id = req.user.id;
        const { wait_minutes = 0, extra_charges = 0 } = req.body || {};

        const wm = Math.max(0, Math.floor(Number(wait_minutes)));
        const extra = Math.max(0, Number(extra_charges));

        // Validate booking belongs to a ride owned by this driver
        const booking = await prisma.booking.findFirst({
            where: {
                bookingId: parseInt(id),
                ride: {
                    driverId: parseInt(driver_id)
                }
            },
            select: {
                bookingId: true,
                bookingStatus: true,
                waitMinutes: true,
                extraCharges: true
            }
        });
        
        if (!booking) return errorResponse(res, 404, 'Booking not found');

        // UPDATE bookings
        await prisma.booking.update({
            where: { bookingId: parseInt(id) },
            data: {
                waitMinutes: {
                    increment: wm
                },
                extraCharges: {
                    increment: extra
                }
            }
        });

        return successResponse(res, 200, 'Wait-time/extra charges applied', { 
            booking_id: Number(id), 
            wait_minutes: wm, 
            extra_charges: Number(extra.toFixed(2)) 
        });
    } catch (error) {
        console.error('applyWaitTimeCharge error:', error);
        return errorResponse(res, 500, 'Failed to apply charges');
    }
};
