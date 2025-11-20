import { prisma } from '../config/db.js';
import { getIO, addActiveRide, getSocketIdForDriver } from '../utils/socketRegistry.js';

// Haversine formula for calculating distance between two points
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

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

    // 1) Get all available drivers with location
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
        isAvailable: true
      }
    });

    // 2) Calculate distances and filter drivers within 10km
    const driversWithDistance = drivers
      .map(driver => ({
        driver_id: driver.userId,
        latitude: Number(driver.latitude),
        longitude: Number(driver.longitude),
        distance_km: haversineDistance(
          Number(source_lat),
          Number(source_lon),
          Number(driver.latitude),
          Number(driver.longitude)
        )
      }))
      .filter(d => d.distance_km <= 10)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 5);

    // 3) Filter drivers to only include those with vehicles that can accommodate the required number of people
    let eligibleDrivers = [];
    if (driversWithDistance.length > 0) {
      try {
        const driverIds = driversWithDistance.map(d => d.driver_id);
        
        // Get vehicles for these drivers
        const vehicles = await prisma.vehicle.findMany({
          where: {
            userId: { in: driverIds }
          },
          select: {
            userId: true,
            capacity: true
          }
        });

        // Group by user_id and get max capacity
        const driverMaxCapacity = {};
        vehicles.forEach(v => {
          if (!driverMaxCapacity[v.userId] || driverMaxCapacity[v.userId] < v.capacity) {
            driverMaxCapacity[v.userId] = v.capacity;
          }
        });

        // Filter drivers with sufficient capacity (capacity > numPeople, since driver takes one seat)
        eligibleDrivers = driversWithDistance.filter(d => {
          const maxCapacity = driverMaxCapacity[d.driver_id] || 0;
          return maxCapacity > numPeople;
        });
      } catch (vehicleError) {
        // If vehicles query fails, include all drivers (fallback)
        console.error('Error filtering drivers by vehicle capacity:', vehicleError);
        eligibleDrivers = driversWithDistance;
      }
    }

    // Create a unique request id
    const request_id = `rr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 4) Store active ride request in memory with destination and date/time
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
      notified_driver_ids: eligibleDrivers.map(d => d.driver_id),
    });

    // 5) Emit new_ride_request to the eligible drivers (only those online)
    const io = getIO();
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
    };
    eligibleDrivers.forEach((d) => {
      const socketId = getSocketIdForDriver(d.driver_id);
      if (socketId && io) {
        io.to(socketId).emit('new_ride_request', payload);
      }
    });

    return res.status(200).json({ success: true, request_id, drivers_notified: eligibleDrivers.map(d => d.driver_id) });
  } catch (err) {
    next(err);
  }
};
