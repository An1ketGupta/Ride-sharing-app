import { promisePool } from '../config/db.js';
import { errorResponse, successResponse, calculateRideAmount } from '../utils/helpers.js';
import { haversineKm } from '../utils/geo.js';
import { sendNotification } from '../utils/notifications.js';

// @desc    Create a new ride
// @route   POST /api/rides/create
// @access  Private (Driver only)
export const createRide = async (req, res) => {
    try {
        const { source, destination, date, time, total_seats, distance_km, vehicle_id } = req.body;
        const fare_per_km = 10; // Fixed 10rs per seat per km
        const driver_id = Number(req.user?.id);

        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        // Check if user is a driver
        const [users] = await promisePool.query(
            'SELECT user_type FROM users WHERE user_id = ?',
            [driver_id]
        );

        if (users.length === 0 || (users[0].user_type !== 'driver' && users[0].user_type !== 'both')) {
            return errorResponse(res, 403, 'Only drivers can create rides');
        }

        // Optionally check admin-verified driver documents if table exists
        try {
            const [docRows] = await promisePool.query(
                `SELECT 
                    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
                    COUNT(*) AS total_count
                 FROM driver_documents WHERE driver_id = ?`,
                [driver_id]
            );
            const approvedCount = Number(docRows?.[0]?.approved_count || 0);
            const totalCount = Number(docRows?.[0]?.total_count || 0);
            if (totalCount > 0 && approvedCount === 0) {
                return errorResponse(res, 403, 'Your documents are pending admin verification. Ride creation will be enabled after approval.');
            }
        } catch (e) {
            // If driver_documents table doesn't exist, continue without document verification
            if (e.code !== 'ER_NO_SUCH_TABLE') {
                console.log('Document verification skipped:', e.message);
            }
        }

        // Validate vehicle_id if provided - ensure it belongs to the driver
        if (vehicle_id) {
            try {
                const [vehicleRows] = await promisePool.query(
                    'SELECT vehicle_id FROM vehicles WHERE vehicle_id = ? AND user_id = ?',
                    [vehicle_id, driver_id]
                );
                if (vehicleRows.length === 0) {
                    return errorResponse(res, 400, 'Invalid vehicle selected. Vehicle must belong to you.');
                }
            } catch (e) {
                // If vehicles table doesn't exist or vehicle_id column doesn't exist in rides, skip validation
                if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR')) {
                    console.warn('Vehicle validation skipped:', e.message);
                    // Continue without vehicle validation
                } else {
                    throw e;
                }
            }
        }

        // Normalize time to HH:MM:SS format
        const normalizedTime = time && time.length === 5 ? `${time}:00` : time;

        // Insert ride - handle case where vehicle_id column might not exist
        let result;
        try {
            [result] = await promisePool.query(
                `INSERT INTO rides (driver_id, vehicle_id, source, destination, date, time, total_seats, available_seats, fare_per_km, distance_km, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
                [driver_id, vehicle_id || null, source, destination, date, normalizedTime, total_seats, total_seats, fare_per_km, distance_km]
            );
        } catch (e) {
            // If vehicle_id column doesn't exist, try without it
            if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.errno === 1054)) {
                console.warn('vehicle_id column not found, inserting ride without vehicle_id');
                [result] = await promisePool.query(
                    `INSERT INTO rides (driver_id, source, destination, date, time, total_seats, available_seats, fare_per_km, distance_km, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
                    [driver_id, source, destination, date, normalizedTime, total_seats, total_seats, fare_per_km, distance_km]
                );
            } else {
                throw e;
            }
        }

        // Get created ride with vehicle info
        let newRide;
        try {
            [newRide] = await promisePool.query(
                `SELECT r.*, u.name as driver_name,
                        v.model as vehicle_model, v.color as vehicle_color, v.license_plate,
                        v.vehicle_image_url, v.capacity as vehicle_capacity
                 FROM rides r
                 JOIN users u ON r.driver_id = u.user_id
                 LEFT JOIN vehicles v ON r.vehicle_id = v.vehicle_id
                 WHERE r.ride_id = ?`,
                [result.insertId]
            );
        } catch (e) {
            // If vehicle_id column doesn't exist, get ride without vehicle join
            if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.errno === 1054)) {
                [newRide] = await promisePool.query(
                    `SELECT r.*, u.name as driver_name
                     FROM rides r
                     JOIN users u ON r.driver_id = u.user_id
                     WHERE r.ride_id = ?`,
                    [result.insertId]
                );
            } else {
                throw e;
            }
        }

        return successResponse(res, 201, 'Ride created successfully', newRide[0]);

    } catch (error) {
        console.error('Create ride error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error sql:', error.sql);
        console.error('Error sqlState:', error.sqlState);
        
        // Provide more specific error messages
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return errorResponse(res, 500, 'Database table not found. Please run migrations.');
        }
        if (error.code === 'ER_BAD_FIELD_ERROR' || error.errno === 1054) {
            return errorResponse(res, 500, `Database column error: ${error.message}. Please run database migrations.`);
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
            return errorResponse(res, 400, 'Invalid vehicle or driver reference.');
        }
        
        return errorResponse(res, 500, `Server error while creating ride: ${error.message || 'Unknown error'}`);
    }
};

// @desc    Search for rides
// @route   GET /api/rides/search
// @access  Public
export const searchRides = async (req, res) => {
    try {
        const { source, destination, date } = req.query;

        let query = `
            SELECT r.*, 
                   u.name as driver_name, u.phone as driver_phone, u.rating as driver_rating,
                   v.model as vehicle_model, v.color as vehicle_color, v.license_plate,
                   v.vehicle_image_url, v.capacity as vehicle_capacity
            FROM rides r
            JOIN users u ON r.driver_id = u.user_id
            LEFT JOIN vehicles v ON r.vehicle_id = v.vehicle_id
            WHERE r.status = 'scheduled' AND r.available_seats > 0
        `;
        const params = [];

        if (source) {
            query += ' AND r.source LIKE ?';
            params.push(`%${source}%`);
        }

        if (destination) {
            query += ' AND r.destination LIKE ?';
            params.push(`%${destination}%`);
        }

        if (date) {
            query += ' AND r.date = ?';
            params.push(date);
        }

        query += ' ORDER BY r.date, r.time';

        const [rides] = await promisePool.query(query, params);

        // Add estimated fare for each ride - Fixed 10rs per seat per km
        const ridesWithFare = rides.map(ride => ({
            ...ride,
            estimated_fare: (10 * ride.distance_km).toFixed(2) // 10rs per seat per km (shown per seat)
        }));

        return successResponse(res, 200, 'Rides retrieved successfully', ridesWithFare);

    } catch (error) {
        console.error('Search rides error:', error);
        return errorResponse(res, 500, 'Server error while searching rides');
    }
};

// @desc    Estimate fare using Haversine distance
// @route   GET /api/rides/estimate?start_lat=&start_lon=&end_lat=&end_lon=
// @access  Public
export const estimateFare = async (req, res) => {
    try {
        // Fare is fixed at 10rs per seat per km
        const { start_lat, start_lon, end_lat, end_lon, seats = 1 } = req.query || {};
        if ([start_lat, start_lon, end_lat, end_lon].some(v => v == null)) {
            return errorResponse(res, 400, 'Missing coordinates');
        }
        const dist = haversineKm(Number(start_lat), Number(start_lon), Number(end_lat), Number(end_lon));
        const seats_booked = Number(seats) || 1;
        const estimated_fare = Number((10 * dist * seats_booked).toFixed(2)); // Fixed 10rs per seat per km
        return successResponse(res, 200, 'Estimated', { distance_km: Number(dist.toFixed(2)), estimated_fare });
    } catch (error) {
        return errorResponse(res, 500, 'Failed to estimate fare');
    }
};

// @desc    Estimate ETA given start/end and optional speed (km/h)
// @route   GET /api/rides/eta?start_lat=&start_lon=&end_lat=&end_lon=&speed_kmph=
// @access  Public
export const estimateETA = async (req, res) => {
    try {
        const { start_lat, start_lon, end_lat, end_lon } = req.query || {};
        const speedKmph = Number(req.query?.speed_kmph ?? (process.env.DEFAULT_SPEED_KMPH || 30));
        if ([start_lat, start_lon, end_lat, end_lon].some(v => v == null) || !Number.isFinite(speedKmph) || speedKmph <= 0) {
            return errorResponse(res, 400, 'Missing coordinates or invalid speed');
        }
        const dist = haversineKm(Number(start_lat), Number(start_lon), Number(end_lat), Number(end_lon));
        const hours = dist / speedKmph;
        const minutes = Math.max(1, Math.round(hours * 60));
        return successResponse(res, 200, 'ETA estimated', {
            distance_km: Number(dist.toFixed(2)),
            speed_kmph: Number(speedKmph.toFixed(2)),
            eta_minutes: minutes
        });
    } catch (error) {
        return errorResponse(res, 500, 'Failed to estimate ETA');
    }
};

// @desc    Get ride by ID
// @route   GET /api/rides/:id
// @access  Public
export const getRideById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rides] = await promisePool.query(
            `SELECT r.*, 
                    u.name as driver_name, u.phone as driver_phone, u.rating as driver_rating,
                    v.model as vehicle_model, v.color as vehicle_color, v.license_plate,
                    v.vehicle_image_url, v.capacity as vehicle_capacity
             FROM rides r
             JOIN users u ON r.driver_id = u.user_id
             LEFT JOIN vehicles v ON r.vehicle_id = v.vehicle_id
             WHERE r.ride_id = ?`,
            [id]
        );

        if (rides.length === 0) {
            return errorResponse(res, 404, 'Ride not found');
        }

        return successResponse(res, 200, 'Ride retrieved successfully', rides[0]);

    } catch (error) {
        console.error('Get ride error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Get driver's rides
// @route   GET /api/rides/my-rides
// @access  Private (Driver only)
export const getMyRides = async (req, res) => {
    try {
        const driver_id = Number(req.user?.id);
        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        // First get all rides with vehicle info
        const [rides] = await promisePool.query(
            `SELECT r.ride_id, r.driver_id, r.vehicle_id, r.source, r.destination, r.date, r.time,
                    r.total_seats, r.available_seats, r.fare_per_km, r.distance_km, r.status,
                    r.created_at,
                    v.model as vehicle_model, v.color as vehicle_color, v.license_plate,
                    v.vehicle_image_url, v.capacity as vehicle_capacity
             FROM rides r
             LEFT JOIN vehicles v ON r.vehicle_id = v.vehicle_id
             WHERE r.driver_id = ?
             ORDER BY r.date DESC, r.time DESC`,
            [driver_id]
        );

        // Then get booking statistics for each ride
        if (rides.length > 0) {
            const rideIds = rides.map(r => r.ride_id);
            const placeholders = rideIds.map(() => '?').join(',');
            
            try {
                const [bookingStats] = await promisePool.query(
                    `SELECT ride_id,
                            COUNT(CASE WHEN booking_status IS NOT NULL 
                                AND booking_status NOT IN ('canceled_by_driver', 'canceled_by_passenger', 'pending') 
                                AND booking_status IN ('confirmed', 'in_progress', 'completed')
                                THEN 1 END) AS total_bookings,
                            COALESCE(SUM(CASE WHEN booking_status IS NOT NULL 
                                AND booking_status NOT IN ('canceled_by_driver', 'canceled_by_passenger', 'pending') 
                                AND booking_status IN ('confirmed', 'in_progress', 'completed')
                                THEN seats_booked ELSE 0 END), 0) AS seats_booked_count,
                            COALESCE(SUM(CASE WHEN booking_status IN ('confirmed', 'completed') THEN amount ELSE 0 END), 0) AS total_revenue
                     FROM bookings
                     WHERE ride_id IN (${placeholders})
                     GROUP BY ride_id`,
                    rideIds
                );

                // Create a map of booking stats by ride_id
                const statsMap = {};
                bookingStats.forEach(stat => {
                    statsMap[stat.ride_id] = {
                        total_bookings: Number(stat.total_bookings) || 0,
                        seats_booked_count: Number(stat.seats_booked_count) || 0,
                        total_revenue: Number(stat.total_revenue) || 0
                    };
                });

                // Merge stats into rides
                rides.forEach(ride => {
                    const stats = statsMap[ride.ride_id] || {
                        total_bookings: 0,
                        seats_booked_count: 0,
                        total_revenue: 0
                    };
                    ride.total_bookings = stats.total_bookings;
                    ride.seats_booked_count = stats.seats_booked_count;
                    ride.total_revenue = stats.total_revenue;
                });
            } catch (bookingError) {
                console.error('Error fetching booking stats:', bookingError);
                // If booking stats fail, set defaults but don't fail the entire request
                rides.forEach(ride => {
                    ride.total_bookings = 0;
                    ride.seats_booked_count = 0;
                    ride.total_revenue = 0;
                });
            }
        }

        return successResponse(res, 200, 'Your rides retrieved successfully', rides);

    } catch (error) {
        console.error('Get my rides error:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        return errorResponse(res, 500, error.message || 'Server error');
    }
};

// @desc    UPDATE rides status
// @route   PUT /api/rides/:id/status
// @access  Private (Driver only - own rides)
export const updateRideStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const ride_id = Number(id);
        const { status } = req.body;
        const driver_id = Number(req.user?.id);

        if (!Number.isFinite(ride_id)) {
            return errorResponse(res, 400, 'Invalid ride ID');
        }

        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        // Validate status
        const validStatuses = ['scheduled', 'ongoing', 'completed', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return errorResponse(res, 400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }

        // Check if ride belongs to driver
        const [rides] = await promisePool.query(
            'SELECT * FROM rides WHERE ride_id = ? AND driver_id = ?',
            [ride_id, driver_id]
        );

        if (rides.length === 0) {
            return errorResponse(res, 404, 'Ride not found or unauthorized');
        }

        // If driver is cancelling the ride, handle all bookings
        if (status === 'cancelled') {
            const connection = await promisePool.getConnection();
            try {
                await connection.beginTransaction();
                
                // Update ride status
                await connection.query(
                    'UPDATE rides SET status = ? WHERE ride_id = ?',
                    [status, ride_id]
                );
                
                // Get all confirmed or pending bookings for this ride
                const [bookings] = await connection.query(
                    `SELECT b.*, p.payment_method, p.payment_id
                     FROM bookings b
                     LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.payment_status = 'completed'
                     WHERE b.ride_id = ? AND b.booking_status IN ('confirmed', 'pending')`,
                    [ride_id]
                );
                
                // Cancel all bookings and process refunds
                for (const booking of bookings) {
                    // Update booking status to canceled_by_driver (driver cancelled the ride)
                    await connection.query(
                        `UPDATE bookings SET booking_status = 'canceled_by_driver' WHERE booking_id = ?`,
                        [booking.booking_id]
                    );
                    
                    // Restore seats if booking was confirmed
                    if (booking.booking_status === 'confirmed') {
                        await connection.query(
                            `UPDATE rides SET available_seats = available_seats + ? WHERE ride_id = ?`,
                            [booking.seats_booked, ride_id]
                        );
                    }
                    
                    // Process refund if payment was made via wallet
                    if (booking.payment_method === 'wallet') {
                        const refundAmount = Number(booking.amount);
                        
                        if (refundAmount > 0) {
                            // Ensure wallet exists
                            await connection.query(
                                `INSERT INTO wallet (user_id, balance) VALUES (?, 0) ON DUPLICATE KEY UPDATE balance = balance`,
                                [booking.passenger_id]
                            );
                            
                            // Refund full amount to wallet (no cancellation fee for driver cancellation)
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
                    
                    // Send cancellation notification to passenger
                    try {
                        const ride = rides[0];
                        const message = `Your ride from ${ride.source} to ${ride.destination} on ${ride.date} at ${ride.time} has been cancelled by the driver. ${booking.payment_method === 'wallet' ? 'Your payment has been refunded to your wallet.' : 'Please contact us for refund.'}`;
                        await sendNotification(booking.passenger_id, message);
                    } catch (e) {
                        console.error('Failed to send cancellation notification:', e);
                        // Continue even if notification fails
                    }
                }
                
                await connection.commit();
                
                return successResponse(res, 200, 'Ride cancelled and all passengers notified', {
                    ride_id: ride_id,
                    status: 'cancelled',
                    bookings_cancelled: bookings.length,
                    refunds_processed: bookings.filter(b => b.payment_method === 'wallet').length
                });
                
            } catch (e) {
                await connection.rollback();
                throw e;
            } finally {
                connection.release();
            }
        }
        
        // Update status for non-cancellation status changes
        await promisePool.query(
            'UPDATE rides SET status = ? WHERE ride_id = ?',
            [status, ride_id]
        );

        // If ride completed and it was a night ride, create safety check records and notify passengers
        if (status === 'completed') {
            // Determine "night" by ride's scheduled time: 22:00-05:00
            const rideTimeStr = rides[0]?.time || '00:00:00';
            const [hh, mm] = rideTimeStr.split(':').map(Number);
            const rideHour = Number.isFinite(hh) ? hh : 0;
            const isNight = true;
            
            if (isNight) {
                // Ensure safety checks table exists
                try {
                    await promisePool.query(`CREATE TABLE IF NOT EXISTS night_ride_safety_checks (
                        safety_check_id INT PRIMARY KEY AUTO_INCREMENT,
                        booking_id INT NOT NULL,
                        ride_id INT NOT NULL,
                        passenger_id INT NOT NULL,
                        is_confirmed TINYINT(1) NOT NULL DEFAULT 0,
                        confirmation_time TIMESTAMP NULL,
                        passenger_called TINYINT(1) NOT NULL DEFAULT 0,
                        passenger_call_time TIMESTAMP NULL,
                        passenger_call_answered TINYINT(1) NULL,
                        emergency_contact_called TINYINT(1) NOT NULL DEFAULT 0,
                        emergency_contact_call_time TIMESTAMP NULL,
                        call_attempt_count INT NOT NULL DEFAULT 0,
                        last_call_attempt_time TIMESTAMP NULL,
                        admin_notified TINYINT(1) NOT NULL DEFAULT 0,
                        ride_completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
                        FOREIGN KEY (ride_id) REFERENCES rides(ride_id) ON DELETE CASCADE,
                        FOREIGN KEY (passenger_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        INDEX idx_passenger (passenger_id),
                        INDEX idx_ride (ride_id),
                        INDEX idx_booking (booking_id),
                        INDEX idx_is_confirmed (is_confirmed),
                        INDEX idx_ride_completed_at (ride_completed_at),
                        INDEX idx_pending_checks (is_confirmed, passenger_called, emergency_contact_called),
                        INDEX idx_call_retry (is_confirmed, passenger_called, call_attempt_count, last_call_attempt_time)
                    )`);
                    
                    // Ensure migration fields exist (for existing tables)
                    // Handle errors gracefully (Prisma handles schema changes)
                    try {
                        await promisePool.query(`
                            ALTER TABLE night_ride_safety_checks
                            ADD COLUMN call_attempt_count INT NOT NULL DEFAULT 0,
                            ADD COLUMN last_call_attempt_time TIMESTAMP NULL,
                            ADD COLUMN admin_notified TINYINT(1) NOT NULL DEFAULT 0
                        `);
                    } catch (migrationError) {
                        // Fields might already exist (error code 1060 = Duplicate column name), continue
                        if (migrationError.code !== 'ER_DUP_FIELDNAME' && !migrationError.message.includes('Duplicate column')) {
                            console.log('Migration check (may be expected):', migrationError.message);
                        }
                    }
                } catch (e) {
                    // Table might already exist, continue
                    console.log('Safety checks table check:', e.message);
                }

                // Get all confirmed bookings for this ride
                const [bookings] = await promisePool.query(
                    `SELECT b.booking_id, b.passenger_id 
                     FROM bookings b 
                     WHERE b.ride_id = ? AND b.booking_status = 'confirmed'`,
                    [ride_id]
                );
                
                for (const booking of bookings) {
                    try {
                        // Create safety check record
                        await promisePool.query(
                            `INSERT INTO night_ride_safety_checks 
                             (booking_id, ride_id, passenger_id, ride_completed_at) 
                             VALUES (?, ?, ?, NOW())`,
                            [booking.booking_id, ride_id, booking.passenger_id]
                        );
                        
                        // Send notification to passenger
                        await sendNotification(
                            booking.passenger_id, 
                            'Hope you reached safely. Please confirm you arrived at your destination. Click here to confirm your safety.'
                        );
                    } catch (e) {
                        console.error(`Failed to create safety check for booking ${booking.booking_id}:`, e);
                        // Continue with other passengers even if one fails
                    }
                }
            }
        }

        return successResponse(res, 200, 'Ride status updated successfully');

    } catch (error) {
        console.error('Update ride status error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Update a ride (driver can edit own scheduled ride)
// @route   PUT /api/rides/:id
// @access  Private (Driver only - own rides)
export const updateRide = async (req, res) => {
    try {
        const { id } = req.params;
        const ride_id = Number(id);
        const driver_id = Number(req.user?.id);

        if (!Number.isFinite(ride_id)) {
            return errorResponse(res, 400, 'Invalid ride ID');
        }

        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        const {
            source,
            destination,
            date,
            time,
            total_seats,
            distance_km
        } = req.body || {};
        const fare_per_km = 10; // Fixed 10rs per seat per km

        // Ensure ride belongs to driver and is editable
        const [rides] = await promisePool.query('SELECT * FROM rides WHERE ride_id = ? AND driver_id = ?', [ride_id, driver_id]);
        if (!rides.length) {
            return errorResponse(res, 404, 'Ride not found or unauthorized');
        }
        const ride = rides[0];
        if (ride.status !== 'scheduled') {
            return errorResponse(res, 400, 'Only scheduled rides can be edited');
        }

        // Compute already booked seats
        const [bookedRows] = await promisePool.query(
            `SELECT COALESCE(SUM(seats_booked),0) AS booked FROM bookings WHERE ride_id = ? AND booking_status NOT IN ('canceled_by_driver', 'canceled_by_passenger')`,
            [ride_id]
        );
        const booked = Number(bookedRows?.[0]?.booked || 0);

        const newTotal = total_seats != null ? Number(total_seats) : ride.total_seats;
        if (newTotal < booked) {
            return errorResponse(res, 400, `Cannot set total seats below already booked (${booked})`);
        }

        const newAvailable = newTotal - booked;

        // Normalize time if provided
        const normalizedTime = time ? (time.length === 5 ? `${time}:00` : time) : ride.time;

        await promisePool.query(
            `UPDATE rides SET 
                source = COALESCE(?, source),
                destination = COALESCE(?, destination),
                date = COALESCE(?, date),
                time = COALESCE(?, time),
                total_seats = ?,
                available_seats = ?,
                fare_per_km = ?,
                distance_km = COALESCE(?, distance_km)
             WHERE ride_id = ?`,
            [
                source ?? null,
                destination ?? null,
                date ?? null,
                normalizedTime ?? null,
                newTotal,
                newAvailable,
                fare_per_km,
                distance_km ?? null,
                ride_id
            ]
        );

        const [updated] = await promisePool.query(
            `SELECT r.*, u.name as driver_name
             FROM rides r JOIN users u ON r.driver_id = u.user_id WHERE r.ride_id = ?`,
            [ride_id]
        );

        return successResponse(res, 200, 'Ride updated successfully', updated[0]);
    } catch (error) {
        console.error('Update ride error:', error);
        return errorResponse(res, 500, 'Server error while updating ride');
    }
};

// --- Scheduled/Recurring rides ---
// @route POST /api/rides/schedule
export const scheduleRide = async (req, res) => {
    try {
        const driver_id = req.user.id;
        const { cron_expr, active = 1 } = req.body || {};
        if (!cron_expr) return errorResponse(res, 400, 'cron_expr is required');
        await promisePool.query(`CREATE TABLE IF NOT EXISTS ride_schedule (
            schedule_id INT PRIMARY KEY AUTO_INCREMENT,
            driver_id INT NOT NULL,
            cron_expr VARCHAR(64) NOT NULL,
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES users(user_id) ON DELETE CASCADE
        )`);
        const [r] = await promisePool.query(`INSERT INTO ride_schedule (driver_id, cron_expr, active) VALUES (?, ?, ?)`, [driver_id, String(cron_expr).slice(0,64), active ? 1 : 0]);
        return successResponse(res, 201, 'Schedule created', { schedule_id: r.insertId });
    } catch (e) {
        return errorResponse(res, 500, 'Failed to create schedule');
    }
};

// @route GET /api/rides/schedule/my
export const getMySchedules = async (req, res) => {
    try {
        const driver_id = req.user.id;
        const [rows] = await promisePool.query(`SELECT * FROM ride_schedule WHERE driver_id = ? ORDER BY created_at DESC`, [driver_id]);
        return successResponse(res, 200, 'OK', rows);
    } catch (e) {
        return errorResponse(res, 500, 'Failed to fetch schedules');
    }
};

// --- Waypoints ---
// @route POST /api/rides/:ride_id/waypoints
export const addWaypoint = async (req, res) => {
    try {
        const { ride_id } = req.params;
        const driver_id = req.user.id;
        const { name, lat, lon, order_index } = req.body || {};
        await promisePool.query(`CREATE TABLE IF NOT EXISTS ride_waypoint (
            waypoint_id INT PRIMARY KEY AUTO_INCREMENT,
            ride_id INT NOT NULL,
            name VARCHAR(100) NULL,
            lat DECIMAL(10,7) NOT NULL,
            lon DECIMAL(10,7) NOT NULL,
            order_index INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ride_id) REFERENCES rides(ride_id) ON DELETE CASCADE,
            INDEX idx_ride_id (ride_id)
        )`);
        // Require driver ownership of ride
        const [owns] = await promisePool.query(`SELECT 1 FROM rides WHERE ride_id = ? AND driver_id = ?`, [ride_id, driver_id]);
        if (!owns.length) return errorResponse(res, 403, 'Unauthorized');
        const [r] = await promisePool.query(
            `INSERT INTO ride_waypoint (ride_id, name, lat, lon, order_index) VALUES (?, ?, ?, ?, ?)`,
            [ride_id, name || null, Number(lat), Number(lon), Number(order_index || 0)]
        );
        return successResponse(res, 201, 'Waypoint added', { waypoint_id: r.insertId });
    } catch (e) {
        return errorResponse(res, 500, 'Failed to add waypoint');
    }
};

// @route GET /api/rides/:ride_id/waypoints
export const listWaypoints = async (req, res) => {
    try {
        const { ride_id } = req.params;
        const [rows] = await promisePool.query(`SELECT * FROM ride_waypoint WHERE ride_id = ? ORDER BY order_index ASC, waypoint_id ASC`, [ride_id]);
        return successResponse(res, 200, 'OK', rows);
    } catch (e) {
        return errorResponse(res, 500, 'Failed to fetch waypoints');
    }
};

