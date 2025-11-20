import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    iconRetinaUrl: iconRetina,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const containerStyle = { width: '100%', height: '260px', borderRadius: '16px' };

export default function ORSMap({ driver, passenger }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const driverMarkerRef = useRef(null);
    const driverCircleRef = useRef(null);
    const passengerMarkerRef = useRef(null);
    const passengerCircleRef = useRef(null);
    const routeLayerRef = useRef(null);

    useEffect(() => {
        // Initialize map
        if (!mapRef.current || mapInstanceRef.current) return;

        // Determine center - prioritize driver location
        let center = [20.5937, 78.9629]; // India fallback
        let zoom = 13;

        if (driver?.lat && driver?.lon) {
            center = [Number(driver.lat), Number(driver.lon)];
            zoom = 16;
        } else if (passenger?.lat && passenger?.lon) {
            center = [Number(passenger.lat), Number(passenger.lon)];
            zoom = 15;
        }

        // Create map instance
        const map = L.map(mapRef.current, {
            center: center,
            zoom: zoom,
            zoomControl: true,
            attributionControl: true
        });

        // Add OpenStreetMap tiles (used by ORS)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        mapInstanceRef.current = map;

        if (import.meta.env.DEV) {
            console.log('🗺️ ORS Map initialized at:', center);
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // Update driver marker
    useEffect(() => {
        if (!mapInstanceRef.current || !driver?.lat || !driver?.lon) {
            if (driverMarkerRef.current) {
                mapInstanceRef.current?.removeLayer(driverMarkerRef.current);
                driverMarkerRef.current = null;
            }
            if (driverCircleRef.current) {
                mapInstanceRef.current?.removeLayer(driverCircleRef.current);
                driverCircleRef.current = null;
            }
            return;
        }

        const driverPos = [Number(driver.lat), Number(driver.lon)];

        // Remove existing driver marker and circle
        if (driverMarkerRef.current) {
            mapInstanceRef.current.removeLayer(driverMarkerRef.current);
            driverMarkerRef.current = null;
        }
        if (driverCircleRef.current) {
            mapInstanceRef.current.removeLayer(driverCircleRef.current);
            driverCircleRef.current = null;
        }

        // Create custom green icon for driver
        const driverIcon = L.divIcon({
            className: 'driver-marker',
            html: `
                <div style="
                    width: 28px;
                    height: 28px;
                    background-color: #10b981;
                    border: 4px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    color: white;
                    font-size: 14px;
                ">D</div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        // Add driver marker
        const driverMarker = L.marker(driverPos, { icon: driverIcon })
            .addTo(mapInstanceRef.current)
            .bindTooltip('Driver Location', { permanent: false, direction: 'top' });

        driverMarkerRef.current = driverMarker;

        // Add circle around driver location
        const driverCircle = L.circle(driverPos, {
            radius: 100,
            fillColor: '#10b981',
            fillOpacity: 0.15,
            color: '#10b981',
            weight: 3,
            opacity: 0.6
        }).addTo(mapInstanceRef.current);

        driverCircleRef.current = driverCircle;

        // Center map on driver location
        mapInstanceRef.current.setView(driverPos, 16);

        if (import.meta.env.DEV) {
            console.log('📍 Driver location updated on ORS map:', driverPos);
        }

        return () => {
            if (driverMarkerRef.current) {
                mapInstanceRef.current?.removeLayer(driverMarkerRef.current);
                driverMarkerRef.current = null;
            }
            if (driverCircleRef.current) {
                mapInstanceRef.current?.removeLayer(driverCircleRef.current);
                driverCircleRef.current = null;
            }
        };
    }, [driver?.lat, driver?.lon]);

    // Update passenger marker
    useEffect(() => {
        if (!mapInstanceRef.current || !passenger?.lat || !passenger?.lon) {
            if (passengerMarkerRef.current) {
                mapInstanceRef.current?.removeLayer(passengerMarkerRef.current);
                passengerMarkerRef.current = null;
            }
            return;
        }

        const passengerPos = [Number(passenger.lat), Number(passenger.lon)];

        // Remove existing passenger marker
        if (passengerMarkerRef.current) {
            mapInstanceRef.current.removeLayer(passengerMarkerRef.current);
        }

        // Create custom blue icon for passenger
        const passengerIcon = L.divIcon({
            className: 'passenger-marker',
            html: `
                <div style="
                    width: 24px;
                    height: 24px;
                    background-color: #3b82f6;
                    border: 3px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    color: white;
                    font-size: 12px;
                ">P</div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        // Add passenger marker
        const passengerMarker = L.marker(passengerPos, { icon: passengerIcon })
            .addTo(mapInstanceRef.current)
            .bindTooltip('Your Location', { permanent: false, direction: 'top' });

        passengerMarkerRef.current = passengerMarker;

        // Remove existing passenger circle
        if (passengerCircleRef.current) {
            mapInstanceRef.current.removeLayer(passengerCircleRef.current);
        }

        // Add circle around passenger location
        const passengerCircle = L.circle(passengerPos, {
            radius: 50,
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            color: '#3b82f6',
            weight: 2,
            opacity: 0.5
        }).addTo(mapInstanceRef.current);

        passengerCircleRef.current = passengerCircle;

        // Fit bounds to show both driver and passenger if both are available
        if (driver?.lat && driver?.lon) {
            const bounds = L.latLngBounds([driverPos, passengerPos]);
            mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
        }

        return () => {
            if (passengerMarkerRef.current) {
                mapInstanceRef.current?.removeLayer(passengerMarkerRef.current);
                passengerMarkerRef.current = null;
            }
            if (passengerCircleRef.current) {
                mapInstanceRef.current?.removeLayer(passengerCircleRef.current);
                passengerCircleRef.current = null;
            }
        };
    }, [passenger?.lat, passenger?.lon, driver?.lat, driver?.lon]);

    // Update ORS route
    useEffect(() => {
        if (!mapInstanceRef.current || !driver?.route?.coordinates || driver.route.coordinates.length === 0) {
            if (routeLayerRef.current) {
                mapInstanceRef.current?.removeLayer(routeLayerRef.current);
                routeLayerRef.current = null;
            }
            return;
        }

        // Remove existing route
        if (routeLayerRef.current) {
            mapInstanceRef.current.removeLayer(routeLayerRef.current);
        }

        try {
            // Convert route coordinates to Leaflet format [lat, lng]
            const routeCoords = driver.route.coordinates.map(coord => {
                if (Array.isArray(coord)) {
                    // Handle [lng, lat] or [lat, lng] format
                    if (coord.length >= 2) {
                        // Check if it's likely [lng, lat] (GeoJSON) or [lat, lng]
                        // If lng > lat, it's probably [lng, lat]
                        return coord[0] > coord[1] ? [coord[1], coord[0]] : [coord[0], coord[1]];
                    }
                } else if (coord.lat !== undefined && coord.lng !== undefined) {
                    return [Number(coord.lat), Number(coord.lng)];
                } else if (coord.lat !== undefined && coord.lon !== undefined) {
                    return [Number(coord.lat), Number(coord.lon)];
                }
                return null;
            }).filter(coord => coord !== null);

            if (routeCoords.length > 0) {
                // Create polyline for the route
                const routePolyline = L.polyline(routeCoords, {
                    color: '#6366f1',
                    weight: 5,
                    opacity: 0.8,
                    smoothFactor: 1
                }).addTo(mapInstanceRef.current);

                routeLayerRef.current = routePolyline;

                // Fit bounds to show entire route
                const bounds = L.latLngBounds(routeCoords);
                mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });

                if (import.meta.env.DEV) {
                    console.log('🗺️ ORS route displayed on map:', routeCoords.length, 'points');
                }
            }
        } catch (error) {
            console.error('Error rendering ORS route:', error);
        }

        return () => {
            if (routeLayerRef.current) {
                mapInstanceRef.current?.removeLayer(routeLayerRef.current);
                routeLayerRef.current = null;
            }
        };
    }, [driver?.route]);

    return (
        <div style={containerStyle} className="relative overflow-hidden rounded-2xl border border-white/20">
            <div ref={mapRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
        </div>
    );
}

