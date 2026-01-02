/**
 * Driver Earnings and Commission Tracking Controller
 * 
 * Tracks driver earnings, platform commission, and provides analytics
 */

import { prisma } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';

// Platform commission rate (15% of ride fare)
const PLATFORM_COMMISSION_RATE = 0.15;

/**
 * Calculate and record driver earnings from a completed booking
 * @param {number} bookingId - Booking ID
 * @param {number} rideId - Ride ID
 * @param {number} driverId - Driver ID
 * @param {number} totalAmount - Total booking amount
 * @returns {Promise<Object>} Earnings record
 */
export const recordDriverEarnings = async (bookingId, rideId, driverId, totalAmount) => {
    try {
        const amount = Number(totalAmount);
        const commission = amount * PLATFORM_COMMISSION_RATE;
        const driverEarnings = amount - commission;

        // Store earnings in a transaction log (we'll use a simple approach with existing tables)
        // In production, you'd want a dedicated earnings/transactions table
        
        // For now, we'll calculate earnings on-the-fly from completed bookings
        // But we can add metadata to track this
        
        return {
            booking_id: bookingId,
            ride_id: rideId,
            driver_id: driverId,
            total_amount: amount,
            platform_commission: commission,
            driver_earnings: driverEarnings,
            commission_rate: PLATFORM_COMMISSION_RATE
        };
    } catch (error) {
        console.error('Error recording driver earnings:', error);
        throw error;
    }
};

/**
 * Get driver earnings summary
 * @route GET /api/earnings/summary
 * @access Private (Driver only)
 */
export const getEarningsSummary = async (req, res) => {
    try {
        const driver_id = Number(req.user?.id);
        
        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        // Verify user is a driver
        const user = await prisma.user.findUnique({
            where: { userId: driver_id },
            select: { userType: true }
        });

        if (!user || (user.userType !== 'driver' && user.userType !== 'both')) {
            return errorResponse(res, 403, 'Only drivers can view earnings');
        }

        // Get all completed bookings for driver's rides
        const completedBookings = await prisma.booking.findMany({
            where: {
                ride: {
                    driverId: driver_id
                },
                bookingStatus: 'completed',
                payments: {
                    some: {
                        paymentStatus: 'completed'
                    }
                }
            },
            include: {
                payments: {
                    where: {
                        paymentStatus: 'completed'
                    },
                    take: 1
                },
                ride: {
                    select: {
                        rideId: true,
                        date: true
                    }
                }
            }
        });

        // Calculate earnings
        let totalEarnings = 0;
        let totalCommission = 0;
        let totalRides = 0;
        const earningsByDate = {};

        completedBookings.forEach(booking => {
            const amount = Number(booking.amount);
            const commission = amount * PLATFORM_COMMISSION_RATE;
            const driverEarnings = amount - commission;

            totalEarnings += driverEarnings;
            totalCommission += commission;
            totalRides += 1;

            // Group by date
            const dateKey = booking.ride.date.toISOString().split('T')[0];
            if (!earningsByDate[dateKey]) {
                earningsByDate[dateKey] = {
                    date: dateKey,
                    earnings: 0,
                    commission: 0,
                    rides: 0
                };
            }
            earningsByDate[dateKey].earnings += driverEarnings;
            earningsByDate[dateKey].commission += commission;
            earningsByDate[dateKey].rides += 1;
        });

        // Get pending earnings (bookings completed but payment pending)
        const pendingBookings = await prisma.booking.findMany({
            where: {
                ride: {
                    driverId: driver_id
                },
                bookingStatus: { in: ['confirmed', 'in_progress'] },
                payments: {
                    some: {
                        paymentStatus: { in: ['pending', 'completed'] }
                    }
                }
            },
            include: {
                payments: {
                    where: {
                        paymentStatus: { in: ['pending', 'completed'] }
                    },
                    take: 1
                }
            }
        });

        let pendingEarnings = 0;
        pendingBookings.forEach(booking => {
            const payment = booking.payments[0];
            if (payment && payment.paymentStatus === 'pending') {
                const amount = Number(booking.amount);
                const commission = amount * PLATFORM_COMMISSION_RATE;
                pendingEarnings += (amount - commission);
            }
        });

        // Calculate this week's earnings
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
        weekStart.setHours(0, 0, 0, 0);

        const thisWeekBookings = completedBookings.filter(booking => {
            return new Date(booking.ride.date) >= weekStart;
        });

        let thisWeekEarnings = 0;
        let thisWeekCommission = 0;
        thisWeekBookings.forEach(booking => {
            const amount = Number(booking.amount);
            const commission = amount * PLATFORM_COMMISSION_RATE;
            thisWeekEarnings += (amount - commission);
            thisWeekCommission += commission;
        });

        // Calculate this month's earnings
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonthBookings = completedBookings.filter(booking => {
            return new Date(booking.ride.date) >= monthStart;
        });

        let thisMonthEarnings = 0;
        let thisMonthCommission = 0;
        thisMonthBookings.forEach(booking => {
            const amount = Number(booking.amount);
            const commission = amount * PLATFORM_COMMISSION_RATE;
            thisMonthEarnings += (amount - commission);
            thisMonthCommission += commission;
        });

        return successResponse(res, 200, 'Earnings summary retrieved successfully', {
            driver_id: driver_id,
            total_earnings: Number(totalEarnings.toFixed(2)),
            total_commission: Number(totalCommission.toFixed(2)),
            total_rides: totalRides,
            pending_earnings: Number(pendingEarnings.toFixed(2)),
            this_week: {
                earnings: Number(thisWeekEarnings.toFixed(2)),
                commission: Number(thisWeekCommission.toFixed(2)),
                rides: thisWeekBookings.length
            },
            this_month: {
                earnings: Number(thisMonthEarnings.toFixed(2)),
                commission: Number(thisMonthCommission.toFixed(2)),
                rides: thisMonthBookings.length
            },
            commission_rate: PLATFORM_COMMISSION_RATE,
            earnings_by_date: Object.values(earningsByDate).map(e => ({
                date: e.date,
                earnings: Number(e.earnings.toFixed(2)),
                commission: Number(e.commission.toFixed(2)),
                rides: e.rides
            }))
        });

    } catch (error) {
        console.error('Get earnings summary error:', error);
        return errorResponse(res, 500, 'Server error while retrieving earnings');
    }
};

/**
 * Get detailed earnings history
 * @route GET /api/earnings/history
 * @access Private (Driver only)
 */
export const getEarningsHistory = async (req, res) => {
    try {
        const driver_id = Number(req.user?.id);
        const { start_date, end_date, limit = 50, offset = 0 } = req.query;

        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        // Verify user is a driver
        const user = await prisma.user.findUnique({
            where: { userId: driver_id },
            select: { userType: true }
        });

        if (!user || (user.userType !== 'driver' && user.userType !== 'both')) {
            return errorResponse(res, 403, 'Only drivers can view earnings');
        }

        // Build where clause
        const where = {
            ride: {
                driverId: driver_id
            },
            bookingStatus: 'completed',
            payments: {
                some: {
                    paymentStatus: 'completed'
                }
            }
        };

        if (start_date || end_date) {
            where.ride = {
                ...where.ride,
                date: {}
            };
            if (start_date) {
                where.ride.date.gte = new Date(start_date);
            }
            if (end_date) {
                where.ride.date.lte = new Date(end_date);
            }
        }

        // Get bookings
        const bookings = await prisma.booking.findMany({
            where,
            include: {
                payments: {
                    where: {
                        paymentStatus: 'completed'
                    },
                    take: 1,
                    orderBy: { paymentDate: 'desc' }
                },
                ride: {
                    select: {
                        rideId: true,
                        date: true,
                        source: true,
                        destination: true
                    }
                },
                passenger: {
                    select: {
                        name: true,
                        phone: true
                    }
                }
            },
            orderBy: {
                bookingDate: 'desc'
            },
            take: parseInt(limit),
            skip: parseInt(offset)
        });

        // Format earnings history
        const earningsHistory = bookings.map(booking => {
            const amount = Number(booking.amount);
            const commission = amount * PLATFORM_COMMISSION_RATE;
            const driverEarnings = amount - commission;

            return {
                booking_id: booking.bookingId,
                ride_id: booking.rideId,
                passenger_name: booking.passenger.name,
                passenger_phone: booking.passenger.phone,
                source: booking.ride.source,
                destination: booking.ride.destination,
                date: booking.ride.date,
                seats_booked: booking.seatsBooked,
                total_amount: amount,
                platform_commission: Number(commission.toFixed(2)),
                driver_earnings: Number(driverEarnings.toFixed(2)),
                payment_method: booking.payments[0]?.paymentMethod || null,
                payment_date: booking.payments[0]?.paymentDate || null,
                transaction_id: booking.payments[0]?.transactionId || null
            };
        });

        return successResponse(res, 200, 'Earnings history retrieved successfully', {
            earnings: earningsHistory,
            total: earningsHistory.length,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Get earnings history error:', error);
        return errorResponse(res, 500, 'Server error while retrieving earnings history');
    }
};


