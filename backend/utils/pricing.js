import { prisma } from '../config/db.js';
import { haversineKm } from './geo.js';

// Calculates fare with surge multiplier based on Surge_Zones and Surge_Rates
// baseFare: number (pre-surge)
// pickup_lat, pickup_lon: numbers
export const calculateFare = async (baseFare, pickup_lat, pickup_lon) => {
  try {
    // Get all surge zones
    const surgeZones = await prisma.$queryRaw`
      SELECT 
        sz.zone_id,
        sz.center_lat,
        sz.center_lon,
        sz.radius_km,
        sr.multiplier,
        sr.start_time,
        sr.end_time
      FROM Surge_Zones sz
      JOIN Surge_Rates sr ON sr.zone_id = sz.zone_id
      WHERE CURRENT_TIME() BETWEEN sr.start_time AND sr.end_time
    `;

    // Find zones within radius using haversine
    let maxMultiplier = 1.0;
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;

    for (const zone of surgeZones) {
      const distance = haversineKm(
        Number(zone.center_lat),
        Number(zone.center_lon),
        pickup_lat,
        pickup_lon
      );
      
      if (distance <= Number(zone.radius_km)) {
        // Check if current time is within surge time window
        const startTime = zone.start_time;
        const endTime = zone.end_time;
        
        if (startTime && endTime) {
          const start = new Date(`2000-01-01T${startTime}`);
          const end = new Date(`2000-01-01T${endTime}`);
          const current = new Date(`2000-01-01T${currentTimeStr}`);
          
          if (current >= start && current <= end) {
            if (Number(zone.multiplier) > maxMultiplier) {
              maxMultiplier = Number(zone.multiplier);
            }
          }
        } else {
          // No time restriction, apply multiplier
          if (Number(zone.multiplier) > maxMultiplier) {
            maxMultiplier = Number(zone.multiplier);
          }
        }
      }
    }

    const finalFare = Number((Number(baseFare) * Number(maxMultiplier)).toFixed(2));
    return { finalFare, multiplier: maxMultiplier };
  } catch (error) {
    // If surge zones table doesn't exist, return base fare
    console.warn('Surge pricing not available, using base fare:', error.message);
    return { finalFare: Number(baseFare), multiplier: 1.0 };
  }
};
