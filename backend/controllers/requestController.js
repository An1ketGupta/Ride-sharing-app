import { prisma } from '../config/db.js';
import { getIO, addActiveRide, getSocketIdForDriver, getActiveRide, getSocketIdForUser, removeActiveRide } from '../utils/socketRegistry.js';
import { findAndScoreDrivers } from '../utils/matching.js';
import { calculateFinalSurgeMultiplier, applySurgePricing } from '../utils/pricing.js';
import { haversineKm } from '../utils/geo.js';

export const requestRide = async (req, res, next) => {
  try {
    const { passenger_id, source_lat, source_lon, destination, destination_lat, destination_lon, date, time, number_of_people } = req.body || {};
    if (!passenger_id || source_lat == null || source_lon == null) {
      return res.status(400).json({ success: false, message: 'passenger_id, source_lat, source_lon are required' });
    }
    if (!destination || destination.trim() === '') {
      return res.status(400).json({ success: false, message: 'destination is required' });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'date is required' });
    }
    if (!time) {
      return res.status(400).json({ success: false, message: 'time is required' });
    }
    const numPeople = number_of_people ? Math.max(1, parseInt(number_of_people) || 1) : 1;

    // Use advanced matching algorithm to find and score drivers
    const scoredDrivers = await findAndScoreDrivers({
      source_lat: Number(source_lat),
      source_lon: Number(source_lon),
      number_of_people: numPeople,
      maxDistanceKm: 10,
      maxDrivers: 10
    });

    if (scoredDrivers.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No drivers available in your area. Please try again later.',
        request_id: null,
        drivers_notified: []
      });
    }

    // Calculate surge pricing
    // Count active requests in the area (within 5km)
    const activeRequests = await prisma.user.findMany({
      where: {
        userType: 'passenger',
        latitude: { not: null },
        longitude: { not: null }
      },
      select: {
        userId: true,
        latitude: true,
        longitude: true
      }
    });

    // Count nearby requests (simplified - in production, use geohash or spatial index)
    const nearbyRequests = activeRequests.filter(req => {
      if (!req.latitude || !req.longitude) return false;
      const distance = haversineKm(
        Number(source_lat),
        Number(source_lon),
        Number(req.latitude),
        Number(req.longitude)
      );
      return distance <= 5; // Within 5km
    }).length;

    // Count available drivers
    const availableDriversCount = scoredDrivers.length;

    // Calculate surge multiplier
    const rideDateTime = date ? new Date(`${date}T${time}`) : new Date();
    const surgeMultiplier = calculateFinalSurgeMultiplier({
      demandCount: nearbyRequests,
      supplyCount: availableDriversCount,
      dateTime: rideDateTime,
      lat: Number(source_lat),
      lon: Number(source_lon),
      nearbyRequests: nearbyRequests
    });

    // Calculate base fare (10rs per seat per km)
    let baseFare = 0;
    if (destination_lat && destination_lon) {
      const distanceKm = haversineKm(
        Number(source_lat),
        Number(source_lon),
        Number(destination_lat),
        Number(destination_lon)
      );
      baseFare = 10 * distanceKm * numPeople;
    } else {
      // Default estimate if destination coordinates not provided
      baseFare = 10 * 5 * numPeople; // Assume 5km default
    }

    // Apply surge pricing
    const finalFare = applySurgePricing(baseFare, surgeMultiplier);

    // Create a unique request id
    const request_id = `rr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Store active ride request in memory with all details including surge pricing
    addActiveRide(request_id, {
      passenger_id,
      source_lat,
      source_lon,
      destination: destination || null,
      destination_lat: destination_lat || null,
      destination_lon: destination_lon || null,
      date: date || null,
      time: time || null,
      number_of_people: numPeople,
      notified_driver_ids: scoredDrivers.map(d => d.driver_id),
      base_fare: baseFare,
      surge_multiplier: surgeMultiplier,
      final_fare: finalFare,
      created_at: new Date().toISOString()
    });

    // Emit new_ride_request to the top-scored drivers (only those online)
    const io = getIO();
    const topDrivers = scoredDrivers.slice(0, 5); // Notify top 5 drivers
    
    const payload = {
      request_id,
      passenger_id,
      pickup: { lat: Number(source_lat), lon: Number(source_lon) },
      destination: destination || null,
      destination_lat: destination_lat || null,
      destination_lon: destination_lon || null,
      date: date || null,
      time: time || null,
      number_of_people: numPeople,
      base_fare: baseFare,
      surge_multiplier: surgeMultiplier,
      final_fare: finalFare,
      driver_score: null // Will be set per driver
    };

    topDrivers.forEach((driver) => {
      const socketId = getSocketIdForDriver(driver.driver_id);
      if (socketId && io) {
        io.to(socketId).emit('new_ride_request', {
          ...payload,
          driver_score: driver.score,
          eta_minutes: driver.eta_minutes,
          distance_km: driver.distance_km
        });
      }
    });

    // Set timeout to expire request after 2 minutes if no driver accepts
    setTimeout(async () => {
      const activeRide = getActiveRide(request_id);
      if (activeRide && !activeRide.accepted) {
        // Notify passenger that no driver accepted
        const passengerSocketId = getSocketIdForUser(Number(passenger_id));
        if (passengerSocketId && io) {
          io.to(passengerSocketId).emit('ride_request_expired', {
            request_id,
            message: 'No driver accepted your ride request. Please try again.'
          });
        }
        // Remove from active rides
        removeActiveRide(request_id);
      }
    }, 120000); // 2 minutes timeout

    return res.status(200).json({ 
      success: true, 
      request_id, 
      drivers_notified: topDrivers.map(d => d.driver_id),
      surge_multiplier: surgeMultiplier,
      base_fare: baseFare,
      final_fare: finalFare,
      estimated_eta_minutes: topDrivers[0]?.eta_minutes || null
    });
  } catch (err) {
    console.error('Error in requestRide:', err);
    next(err);
  }
};
