/**
 * OpenRouteService (ORS) API utility
 * Used for route calculation and path generation
 */

const ORS_API_KEY = process.env.ORS_API_KEY || '';
const ORS_BASE_URL = 'https://api.openrouteservice.org/v2';

/**
 * Decode polyline from OpenRouteService format to coordinates array
 * @param {string} encodedPolyline - Encoded polyline string
 * @returns {Array<{lat: number, lng: number}>} - Array of coordinate objects
 */
export const decodePolyline = (encodedPolyline) => {
    if (!encodedPolyline) return [];
    
    const coordinates = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    
    while (index < encodedPolyline.length) {
        let shift = 0;
        let result = 0;
        let byte;
        
        // Decode latitude
        do {
            byte = encodedPolyline.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        
        const deltaLat = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
        lat += deltaLat;
        
        shift = 0;
        result = 0;
        
        // Decode longitude
        do {
            byte = encodedPolyline.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        
        const deltaLng = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
        lng += deltaLng;
        
        coordinates.push({
            lat: lat / 1e5,
            lng: lng / 1e5
        });
    }
    
    return coordinates;
};

/**
 * Get route from origin to destination using OpenRouteService
 * @param {number} startLat - Start latitude
 * @param {number} startLon - Start longitude
 * @param {number} endLat - End latitude
 * @param {number} endLon - End longitude
 * @param {string} profile - Routing profile (driving-car, driving-hgv, cycling-regular, etc.)
 * @returns {Promise<Object>} - Route data including polyline and geometry
 */
export const getRoute = async (startLat, startLon, endLat, endLon, profile = 'driving-car') => {
    if (!ORS_API_KEY) {
        console.warn('⚠️ ORS API key not configured');
        return null;
    }
    
    try {
        const coordinates = [[startLon, startLat], [endLon, endLat]];
        
        // OpenRouteService expects the API key in Authorization header
        // The key might be base64 encoded or a JWT token - use as provided
        const response = await fetch(`${ORS_BASE_URL}/directions/${profile}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ORS_API_KEY,
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                'X-API-Key': ORS_API_KEY // Some ORS endpoints may use this header
            },
            body: JSON.stringify({
                coordinates: coordinates,
                format: 'geojson',
                geometry: true,
                geometry_format: 'geojson',
                instructions: false,
                elevation: false
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ ORS API error: ${response.status} ${response.statusText}`);
            console.error(`❌ Error details: ${errorText}`);
            if (response.status === 401 || response.status === 403) {
                console.error('⚠️ Authentication failed - check ORS_API_KEY in .env file');
            }
            return null;
        }
        
        const data = await response.json();
        
        if (!data || !data.features || data.features.length === 0) {
            console.warn('⚠️ No route found from ORS');
            return null;
        }
        
        const feature = data.features[0];
        const route = feature.geometry;
        const properties = feature.properties;
        
        // Extract coordinates from GeoJSON geometry (coordinates are [lon, lat] in GeoJSON)
        let routeCoordinates = [];
        if (route && route.coordinates && Array.isArray(route.coordinates)) {
            routeCoordinates = route.coordinates.map(coord => ({
                lat: Number(coord[1]), // GeoJSON uses [lon, lat]
                lng: Number(coord[0])
            }));
        }
        
        // If coordinates not found, try to decode from polyline (if available)
        if (routeCoordinates.length === 0 && properties?.encoded_polyline) {
            routeCoordinates = decodePolyline(properties.encoded_polyline);
        }
        
        const result = {
            polyline: properties?.encoded_polyline || null,
            coordinates: routeCoordinates,
            distance: properties?.segments?.[0]?.distance || null, // in meters
            duration: properties?.segments?.[0]?.duration || null, // in seconds
            geometry: route // GeoJSON geometry
        };

        if (process.env.NODE_ENV === 'development') {
            console.log(`🗺️ ORS Route fetched: ${routeCoordinates.length} coordinates, distance: ${result.distance}m, duration: ${result.duration}s`);
        }

        return result;
    } catch (error) {
        console.error('❌ Error fetching route from OpenRouteService:', error.message);
        return null;
    }
};

/**
 * Get route from driver's current position to passenger's destination
 * Used when ride is ongoing
 * @param {number} driverLat - Driver's current latitude
 * @param {number} driverLon - Driver's current longitude
 * @param {number} destLat - Destination latitude
 * @param {number} destLon - Destination longitude
 * @returns {Promise<Object>} - Route data
 */
export const getDriverToDestinationRoute = async (driverLat, driverLon, destLat, destLon) => {
    return await getRoute(driverLat, driverLon, destLat, destLon, 'driving-car');
};

