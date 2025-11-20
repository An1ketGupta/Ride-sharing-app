import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, Marker, useLoadScript, Circle, DirectionsService, DirectionsRenderer, Polyline } from '@react-google-maps/api';
import ORSMap from './ORSMap';

const containerStyle = { width: '100%', height: '260px', borderRadius: '16px' };

export default function LiveRideMap({ driver, passenger }) {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const { isLoaded } = useLoadScript({ googleMapsApiKey: apiKey || '' });
    const mapRef = useRef(null);
    const polylineRef = useRef(null);

    const center = useMemo(() => {
        if (driver?.lat && driver?.lon) return { lat: Number(driver.lat), lng: Number(driver.lon) };
        if (passenger?.lat && passenger?.lon) return { lat: Number(passenger.lat), lng: Number(passenger.lon) };
        return { lat: 20.5937, lng: 78.9629 }; // India fallback
    }, [driver, passenger]);
    const [route, setRoute] = useState(null);
    const [orsRoute, setOrsRoute] = useState(null); // OpenRouteService route

    // Update ORS route when driver location includes route data
    useEffect(() => {
        if (driver?.route && driver.route.coordinates && Array.isArray(driver.route.coordinates) && driver.route.coordinates.length > 0) {
            // Convert ORS coordinates to Google Maps format [{lat, lng}, ...]
            const routePath = driver.route.coordinates.map(coord => {
                // Handle different coordinate formats
                let lat, lng;
                if (typeof coord === 'object' && coord !== null) {
                    // Format: {lat: ..., lng: ...} or {lat: ..., lon: ...}
                    lat = Number(coord.lat || coord[1]);
                    lng = Number(coord.lng || coord.lon || coord[0]);
                } else if (Array.isArray(coord)) {
                    // Format: [lng, lat] (GeoJSON format)
                    lat = Number(coord[1]);
                    lng = Number(coord[0]);
                } else {
                    return null;
                }
                
                // Validate coordinates
                if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                    return null;
                }
                
                return { lat, lng };
            }).filter(coord => coord !== null);
            
            if (routePath.length > 0) {
                setOrsRoute(routePath);
            } else {
                setOrsRoute(null);
            }
        } else {
            setOrsRoute(null);
        }
    }, [driver?.route]);

    useEffect(() => {
        if (!mapRef.current || !isLoaded) return;
        if (!window.google || !window.google.maps) return;
        
        const points = [];
        if (driver?.lat && driver?.lon) points.push({ lat: Number(driver.lat), lng: Number(driver.lon) });
        if (passenger?.lat && passenger?.lon) points.push({ lat: Number(passenger.lat), lng: Number(passenger.lon) });
        
        // Include route path in bounds if available
        if (orsRoute && orsRoute.length > 0) {
            orsRoute.forEach(point => {
                points.push(point);
            });
        }
        
        if (points.length >= 2) {
            try {
                const bounds = new window.google.maps.LatLngBounds();
                points.forEach((p) => bounds.extend(p));
                mapRef.current.fitBounds(bounds, 40);
            } catch (err) {
                // Error setting map bounds
            }
        } else if (driver?.lat && driver?.lon) {
            // Always center on driver location if available (even without passenger)
            const driverPos = { lat: Number(driver.lat), lng: Number(driver.lon) };
            mapRef.current.setCenter(driverPos);
            // Use higher zoom level for better visibility when only showing driver
            mapRef.current.setZoom(16);
        } else if (points.length === 1) {
            // If only passenger point, center on it
            mapRef.current.setCenter(points[0]);
            mapRef.current.setZoom(15);
        }
    }, [driver, passenger, isLoaded, orsRoute]);

    // Create marker icons - must be called before any early returns to maintain hook order
    const driverIcon = useMemo(() => {
        if (!isLoaded || !window.google?.maps) return null;
        return {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 14, // Increased size for better visibility
            fillColor: '#10b981', // Green for driver
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 4, // Increased stroke for better visibility
            label: {
                text: 'D',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 'bold'
            },
            zIndex: 1000
        };
    }, [isLoaded]);

    const passengerIcon = useMemo(() => {
        if (!isLoaded || !window.google?.maps) return null;
        return {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#3b82f6', // Blue for passenger
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
            label: {
                text: 'P',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 'bold'
            }
        };
    }, [isLoaded]);

    // Fallback to ORSMap (Leaflet/OpenStreetMap) if Google Maps API key is not configured
    if (!apiKey) {
        return <ORSMap driver={driver} passenger={passenger} />;
    }

    if (!isLoaded) {
        return (
            <div style={{ ...containerStyle }} className="flex items-center justify-center bg-white/50 dark:bg-white/5 border border-white/20">
                <div className="text-sm text-muted-foreground">Loading map…</div>
            </div>
        );
    }

    return (
        <GoogleMap
            onLoad={(map) => { mapRef.current = map; }}
            mapContainerStyle={containerStyle}
            center={center}
            zoom={14}
            options={{
                disableDefaultUI: true,
                zoomControl: true,
                mapTypeControl: false,
                streetViewControl: false,
            }}
        >
            {/* OpenRouteService route polyline - preferred when available */}
            {orsRoute && orsRoute.length > 0 && isLoaded && window.google?.maps && (
                <Polyline
                    path={orsRoute}
                    options={{
                        geodesic: true,
                        strokeColor: '#6366f1', // Primary color
                        strokeOpacity: 0.8,
                        strokeWeight: 5,
                        icons: [{
                            icon: {
                                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                                strokeColor: '#6366f1',
                                fillColor: '#6366f1',
                                fillOpacity: 1,
                                strokeWeight: 2,
                                scale: 4,
                                rotation: 0
                            },
                            offset: '50%',
                            repeat: '100px'
                        }]
                    }}
                    onLoad={(polyline) => {
                        polylineRef.current = polyline;
                    }}
                    onError={(error) => {
                        // Polyline error
                    }}
                />
            )}
            
            {/* Fallback: Google Directions service - only if ORS route not available and both locations are available */}
            {!orsRoute && driver?.lat && driver?.lon && passenger?.lat && passenger?.lon && isLoaded && (
                <DirectionsService
                    options={{
                        origin: { lat: Number(driver.lat), lng: Number(driver.lon) },
                        destination: { lat: Number(passenger.lat), lng: Number(passenger.lon) },
                        travelMode: 'DRIVING'
                    }}
                    callback={(res) => {
                        if (res && res.status === 'OK') {
                            setRoute(res);
                        }
                    }}
                />
            )}
            {/* Google Directions route rendering - fallback */}
            {!orsRoute && route && (
                <DirectionsRenderer options={{ directions: route, suppressMarkers: true, preserveViewport: true }} />
            )}
            {/* Driver marker - always show if driver location is available */}
            {driver?.lat && driver?.lon && isLoaded && driverIcon && (
                <>
                    <Marker 
                        position={{ lat: Number(driver.lat), lng: Number(driver.lon) }} 
                        icon={driverIcon}
                        title="Driver Location"
                        zIndex={1000}
                    />
                    {/* Circle around driver location for better visibility */}
                    <Circle 
                        center={{ lat: Number(driver.lat), lng: Number(driver.lon) }} 
                        radius={100} 
                        options={{ 
                            fillColor: '#10b981', 
                            fillOpacity: 0.15, 
                            strokeColor: '#10b981', 
                            strokeOpacity: 0.6, 
                            strokeWeight: 3,
                            zIndex: 998
                        }} 
                    />
                </>
            )}
            {/* Passenger marker - show if passenger location is available */}
            {passenger?.lat && passenger?.lon && isLoaded && passengerIcon && (
                <>
                    <Marker 
                        position={{ lat: Number(passenger.lat), lng: Number(passenger.lon) }} 
                        icon={passengerIcon}
                        title="Your Location"
                        zIndex={999}
                    />
                    <Circle 
                        center={{ lat: Number(passenger.lat), lng: Number(passenger.lon) }} 
                        radius={50} 
                        options={{ 
                            fillColor: '#3b82f6', 
                            fillOpacity: 0.15, 
                            strokeColor: '#3b82f6', 
                            strokeOpacity: 0.5, 
                            strokeWeight: 2 
                        }} 
                    />
                </>
            )}
        </GoogleMap>
    );
}


