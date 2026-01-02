/**
 * Cron Job System for Scheduled/Recurring Rides
 * 
 * Processes RideSchedule entries and creates rides based on cron expressions
 */

import { prisma } from '../config/db.js';
import { sendNotification } from './notifications.js';

/**
 * Parse cron expression and check if it matches current time
 * @param {string} cronExpr - Cron expression (e.g., "0 9 * * *" for 9 AM daily)
 * @param {Date} now - Current date/time
 * @returns {boolean} True if cron expression matches current time
 */
const matchesCron = (cronExpr, now) => {
    // Simple cron parser for common patterns
    // Format: "minute hour day month dayOfWeek"
    // Examples:
    //   "0 9 * * *" - 9 AM daily
    //   "0 9 * * 1-5" - 9 AM weekdays
    //   "0 9,17 * * *" - 9 AM and 5 PM daily
    
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) {
        return false; // Invalid format
    }

    const [minute, hour, day, month, dayOfWeek] = parts;
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed
    const currentDayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Helper to check if value matches pattern
    const matches = (pattern, value) => {
        if (pattern === '*') return true;
        if (pattern.includes(',')) {
            return pattern.split(',').some(p => matches(p.trim(), value));
        }
        if (pattern.includes('-')) {
            const [start, end] = pattern.split('-').map(Number);
            return value >= start && value <= end;
        }
        if (pattern.includes('/')) {
            const [base, step] = pattern.split('/').map(Number);
            return value % step === base % step;
        }
        return Number(pattern) === value;
    };

    return matches(minute, currentMinute) &&
           matches(hour, currentHour) &&
           matches(day, currentDay) &&
           matches(month, currentMonth) &&
           matches(dayOfWeek, currentDayOfWeek);
};

/**
 * Process scheduled rides and create actual rides
 * This should be called periodically (e.g., every minute via cron or setInterval)
 */
export const processScheduledRides = async () => {
    try {
        const now = new Date();
        
        // Get all active ride schedules
        const schedules = await prisma.rideSchedule.findMany({
            where: {
                active: true
            },
            include: {
                driver: {
                    include: {
                        vehicles: {
                            take: 1,
                            orderBy: { vehicleId: 'desc' }
                        }
                    }
                }
            }
        });

        for (const schedule of schedules) {
            try {
                // Check if cron expression matches current time
                if (!matchesCron(schedule.cronExpr, now)) {
                    continue; // Skip this schedule
                }

                // Check if a ride was already created for this schedule today
                const today = new Date(now);
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                const existingRide = await prisma.ride.findFirst({
                    where: {
                        driverId: schedule.driverId,
                        date: {
                            gte: today,
                            lt: tomorrow
                        },
                        status: { in: ['scheduled', 'ongoing'] }
                    }
                });

                if (existingRide) {
                    // Ride already created for today, skip
                    continue;
                }

                // Get driver's default vehicle
                const vehicle = schedule.driver.vehicles[0];
                if (!vehicle) {
                    console.warn(`Driver ${schedule.driverId} has no vehicles, skipping scheduled ride`);
                    continue;
                }

                // Create a scheduled ride
                // Note: In a real system, you'd want to get source/destination from schedule or driver preferences
                // For now, we'll create a placeholder ride that the driver can edit
                const ride = await prisma.ride.create({
                    data: {
                        driverId: schedule.driverId,
                        vehicleId: vehicle.vehicleId,
                        source: 'Scheduled Ride - Please update source',
                        destination: 'Scheduled Ride - Please update destination',
                        date: now,
                        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`,
                        totalSeats: vehicle.capacity,
                        availableSeats: vehicle.capacity - 1, // Reserve driver seat
                        farePerKm: 10,
                        distanceKm: 0,
                        status: 'scheduled'
                    }
                });

                // Notify driver
                await sendNotification(
                    schedule.driverId,
                    `Your scheduled ride has been created! Ride ID: ${ride.rideId}. Please update the source and destination.`
                );

                console.log(`Created scheduled ride ${ride.rideId} for driver ${schedule.driverId}`);
            } catch (scheduleError) {
                console.error(`Error processing schedule ${schedule.scheduleId}:`, scheduleError);
                // Continue with other schedules even if one fails
            }
        }
    } catch (error) {
        console.error('Error in processScheduledRides:', error);
    }
};

/**
 * Start cron job processor (runs every minute)
 * @returns {NodeJS.Timeout} Interval ID that can be cleared
 */
export const startCronProcessor = () => {
    // Process immediately on start
    processScheduledRides();
    
    // Then process every minute
    const intervalId = setInterval(() => {
        processScheduledRides();
    }, 60000); // 60 seconds = 1 minute

    console.log('✅ Cron job processor started (runs every minute)');
    return intervalId;
};


