import { prisma } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';
import { sendNotification, sendSMS, sendEmail } from '../utils/notifications.js';
import { haversineKm } from '../utils/geo.js';

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

        // Verify booking exists and get context: passenger, driver, vehicle, route
        const booking = await prisma.booking.findUnique({
            where: { bookingId: bookingId },
            include: {
                passenger: {
                    select: {
                        name: true,
                        phone: true,
                        email: true,
                        emergencyContactName: true,
                        emergencyContactPhone: true,
                        emergencyContactEmail: true
                    }
                },
                ride: {
                    include: {
                        driver: {
                            select: {
                                name: true,
                                phone: true,
                                email: true
                            }
                        },
                        vehicle: {
                            select: {
                                model: true,
                                licensePlate: true,
                                color: true,
                                capacity: true
                            }
                        }
                    }
                }
            }
        });

        if (!booking) {
            return errorResponse(res, 404, 'Booking not found');
        }

        // Verify user_id matches passenger_id or is admin
        if (Number(booking.passengerId) !== userId) {
            // Check if user is admin
            const admin = await prisma.user.findFirst({
                where: {
                    userId: userId,
                    userType: 'admin'
                }
            });
            if (!admin) {
                return errorResponse(res, 403, 'Unauthorized: Only the passenger or admin can raise SOS for this booking');
            }
        }

        // Log SOS alert
        const sosAlert = await prisma.sosAlert.create({
            data: {
                rideId: bookingId, // Note: In schema, rideId in sos_alerts references booking_id
                userId: userId,
                details: details || null
            }
        });

        // Build messages
        const mapsLink = (lat, lon) => lat != null && lon != null ? `https://maps.google.com/?q=${lat},${lon}` : null;
        const passengerLocLink = mapsLink(passenger_lat, passenger_lon);
        const parts = [];
        parts.push(`🚨🚨 EMERGENCY SOS ALERT 🚨🚨`);
        parts.push(`Booking ID: #${bookingId}`);
        parts.push(``);
        
        // Passenger Information
        parts.push(`📱 PASSENGER INFORMATION:`);
        parts.push(`   Name: ${booking.passenger.name || 'N/A'}`);
        parts.push(`   Phone: ${booking.passenger.phone || 'N/A'}`);
        parts.push(`   Email: ${booking.passenger.email || 'N/A'}`);
        parts.push(`   Passenger ID: ${booking.passengerId}`);
        parts.push(``);
        
        // Driver Information
        parts.push(`🚗 DRIVER INFORMATION:`);
        parts.push(`   Name: ${booking.ride.driver.name || 'N/A'}`);
        parts.push(`   Phone: ${booking.ride.driver.phone || 'N/A'}`);
        parts.push(`   Email: ${booking.ride.driver.email || 'N/A'}`);
        parts.push(`   Driver ID: ${booking.ride.driverId}`);
        parts.push(``);
        
        // Vehicle Information
        if (booking.ride.vehicle) {
            parts.push(`🚙 VEHICLE INFORMATION:`);
            parts.push(`   Model: ${booking.ride.vehicle.model || 'N/A'}`);
            parts.push(`   Color: ${booking.ride.vehicle.color || 'N/A'}`);
            parts.push(`   License Plate: ${booking.ride.vehicle.licensePlate || 'N/A'}`);
            parts.push(`   Capacity: ${booking.ride.vehicle.capacity || 'N/A'} seats`);
            parts.push(``);
        }
        
        // Ride Information
        parts.push(`📍 RIDE INFORMATION:`);
        parts.push(`   Source: ${booking.ride.source || 'N/A'}`);
        parts.push(`   Destination: ${booking.ride.destination || 'N/A'}`);
        if (booking.ride.date) parts.push(`   Date: ${booking.ride.date}`);
        if (booking.ride.time) parts.push(`   Time: ${booking.ride.time}`);
        if (booking.ride.distanceKm) parts.push(`   Distance: ${booking.ride.distanceKm} km`);
        parts.push(`   Fare: ₹10 per seat per km`); // Fixed fare
        parts.push(`   Ride Status: ${booking.ride.status || 'N/A'}`);
        parts.push(``);
        
        // Booking Information
        parts.push(`🎫 BOOKING INFORMATION:`);
        parts.push(`   Seats Booked: ${booking.seatsBooked || 'N/A'}`);
        if (booking.amount) parts.push(`   Amount: ₹${booking.amount}`);
        parts.push(`   Booking Status: ${booking.bookingStatus || 'N/A'}`);
        if (booking.bookingDate) parts.push(`   Booking Date: ${booking.bookingDate}`);
        parts.push(``);
        
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
        if (booking.passenger.emergencyContactName) {
            parts.push(`🆘 EMERGENCY CONTACT:`);
            parts.push(`   Name: ${booking.passenger.emergencyContactName}`);
            if (booking.passenger.emergencyContactPhone) parts.push(`   Phone: ${booking.passenger.emergencyContactPhone}`);
            if (booking.passenger.emergencyContactEmail) parts.push(`   Email: ${booking.passenger.emergencyContactEmail}`);
        }

        const message = parts.join('\n');

        // Notify all admins in-app (and realtime via socket)
        let admins = [];
        let adminNotificationStatus = { admins_found: 0, notifications_sent: 0, message: '' };
        
        try {
            // Get all admin users
            admins = await prisma.user.findMany({
                where: { userType: 'admin' },
                select: {
                    userId: true,
                    name: true,
                    email: true,
                    phone: true,
                    userType: true
                }
            });
            
            console.log(`✅ Found ${admins.length} admin(s)`);
            
            // Also broadcast SOS via socket to all admins
            try {
                const { getIO, getSocketIdForUser } = await import('../utils/socketRegistry.js');
                const io = getIO();
                
                if (admins && admins.length > 0) {
                    let successCount = 0;
                    let socketCount = 0;
                    
                    for (const a of admins) {
                        try {
                            console.log(`📤 Attempting to notify admin ${a.userId} (${a.name || a.email || 'Unknown'})...`);
                            
                            // Send database notification
                            const notifResult = await sendNotification(a.userId, `🚨 SOS ALERT: ${message}`);
                            successCount++;
                            console.log(`✅ Sent DB notification to admin ${a.userId} (${a.name || a.email || 'Unknown'}) - Notification ID: ${notifResult?.notification_id || 'N/A'}`);
                            
                            // Also emit via socket for real-time notification
                            const adminSocketId = getSocketIdForUser(Number(a.userId));
                            console.log(`🔍 Admin ${a.userId} socket lookup: socketId=${adminSocketId || 'null'}, io=${io ? 'available' : 'null'}`);
                            
                            if (io && adminSocketId) {
                                const sosPayload = {
                                    alert_id: sosAlert.alertId,
                                    booking_id: bookingId,
                                    ride_id: booking.rideId,
                                    // Passenger Information
                                    passenger_id: userId,
                                    passenger_name: booking.passenger.name,
                                    passenger_phone: booking.passenger.phone,
                                    passenger_email: booking.passenger.email,
                                    // Driver Information
                                    driver_id: booking.ride.driverId,
                                    driver_name: booking.ride.driver.name,
                                    driver_phone: booking.ride.driver.phone,
                                    driver_email: booking.ride.driver.email,
                                    // Vehicle Information
                                    vehicle_model: booking.ride.vehicle?.model || null,
                                    vehicle_color: booking.ride.vehicle?.color || null,
                                    vehicle_plate: booking.ride.vehicle?.licensePlate || null,
                                    vehicle_capacity: booking.ride.vehicle?.capacity || null,
                                    // Ride Information
                                    source: booking.ride.source,
                                    destination: booking.ride.destination,
                                    ride_date: booking.ride.date,
                                    ride_time: booking.ride.time,
                                    ride_status: booking.ride.status,
                                    distance_km: booking.ride.distanceKm ? Number(booking.ride.distanceKm) : null,
                                    fare_per_km: booking.ride.farePerKm ? Number(booking.ride.farePerKm) : null,
                                    // Booking Information
                                    seats_booked: booking.seatsBooked,
                                    amount: booking.amount ? Number(booking.amount) : null,
                                    booking_status: booking.bookingStatus,
                                    booking_date: booking.bookingDate,
                                    // Location
                                    location: { lat: passenger_lat, lon: passenger_lon },
                                    location_link: passengerLocLink,
                                    // Emergency Details
                                    details: details || null,
                                    // Emergency Contact
                                    emergency_contact_name: booking.passenger.emergencyContactName,
                                    emergency_contact_phone: booking.passenger.emergencyContactPhone,
                                    emergency_contact_email: booking.passenger.emergencyContactEmail,
                                    // Full formatted message
                                    message: message,
                                    timestamp: new Date().toISOString()
                                };
                                io.to(adminSocketId).emit('sos_alert_admin', sosPayload);
                                socketCount++;
                                console.log(`📡 Sent socket notification 'sos_alert_admin' to admin ${a.userId} (socket: ${adminSocketId})`);
                            } else {
                                console.warn(`⚠️ Admin ${a.userId} not connected via socket (socketId: ${adminSocketId || 'null'}, io: ${io ? 'available' : 'null'})`);
                            }
                        } catch (adminError) {
                            console.error(`❌ Failed to notify admin ${a.userId}:`, adminError);
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
                            alert_id: sosAlert.alertId,
                            booking_id: bookingId,
                            ride_id: booking.rideId,
                            passenger_id: userId,
                            passenger_name: booking.passenger.name,
                            passenger_phone: booking.passenger.phone,
                            passenger_email: booking.passenger.email,
                            driver_id: booking.ride.driverId,
                            driver_name: booking.ride.driver.name,
                            driver_phone: booking.ride.driver.phone,
                            driver_email: booking.ride.driver.email,
                            vehicle_model: booking.ride.vehicle?.model || null,
                            vehicle_color: booking.ride.vehicle?.color || null,
                            vehicle_plate: booking.ride.vehicle?.licensePlate || null,
                            vehicle_capacity: booking.ride.vehicle?.capacity || null,
                            source: booking.ride.source,
                            destination: booking.ride.destination,
                            ride_date: booking.ride.date,
                            ride_time: booking.ride.time,
                            ride_status: booking.ride.status,
                            distance_km: booking.ride.distanceKm ? Number(booking.ride.distanceKm) : null,
                            fare_per_km: booking.ride.farePerKm ? Number(booking.ride.farePerKm) : null,
                            seats_booked: booking.seatsBooked,
                            amount: booking.amount ? Number(booking.amount) : null,
                            booking_status: booking.bookingStatus,
                            booking_date: booking.bookingDate,
                            location: { lat: passenger_lat, lon: passenger_lon },
                            location_link: passengerLocLink,
                            details: details || null,
                            emergency_contact_name: booking.passenger.emergencyContactName,
                            emergency_contact_phone: booking.passenger.emergencyContactPhone,
                            emergency_contact_email: booking.passenger.emergencyContactEmail,
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
                            alert_id: sosAlert.alertId,
                            booking_id: bookingId,
                            passenger_id: userId,
                            message: message,
                            timestamp: new Date().toISOString()
                        });
                        console.log('📢 Broadcasted SOS alert to all connected sockets (no admins found)');
                    }
                }
                
                // ALWAYS create a broadcast notification (user_id = NULL) so ALL admins can see SOS alerts
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
                            await sendNotification(a.userId, message);
                            console.log(`✅ Sent DB notification to admin ${a.userId} (fallback)`);
                        } catch (e) {
                            console.error(`❌ Failed to send fallback notification to admin ${a.userId}:`, e);
                        }
                    }
                } else {
                    await sendNotification(null, message);
                    console.log('✅ Sent broadcast notification (fallback)');
                }
            }
        } catch (notifError) {
            console.error('❌ Failed to send admin notifications:', notifError);
            // Continue execution - don't fail the whole request
        }

        // Broadcast SOS to nearby drivers via socket
        try {
            const { getIO, getSocketIdForDriver } = await import('../utils/socketRegistry.js');
            const io = getIO();
            if (io && passenger_lat != null && passenger_lon != null) {
                // Find nearby available drivers within 5km radius
                // Get all available drivers first, then filter by distance in JavaScript
                const allDrivers = await prisma.user.findMany({
                    where: {
                        userType: { in: ['driver', 'both'] },
                        isAvailable: true,
                        latitude: { not: null },
                        longitude: { not: null }
                    },
                    select: {
                        userId: true,
                        latitude: true,
                        longitude: true
                    }
                });

                // Calculate distance for each driver and filter those within 5km
                const nearbyDrivers = allDrivers
                    .map(driver => {
                        const distance = haversineKm(
                            Number(driver.latitude),
                            Number(driver.longitude),
                            passenger_lat,
                            passenger_lon
                        );
                        return { ...driver, distance_km: distance };
                    })
                    .filter(driver => driver.distance_km <= 5)
                    .sort((a, b) => a.distance_km - b.distance_km)
                    .slice(0, 10); // Limit to 10 nearest drivers

                const sosPayload = {
                    alert_id: sosAlert.alertId,
                    ride_id: bookingId,
                    passenger_id: userId,
                    passenger_name: booking.passenger.name,
                    passenger_phone: booking.passenger.phone,
                    location: { lat: passenger_lat, lon: passenger_lon },
                    message: message,
                    timestamp: new Date().toISOString()
                };

                nearbyDrivers.forEach((driver) => {
                    const driverSocketId = getSocketIdForDriver(Number(driver.userId));
                    if (driverSocketId && io) {
                        io.to(driverSocketId).emit('sos_alert', sosPayload);
                    }
                });
            }
        } catch (socketError) {
            console.error('Failed to broadcast SOS to drivers:', socketError);
            // Continue execution - don't fail the whole request
        }

        // Notify passenger's emergency contact via SMS/Email if available
        try {
            const smsText = `${message}`;
            if (booking.passenger.emergencyContactPhone) {
                await sendSMS(booking.passenger.emergencyContactPhone, smsText);
            }
            if (booking.passenger.emergencyContactEmail) {
                const subject = `Emergency alert for ${booking.passenger.name}`;
                await sendEmail(booking.passenger.emergencyContactEmail, subject, smsText);
            }
        } catch (contactError) {
            console.error('Failed to notify emergency contact:', contactError);
            // Continue execution - don't fail the whole request
        }

        // Return response with admin notification status
        const responseData = {
            alert_id: sosAlert.alertId,
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
