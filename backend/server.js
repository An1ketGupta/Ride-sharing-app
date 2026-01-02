import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { testConnection, prisma } from './config/db.js';
import { setIO, registerDriverSocket, registerUserSocket, unregisterSocket, getActiveRide, markRideAccepted, getSocketIdForDriver, getSocketIdForUser } from './utils/socketRegistry.js';
import requestRoutes from './routes/requestRoutes.js';
import adminRoutes from './routes/admin.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import { sendNotification } from './utils/notifications.js';
import documentRoutes from './routes/documentRoutes.js';
import { getDriverToDestinationRoute } from './utils/ors.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import rideRoutes from './routes/rideRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import userRoutes from './routes/userRoutes.js';
import receiptRoutes from './routes/receiptRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import safetyRoutes from './routes/safetyRoutes.js';
import earningsRoutes from './routes/earningsRoutes.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
setIO(io);

// Throttle map: driver_id -> last emit timestamp
const lastDriverPosAt = new Map();

// Middleware
app.use(cors());

// JSON parsers after webhook
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test database connection
testConnection();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/drivers', documentRoutes);
app.use('/api/users', userRoutes);
app.use('/api', requestRoutes);
app.use('/admin', adminRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api', notificationRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/earnings', earningsRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Server error'
    });
});

// Socket.IO events and demo broadcaster
io.on('connection', (socket) => {
    // Driver registers their driver_id to receive targeted events
    socket.on('driver_register', ({ driver_id }) => {
        if (driver_id) {
            registerDriverSocket(Number(driver_id), socket.id);
        }
    });

    // Users can also register to receive notifications
    socket.on('user_register', ({ user_id }) => {
        if (user_id) {
            registerUserSocket(Number(user_id), socket.id);
        }
    });

    // Driver live location updates → broadcast only to passengers with active bookings for that ride
    socket.on('driver_update_position', async ({ driver_id, lat, lon, ride_id }) => {
        const id = Number(driver_id);
        const latNum = Number(lat);
        const lonNum = Number(lon);
        const rideId = ride_id ? Number(ride_id) : null;
        
        if (!Number.isFinite(id) || !Number.isFinite(latNum) || !Number.isFinite(lonNum)) return;
        const now = Date.now();
        const last = lastDriverPosAt.get(id) || 0;
        if (now - last < 2000) return; // throttle: 1 update per 2s
        lastDriverPosAt.set(id, now);

        // Persist latest driver location for proximity matching
        // This should always happen, regardless of ride_id, so location is available for API queries
        prisma.user.updateMany({
            where: {
                userId: id,
                userType: { in: ['driver', 'both'] }
            },
            data: {
                latitude: latNum,
                longitude: lonNum,
                isAvailable: true
            }
        }).then((result) => {
            // Location persisted silently
        }).catch((err) => {
            console.error(`❌ Failed to persist driver location for driver ${id}:`, err.message);
            // Don't throw - continue with socket broadcast even if DB update fails
        });

        // If ride_id is provided, only send to passengers with ongoing rides
        if (rideId && Number.isFinite(rideId)) {
            try {
                // Get ride details including destination coordinates
                const ride = await prisma.ride.findFirst({
                    where: {
                        rideId: rideId,
                        driverId: id,
                        status: 'ongoing',
                        bookings: {
                            some: {
                                bookingStatus: { in: ['confirmed', 'in_progress'] },
                                NOT: {
                                    bookingStatus: { in: ['canceled_by_driver', 'canceled_by_passenger'] }
                                }
                            }
                        }
                    },
                    include: {
                        bookings: {
                            where: {
                                bookingStatus: { in: ['confirmed', 'in_progress'] },
                                NOT: {
                                    bookingStatus: { in: ['canceled_by_driver', 'canceled_by_passenger'] }
                                }
                            },
                            select: {
                                passengerId: true,
                                bookingId: true
                            }
                        }
                    }
                });
                
                const rides = ride ? [{
                    ...ride,
                    passenger_id: ride.bookings[0]?.passengerId,
                    booking_id: ride.bookings[0]?.bookingId
                }] : [];

                if (rides.length === 0) {
                    return;
                }

                // Extract destination coordinates - try multiple methods
                let destLat = null;
                let destLon = null;
                
                // Method 1: Try to extract from destination field (format: "Destination: lat, lon" or "lat, lon")
                const destination = rides[0]?.destination || '';
                const destMatch = destination.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
                if (destMatch) {
                    destLat = parseFloat(destMatch[1]);
                    destLon = parseFloat(destMatch[2]);
                }
                
                // Method 2: If not found, try to get from ride waypoints (last waypoint as destination)
                if (!destLat || !destLon) {
                    try {
                        const waypoint = await prisma.rideWaypoint.findFirst({
                            where: { rideId: rideId },
                            orderBy: [
                                { orderIndex: 'desc' },
                                { waypointId: 'desc' }
                            ],
                            select: { lat: true, lon: true }
                        });
                        if (waypoint) {
                            destLat = Number(waypoint.lat);
                            destLon = Number(waypoint.lon);
                        }
                    } catch (waypointError) {
                        // Table might not exist, continue
                    }
                }

                // If destination coordinates not found, try to get from saved_locations or request
                // For now, we'll fetch route if we have destination coordinates
                let routeData = null;
                
                // Throttle route fetching - only fetch route every 10 seconds to avoid API rate limits
                const routeCacheKey = `route_${rideId}`;
                const lastRouteFetch = global.routeFetchCache?.get(routeCacheKey) || 0;
                const shouldFetchRoute = (Date.now() - lastRouteFetch) > 10000; // 10 seconds
                
                if (destLat && destLon && shouldFetchRoute) {
                    try {
                        routeData = await getDriverToDestinationRoute(latNum, lonNum, destLat, destLon);
                        
                        // Cache route fetch time
                        if (!global.routeFetchCache) {
                            global.routeFetchCache = new Map();
                        }
                        global.routeFetchCache.set(routeCacheKey, Date.now());
                    } catch (routeError) {
                        console.error('❌ Error fetching route:', routeError.message);
                        // Continue without route data - don't block location updates
                    }
                }

                // Group passengers by ride
                const passengerMap = new Map();
                rides.forEach(ride => {
                    if (!passengerMap.has(ride.passenger_id)) {
                        passengerMap.set(ride.passenger_id, ride);
                    }
                });

                // Send location update to each passenger with route data
                const positionPayload = {
                    driver_id: id,
                    lat: latNum,
                    lon: lonNum,
                    ride_id: rideId,
                    ts: Date.now(),
                    route: routeData && routeData.coordinates && routeData.coordinates.length > 0 ? {
                        coordinates: routeData.coordinates, // Array of {lat, lng} objects
                        distance: routeData.distance,
                        duration: routeData.duration,
                        geometry: routeData.geometry
                    } : null
                };

                passengerMap.forEach((ride, passengerId) => {
                    const passengerSocketId = getSocketIdForUser(Number(passengerId));
                    if (passengerSocketId) {
                        io.to(passengerSocketId).emit('driver:position', positionPayload);
                    }
                });
            } catch (err) {
                console.error('Error querying passengers for ride:', err);
                // Don't broadcast on error - location should only be shared for confirmed ongoing rides
            }
        } else {
            // Location is still persisted to DB even without ride_id, but not broadcast via socket
        }
    });

    // First-accept logic: the first valid driver to accept claims the ride
    socket.on('driver_accept_ride', async ({ request_id, driver_id, vehicle_id }) => {
        try {
            if (!request_id || !driver_id) return;
            const ride = getActiveRide(request_id);
            if (!ride || ride.accepted) return; // already taken or not found
            if (!ride.notified_driver_ids.includes(Number(driver_id))) return; // not eligible

            const numPeople = Number(ride.number_of_people) || 1;

            // Validate vehicle capacity BEFORE accepting
            let vehicleCapacity = 0;
            let selectedVehicleId = null;
            let hasValidVehicle = false;

            try {
                if (vehicle_id) {
                    // Check if the selected vehicle has sufficient capacity
                    const vehicle = await prisma.vehicle.findFirst({
                        where: {
                            vehicleId: parseInt(vehicle_id),
                            userId: parseInt(driver_id)
                        },
                        select: {
                            vehicleId: true,
                            capacity: true
                        }
                    });
                    
                    if (vehicle) {
                        vehicleCapacity = Number(vehicle.capacity) || 0;
                        // Vehicle capacity includes driver, so we need capacity > numPeople (e.g., 5-seater = 1 driver + 4 passengers)
                        const requiredCapacity = numPeople + 1; // +1 for driver
                        const availablePassengers = Math.max(0, vehicleCapacity - 1); // capacity - 1 for driver
                        
                        // Strict validation: vehicle capacity must be greater than number of passengers
                        // This ensures we have at least (numPeople + 1) seats total (1 driver + numPeople passengers)
                        if (vehicleCapacity > numPeople && availablePassengers >= numPeople) {
                            selectedVehicleId = Number(vehicle_id);
                            hasValidVehicle = true;
                        } else {
                            // Selected vehicle doesn't have enough capacity
                            const driverSocketId = getSocketIdForDriver(Number(driver_id));
                            if (driverSocketId && io) {
                                io.to(driverSocketId).emit('ride_accept_error', {
                                    request_id,
                                    message: `Selected vehicle can only accommodate ${availablePassengers} passengers (${vehicleCapacity}-seater), but ${numPeople} are required. Please select a different vehicle with at least ${numPeople + 1} seats.`
                                });
                            }
                            return; // Reject acceptance
                        }
                    } else {
                        // Invalid vehicle ID
                        const driverSocketId = getSocketIdForDriver(Number(driver_id));
                        if (driverSocketId && io) {
                            io.to(driverSocketId).emit('ride_accept_error', {
                                request_id,
                                message: 'Invalid vehicle selected. Please select a valid vehicle.'
                            });
                        }
                        return; // Reject acceptance
                    }
                } else {
                    // No vehicle selected - check if driver has any vehicle with sufficient capacity
                    // Vehicle capacity includes driver, so we need capacity > numPeople
                    const allVehicles = await prisma.vehicle.findMany({
                        where: {
                            userId: parseInt(driver_id),
                            capacity: { gt: numPeople }
                        },
                        orderBy: { capacity: 'asc' },
                        take: 1,
                        select: {
                            vehicleId: true,
                            capacity: true
                        }
                    });
                    
                    if (allVehicles.length > 0) {
                        vehicleCapacity = Number(allVehicles[0].capacity) || 0;
                        const availablePassengers = Math.max(0, vehicleCapacity - 1);
                        // Double-check that the auto-selected vehicle can actually accommodate the passengers
                        if (vehicleCapacity > numPeople && availablePassengers >= numPeople) {
                            selectedVehicleId = Number(allVehicles[0].vehicleId);
                            hasValidVehicle = true;
                        } else {
                            // Auto-selected vehicle doesn't have enough capacity (shouldn't happen due to SQL query, but safety check)
                            const driverSocketId = getSocketIdForDriver(Number(driver_id));
                            if (driverSocketId && io) {
                                io.to(driverSocketId).emit('ride_accept_error', {
                                    request_id,
                                    message: `You don't have any vehicle that can accommodate ${numPeople} passengers. You need a vehicle with at least ${numPeople + 1} seats (${numPeople} passengers + 1 driver).`
                                });
                            }
                            return; // Reject acceptance
                        }
                    } else {
                        // Driver has no vehicle with sufficient capacity
                        const driverSocketId = getSocketIdForDriver(Number(driver_id));
                        if (driverSocketId && io) {
                            io.to(driverSocketId).emit('ride_accept_error', {
                                request_id,
                                message: `You don't have any vehicle that can accommodate ${numPeople} passengers. You need a vehicle with at least ${numPeople + 1} seats (${numPeople} passengers + 1 driver).`
                            });
                        }
                        return; // Reject acceptance
                    }
                }
            } catch (vehicleError) {
                // If vehicles query fails, check if default capacity is sufficient
                if (vehicleError.code === 'P2025' || vehicleError.message?.includes('Record to update not found')) {
                    vehicleCapacity = 4; // default fallback
                    const availablePassengers = vehicleCapacity - 1; // 3 passengers max for 4-seater
                    // Validate that default capacity can accommodate the requested passengers
                    if (vehicleCapacity > numPeople && availablePassengers >= numPeople) {
                        hasValidVehicle = true;
                    } else {
                        // Default capacity insufficient
                        const driverSocketId = getSocketIdForDriver(Number(driver_id));
                        if (driverSocketId && io) {
                            io.to(driverSocketId).emit('ride_accept_error', {
                                request_id,
                                message: `Vehicle capacity insufficient. Need at least ${numPeople + 1} seats to accommodate ${numPeople} passengers, but only ${vehicleCapacity} seats available.`
                            });
                        }
                        return; // Reject acceptance
                    }
                } else {
                    console.error('Vehicle validation error:', vehicleError);
                    const driverSocketId = getSocketIdForDriver(Number(driver_id));
                    if (driverSocketId && io) {
                        io.to(driverSocketId).emit('ride_accept_error', {
                            request_id,
                            message: 'Error validating vehicle. Please try again.'
                        });
                    }
                    return; // Reject acceptance on error
                }
            }

            // Final validation check before accepting the ride
            if (!hasValidVehicle || !selectedVehicleId) {
                const driverSocketId = getSocketIdForDriver(Number(driver_id));
                if (driverSocketId && io) {
                    io.to(driverSocketId).emit('ride_accept_error', {
                        request_id,
                        message: 'Unable to validate vehicle capacity. Please try again or select a different vehicle.'
                    });
                }
                return; // Reject acceptance
            }
            
            // Double-check capacity one more time before proceeding
            const finalAvailablePassengers = Math.max(0, vehicleCapacity - 1);
            if (vehicleCapacity <= numPeople || finalAvailablePassengers < numPeople) {
                const driverSocketId = getSocketIdForDriver(Number(driver_id));
                if (driverSocketId && io) {
                    io.to(driverSocketId).emit('ride_accept_error', {
                        request_id,
                        message: `Vehicle capacity check failed. Vehicle has ${vehicleCapacity} seats (can accommodate ${finalAvailablePassengers} passengers), but ${numPeople} passengers are required.`
                    });
                }
                return; // Reject acceptance
            }

            // Atomically mark accepted in memory
            markRideAccepted(request_id);

            // Update DB: set driver unavailable (using users table with is_available column)
            await prisma.user.update({
                where: { userId: parseInt(driver_id) },
                data: { isAvailable: false }
            });

            // Create ride and booking in database
            try {
                // Calculate distance if destination coordinates are provided
                let distance_km = 5.0; // default
                if (ride.destination_lat && ride.destination_lon) {
                    const { haversineKm } = await import('./utils/geo.js');
                    distance_km = haversineKm(ride.source_lat, ride.source_lon, ride.destination_lat, ride.destination_lon);
                }
                
                // Fixed fare per km - 10rs per seat per km
                const fare_per_km = 10;

                // Calculate total seats (vehicle capacity) and available seats (capacity - 1 for driver - number_of_people)
                const totalSeats = vehicleCapacity;
                const availableSeats = Math.max(0, totalSeats - 1 - numPeople);

                // Create ride with status 'scheduled' - ride remains scheduled until driver manually starts it
                // The ride will NOT be automatically set to 'ongoing' - driver must manually change status when they start the ride
                const rideDate = ride.date ? new Date(ride.date) : new Date();
                const rideTime = ride.time || new Date().toTimeString().split(' ')[0].substring(0, 5);
                
                const rideResult = await prisma.ride.create({
                    data: {
                        driverId: parseInt(driver_id),
                        vehicleId: selectedVehicleId,
                        source: `Pickup: ${ride.source_lat}, ${ride.source_lon}`,
                        destination: ride.destination || `Destination: ${ride.destination_lat}, ${ride.destination_lon}`,
                        date: rideDate,
                        time: rideTime,
                        totalSeats: totalSeats,
                        availableSeats: availableSeats,
                        farePerKm: fare_per_km,
                        distanceKm: distance_km,
                        status: 'scheduled'
                    }
                });

                const ride_id = rideResult.rideId;

                // Calculate booking amount with surge pricing if available
                let estimatedAmount = 10 * distance_km * numPeople;
                if (ride.surge_multiplier && ride.surge_multiplier > 1.0) {
                    // Use surge pricing from request if available
                    estimatedAmount = ride.final_fare || estimatedAmount;
                }
                
                const bookingResult = await prisma.booking.create({
                    data: {
                        rideId: ride_id,
                        passengerId: parseInt(ride.passenger_id),
                        seatsBooked: numPeople,
                        amount: estimatedAmount,
                        bookingStatus: 'confirmed'
                    }
                });

                // Note: available_seats already accounts for the booking in the INSERT above

                const assignment = {
                    request_id,
                    booking_id: bookingResult.bookingId,
                    ride_id: ride_id,
                    passenger_id: ride.passenger_id,
                    pickup: { lat: Number(ride.source_lat), lon: Number(ride.source_lon) },
                    destination: ride.destination || null,
                    date: ride.date || null,
                    time: ride.time || null,
                    driver_id: Number(driver_id)
                };

                // Notify assigned driver
                const driverSocketId = getSocketIdForDriver(Number(driver_id));
                if (driverSocketId) {
                    io.to(driverSocketId).emit('ride_assigned', assignment);
                }

                // Notify passenger
                io.emit(`ride_assigned_passenger_${ride.passenger_id}`, assignment);

                // Send DB-backed notification to passenger
                await sendNotification(ride.passenger_id, `Your driver has accepted the ride! Booking ID: ${bookingResult.bookingId}`);

                // Notify other drivers that this ride request is no longer available
                const otherDrivers = ride.notified_driver_ids.filter(id => Number(id) !== Number(driver_id));
                otherDrivers.forEach((otherDriverId) => {
                    const otherDriverSocketId = getSocketIdForDriver(Number(otherDriverId));
                    if (otherDriverSocketId && io) {
                        io.to(otherDriverSocketId).emit('ride_request_taken', {
                            request_id,
                            message: 'This ride request has been accepted by another driver'
                        });
                    }
                });

            } catch (dbError) {
                console.error('Failed to create ride/booking:', dbError);
                // Still notify driver but log error
            }
        } catch (e) {
            console.error('Error handling driver_accept_ride:', e);
        }
    });

    // Driver rejects a ride request
    socket.on('driver_reject_ride', async ({ request_id, driver_id }) => {
        try {
            if (!request_id || !driver_id) return;
            const ride = getActiveRide(request_id);
            if (!ride) return; // request not found or already processed
            
            // Check if driver was notified about this ride
            if (!ride.notified_driver_ids.includes(Number(driver_id))) {
                return; // driver wasn't eligible for this ride
            }

            // If ride is already accepted, don't process rejection
            if (ride.accepted) {
                return;
            }

            // Optionally notify passenger that a driver rejected (if you want to track this)
            // For now, we'll just log it and let other drivers still have a chance to accept
        } catch (e) {
            console.error('Error handling driver_reject_ride:', e);
        }
    });

    // Passenger sends a message to the driver for a specific booking
    socket.on('booking_message', async ({ booking_id, text, from_user_id }) => {
        try {
            if (!booking_id || !text || !from_user_id) return;
            // Find driver for this booking and confirm sender is authorized
            const booking = await prisma.booking.findUnique({
                where: { bookingId: parseInt(booking_id) },
                include: {
                    ride: {
                        select: {
                            driverId: true
                        }
                    }
                }
            });
            if (!booking) return;
            const passenger_id = booking.passengerId;
            const driver_id = booking.ride.driverId;
            
            // Allow both passenger and driver to send messages
            const isPassenger = Number(passenger_id) === Number(from_user_id);
            const isDriver = Number(driver_id) === Number(from_user_id);
            
            if (!isPassenger && !isDriver) return; // reject unauthorized sender

            // Determine recipient
            const recipientId = isPassenger ? driver_id : passenger_id;
            const recipientSocketId = isPassenger 
                ? getSocketIdForDriver(Number(driver_id))
                : getSocketIdForUser(Number(passenger_id));

            // Let the database set the timestamp automatically
            // Prisma will handle it with @default(now())

            // Save message to database - ensure it's saved before proceeding
            let messageId = null;
            try {
                // Verify booking exists before inserting message
                const bookingCheck = await prisma.booking.findUnique({
                    where: { bookingId: parseInt(booking_id) },
                    select: { bookingId: true }
                });
                
                if (!bookingCheck) {
                    throw new Error(`Booking ${booking_id} does not exist`);
                }

                // Verify user exists
                const userCheck = await prisma.user.findUnique({
                    where: { userId: parseInt(from_user_id) },
                    select: { userId: true }
                });
                
                if (!userCheck) {
                    throw new Error(`User ${from_user_id} does not exist`);
                }

                // Now insert the message - Prisma will set the timestamp automatically
                const insertResult = await prisma.bookingMessage.create({
                    data: {
                        bookingId: parseInt(booking_id),
                        fromUserId: parseInt(from_user_id),
                        messageText: String(text)
                    }
                });
                messageId = insertResult.messageId;
            } catch (dbError) {
                console.error('❌ Failed to save message to database:', dbError);
                console.error('Error code:', dbError.code);
                console.error('Error errno:', dbError.errno);
                console.error('Error sqlState:', dbError.sqlState);
                console.error('Error sql:', dbError.sql);
                // Send error acknowledgment with detailed error
                socket.emit('booking_message_ack', { 
                    ok: false, 
                    error: 'Failed to save message to database',
                    message: dbError.message,
                    code: dbError.code,
                    errno: dbError.errno
                });
                return; // Don't proceed if message wasn't saved
            }

            // If messageId is still null, something went wrong
            if (!messageId) {
                console.error('❌ Message ID is null after insert attempt');
                socket.emit('booking_message_ack', { 
                    ok: false, 
                    error: 'Message was not saved to database' 
                });
                return;
            }

            // Get the actual timestamp from the database
            let dbTimestamp;
            try {
                const messageRow = await prisma.bookingMessage.findUnique({
                    where: { messageId: messageId },
                    select: { createdAt: true }
                });
                dbTimestamp = messageRow?.createdAt ? new Date(messageRow.createdAt).toISOString() : new Date().toISOString();
            } catch (e) {
                dbTimestamp = new Date().toISOString();
            }

            const payload = {
                message_id: messageId,
                booking_id: Number(booking_id),
                text: String(text),
                from_user_id: Number(from_user_id),
                timestamp: dbTimestamp
            };
            
            // Send to recipient AND sender (so both see it in real-time)
            if (io) {
                // Send to recipient
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('booking_message', payload);
                    // Also emit a generic notification event
                    io.to(recipientSocketId).emit('notification', {
                        notification_id: 0,
                        user_id: Number(recipientId),
                        message: `${isPassenger ? 'Passenger' : 'Driver'} message: ${String(text)}`,
                        is_read: 0,
                        created_at: dbTimestamp,
                        type: 'booking_message',
                        booking_id: Number(booking_id)
                    });
                }
                
                // Send message back to sender's socket for real-time display
                // This ensures the sender sees their own message immediately in their Messages page
                socket.emit('booking_message', payload);
            }
            
            // Persist notification for recipient
            try { 
                await sendNotification(
                    Number(recipientId), 
                    `${isPassenger ? 'Passenger' : 'Driver'} message: ${String(text)}`
                ); 
            } catch {}
            
            // Acknowledge to sender with message details
            socket.emit('booking_message_ack', { 
                ok: true, 
                message_id: messageId,
                booking_id: Number(booking_id),
                text: String(text),
                timestamp: dbTimestamp
            });
        } catch (e) {
            console.error('❌ booking_message error:', e);
            // Send error acknowledgment
            socket.emit('booking_message_ack', { 
                ok: false, 
                error: 'An error occurred while processing the message',
                message: e.message 
            });
        }
    });

    socket.on('disconnect', () => {
        unregisterSocket(socket.id);
    });
});

// Removed demo broadcaster to avoid noisy emissions in production

// Start cron job processor for scheduled rides
try {
    const { startCronProcessor } = await import('./utils/cron.js');
    startCronProcessor();
} catch (cronError) {
    console.warn('⚠️  Failed to start cron processor:', cronError.message);
}

// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
    console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
    console.log(`🛰️  Socket.IO: ws://localhost:${PORT}`);
});

// (webhook is defined earlier to preserve raw body)

export default app;

