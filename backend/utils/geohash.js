/**
 * Geohash Utility for Efficient Location-Based Queries
 * 
 * Geohashing divides the world into a grid and assigns each cell a unique hash.
 * This allows for efficient proximity searches without calculating distances for every record.
 * 
 * Implementation based on: https://en.wikipedia.org/wiki/Geohash
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const BITS = [16, 8, 4, 2, 1];

/**
 * Encode latitude and longitude to geohash
 * @param {number} lat - Latitude (-90 to 90)
 * @param {number} lon - Longitude (-180 to 180)
 * @param {number} precision - Number of characters in hash (1-12, default: 9)
 * @returns {string} Geohash string
 */
export const encode = (lat, lon, precision = 9) => {
    if (precision < 1 || precision > 12) {
        precision = 9;
    }

    let latMin = -90.0;
    let latMax = 90.0;
    let lonMin = -180.0;
    let lonMax = 180.0;
    let bit = 0;
    let ch = 0;
    let even = true;
    let geohash = '';

    while (geohash.length < precision) {
        if (even) {
            // Longitude bit
            const lonMid = (lonMin + lonMax) / 2;
            if (lon >= lonMid) {
                ch |= BITS[bit];
                lonMin = lonMid;
            } else {
                lonMax = lonMid;
            }
        } else {
            // Latitude bit
            const latMid = (latMin + latMax) / 2;
            if (lat >= latMid) {
                ch |= BITS[bit];
                latMin = latMid;
            } else {
                latMax = latMid;
            }
        }

        even = !even;
        if (bit < 4) {
            bit++;
        } else {
            geohash += BASE32[ch];
            bit = 0;
            ch = 0;
        }
    }

    return geohash;
};

/**
 * Decode geohash to latitude and longitude
 * @param {string} geohash - Geohash string
 * @returns {Object} { lat: number, lon: number, latError: number, lonError: number }
 */
export const decode = (geohash) => {
    let latMin = -90.0;
    let latMax = 90.0;
    let lonMin = -180.0;
    let lonMax = 180.0;
    let even = true;

    for (let i = 0; i < geohash.length; i++) {
        const ch = BASE32.indexOf(geohash[i]);
        if (ch === -1) {
            throw new Error('Invalid geohash character');
        }

        for (let j = 0; j < 5; j++) {
            const bit = (ch >> (4 - j)) & 1;
            if (even) {
                // Longitude bit
                const lonMid = (lonMin + lonMax) / 2;
                if (bit) {
                    lonMin = lonMid;
                } else {
                    lonMax = lonMid;
                }
            } else {
                // Latitude bit
                const latMid = (latMin + latMax) / 2;
                if (bit) {
                    latMin = latMid;
                } else {
                    latMax = latMid;
                }
            }
            even = !even;
        }
    }

    const lat = (latMin + latMax) / 2;
    const lon = (lonMin + lonMax) / 2;
    const latError = (latMax - latMin) / 2;
    const lonError = (lonMax - lonMin) / 2;

    return { lat, lon, latError, lonError };
};

/**
 * Get neighboring geohashes (for proximity search)
 * @param {string} geohash - Center geohash
 * @returns {Object} { n: string, ne: string, e: string, se: string, s: string, sw: string, w: string, nw: string }
 */
export const neighbors = (geohash) => {
    const { lat, lon } = decode(geohash);
    const precision = geohash.length;
    const latError = 90 / Math.pow(2, Math.floor((precision * 5) / 2));
    const lonError = 180 / Math.pow(2, Math.ceil((precision * 5) / 2));

    return {
        n: encode(lat + latError, lon, precision),
        ne: encode(lat + latError, lon + lonError, precision),
        e: encode(lat, lon + lonError, precision),
        se: encode(lat - latError, lon + lonError, precision),
        s: encode(lat - latError, lon, precision),
        sw: encode(lat - latError, lon - lonError, precision),
        w: encode(lat, lon - lonError, precision),
        nw: encode(lat + latError, lon - lonError, precision)
    };
};

/**
 * Get all geohashes within a bounding box
 * @param {number} latMin - Minimum latitude
 * @param {number} latMax - Maximum latitude
 * @param {number} lonMin - Minimum longitude
 * @param {number} lonMax - Maximum longitude
 * @param {number} precision - Geohash precision
 * @returns {Array<string>} Array of geohash strings
 */
export const bbox = (latMin, latMax, lonMin, lonMax, precision = 9) => {
    const hashes = new Set();
    const step = Math.max(
        90 / Math.pow(2, Math.floor((precision * 5) / 2)),
        180 / Math.pow(2, Math.ceil((precision * 5) / 2))
    );

    for (let lat = latMin; lat <= latMax; lat += step) {
        for (let lon = lonMin; lon <= lonMax; lon += step) {
            hashes.add(encode(lat, lon, precision));
        }
    }

    return Array.from(hashes);
};

/**
 * Get geohashes for proximity search (center + neighbors)
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} radiusKm - Search radius in kilometers
 * @param {number} precision - Geohash precision
 * @returns {Array<string>} Array of geohash strings to search
 */
export const proximityHashes = (lat, lon, radiusKm = 10, precision = 7) => {
    // Approximate degrees per km (rough estimate)
    const latDegreesPerKm = 1 / 111.0;
    const lonDegreesPerKm = 1 / (111.0 * Math.cos(lat * Math.PI / 180));

    const latRadius = radiusKm * latDegreesPerKm;
    const lonRadius = radiusKm * lonDegreesPerKm;

    const latMin = lat - latRadius;
    const latMax = lat + latRadius;
    const lonMin = lon - lonRadius;
    const lonMax = lon + lonRadius;

    return bbox(latMin, latMax, lonMin, lonMax, precision);
};


