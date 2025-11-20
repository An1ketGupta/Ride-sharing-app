import { promisePool } from '../config/db.js';
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
        const [rides] = await promisePool.query(
            'SELECT * FROM rides WHERE ride_id = ? AND status = "scheduled"',
            [ride_id]
        );

        if (rides.length === 0) {
            return errorResponse(res, 404, 'Ride not found or not available');
        }

        const ride = rides[0];

        // Check if enough seats available
        if (ride.available_seats < seats_booked) {
            return errorResponse(res, 400, `Only ${ride.available_seats} seats available`);
        }

        // Check if user is not the driver
        if (ride.driver_id === passenger_id) {
            return errorResponse(res, 400, 'Driver cannot book their own ride');
        }

        // Calculate amount - Fixed 10rs per seat per km
        let amount = (10 * ride.distance_km * seats_booked);
        const { promo_code, notes, stops, save_location } = req.body || {};
        // Optional: apply flat/percent promo if present in promo_codes
        if (promo_code) {
            try {
                const [pcRows] = await promisePool.query(`SELECT * FROM promo_codes WHERE code = ? AND (expiry_date IS NULL OR expiry_date >= CURDATE())`, [promo_code]);
                const promo = pcRows[0];
                if (promo) {
                    if (promo.discount_percent) amount = amount * (1 - Number(promo.discount_percent)/100);
                    if (promo.discount_amount) amount = Math.max(0, amount - Number(promo.discount_amount));
                    // mark user promo used (idempotent upsert)
                    await promisePool.query(`INSERT INTO user_promo_codes (user_id, code, is_used) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE is_used = 1`, [passenger_id, promo_code]);
                }
            } catch {}
        }
        amount = amount.toFixed(2);

        // Create booking with graceful fallback if "notes" column doesn't exist
        let result;
        try {
            [result] = await promisePool.query(
                'INSERT INTO bookings (ride_id, passenger_id, seats_booked, amount, booking_status, notes) VALUES (?, ?, ?, ?, "pending", ?)',
                [ride_id, passenger_id, seats_booked, amount, notes || null]
            );
        } catch (e) {
            // ER_BAD_FIELD_ERROR (1054): unknown column 'notes' -> retry without notes column
            if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.errno === 1054)) {
                [result] = await promisePool.query(
                    'INSERT INTO bookings (ride_id, passenger_id, seats_booked, amount, booking_status) VALUES (?, ?, ?, ?, "pending")',
                    [ride_id, passenger_id, seats_booked, amount]
                );
            } else {
                throw e;
            }
        }

        // Get created booking with ride details
        const [newBooking] = await promisePool.query(
            `SELECT b.*, r.source, r.destination, r.date, r.time,
                    u.name as driver_name, u.phone as driver_phone,
                    v.model as vehicle_model, v.color as vehicle_color, v.license_plate,
                    v.vehicle_image_url, v.capacity as vehicle_capacity,
                    p.payment_method, p.payment_status, p.payment_id
             FROM bookings b
             JOIN rides r ON b.ride_id = r.ride_id
             JOIN users u ON r.driver_id = u.user_id
             LEFT JOIN vehicles v ON r.vehicle_id = v.vehicle_id
             LEFT JOIN payments p ON b.booking_id = p.booking_id
             WHERE b.booking_id = ?`,
            [result.insertId]
        );

        const booking = newBooking[0];

        // Optionally save user's location (e.g., Home/Work)
        try {
            if (save_location && save_location.name && typeof save_location.lat === 'number' && typeof save_location.lon === 'number') {
                await promisePool.query(
                    `INSERT INTO saved_locations (user_id, name, lat, lon) VALUES (?, ?, ?, ?)`,
                    [passenger_id, String(save_location.name).slice(0,50), save_location.lat, save_location.lon]
                );
            }
        } catch (e) {
            // Non-fatal: do not block booking on saved-location failure
            console.warn('Saved location insert failed:', e?.message || e);
        }

        // Notify the driver about the new booking via socket
        try {
            const io = getIO();
            const driverSocketId = getSocketIdForUser(Number(ride.driver_id));
            
            if (io && driverSocketId) {
                io.to(driverSocketId).emit('new_booking', {
                    booking_id: booking.booking_id,
                    ride_id: booking.ride_id,
                    passenger_id: booking.passenger_id,
                    seats_booked: booking.seats_booked,
                    amount: booking.amount,
                    source: booking.source,
                    destination: booking.destination,
                    date: booking.date,
                    time: booking.time,
                    status: booking.status
                });
                console.log(`📩 Sent booking notification to driver ${ride.driver_id}`);
            }

            // Send DB notification to driver
            await sendNotification(
                ride.driver_id,
                `New booking request: ${passenger_id} booked ${seats_booked} seat(s) for ${ride.source} → ${ride.destination}`
            );
        } catch (notifError) {
            console.error('Error sending booking notification:', notifError);
            // Don't fail the booking if notification fails
        }

        return successResponse(res, 201, 'Booking created successfully', booking);

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
        
        // Get user type from database
        const [userRows] = await promisePool.query(
            'SELECT user_type FROM users WHERE user_id = ?',
            [user_id]
        );
        const user_type = userRows[0]?.user_type || 'passenger';

        let bookings;
        
        if (user_type === 'driver' || user_type === 'both') {
            // Get bookings for driver's rides
            [bookings] = await promisePool.query(
                `SELECT b.*, 
                        r.source, r.destination, r.date, r.time, r.status as ride_status, r.driver_id,
                        u.name as passenger_name, u.phone as passenger_phone,
                        ud.name as driver_name, ud.phone as driver_phone,
                        v.model as vehicle_model, v.color as vehicle_color, v.license_plate,
                        v.vehicle_image_url, v.capacity as vehicle_capacity,
                        p.payment_method, p.payment_status, p.transaction_id, p.payment_id
                 FROM bookings b
                 JOIN rides r ON b.ride_id = r.ride_id
                 JOIN users u ON b.passenger_id = u.user_id
                 JOIN users ud ON r.driver_id = ud.user_id
                 LEFT JOIN vehicles v ON r.vehicle_id = v.vehicle_id
                 LEFT JOIN payments p ON b.booking_id = p.booking_id
                 WHERE r.driver_id = ?
                 ORDER BY b.booking_date DESC`,
                [user_id]
            );
        } else {
            // Get bookings for passenger
            [bookings] = await promisePool.query(
                `SELECT b.*, 
                        r.source, r.destination, r.date, r.time, r.status as ride_status, r.driver_id,
                        u.name as driver_name, u.phone as driver_phone,
                        v.model as vehicle_model, v.color as vehicle_color, v.license_plate,
                        v.vehicle_image_url, v.capacity as vehicle_capacity,
                        p.payment_method, p.payment_status, p.transaction_id, p.payment_id
                 FROM bookings b
                 JOIN rides r ON b.ride_id = r.ride_id
                 JOIN users u ON r.driver_id = u.user_id
                 LEFT JOIN vehicles v ON r.vehicle_id = v.vehicle_id
                 LEFT JOIN payments p ON b.booking_id = p.booking_id
                 WHERE b.passenger_id = ?
                 ORDER BY b.booking_date DESC`,
                [user_id]
            );
        }

        return successResponse(res, 200, 'Bookings retrieved successfully', bookings);

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

        const [bookings] = await promisePool.query(
            `SELECT b.*, 
                    r.source, r.destination, r.date, r.time, r.driver_id,
                    u.name as driver_name, u.phone as driver_phone,
                    v.model as vehicle_model, v.color as vehicle_color, v.license_plate,
                    v.vehicle_image_url, v.capacity as vehicle_capacity,
                    p.payment_method, p.payment_status, p.payment_id
             FROM bookings b
             JOIN rides r ON b.ride_id = r.ride_id
             JOIN users u ON r.driver_id = u.user_id
             LEFT JOIN vehicles v ON r.vehicle_id = v.vehicle_id
             LEFT JOIN payments p ON b.booking_id = p.booking_id
             WHERE b.booking_id = ?`,
            [id]
        );

        if (bookings.length === 0) {
            return errorResponse(res, 404, 'Booking not found');
        }

        const booking = bookings[0];

        // Check if user is authorized (passenger or driver)
        if (booking.passenger_id !== user_id && booking.driver_id !== user_id) {
            return errorResponse(res, 403, 'Unauthorized access');
        }

        return successResponse(res, 200, 'Booking retrieved successfully', booking);

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
        const [bookings] = await promisePool.query(
            `SELECT b.booking_id, b.passenger_id, r.driver_id
             FROM bookings b
             JOIN rides r ON b.ride_id = r.ride_id
             WHERE b.booking_id = ?`,
            [id]
        );

        if (bookings.length === 0) {
            return errorResponse(res, 404, 'Booking not found');
        }

        const booking = bookings[0];
        const isPassenger = Number(booking.passenger_id) === Number(user_id);
        const isDriver = Number(booking.driver_id) === Number(user_id);

        if (!isPassenger && !isDriver) {
            return errorResponse(res, 403, 'Unauthorized to view messages for this booking');
        }

        // Get messages for this booking
        let messages;
        try {
            [messages] = await promisePool.query(
                `SELECT message_id, booking_id, from_user_id, message_text as text, created_at as timestamp
                 FROM booking_messages
                 WHERE booking_id = ?
                 ORDER BY created_at ASC`,
                [id]
            );
        } catch (dbError) {
            // If table doesn't exist, return empty array
            if (dbError?.code === 'ER_NO_SUCH_TABLE') {
                messages = [];
            } else {
                throw dbError;
            }
        }

        // Add metadata for frontend
        const messagesWithMetadata = (messages || []).map(msg => ({
            message_id: msg.message_id,
            booking_id: msg.booking_id,
            text: msg.text,
            from_user_id: msg.from_user_id,
            timestamp: msg.timestamp,
            is_from_me: Number(msg.from_user_id) === Number(user_id),
            is_from_driver: Number(msg.from_user_id) === Number(booking.driver_id)
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
        const [bookings] = await promisePool.query(
            `SELECT b.*, r.ride_id, r.driver_id, r.status as ride_status, r.source, r.destination
             FROM bookings b
             JOIN rides r ON b.ride_id = r.ride_id
             WHERE b.booking_id = ?`,
            [id]
        );

        if (bookings.length === 0) {
            return errorResponse(res, 404, 'Booking not found');
        }

        const booking = bookings[0];

        // Check if user is authorized (passenger)
        if (booking.passenger_id !== user_id) {
            return errorResponse(res, 403, 'Unauthorized access');
        }

        // Check if ride is actively ongoing (only share location during active ride)
        const rideStatus = (booking.ride_status || '').toLowerCase();
        
        // Only share location when ride is actively ongoing
        if (rideStatus !== 'ongoing') {
            return errorResponse(res, 400, 'Driver location is only available while the ride is ongoing');
        }

        // Get driver's current location from users table
        const [drivers] = await promisePool.query(
            `SELECT user_id, latitude, longitude, name as driver_name
             FROM users
             WHERE user_id = ? AND (latitude IS NOT NULL AND longitude IS NOT NULL)`,
            [booking.driver_id]
        );

        if (drivers.length === 0) {
            // Return a response indicating location is not available yet, but don't error
            // This allows the frontend to keep polling or wait for socket updates
            return successResponse(res, 200, 'Driver location not available yet - waiting for driver to share location', {
                driver_id: booking.driver_id,
                ride_id: booking.ride_id,
                lat: null,
                lon: null,
                ts: null,
                message: 'Driver location will be available once the driver starts sharing their location'
            });
        }

        const driver = drivers[0];

        return successResponse(res, 200, 'Driver location retrieved successfully', {
            driver_id: driver.user_id,
            driver_name: driver.driver_name,
            lat: Number(driver.latitude),
            lon: Number(driver.longitude),
            ride_id: booking.ride_id,
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
        const [bookings] = await promisePool.query(
            'SELECT * FROM bookings WHERE booking_id = ? AND passenger_id = ?',
            [id, user_id]
        );

        if (bookings.length === 0) {
            return errorResponse(res, 404, 'Booking not found');
        }

        const booking = bookings[0];

        if (booking.booking_status === 'confirmed') {
            return errorResponse(res, 400, 'Booking already confirmed');
        }

        // Get ride details
        const [rides] = await promisePool.query(
            'SELECT * FROM rides WHERE ride_id = ?',
            [booking.ride_id]
        );

        const ride = rides[0];

        // Check if enough seats available
        if (ride.available_seats < booking.seats_booked) {
            return errorResponse(res, 400, 'Not enough seats available');
        }

        // UPDATE bookings and ride in a transaction
        const connection = await promisePool.getConnection();
        await connection.beginTransaction();

        try {
            // UPDATE bookings status
            await connection.query(
                'UPDATE bookings SET booking_status = "confirmed" WHERE booking_id = ?',
                [id]
            );

            // Update available seats
            await connection.query(
                'UPDATE rides SET available_seats = available_seats - ? WHERE ride_id = ?',
                [booking.seats_booked, booking.ride_id]
            );

            await connection.commit();
            connection.release();

            return successResponse(res, 200, 'Booking confirmed successfully');

        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }

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
        const [rows] = await promisePool.query(
            `SELECT b.*, r.driver_id, r.status as ride_status
             FROM bookings b
             JOIN rides r ON b.ride_id = r.ride_id
             WHERE b.booking_id = ?`,
            [id]
        );

        if (!rows.length) {
            return errorResponse(res, 404, 'Booking not found');
        }

        const booking = rows[0];

        // Determine actor role
        const isPassenger = Number(booking.passenger_id) === Number(user_id);
        const isDriver = Number(booking.driver_id) === Number(user_id);
        if (!isPassenger && !isDriver) {
            return errorResponse(res, 403, 'Unauthorized to cancel this booking');
        }

        if (booking.booking_status === 'completed') {
            return errorResponse(res, 400, 'Cannot cancel completed booking');
        }
        if (booking.booking_status === 'canceled_by_driver' || booking.booking_status === 'canceled_by_passenger') {
            return errorResponse(res, 400, 'Booking already cancelled');
        }

        // Define when fee applies: passenger cancels after driver is on the way
        // Heuristic: if booking is confirmed, or ride is ongoing
        const driverOnTheWay = ['confirmed'].includes(booking.booking_status) || ['ongoing'].includes(booking.ride_status);

        // Fee policy (can be refined via config): 10% of amount, min 20, max 100
        let cancellationFee = 0.0;
        if (isPassenger && driverOnTheWay) {
            const pct = 0.10 * Number(booking.amount);
            cancellationFee = Math.min(100, Math.max(20, Number(pct.toFixed(2))));
        }

        // Set cancellation status based on who is cancelling
        const nextStatus = isPassenger ? 'canceled_by_passenger' : 'canceled_by_driver';
        const shouldRestoreSeats = ['confirmed'].includes(booking.booking_status);

        const connection = await promisePool.getConnection();
        await connection.beginTransaction();
        try {
            // UPDATE bookings status and fee (fallback if cancellation_fee column is missing)
            let feeSupported = true;
            try {
                await connection.query(
                    `UPDATE bookings SET booking_status = ?, cancellation_fee = ? WHERE booking_id = ?`,
                    [nextStatus, cancellationFee, id]
                );
            } catch (e) {
                if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.errno === 1054)) {
                    feeSupported = false;
                    await connection.query(
                        `UPDATE bookings SET booking_status = ? WHERE booking_id = ?`,
                        [nextStatus, id]
                    );
                } else {
                    throw e;
                }
            }

            // Restore seats if they were reserved by a confirmed booking
            if (shouldRestoreSeats) {
                await connection.query(
                    `UPDATE rides SET available_seats = available_seats + ? WHERE ride_id = ?`,
                    [booking.seats_booked, booking.ride_id]
                );
            }

            // Handle wallet refund if payment was made via wallet
            const [paymentRows] = await connection.query(
                `SELECT * FROM payments WHERE booking_id = ? AND payment_status = 'completed'`,
                [id]
            );
            
            if (paymentRows.length > 0) {
                const payment = paymentRows[0];
                
                if (payment.payment_method === 'wallet') {
                    // Calculate refund amount (full amount - cancellation fee)
                    const refundAmount = Number(booking.amount) - cancellationFee;
                    
                    if (refundAmount > 0) {
                        // Ensure wallet exists
                        await connection.query(
                            `INSERT INTO wallet (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE balance = balance`,
                            [booking.passenger_id]
                        );
                        
                        // Refund to wallet
                        await connection.query(
                            `UPDATE wallet SET balance = balance + ? WHERE user_id = ?`,
                            [refundAmount, booking.passenger_id]
                        );
                        
                        // Record refund transaction
                        await connection.query(
                            `INSERT INTO wallet_transaction (user_id, amount, type) VALUES (?, ?, 'refund')`,
                            [booking.passenger_id, refundAmount]
                        );
                    }
                }
            }
            
            // Mark pending payments as failed when booking is cancelled
            await connection.query(
                `UPDATE payments SET payment_status = 'failed' WHERE booking_id = ? AND payment_status = 'pending'`,
                [id]
            );
            
            // If passenger owes a cancellation fee, create a pending payment record (only if fee column exists)
            if (isPassenger && cancellationFee > 0 && feeSupported) {
                await connection.query(
                    `INSERT INTO payments (booking_id, amount, payment_method, payment_status, transaction_id)
                     VALUES (?, ?, 'cash', 'pending', 'CANCEL_FEE')`,
                    [id, cancellationFee]
                );
            }

            await connection.commit();
        } catch (e) {
            await connection.rollback();
            throw e;
        } finally {
            connection.release();
        }

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
        const [rows] = await promisePool.query(
            `SELECT b.booking_id, b.booking_status, r.driver_id
             FROM bookings b JOIN rides r ON r.ride_id = b.ride_id
             WHERE b.booking_id = ?`,
            [id]
        );
        if (!rows.length) return errorResponse(res, 404, 'Booking not found');
        if (Number(rows[0].driver_id) !== Number(driver_id)) return errorResponse(res, 403, 'Unauthorized');

        // UPDATE bookings (graceful if columns missing)
        try {
            await promisePool.query(
                `UPDATE bookings SET wait_minutes = COALESCE(wait_minutes, 0) + ?, extra_charges = COALESCE(extra_charges, 0) + ? WHERE booking_id = ?`,
                [wm, extra, id]
            );
        } catch (e) {
            // If columns do not exist, attempt to add them once
            if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.errno === 1054)) {
                try {
                    await promisePool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wait_minutes INT DEFAULT 0`);
                } catch {}
                try {
                    await promisePool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_charges DECIMAL(10,2) DEFAULT 0`);
                } catch {}
                await promisePool.query(
                    `UPDATE bookings SET wait_minutes = COALESCE(wait_minutes, 0) + ?, extra_charges = COALESCE(extra_charges, 0) + ? WHERE booking_id = ?`,
                    [wm, extra, id]
                );
            } else {
                throw e;
            }
        }

        return successResponse(res, 200, 'Wait-time/extra charges applied', { booking_id: Number(id), wait_minutes: wm, extra_charges: Number(extra.toFixed(2)) });
    } catch (error) {
        console.error('applyWaitTimeCharge error:', error);
        return errorResponse(res, 500, 'Failed to apply charges');
    }
};

