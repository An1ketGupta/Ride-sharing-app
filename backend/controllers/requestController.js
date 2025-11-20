import { promisePool } from '../config/db.js';
import { getIO, addActiveRide, getSocketIdForDriver } from '../utils/socketRegistry.js';

// Haversine query to find 5 nearest available drivers within ~10 km
// Uses the User table with driver type and location: (user_id as driver_id, latitude, longitude, is_available)
// Note: is_available check is optional - drivers with location are considered available
const FIND_NEAREST_DRIVERS_SQL = `
  SELECT 
    u.user_id AS driver_id,
    u.latitude,
    u.longitude,
    (6371 * 2 * ASIN(
      SQRT(
        POWER(SIN(RADIANS((u.latitude  - ?) / 2)), 2) +
        COS(RADIANS(?)) * COS(RADIANS(u.latitude)) *
        POWER(SIN(RADIANS((u.longitude - ?) / 2)), 2)
      )
    )) AS distance_km
  FROM users u
  WHERE 
    u.user_type IN ('driver', 'both')
    AND (u.is_available = 1 OR u.is_available IS NULL)
    AND u.latitude IS NOT NULL
    AND u.longitude IS NOT NULL
  HAVING distance_km <= 10
  ORDER BY distance_km ASC
  LIMIT 5;
`;

// Fallback if is_available column is missing
const FIND_NEAREST_DRIVERS_SQL_NO_AVAILABLE = `
  SELECT 
    u.user_id AS driver_id,
    u.latitude,
    u.longitude,
    (6371 * 2 * ASIN(
      SQRT(
        POWER(SIN(RADIANS((u.latitude  - ?) / 2)), 2) +
        COS(RADIANS(?)) * COS(RADIANS(u.latitude)) *
        POWER(SIN(RADIANS((u.longitude - ?) / 2)), 2)
      )
    )) AS distance_km
  FROM users u
  WHERE 
    u.user_type IN ('driver', 'both')
    AND u.latitude IS NOT NULL
    AND u.longitude IS NOT NULL
  HAVING distance_km <= 10
  ORDER BY distance_km ASC
  LIMIT 5;
`;

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

    // 1) Query 5 closest available drivers via Haversine
    let rows;
    try {
      const [r] = await promisePool.query(FIND_NEAREST_DRIVERS_SQL, [source_lat, source_lat, source_lon]);
      rows = r;
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      if (e?.code === 'ER_BAD_FIELD_ERROR' && msg.includes('is_available')) {
        const [r2] = await promisePool.query(FIND_NEAREST_DRIVERS_SQL_NO_AVAILABLE, [source_lat, source_lat, source_lon]);
        rows = r2;
      } else if (e?.code === 'ER_BAD_FIELD_ERROR' && (msg.includes('latitude') || msg.includes('longitude'))) {
        return res.status(500).json({ success: false, message: 'Ride request requires User.latitude and User.longitude columns. Please run DB migrations.' });
      } else {
        throw e;
      }
    }
    const nearestDrivers = rows || [];

    // Filter drivers to only include those with vehicles that can accommodate the required number of people
    let eligibleDrivers = [];
    if (nearestDrivers.length > 0) {
      try {
        // Check which drivers have vehicles with sufficient capacity
        const driverIds = nearestDrivers.map(d => d.driver_id);
        const placeholders = driverIds.map(() => '?').join(',');
        // Vehicle capacity includes driver, so we need capacity > numPeople (e.g., 5-seater = 1 driver + 4 passengers)
        const [vehicleRows] = await promisePool.query(
          `SELECT DISTINCT user_id, MAX(capacity) as max_capacity 
           FROM vehicles 
           WHERE user_id IN (${placeholders}) 
           GROUP BY user_id 
           HAVING max_capacity > ?`,
          [...driverIds, numPeople]
        );
        const eligibleDriverIds = new Set(vehicleRows.map(v => v.user_id));
        eligibleDrivers = nearestDrivers.filter(d => eligibleDriverIds.has(d.driver_id));
      } catch (vehicleError) {
        // If vehicles table doesn't exist or query fails, include all drivers (fallback)
        if (vehicleError.code !== 'ER_NO_SUCH_TABLE') {
          console.error('Error filtering drivers by vehicle capacity:', vehicleError);
        }
        eligibleDrivers = nearestDrivers;
      }
    }

    // Create a unique request id
    const request_id = `rr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 2) Store active ride request in memory with destination and date/time
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

    // 3) Emit new_ride_request to the eligible drivers (only those online)
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


