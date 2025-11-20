import { promisePool } from '../config/db.js';

// Calculates fare with surge multiplier based on Surge_Zones and Surge_Rates
// baseFare: number (pre-surge)
// pickup_lat, pickup_lon: numbers
export const calculateFare = async (baseFare, pickup_lat, pickup_lon) => {
  const sql = `
    SELECT sr.multiplier
    FROM Surge_Zones sz
    JOIN Surge_Rates sr ON sr.zone_id = sz.zone_id
    WHERE (6371 * 2 * ASIN(
             SQRT(
               POWER(SIN(RADIANS((sz.center_lat - ?) / 2)), 2) +
               COS(RADIANS(?)) * COS(RADIANS(sz.center_lat)) *
               POWER(SIN(RADIANS((sz.center_lon - ?) / 2)), 2)
             )
           )) <= sz.radius_km
      AND CURRENT_TIME() BETWEEN sr.start_time AND sr.end_time
    ORDER BY sr.multiplier DESC
    LIMIT 1
  `;
  const params = [pickup_lat, pickup_lat, pickup_lon];
  const [rows] = await promisePool.query(sql, params);
  const multiplier = rows?.[0]?.multiplier ?? 1.0;
  const finalFare = Number((Number(baseFare) * Number(multiplier)).toFixed(2));
  return { finalFare, multiplier };
};


