import { prisma } from '../config/db.js';
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
        const user = await prisma.user.findUnique({
            where: { userId: driver_id },
            select: { userType: true }
        });

        if (!user || (user.userType !== 'driver' && user.userType !== 'both')) {
            return errorResponse(res, 403, 'Only drivers can create rides');
        }

        // Optionally check admin-verified driver documents
        try {
            const docStats = await prisma.driverDocument.groupBy({
                by: ['driverId'],
                where: { driverId: driver_id },
                _count: true,
                _sum: {
                    // We'll count approved manually
                }
            });

            const allDocs = await prisma.driverDocument.findMany({
                where: { driverId: driver_id }
            });

            const approvedCount = allDocs.filter(doc => doc.status === 'approved').length;
            const totalCount = allDocs.length;

            if (totalCount > 0 && approvedCount === 0) {
                return errorResponse(res, 403, 'Your documents are pending admin verification. Ride creation will be enabled after approval.');
            }
        } catch (e) {
            // If driver_documents table doesn't exist, continue without document verification
            console.log('Document verification skipped:', e.message);
        }

        // Validate vehicle_id if provided - ensure it belongs to the driver
        if (vehicle_id) {
            try {
                const vehicle = await prisma.vehicle.findFirst({
                    where: {
                        vehicleId: parseInt(vehicle_id),
                        userId: driver_id
                    }
                });
                if (!vehicle) {
                    return errorResponse(res, 400, 'Invalid vehicle selected. Vehicle must belong to you.');
                }
            } catch (e) {
                console.warn('Vehicle validation skipped:', e.message);
            }
        }

        // Normalize time to HH:MM:SS format
        const normalizedTime = time && time.length === 5 ? `${time}:00` : time;

        // Insert ride
        const ride = await prisma.ride.create({
            data: {
                driverId: driver_id,
                vehicleId: vehicle_id ? parseInt(vehicle_id) : null,
                source: source,
                destination: destination,
                date: date ? new Date(date) : new Date(),
                time: normalizedTime || '00:00:00',
                totalSeats: parseInt(total_seats),
                availableSeats: parseInt(total_seats),
                farePerKm: fare_per_km,
                distanceKm: parseFloat(distance_km) || 0,
                status: 'scheduled'
            },
            include: {
                driver: {
                    select: {
                        name: true
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
        });

        // Format response
        const formattedRide = {
            ride_id: ride.rideId,
            driver_id: ride.driverId,
            vehicle_id: ride.vehicleId,
            source: ride.source,
            destination: ride.destination,
            date: ride.date,
            time: ride.time,
            total_seats: ride.totalSeats,
            available_seats: ride.availableSeats,
            fare_per_km: ride.farePerKm,
            distance_km: ride.distanceKm,
            status: ride.status,
            created_at: ride.createdAt,
            driver_name: ride.driver.name,
            vehicle_model: ride.vehicle?.model || null,
            vehicle_color: ride.vehicle?.color || null,
            license_plate: ride.vehicle?.licensePlate || null,
            vehicle_image_url: ride.vehicle?.vehicleImageUrl || null,
            vehicle_capacity: ride.vehicle?.capacity || null
        };

        return successResponse(res, 201, 'Ride created successfully', formattedRide);

    } catch (error) {
        console.error('Create ride error:', error);
        
        // Provide more specific error messages
        if (error.code === 'P2003') {
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

        const where = {
            status: 'scheduled',
            availableSeats: { gt: 0 }
        };

        if (source) {
            where.source = { contains: source, mode: 'insensitive' };
        }

        if (destination) {
            where.destination = { contains: destination, mode: 'insensitive' };
        }

        if (date) {
            const dateObj = new Date(date);
            where.date = {
                gte: new Date(dateObj.setHours(0, 0, 0, 0)),
                lt: new Date(dateObj.setHours(23, 59, 59, 999))
            };
        }

        const rides = await prisma.ride.findMany({
            where,
            include: {
                driver: {
                    select: {
                        name: true,
                        phone: true,
                        rating: true
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
            },
            orderBy: [
                { date: 'asc' },
                { time: 'asc' }
            ]
        });

        // Add estimated fare for each ride - Fixed 10rs per seat per km
        const ridesWithFare = rides.map(ride => ({
            ride_id: ride.rideId,
            driver_id: ride.driverId,
            vehicle_id: ride.vehicleId,
            source: ride.source,
            destination: ride.destination,
            date: ride.date,
            time: ride.time,
            total_seats: ride.totalSeats,
            available_seats: ride.availableSeats,
            fare_per_km: ride.farePerKm,
            distance_km: Number(ride.distanceKm),
            status: ride.status,
            created_at: ride.createdAt,
            driver_name: ride.driver.name,
            driver_phone: ride.driver.phone,
            driver_rating: ride.driver.rating ? Number(ride.driver.rating) : null,
            vehicle_model: ride.vehicle?.model || null,
            vehicle_color: ride.vehicle?.color || null,
            license_plate: ride.vehicle?.licensePlate || null,
            vehicle_image_url: ride.vehicle?.vehicleImageUrl || null,
            vehicle_capacity: ride.vehicle?.capacity || null,
            estimated_fare: (10 * Number(ride.distanceKm)).toFixed(2) // 10rs per seat per km (shown per seat)
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

        const ride = await prisma.ride.findUnique({
            where: { rideId: parseInt(id) },
            include: {
                driver: {
                    select: {
                        name: true,
                        phone: true,
                        rating: true
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
        });

        if (!ride) {
            return errorResponse(res, 404, 'Ride not found');
        }

        const formattedRide = {
            ride_id: ride.rideId,
            driver_id: ride.driverId,
            vehicle_id: ride.vehicleId,
            source: ride.source,
            destination: ride.destination,
            date: ride.date,
            time: ride.time,
            total_seats: ride.totalSeats,
            available_seats: ride.availableSeats,
            fare_per_km: ride.farePerKm,
            distance_km: Number(ride.distanceKm),
            status: ride.status,
            created_at: ride.createdAt,
            driver_name: ride.driver.name,
            driver_phone: ride.driver.phone,
            driver_rating: ride.driver.rating ? Number(ride.driver.rating) : null,
            vehicle_model: ride.vehicle?.model || null,
            vehicle_color: ride.vehicle?.color || null,
            license_plate: ride.vehicle?.licensePlate || null,
            vehicle_image_url: ride.vehicle?.vehicleImageUrl || null,
            vehicle_capacity: ride.vehicle?.capacity || null
        };

        return successResponse(res, 200, 'Ride retrieved successfully', formattedRide);

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

        // Get all rides with vehicle info
        const rides = await prisma.ride.findMany({
            where: { driverId: driver_id },
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
            },
            orderBy: [
                { date: 'desc' },
                { time: 'desc' }
            ]
        });

        // Get booking statistics for each ride
        if (rides.length > 0) {
            const rideIds = rides.map(r => r.rideId);
            
            try {
                const bookingStats = await prisma.booking.groupBy({
                    by: ['rideId'],
                    where: {
                        rideId: { in: rideIds },
                        bookingStatus: { in: ['confirmed', 'in_progress', 'completed'] },
                        NOT: {
                            bookingStatus: { in: ['canceled_by_driver', 'canceled_by_passenger', 'pending'] }
                        }
                    },
                    _count: true,
                    _sum: {
                        seatsBooked: true,
                        amount: true
                    }
                });

                // Create a map of booking stats by ride_id
                const statsMap = {};
                bookingStats.forEach(stat => {
                    statsMap[stat.rideId] = {
                        total_bookings: stat._count || 0,
                        seats_booked_count: Number(stat._sum.seatsBooked) || 0,
                        total_revenue: Number(stat._sum.amount) || 0
                    };
                });

                // Merge stats into rides
                rides.forEach(ride => {
                    const stats = statsMap[ride.rideId] || {
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

        // Format rides
        const formattedRides = rides.map(ride => ({
            ride_id: ride.rideId,
            driver_id: ride.driverId,
            vehicle_id: ride.vehicleId,
            source: ride.source,
            destination: ride.destination,
            date: ride.date,
            time: ride.time,
            total_seats: ride.totalSeats,
            available_seats: ride.availableSeats,
            fare_per_km: ride.farePerKm,
            distance_km: Number(ride.distanceKm),
            status: ride.status,
            created_at: ride.createdAt,
            vehicle_model: ride.vehicle?.model || null,
            vehicle_color: ride.vehicle?.color || null,
            license_plate: ride.vehicle?.licensePlate || null,
            vehicle_image_url: ride.vehicle?.vehicleImageUrl || null,
            vehicle_capacity: ride.vehicle?.capacity || null,
            total_bookings: ride.total_bookings || 0,
            seats_booked_count: ride.seats_booked_count || 0,
            total_revenue: ride.total_revenue || 0
        }));

        return successResponse(res, 200, 'Your rides retrieved successfully', formattedRides);

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
        const ride = await prisma.ride.findFirst({
            where: {
                rideId: ride_id,
                driverId: driver_id
            }
        });

        if (!ride) {
            return errorResponse(res, 404, 'Ride not found or unauthorized');
        }

        // If driver is cancelling the ride, handle all bookings
        if (status === 'cancelled') {
            await prisma.$transaction(async (tx) => {
                // Update ride status
                await tx.ride.update({
                    where: { rideId: ride_id },
                    data: { status: 'cancelled' }
                });
                
                // Get all confirmed or pending bookings for this ride
                const bookings = await tx.booking.findMany({
                    where: {
                        rideId: ride_id,
                        bookingStatus: { in: ['confirmed', 'pending'] }
                    },
                    include: {
                        payments: {
                            where: {
                                paymentStatus: 'completed'
                            },
                            take: 1,
                            select: {
                                paymentMethod: true,
                                paymentId: true
                            }
                        }
                    }
                });
                
                // Cancel all bookings and process refunds
                for (const booking of bookings) {
                    // Update booking status to canceled_by_driver
                    await tx.booking.update({
                        where: { bookingId: booking.bookingId },
                        data: { bookingStatus: 'canceled_by_driver' }
                    });
                    
                    // Restore seats if booking was confirmed
                    if (booking.bookingStatus === 'confirmed') {
                        await tx.ride.update({
                            where: { rideId: ride_id },
                            data: {
                                availableSeats: {
                                    increment: booking.seatsBooked
                                }
                            }
                        });
                    }
                    
                    // Process refund if payment was made via wallet
                    const payment = booking.payments[0];
                    if (payment && payment.paymentMethod === 'wallet') {
                        const refundAmount = Number(booking.amount);
                        
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
                    
                    // Send cancellation notification to passenger
                    try {
                        const message = `Your ride from ${ride.source} to ${ride.destination} on ${ride.date} at ${ride.time} has been cancelled by the driver. ${payment?.paymentMethod === 'wallet' ? 'Your payment has been refunded to your wallet.' : 'Please contact us for refund.'}`;
                        await sendNotification(booking.passengerId, message);
                    } catch (e) {
                        console.error('Failed to send cancellation notification:', e);
                        // Continue even if notification fails
                    }
                }
            });
            
            const bookings = await prisma.booking.findMany({
                where: {
                    rideId: ride_id,
                    bookingStatus: { in: ['confirmed', 'pending'] }
                },
                include: {
                    payments: {
                        where: {
                            paymentStatus: 'completed'
                        },
                        take: 1
                    }
                }
            });
            
            return successResponse(res, 200, 'Ride cancelled and all passengers notified', {
                ride_id: ride_id,
                status: 'cancelled',
                bookings_cancelled: bookings.length,
                refunds_processed: bookings.filter(b => b.payments[0]?.paymentMethod === 'wallet').length
            });
        }
        
        // Update status for non-cancellation status changes
        await prisma.ride.update({
            where: { rideId: ride_id },
            data: { status: status }
        });

        // If ride completed and it was a night ride, create safety check records and notify passengers
        if (status === 'completed') {
            // Determine "night" by ride's scheduled time: 22:00-05:00
            const rideTimeStr = ride.time || '00:00:00';
            const [hh, mm] = rideTimeStr.split(':').map(Number);
            const rideHour = Number.isFinite(hh) ? hh : 0;
            const isNight = true; // Always create safety checks for completed rides
            
            if (isNight) {
                // Get all confirmed bookings for this ride
                const bookings = await prisma.booking.findMany({
                    where: {
                        rideId: ride_id,
                        bookingStatus: 'confirmed'
                    },
                    select: {
                        bookingId: true,
                        passengerId: true
                    }
                });
                
                for (const booking of bookings) {
                    try {
                        // Create safety check record
                        await prisma.nightRideSafetyCheck.create({
                            data: {
                                bookingId: booking.bookingId,
                                rideId: ride_id,
                                passengerId: booking.passengerId,
                                rideCompletedAt: new Date()
                            }
                        });
                        
                        // Send notification to passenger
                        await sendNotification(
                            booking.passengerId, 
                            'Hope you reached safely. Please confirm you arrived at your destination. Click here to confirm your safety.'
                        );
                    } catch (e) {
                        console.error(`Failed to create safety check for booking ${booking.bookingId}:`, e);
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
        const ride = await prisma.ride.findFirst({
            where: {
                rideId: ride_id,
                driverId: driver_id
            }
        });
        
        if (!ride) {
            return errorResponse(res, 404, 'Ride not found or unauthorized');
        }
        
        if (ride.status !== 'scheduled') {
            return errorResponse(res, 400, 'Only scheduled rides can be edited');
        }

        // Compute already booked seats
        const bookedResult = await prisma.booking.aggregate({
            where: {
                rideId: ride_id,
                NOT: {
                    bookingStatus: { in: ['canceled_by_driver', 'canceled_by_passenger'] }
                }
            },
            _sum: {
                seatsBooked: true
            }
        });
        
        const booked = Number(bookedResult._sum.seatsBooked || 0);

        const newTotal = total_seats != null ? Number(total_seats) : ride.totalSeats;
        if (newTotal < booked) {
            return errorResponse(res, 400, `Cannot set total seats below already booked (${booked})`);
        }

        const newAvailable = newTotal - booked;

        // Normalize time if provided
        const normalizedTime = time ? (time.length === 5 ? `${time}:00` : time) : ride.time;

        // Update ride
        const updated = await prisma.ride.update({
            where: { rideId: ride_id },
            data: {
                source: source ?? undefined,
                destination: destination ?? undefined,
                date: date ? new Date(date) : undefined,
                time: normalizedTime ?? undefined,
                totalSeats: newTotal,
                availableSeats: newAvailable,
                farePerKm: fare_per_km,
                distanceKm: distance_km ? parseFloat(distance_km) : undefined
            },
            include: {
                driver: {
                    select: {
                        name: true
                    }
                }
            }
        });

        const formattedRide = {
            ride_id: updated.rideId,
            driver_id: updated.driverId,
            vehicle_id: updated.vehicleId,
            source: updated.source,
            destination: updated.destination,
            date: updated.date,
            time: updated.time,
            total_seats: updated.totalSeats,
            available_seats: updated.availableSeats,
            fare_per_km: updated.farePerKm,
            distance_km: Number(updated.distanceKm),
            status: updated.status,
            created_at: updated.createdAt,
            driver_name: updated.driver.name
        };

        return successResponse(res, 200, 'Ride updated successfully', formattedRide);
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
        
        const schedule = await prisma.rideSchedule.create({
            data: {
                driverId: parseInt(driver_id),
                cronExpr: String(cron_expr).slice(0, 64),
                active: active ? true : false
            }
        });
        
        return successResponse(res, 201, 'Schedule created', { schedule_id: schedule.scheduleId });
    } catch (e) {
        console.error('Schedule ride error:', e);
        return errorResponse(res, 500, 'Failed to create schedule');
    }
};

// @route GET /api/rides/schedule/my
export const getMySchedules = async (req, res) => {
    try {
        const driver_id = req.user.id;
        const schedules = await prisma.rideSchedule.findMany({
            where: { driverId: parseInt(driver_id) },
            orderBy: { createdAt: 'desc' }
        });
        
        return successResponse(res, 200, 'OK', schedules.map(s => ({
            schedule_id: s.scheduleId,
            driver_id: s.driverId,
            cron_expr: s.cronExpr,
            active: s.active ? 1 : 0,
            created_at: s.createdAt
        })));
    } catch (e) {
        console.error('Get schedules error:', e);
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
        
        // Require driver ownership of ride
        const ride = await prisma.ride.findFirst({
            where: {
                rideId: parseInt(ride_id),
                driverId: parseInt(driver_id)
            }
        });
        
        if (!ride) return errorResponse(res, 403, 'Unauthorized');
        
        const waypoint = await prisma.rideWaypoint.create({
            data: {
                rideId: parseInt(ride_id),
                name: name || null,
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                orderIndex: Number(order_index || 0)
            }
        });
        
        return successResponse(res, 201, 'Waypoint added', { waypoint_id: waypoint.waypointId });
    } catch (e) {
        console.error('Add waypoint error:', e);
        return errorResponse(res, 500, 'Failed to add waypoint');
    }
};

// @route GET /api/rides/:ride_id/waypoints
export const listWaypoints = async (req, res) => {
    try {
        const { ride_id } = req.params;
        const waypoints = await prisma.rideWaypoint.findMany({
            where: { rideId: parseInt(ride_id) },
            orderBy: [
                { orderIndex: 'asc' },
                { waypointId: 'asc' }
            ]
        });
        
        return successResponse(res, 200, 'OK', waypoints.map(w => ({
            waypoint_id: w.waypointId,
            ride_id: w.rideId,
            name: w.name,
            lat: Number(w.lat),
            lon: Number(w.lon),
            order_index: w.orderIndex,
            created_at: w.createdAt
        })));
    } catch (e) {
        console.error('List waypoints error:', e);
        return errorResponse(res, 500, 'Failed to fetch waypoints');
    }
};
