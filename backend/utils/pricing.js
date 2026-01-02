/**
 * Surge Pricing and Dynamic Pricing Utilities
 * 
 * Calculates surge multipliers based on demand/supply ratio, time of day, and location density
 */

/**
 * Calculate surge multiplier based on demand/supply ratio
 * @param {number} demandCount - Number of active ride requests in area
 * @param {number} supplyCount - Number of available drivers in area
 * @param {Object} options - Configuration options
 * @returns {number} Surge multiplier (1.0 = no surge, 2.0 = 2x price, etc.)
 */
export const calculateSurgeMultiplier = (demandCount, supplyCount, options = {}) => {
    const {
        minSupply = 1,           // Minimum drivers needed to avoid surge
        baseMultiplier = 1.0,     // Base price multiplier
        maxMultiplier = 3.0,     // Maximum surge multiplier
        demandThreshold = 3,      // Demand threshold to trigger surge
        supplyThreshold = 2       // Supply threshold below which surge increases
    } = options;

    // Avoid division by zero
    if (supplyCount === 0) {
        return maxMultiplier;
    }

    // Calculate demand/supply ratio
    const ratio = demandCount / supplyCount;

    // If supply is very low, apply maximum surge
    if (supplyCount < supplyThreshold) {
        const lowSupplyMultiplier = Math.min(
            maxMultiplier,
            baseMultiplier + (supplyThreshold - supplyCount) * 0.5
        );
        return Math.max(baseMultiplier, lowSupplyMultiplier);
    }

    // If demand is very high relative to supply, apply surge
    if (demandCount >= demandThreshold && ratio > 1.5) {
        // Exponential surge: more aggressive as ratio increases
        const surgeFactor = Math.min(
            maxMultiplier,
            baseMultiplier + (ratio - 1.0) * 0.5
        );
        return Math.max(baseMultiplier, surgeFactor);
    }

    // Normal conditions: no surge
    return baseMultiplier;
};

/**
 * Calculate time-based surge multiplier
 * @param {Date} dateTime - Date/time of the ride
 * @returns {number} Time-based surge multiplier
 */
export const calculateTimeBasedSurge = (dateTime) => {
    const hour = dateTime.getHours();
    
    // Peak hours: 7-9 AM (morning rush), 5-8 PM (evening rush)
    const isMorningRush = hour >= 7 && hour < 9;
    const isEveningRush = hour >= 17 && hour < 20;
    const isNight = hour >= 22 || hour < 5;
    
    if (isMorningRush || isEveningRush) {
        return 1.2; // 20% surge during peak hours
    }
    
    if (isNight) {
        return 1.3; // 30% surge during night hours (safety premium)
    }
    
    return 1.0; // No time-based surge
};

/**
 * Calculate location-based surge (for high-density areas)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} nearbyRequests - Number of nearby ride requests
 * @returns {number} Location-based surge multiplier
 */
export const calculateLocationSurge = (lat, lon, nearbyRequests) => {
    // If there are many requests in the same area, apply surge
    if (nearbyRequests >= 5) {
        return Math.min(1.5, 1.0 + (nearbyRequests - 5) * 0.1);
    }
    
    return 1.0;
};

/**
 * Calculate final surge multiplier combining all factors
 * @param {Object} params - Parameters for surge calculation
 * @param {number} params.demandCount - Number of active requests
 * @param {number} params.supplyCount - Number of available drivers
 * @param {Date} params.dateTime - Ride date/time
 * @param {number} params.lat - Latitude
 * @param {number} params.lon - Longitude
 * @param {number} params.nearbyRequests - Nearby requests count
 * @returns {number} Final surge multiplier
 */
export const calculateFinalSurgeMultiplier = (params) => {
    const {
        demandCount = 0,
        supplyCount = 0,
        dateTime = new Date(),
        lat = null,
        lon = null,
        nearbyRequests = 0
    } = params;

    // Calculate individual surge factors
    const demandSupplySurge = calculateSurgeMultiplier(demandCount, supplyCount);
    const timeSurge = calculateTimeBasedSurge(dateTime);
    const locationSurge = (lat && lon) ? calculateLocationSurge(lat, lon, nearbyRequests) : 1.0;

    // Combine surges multiplicatively (but cap at max)
    const combinedSurge = demandSupplySurge * timeSurge * locationSurge;
    
    // Cap at maximum 3.0x
    return Math.min(3.0, Math.max(1.0, combinedSurge));
};

/**
 * Apply surge pricing to base fare
 * @param {number} baseFare - Base fare amount
 * @param {number} surgeMultiplier - Surge multiplier
 * @returns {number} Final fare with surge applied
 */
export const applySurgePricing = (baseFare, surgeMultiplier) => {
    return Math.round(baseFare * surgeMultiplier * 100) / 100; // Round to 2 decimal places
};


