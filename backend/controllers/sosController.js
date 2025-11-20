import { promisePool } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';
import { sendNotification, sendSMS, sendEmail } from '../utils/notifications.js';

// @desc Log SOS alert and mock notify admin
// @route POST /api/rides/:ride_id/sos
// Note: ride_id in URL is actually booking_id
export const raiseSOS = async (req, res) => {
    try {
        const { ride_id } = req.params; // this is Booking.booking_id according to schema
        const { user_id, details, passenger_lat, passenger_lon } = req.body || {};

        // Validate required fields
        if (!user_id) {
            return errorResponse(res, 400, 'user_id is required');
        }

        const bookingId = Number(ride_id);
        const userId = Number(user_id);

        if (!bookingId || isNaN(bookingId)) {
            return errorResponse(res, 400, 'Invalid booking ID');
        }

        // 2) First verify booking exists and get context: passenger, driver, vehicle, route
        const [rows] = await promisePool.query(
            `SELECT 
                b.booking_id,
                b.ride_id AS ride_ref_id,
                b.passenger_id,
                b.seats_booked,
                b.amount,
                b.booking_status,
                b.booking_date,
                r.driver_id,
                r.source,
                r.destination,
                r.date AS ride_date,
                r.time AS ride_time,
                r.status AS ride_status,
                r.fare_per_km,
                r.distance_km,
                uP.name AS passenger_name,
                uP.phone AS passenger_phone,
                uP.email AS passenger_email,
                uP.emergency_contact_name,
                uP.emergency_contact_phone,
                uP.emergency_contact_email,
                uD.name AS driver_name,
                uD.phone AS driver_phone,
                uD.email AS driver_email,
                v.model AS vehicle_model,
                v.license_plate AS vehicle_plate,
                v.color AS vehicle_color,
                v.capacity AS vehicle_capacity
            FROM bookings b
            JOIN rides r ON r.ride_id = b.ride_id
            JOIN users uP ON uP.user_id = b.passenger_id
            JOIN users uD ON uD.user_id = r.driver_id
            LEFT JOIN vehicles v ON v.user_id = r.driver_id
            WHERE b.booking_id = ?`,
            [bookingId]
        );
        const info = rows?.[0];

        if (!info) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // Verify user_id matches passenger_id or is admin
        if (info.passenger_id !== userId) {
            // Check if user is admin
            const [adminCheck] = await promisePool.query(
                `SELECT user_id FROM users WHERE user_id = ? AND user_type = 'admin'`,
                [userId]
            );
            if (!adminCheck || adminCheck.length === 0) {
                return errorResponse(res, 403, 'Unauthorized: Only the passenger or admin can raise SOS for this booking');
            }
        }

        // 1) Log SOS - try different table name variations for case sensitivity
        let insertRes;
        try {
            [insertRes] = await promisePool.query(
                `INSERT INTO sos_alerts (ride_id, user_id, details) VALUES (?, ?, ?)`,
                [bookingId, userId, details || null]
            );
        } catch (e) {
            // Try SOS_Alerts if sos_alerts doesn't exist
            if (e?.code === 'ER_NO_SUCH_TABLE' || String(e?.message || '').includes('sos_alerts') || String(e?.message || '').includes('SOS_Alerts')) {
                try {
                    // Try creating with lowercase first
                    await promisePool.query(`CREATE TABLE IF NOT EXISTS sos_alerts (
                      alert_id INT PRIMARY KEY AUTO_INCREMENT,
                      ride_id INT NOT NULL,
                      user_id INT NOT NULL,
                      details TEXT,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      FOREIGN KEY (ride_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
                      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                    )`);
                    [insertRes] = await promisePool.query(
                        `INSERT INTO sos_alerts (ride_id, user_id, details) VALUES (?, ?, ?)`,
                        [bookingId, userId, details || null]
                    );
                } catch (e2) {
                    // If still fails, try uppercase table name
                    try {
                        await promisePool.query(`CREATE TABLE IF NOT EXISTS SOS_Alerts (
                          alert_id INT PRIMARY KEY AUTO_INCREMENT,
                          ride_id INT NOT NULL,
                          user_id INT NOT NULL,
                          details TEXT,
                          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                          FOREIGN KEY (ride_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
                          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                        )`);
                        [insertRes] = await promisePool.query(
                            `INSERT INTO SOS_Alerts (ride_id, user_id, details) VALUES (?, ?, ?)`,
                            [bookingId, userId, details || null]
                        );
                    } catch (e3) {
                        console.error('Failed to create/insert SOS alert:', e3);
                        throw e3;
                    }
                }
            } else {
                throw e;
            }
        }

        // 3) Build messages
        const mapsLink = (lat, lon) => lat != null && lon != null ? `https://maps.google.com/?q=${lat},${lon}` : null;
        const passengerLocLink = mapsLink(passenger_lat, passenger_lon);
        const parts = [];
        parts.push(`🚨🚨 EMERGENCY SOS ALERT 🚨🚨`);
        parts.push(`Booking ID: #${bookingId}`);
        parts.push(``);
        
        if (info) {
            // Passenger Information
            parts.push(`📱 PASSENGER INFORMATION:`);
            parts.push(`   Name: ${info.passenger_name || 'N/A'}`);
            parts.push(`   Phone: ${info.passenger_phone || 'N/A'}`);
            parts.push(`   Email: ${info.passenger_email || 'N/A'}`);
            parts.push(`   Passenger ID: ${info.passenger_id}`);
            parts.push(``);
            
            // Driver Information
            parts.push(`🚗 DRIVER INFORMATION:`);
            parts.push(`   Name: ${info.driver_name || 'N/A'}`);
            parts.push(`   Phone: ${info.driver_phone || 'N/A'}`);
            parts.push(`   Email: ${info.driver_email || 'N/A'}`);
            parts.push(`   Driver ID: ${info.driver_id}`);
            parts.push(``);
            
            // Vehicle Information
            if (info.vehicle_model || info.vehicle_plate) {
                parts.push(`🚙 VEHICLE INFORMATION:`);
                parts.push(`   Model: ${info.vehicle_model || 'N/A'}`);
                parts.push(`   Color: ${info.vehicle_color || 'N/A'}`);
                parts.push(`   License Plate: ${info.vehicle_plate || 'N/A'}`);
                parts.push(`   Capacity: ${info.vehicle_capacity || 'N/A'} seats`);
                parts.push(``);
            }
            
            // Ride Information
            parts.push(`📍 RIDE INFORMATION:`);
            parts.push(`   Source: ${info.source || 'N/A'}`);
            parts.push(`   Destination: ${info.destination || 'N/A'}`);
            if (info.ride_date) parts.push(`   Date: ${info.ride_date}`);
            if (info.ride_time) parts.push(`   Time: ${info.ride_time}`);
            if (info.distance_km) parts.push(`   Distance: ${info.distance_km} km`);
            parts.push(`   Fare: ₹10 per seat per km`); // Fixed fare
            parts.push(`   Ride Status: ${info.ride_status || 'N/A'}`);
            parts.push(``);
            
            // Booking Information
            parts.push(`🎫 BOOKING INFORMATION:`);
            parts.push(`   Seats Booked: ${info.seats_booked || 'N/A'}`);
            if (info.amount) parts.push(`   Amount: ₹${info.amount}`);
            parts.push(`   Booking Status: ${info.booking_status || 'N/A'}`);
            if (info.booking_date) parts.push(`   Booking Date: ${info.booking_date}`);
            parts.push(``);
        }
        
        // Emergency Details
        if (details) {
            parts.push(`📝 EMERGENCY DETAILS:`);
            parts.push(`   ${details}`);
            parts.push(``);
        }
        
        // Current Location
        if (passengerLocLink) {
            parts.push(`📍 CURRENT PASSENGER LOCATION:`);
            parts.push(`   ${passengerLocLink}`);
            if (passenger_lat != null && passenger_lon != null) {
                parts.push(`   Coordinates: ${passenger_lat}, ${passenger_lon}`);
            }
            parts.push(``);
        }
        
        // Emergency Contact (if available)
        if (info && info.emergency_contact_name) {
            parts.push(`🆘 EMERGENCY CONTACT:`);
            parts.push(`   Name: ${info.emergency_contact_name}`);
            if (info.emergency_contact_phone) parts.push(`   Phone: ${info.emergency_contact_phone}`);
            if (info.emergency_contact_email) parts.push(`   Email: ${info.emergency_contact_email}`);
        }

        const message = parts.join('\n');

        // 4) Notify all admins in-app (and realtime via socket)
        let admins = []; // Declare outside try block for access in response
        let adminNotificationStatus = { admins_found: 0, notifications_sent: 0, message: '' };
        
        try {
            // Try different table name variations for case sensitivity
            let tableName = 'users'; // default
            
            // Try lowercase first (most common)
            try {
                [admins] = await promisePool.query(`SELECT user_id, name, email, phone, user_type FROM users WHERE user_type = 'admin'`);
                tableName = 'users';
                console.log(`✅ Found ${admins.length} admin(s) using table 'users'`);
            } catch (tableError) {
                // Try with capital U if users table doesn't exist
                if (tableError?.code === 'ER_NO_SUCH_TABLE' || String(tableError?.message || '').toLowerCase().includes('table') && String(tableError?.message || '').toLowerCase().includes('users')) {
                    try {
                        [admins] = await promisePool.query(`SELECT user_id, name, email, phone, user_type FROM User WHERE user_type = 'admin'`);
                        tableName = 'User';
                        console.log(`✅ Found ${admins.length} admin(s) using table 'User'`);
                    } catch (e2) {
                        console.error('❌ Failed to query admin users from both table names:', e2);
                        // Try one more time with backticks for case sensitivity
                        try {
                            [admins] = await promisePool.query(`SELECT user_id, name, email, phone, user_type FROM \`users\` WHERE user_type = 'admin'`);
                            tableName = '`users`';
                            console.log(`✅ Found ${admins.length} admin(s) using table \`users\``);
                        } catch (e3) {
                            try {
                                [admins] = await promisePool.query(`SELECT user_id, name, email, phone, user_type FROM \`User\` WHERE user_type = 'admin'`);
                                tableName = '`User`';
                                console.log(`✅ Found ${admins.length} admin(s) using table \`User\``);
                            } catch (e4) {
                                console.error('❌ All table name attempts failed. Error:', e4);
                                throw e4;
                            }
                        }
                    }
                } else {
                    console.error('❌ Unexpected error querying admin users:', tableError);
                    throw tableError;
                }
            }
            
            // Debug: Log all users with admin type (case-insensitive check)
            if (admins.length === 0) {
                console.warn('⚠️ No admins found with user_type="admin". Checking all user types...');
                try {
                    const [allUsers] = await promisePool.query(`SELECT user_id, name, email, user_type FROM ${tableName} LIMIT 10`);
                    console.log('Sample users:', allUsers);
                    // Also try case-insensitive search
                    const [adminCheck] = await promisePool.query(`SELECT user_id, name, email, user_type FROM ${tableName} WHERE LOWER(user_type) = 'admin'`);
                    if (adminCheck.length > 0) {
                        console.log(`⚠️ Found ${adminCheck.length} user(s) with case-insensitive 'admin' match:`, adminCheck);
                        admins = adminCheck;
                    }
                } catch (debugError) {
                    console.error('Debug query failed:', debugError);
                }
            }
            
            console.log(`🔍 Querying admin users from table: ${tableName}`);
            console.log(`🔍 Found ${admins?.length || 0} admin user(s) in database:`, admins.map(a => ({ id: a.user_id, name: a.name, email: a.email, type: a.user_type })));
            
            // Also broadcast SOS via socket to all admins
            try {
                const { getIO, getSocketIdForUser } = await import('../utils/socketRegistry.js');
                const io = getIO();
                
                if (admins && admins.length > 0) {
                    let successCount = 0;
                    let socketCount = 0;
                    
                    for (const a of admins) {
                        try {
                            console.log(`📤 Attempting to notify admin ${a.user_id} (${a.name || a.email || 'Unknown'})...`);
                            
                            // Send database notification
                            const notifResult = await sendNotification(a.user_id, `🚨 SOS ALERT: ${message}`);
                            successCount++;
                            console.log(`✅ Sent DB notification to admin ${a.user_id} (${a.name || a.email || 'Unknown'}) - Notification ID: ${notifResult.notification_id}`);
                            
                            // Also emit via socket for real-time notification
                            const adminSocketId = getSocketIdForUser(Number(a.user_id));
                            console.log(`🔍 Admin ${a.user_id} socket lookup: socketId=${adminSocketId || 'null'}, io=${io ? 'available' : 'null'}`);
                            
                            if (io && adminSocketId) {
                                const sosPayload = {
                                    alert_id: insertRes.insertId,
                                    booking_id: bookingId,
                                    ride_id: info.ride_ref_id,
                                    // Passenger Information
                                    passenger_id: userId,
                                    passenger_name: info.passenger_name,
                                    passenger_phone: info.passenger_phone,
                                    passenger_email: info.passenger_email,
                                    // Driver Information
                                    driver_id: info.driver_id,
                                    driver_name: info.driver_name,
                                    driver_phone: info.driver_phone,
                                    driver_email: info.driver_email,
                                    // Vehicle Information
                                    vehicle_model: info.vehicle_model,
                                    vehicle_color: info.vehicle_color,
                                    vehicle_plate: info.vehicle_plate,
                                    vehicle_capacity: info.vehicle_capacity,
                                    // Ride Information
                                    source: info.source,
                                    destination: info.destination,
                                    ride_date: info.ride_date,
                                    ride_time: info.ride_time,
                                    ride_status: info.ride_status,
                                    distance_km: info.distance_km,
                                    fare_per_km: info.fare_per_km,
                                    // Booking Information
                                    seats_booked: info.seats_booked,
                                    amount: info.amount,
                                    booking_status: info.booking_status,
                                    booking_date: info.booking_date,
                                    // Location
                                    location: { lat: passenger_lat, lon: passenger_lon },
                                    location_link: passengerLocLink,
                                    // Emergency Details
                                    details: details || null,
                                    // Emergency Contact
                                    emergency_contact_name: info.emergency_contact_name,
                                    emergency_contact_phone: info.emergency_contact_phone,
                                    emergency_contact_email: info.emergency_contact_email,
                                    // Full formatted message
                                    message: message,
                                    timestamp: new Date().toISOString()
                                };
                                io.to(adminSocketId).emit('sos_alert_admin', sosPayload);
                                socketCount++;
                                console.log(`📡 Sent socket notification 'sos_alert_admin' to admin ${a.user_id} (socket: ${adminSocketId})`);
                            } else {
                                console.warn(`⚠️ Admin ${a.user_id} not connected via socket (socketId: ${adminSocketId || 'null'}, io: ${io ? 'available' : 'null'})`);
                                console.warn(`   Admin needs to be logged in and have socket connection active to receive real-time alerts.`);
                            }
                        } catch (adminError) {
                            console.error(`❌ Failed to notify admin ${a.user_id}:`, adminError);
                            console.error(`   Error details:`, {
                                message: adminError.message,
                                code: adminError.code,
                                stack: adminError.stack
                            });
                        }
                    }
                    
                    console.log(`✅ SOS notifications: ${successCount}/${admins.length} DB notifications sent, ${socketCount}/${admins.length} socket notifications sent`);
                    adminNotificationStatus = {
                        admins_found: admins.length,
                        notifications_sent: successCount,
                        socket_notifications_sent: socketCount,
                        message: `SOS sent to ${successCount} admin(s) via DB, ${socketCount} via socket`
                    };
                    
                    // Also broadcast to all connected admin sockets as fallback
                    if (io) {
                        io.emit('sos_alert_admin_broadcast', {
                            alert_id: insertRes.insertId,
                            booking_id: bookingId,
                            ride_id: info.ride_ref_id,
                            // Passenger Information
                            passenger_id: userId,
                            passenger_name: info.passenger_name,
                            passenger_phone: info.passenger_phone,
                            passenger_email: info.passenger_email,
                            // Driver Information
                            driver_id: info.driver_id,
                            driver_name: info.driver_name,
                            driver_phone: info.driver_phone,
                            driver_email: info.driver_email,
                            // Vehicle Information
                            vehicle_model: info.vehicle_model,
                            vehicle_color: info.vehicle_color,
                            vehicle_plate: info.vehicle_plate,
                            vehicle_capacity: info.vehicle_capacity,
                            // Ride Information
                            source: info.source,
                            destination: info.destination,
                            ride_date: info.ride_date,
                            ride_time: info.ride_time,
                            ride_status: info.ride_status,
                            distance_km: info.distance_km,
                            fare_per_km: info.fare_per_km,
                            // Booking Information
                            seats_booked: info.seats_booked,
                            amount: info.amount,
                            booking_status: info.booking_status,
                            booking_date: info.booking_date,
                            // Location
                            location: { lat: passenger_lat, lon: passenger_lon },
                            location_link: passengerLocLink,
                            // Emergency Details
                            details: details || null,
                            // Emergency Contact
                            emergency_contact_name: info.emergency_contact_name,
                            emergency_contact_phone: info.emergency_contact_phone,
                            emergency_contact_email: info.emergency_contact_email,
                            // Full formatted message
                            message: message,
                            timestamp: new Date().toISOString()
                        });
                        console.log('📢 Broadcasted SOS alert to all connected sockets (fallback)');
                    }
                } else {
                    // Fallback: broadcast notification (user_id NULL) so it appears in admin feed
                    console.warn('⚠️ No admin users found in database! Creating broadcast notification.');
                    await sendNotification(null, `🚨 SOS ALERT: ${message}`);
                    adminNotificationStatus = {
                        admins_found: 0,
                        notifications_sent: 0,
                        message: 'No admin users found - broadcast notification created. Please ensure at least one user has user_type="admin"'
                    };
                    // Also broadcast to all connected sockets
                    if (io) {
                        io.emit('sos_alert_admin_broadcast', {
                            alert_id: insertRes.insertId,
                            booking_id: bookingId,
                            passenger_id: userId,
                            message: message,
                            timestamp: new Date().toISOString()
                        });
                        console.log('📢 Broadcasted SOS alert to all connected sockets (no admins found)');
                    }
                    console.log('⚠️ No admin users found, sent broadcast notification');
                }
                
                // ALWAYS create a broadcast notification (user_id = NULL) so ALL admins can see SOS alerts
                // This ensures SOS alerts are visible even if individual admin notifications fail
                try {
                    await sendNotification(null, `🚨 SOS ALERT: ${message}`);
                    console.log('✅ Created broadcast SOS notification (visible to all admins)');
                } catch (broadcastError) {
                    console.error('❌ Failed to create broadcast SOS notification:', broadcastError);
                }
            } catch (socketErr) {
                console.error('❌ Failed to send SOS via socket:', socketErr);
                // Still send DB notifications even if socket fails
                if (admins && admins.length > 0) {
                    for (const a of admins) {
                        try {
                            await sendNotification(a.user_id, message);
                            console.log(`✅ Sent DB notification to admin ${a.user_id} (fallback)`);
                        } catch (e) {
                            console.error(`❌ Failed to send fallback notification to admin ${a.user_id}:`, e);
                        }
                    }
                } else {
                    await sendNotification(null, message);
                    console.log('✅ Sent broadcast notification (fallback)');
                }
            }
        } catch (notifError) {
            console.error('❌ Failed to send admin notifications:', notifError);
            console.error('Error details:', {
                message: notifError.message,
                code: notifError.code,
                stack: notifError.stack
            });
            // Continue execution - don't fail the whole request
        }

        // 4b) Broadcast SOS to nearby drivers via socket
        try {
            const { getIO, getSocketIdForDriver } = await import('../utils/socketRegistry.js');
            const io = getIO();
            if (io && info && passenger_lat != null && passenger_lon != null) {
                // Find nearby available drivers within 5km radius
                const [nearbyDrivers] = await promisePool.query(
                    `SELECT user_id, latitude, longitude,
                        (6371 * 2 * ASIN(
                            SQRT(
                                POWER(SIN(RADIANS((latitude - ?) / 2)), 2) +
                                COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                                POWER(SIN(RADIANS((longitude - ?) / 2)), 2)
                            )
                        )) AS distance_km
                     FROM users
                     WHERE user_type IN ('driver', 'both')
                     AND is_available = 1
                     AND latitude IS NOT NULL
                     AND longitude IS NOT NULL
                     HAVING distance_km <= 5
                     ORDER BY distance_km ASC
                     LIMIT 10`,
                    [passenger_lat, passenger_lat, passenger_lon]
                );

                const sosPayload = {
                    alert_id: insertRes.insertId,
                    ride_id: bookingId,
                    passenger_id: userId,
                    passenger_name: info.passenger_name,
                    passenger_phone: info.passenger_phone,
                    location: { lat: passenger_lat, lon: passenger_lon },
                    message: message,
                    timestamp: new Date().toISOString()
                };

                nearbyDrivers.forEach((driver) => {
                    const driverSocketId = getSocketIdForDriver(Number(driver.user_id));
                    if (driverSocketId && io) {
                        io.to(driverSocketId).emit('sos_alert', sosPayload);
                    }
                });
            }
        } catch (socketError) {
            console.error('Failed to broadcast SOS to drivers:', socketError);
            // Continue execution - don't fail the whole request
        }

        // 5) Notify passenger's emergency contact via SMS/Email if available
        if (info) {
            try {
                const smsText = `${message}`;
                if (info.emergency_contact_phone) {
                    await sendSMS(info.emergency_contact_phone, smsText);
                }
                if (info.emergency_contact_email) {
                    const subject = `Emergency alert for ${info.passenger_name}`;
                    await sendEmail(info.emergency_contact_email, subject, smsText);
                }
            } catch (contactError) {
                console.error('Failed to notify emergency contact:', contactError);
                // Continue execution - don't fail the whole request
            }
        }

        // Return response with admin notification status
        const responseData = {
            alert_id: insertRes.insertId,
            booking_id: bookingId,
            admin_notifications: {
                admins_found: admins?.length || 0,
                notifications_sent: admins?.length || 0,
                message: admins && admins.length > 0 
                    ? `SOS sent to ${admins.length} admin(s)` 
                    : 'No admin users found - broadcast notification created'
            }
        };

        return successResponse(res, 200, 'SOS logged and notifications sent', responseData);
    } catch (error) {
        console.error('SOS error:', error);
        const errorMessage = error.message || 'Failed to process SOS';
        return errorResponse(res, 500, errorMessage);
    }
};


