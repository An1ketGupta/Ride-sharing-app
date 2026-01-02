/**
 * Advanced Driver Matching Algorithm
 * 
 * Scores and ranks drivers based on multiple factors:
 * - Distance to pickup location
 * - Driver rating
 * - Driver acceptance rate
 * - Estimated time of arrival (ETA)
 * - Vehicle capacity match
 * - Driver availability history
 */

import { haversineKm } from './geo.js';
import { prisma } from '../config/db.js';

/**
 * Calculate driver acceptance rate
 * @param {number} driverId - Driver user ID
 * @returns {Promise<number>} Acceptance rate (0.0 to 1.0)
 */
const calculateAcceptanceRate = async (driverId) => {
    try {
        // Get driver's ride history
        const rides = await prisma.ride.findMany({
            where: { driverId: parseInt(driverId) },
            include: {
                bookings: {
                    where: {
                        bookingStatus: { in: ['confirmed', 'completed', 'in_progress'] }
                    }
                }
            }
        });

        if (rides.length === 0) {
            return 0.5; // Default for new drivers
        }

        // Calculate acceptance rate based on completed rides vs total rides
        const totalRides = rides.length;
        const completedRides = rides.filter(r => r.status === 'completed').length;
        
        // Also consider booking acceptance (how many bookings they've accepted)
        const totalBookings = rides.reduce((sum, r) => sum + r.bookings.length, 0);
        
        // Acceptance rate = (completed rides + accepted bookings) / (total rides + total bookings)
        const acceptanceRate = totalRides > 0 
            ? (completedRides + totalBookings) / (totalRides + Math.max(1, totalBookings))
            : 0.5;

        return Math.min(1.0, Math.max(0.0, acceptanceRate));
    } catch (error) {
        console.error(`Error calculating acceptance rate for driver ${driverId}:`, error);
        return 0.5; // Default fallback
    }
};

/**
 * Calculate estimated time of arrival (ETA) for driver to reach pickup
 * @param {number} driverLat - Driver's current latitude
 * @param {number} driverLon - Driver's current longitude
 * @param {number} pickupLat - Pickup location latitude
 * @param {number} pickupLon - Pickup location longitude
 * @param {number} avgSpeedKmph - Average speed in km/h (default: 30)
 * @returns {number} ETA in minutes
 */
const calculateETA = (driverLat, driverLon, pickupLat, pickupLon, avgSpeedKmph = 30) => {
    const distanceKm = haversineKm(driverLat, driverLon, pickupLat, pickupLon);
    const hours = distanceKm / avgSpeedKmph;
    return Math.max(1, Math.round(hours * 60)); // Minimum 1 minute
};

/**
 * Calculate driver score for matching
 * @param {Object} driver - Driver data
 * @param {Object} request - Ride request data
 * @param {Object} scores - Pre-calculated scores
 * @returns {number} Overall driver score (higher is better)
 */
const calculateDriverScore = (driver, request, scores) => {
    const {
        distanceScore,      // 0-1, based on distance (closer = higher)
        ratingScore,        // 0-1, based on driver rating
        acceptanceScore,    // 0-1, based on acceptance rate
        etaScore,           // 0-1, based on ETA (faster = higher)
        capacityScore       // 0-1, based on vehicle capacity match
    } = scores;

    // Weighted scoring system
    const weights = {
        distance: 0.35,      // 35% - Distance is most important
        rating: 0.25,        // 25% - Driver quality
        acceptance: 0.15,    // 15% - Reliability
        eta: 0.15,           // 15% - Speed of pickup
        capacity: 0.10       // 10% - Vehicle fit
    };

    // Calculate weighted score
    const totalScore = 
        (distanceScore * weights.distance) +
        (ratingScore * weights.rating) +
        (acceptanceScore * weights.acceptance) +
        (etaScore * weights.eta) +
        (capacityScore * weights.capacity);

    return totalScore;
};

/**
 * Normalize distance to score (0-1)
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} maxDistanceKm - Maximum acceptable distance (default: 10km)
 * @returns {number} Score between 0 and 1
 */
const normalizeDistanceScore = (distanceKm, maxDistanceKm = 10) => {
    if (distanceKm <= 0) return 1.0;
    if (distanceKm >= maxDistanceKm) return 0.0;
    
    // Inverse relationship: closer = higher score
    return 1.0 - (distanceKm / maxDistanceKm);
};

/**
 * Normalize rating to score (0-1)
 * @param {number} rating - Driver rating (0-5)
 * @returns {number} Score between 0 and 1
 */
const normalizeRatingScore = (rating) => {
    if (!rating || rating <= 0) return 0.3; // Default for unrated drivers
    return Math.min(1.0, rating / 5.0);
};

/**
 * Normalize ETA to score (0-1)
 * @param {number} etaMinutes - Estimated time of arrival in minutes
 * @param {number} maxETAMinutes - Maximum acceptable ETA (default: 20 minutes)
 * @returns {number} Score between 0 and 1
 */
const normalizeETAScore = (etaMinutes, maxETAMinutes = 20) => {
    if (etaMinutes <= 0) return 1.0;
    if (etaMinutes >= maxETAMinutes) return 0.0;
    
    // Inverse relationship: faster = higher score
    return 1.0 - (etaMinutes / maxETAMinutes);
};

/**
 * Normalize capacity to score (0-1)
 * @param {number} vehicleCapacity - Vehicle capacity
 * @param {number} requiredSeats - Required number of seats
 * @returns {number} Score between 0 and 1
 */
const normalizeCapacityScore = (vehicleCapacity, requiredSeats) => {
    if (vehicleCapacity <= requiredSeats) return 0.0; // Cannot accommodate
    
    // Prefer vehicles that match capacity closely (not too large, not too small)
    const availableSeats = vehicleCapacity - 1; // Subtract driver seat
    const excessSeats = availableSeats - requiredSeats;
    
    if (excessSeats === 0) return 1.0; // Perfect match
    if (excessSeats <= 2) return 0.9;  // Good match (1-2 extra seats)
    if (excessSeats <= 4) return 0.7;  // Acceptable (3-4 extra seats)
    
    return 0.5; // Too large, but acceptable
};

/**
 * Find and score eligible drivers for a ride request
 * @param {Object} request - Ride request parameters
 * @param {number} request.source_lat - Pickup latitude
 * @param {number} request.source_lon - Pickup longitude
 * @param {number} request.number_of_people - Number of passengers
 * @param {number} request.maxDistanceKm - Maximum distance to consider (default: 10km)
 * @param {number} request.maxDrivers - Maximum number of drivers to return (default: 10)
 * @returns {Promise<Array>} Array of scored and ranked drivers
 */
export const findAndScoreDrivers = async (request) => {
    const {
        source_lat,
        source_lon,
        number_of_people = 1,
        maxDistanceKm = 10,
        maxDrivers = 10
    } = request;

    try {
        // Step 1: Get all available drivers with location
        const drivers = await prisma.user.findMany({
            where: {
                userType: { in: ['driver', 'both'] },
                latitude: { not: null },
                longitude: { not: null },
                isAvailable: true
            },
            select: {
                userId: true,
                latitude: true,
                longitude: true,
                rating: true,
                name: true
            }
        });

        if (drivers.length === 0) {
            return [];
        }

        // Step 2: Get vehicles for all drivers
        const driverIds = drivers.map(d => d.userId);
        const vehicles = await prisma.vehicle.findMany({
            where: {
                userId: { in: driverIds }
            },
            select: {
                userId: true,
                vehicleId: true,
                capacity: true,
                model: true,
                color: true,
                licensePlate: true
            }
        });

        // Create vehicle map by driver ID
        const vehicleMap = new Map();
        vehicles.forEach(v => {
            if (!vehicleMap.has(v.userId)) {
                vehicleMap.set(v.userId, []);
            }
            vehicleMap.get(v.userId).push(v);
        });

        // Step 3: Calculate distance and filter by max distance
        const driversWithDistance = drivers
            .map(driver => {
                const distanceKm = haversineKm(
                    Number(source_lat),
                    Number(source_lon),
                    Number(driver.latitude),
                    Number(driver.longitude)
                );
                return {
                    ...driver,
                    distanceKm,
                    latitude: Number(driver.latitude),
                    longitude: Number(driver.longitude)
                };
            })
            .filter(d => d.distanceKm <= maxDistanceKm);

        // Step 4: Filter by vehicle capacity
        const eligibleDrivers = driversWithDistance.filter(driver => {
            const driverVehicles = vehicleMap.get(driver.userId) || [];
            return driverVehicles.some(v => v.capacity > number_of_people);
        });

        if (eligibleDrivers.length === 0) {
            return [];
        }

        // Step 5: Calculate scores for each driver
        const scoredDrivers = await Promise.all(
            eligibleDrivers.map(async (driver) => {
                // Get driver's best vehicle (closest capacity match)
                const driverVehicles = vehicleMap.get(driver.userId) || [];
                const suitableVehicles = driverVehicles.filter(v => v.capacity > number_of_people);
                const bestVehicle = suitableVehicles.reduce((best, current) => {
                    if (!best) return current;
                    const bestExcess = best.capacity - 1 - number_of_people;
                    const currentExcess = current.capacity - 1 - number_of_people;
                    // Prefer vehicle with less excess capacity
                    return currentExcess < bestExcess ? current : best;
                }, null);

                if (!bestVehicle) {
                    return null; // Skip if no suitable vehicle
                }

                // Calculate individual scores
                const distanceScore = normalizeDistanceScore(driver.distanceKm, maxDistanceKm);
                const ratingScore = normalizeRatingScore(driver.rating ? Number(driver.rating) : null);
                const acceptanceScore = await calculateAcceptanceRate(driver.userId);
                
                const etaMinutes = calculateETA(
                    driver.latitude,
                    driver.longitude,
                    source_lat,
                    source_lon
                );
                const etaScore = normalizeETAScore(etaMinutes);
                
                const capacityScore = normalizeCapacityScore(bestVehicle.capacity, number_of_people);

                // Calculate overall score
                const overallScore = calculateDriverScore(
                    driver,
                    request,
                    {
                        distanceScore,
                        ratingScore,
                        acceptanceScore,
                        etaScore,
                        capacityScore
                    }
                );

                return {
                    driver_id: driver.userId,
                    driver_name: driver.name,
                    distance_km: driver.distanceKm,
                    eta_minutes: etaMinutes,
                    rating: driver.rating ? Number(driver.rating) : null,
                    acceptance_rate: acceptanceScore,
                    vehicle_id: bestVehicle.vehicleId,
                    vehicle_model: bestVehicle.model,
                    vehicle_color: bestVehicle.color,
                    vehicle_capacity: bestVehicle.capacity,
                    license_plate: bestVehicle.licensePlate,
                    score: overallScore,
                    scores: {
                        distance: distanceScore,
                        rating: ratingScore,
                        acceptance: acceptanceScore,
                        eta: etaScore,
                        capacity: capacityScore
                    }
                };
            })
        );

        // Step 6: Filter out nulls and sort by score (highest first)
        const validDrivers = scoredDrivers
            .filter(d => d !== null)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxDrivers);

        return validDrivers;
    } catch (error) {
        console.error('Error in findAndScoreDrivers:', error);
        throw error;
    }
};


