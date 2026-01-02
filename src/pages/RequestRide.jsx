import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { requestService } from '../services/requestService';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { MapPin, Navigation, AlertCircle, CheckCircle, XCircle, Loader, Users, Calendar, Clock } from 'lucide-react';
import io from 'socket.io-client';

const RequestRide = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [requestStatus, setRequestStatus] = useState(null); // null, 'searching', 'found', 'timeout'
    const [requestId, setRequestId] = useState(null);
    const [socket, setSocket] = useState(null);
    const [availableDrivers, setAvailableDrivers] = useState([]);
    const [pickupAddress, setPickupAddress] = useState('');
    const [destinationAddress, setDestinationAddress] = useState('');
    const [selectedLocation, setSelectedLocation] = useState({ lat: null, lon: null });
    const [destinationLocation, setDestinationLocation] = useState({ lat: null, lon: null });
    const [rideDate, setRideDate] = useState('');
    const [rideTime, setRideTime] = useState('');
    const [numberOfPeople, setNumberOfPeople] = useState(1);
    const [assignedDriver, setAssignedDriver] = useState(null);
    const [socketConnected, setSocketConnected] = useState(false);
    const [geoPermission, setGeoPermission] = useState('prompt'); // prompt|granted|denied|unknown
    const [retryCount, setRetryCount] = useState(0);
    const [geoCache] = useState(() => new Map());

    // Forward geocode address to coordinates
    const forwardGeocode = async (query) => {
        const key = (query || '').trim().toLowerCase();
        if (!key) return null;
        if (geoCache.has(key)) return geoCache.get(key);
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`);
            const data = await resp.json();
            const first = Array.isArray(data) ? data[0] : null;
            const result = first ? { lat: Number(first.lat), lon: Number(first.lon) } : null;
            if (result) geoCache.set(key, result);
            return result;
        } catch {
            geoCache.set(key, null);
            return null;
        }
    };

    // Reverse geocode coordinates to address
    const reverseGeocode = async (lat, lon) => {
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
            const data = await resp.json();
            const addr = data?.display_name || '';
            return addr;
        } catch {
            return '';
        }
    };

    useEffect(() => {
        // Get user location and convert to address
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const coords = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };
                    setSelectedLocation(coords);
                    setGeoPermission('granted');
                    // Convert coordinates to address
                    const address = await reverseGeocode(coords.lat, coords.lon);
                    if (address) {
                        setPickupAddress(address);
                    }
                },
                () => {
                    toast.error('Unable to get your location. Please enter an address manually.');
                    setGeoPermission('denied');
                }
            );
        }

        // Setup socket
        if (!user?.user_id) return;
        const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
        const s = io(socketUrl, { transports: ['websocket'] });
        
        s.on('connect', () => {
            s.emit('user_register', { user_id: user.user_id });
            setSocketConnected(true);
        });
        s.on('disconnect', () => setSocketConnected(false));

        s.on('ride_assigned_passenger_' + user.user_id, (payload) => {
            setAssignedDriver(payload);
            setRequestStatus('found');
            toast.success('Driver assigned!');
        });

        setSocket(s);
        return () => s.disconnect();
    }, [user?.user_id, toast]);

    const handleRequestRide = async () => {
        if (!user?.user_id) {
            toast.error('Please login first');
            return;
        }

        // If address is provided, geocode it
        let coords = selectedLocation;
        if (pickupAddress.trim() && (!coords.lat || !coords.lon)) {
            const geocoded = await forwardGeocode(pickupAddress.trim());
            if (!geocoded) {
                toast.error('Could not locate that address. Please try a more specific address.');
                return;
            }
            coords = geocoded;
            setSelectedLocation(coords);
        }

        if (!coords.lat || !coords.lon) {
            toast.error('Please enter a pickup address');
            return;
        }

        // Validate destination
        let destCoords = destinationLocation;
        if (destinationAddress.trim() && (!destCoords.lat || !destCoords.lon)) {
            const geocoded = await forwardGeocode(destinationAddress.trim());
            if (!geocoded) {
                toast.error('Could not locate destination address. Please try a more specific address.');
                return;
            }
            destCoords = geocoded;
            setDestinationLocation(destCoords);
        }

        if (!destCoords.lat || !destCoords.lon) {
            toast.error('Please enter a destination address');
            return;
        }

        // Validate date and time
        if (!rideDate) {
            toast.error('Please select a date for the ride');
            return;
        }
        if (!rideTime) {
            toast.error('Please select a time for the ride');
            return;
        }

        try {
            setLoading(true);
            setRequestStatus('searching');
            const response = await requestService.requestRide({
                passenger_id: user.user_id,
                source_lat: coords.lat,
                source_lon: coords.lon,
                destination: destinationAddress.trim(),
                destination_lat: destCoords.lat,
                destination_lon: destCoords.lon,
                date: rideDate,
                time: rideTime,
                number_of_people: numberOfPeople
            });
            
            if (response.success) {
                setRequestId(response.request_id);
                setAvailableDrivers(response.drivers_notified || []);
                toast.success(`Request sent to ${response.drivers_notified?.length || 0} nearby drivers`);
                
                // Timeout after 30 seconds
                setTimeout(() => {
                    setRequestStatus((prev) => {
                        if (prev === 'searching') {
                            toast.warning('No drivers available. Please try again later.');
                            return 'timeout';
                        }
                        return prev;
                    });
                }, 30000);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to request ride');
            setRequestStatus(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 container mx-auto max-w-4xl px-6 sm:px-8 py-8 sm:py-10">
            {/* Permission helper */}
            {geoPermission === 'denied' && (
                <div className="mb-6 p-4 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 mt-0.5" />
                    <div>
                        <div className="font-semibold">Location access is blocked</div>
                        <div className="text-sm">Enable location permissions in your browser settings or enter an address manually.</div>
                    </div>
                </div>
            )}

            {/* Socket status */}
            <div className="mb-6 flex items-center gap-2 text-sm">
                <div className={`px-3 py-1.5 rounded-full border font-semibold ${socketConnected ? 'border-[#10b981] text-[#10b981] bg-[#10b981]/10' : 'border-gray-200 text-gray-900/60 bg-[#0A0A0A]'}`}>
                    {socketConnected ? 'Socket: Connected' : 'Socket: Disconnected'}
                </div>
                {requestStatus && (
                    <div className={`px-3 py-1.5 rounded-full border font-semibold ${requestStatus==='searching'?'border-[#0EA5E9] text-blue-600 bg-blue-600/10': requestStatus==='found'?'border-[#10b981] text-[#10b981] bg-[#10b981]/10':'border-gray-200 text-gray-900/60 bg-[#0A0A0A]'}`}>
                        Status: {requestStatus}
                    </div>
                )}
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-8 text-gray-900">Request Ride</h1>

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="rounded-lg border border-gray-200 bg-white shadow-xl p-6 sm:p-8"
            >
                {!requestStatus ? (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-semibold mb-2 text-gray-900">Pickup Location</label>
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600 pointer-events-none z-10" />
                                    <input
                                        type="text"
                                        placeholder="Enter pickup address (e.g., 123 Main St, City)"
                                        value={pickupAddress}
                                        onChange={(e) => setPickupAddress(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3 bg-[#0A0A0A] border border-gray-200 rounded-lg focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none text-gray-900 placeholder:text-gray-900/40"
                                    />
                                </div>
                                <button
                                    onClick={async () => {
                                        if (navigator.geolocation) {
                                            navigator.geolocation.getCurrentPosition(async (pos) => {
                                                const coords = {
                                                    lat: pos.coords.latitude,
                                                    lon: pos.coords.longitude
                                                };
                                                setSelectedLocation(coords);
                                                const address = await reverseGeocode(coords.lat, coords.lon);
                                                if (address) {
                                                    setPickupAddress(address);
                                                }
                                            });
                                        }
                                    }}
                                    className="px-4 py-3 bg-blue-600 text-gray-900 rounded-lg font-semibold hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 flex items-center gap-2"
                                >
                                    <Navigation className="w-5 h-5" />
                                    Use GPS
                                </button>
                            </div>
                            {selectedLocation.lat && selectedLocation.lon && (
                                <p className="text-xs text-gray-900/40 mt-2">
                                    Coordinates: {selectedLocation.lat.toFixed(6)}, {selectedLocation.lon.toFixed(6)}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-2 text-gray-900">Destination</label>
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600 pointer-events-none z-10" />
                                    <input
                                        type="text"
                                        placeholder="Enter destination address"
                                        value={destinationAddress}
                                        onChange={(e) => setDestinationAddress(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3 bg-[#0A0A0A] border border-gray-200 rounded-lg focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none text-gray-900 placeholder:text-gray-900/40"
                                    />
                                </div>
                            </div>
                            {destinationLocation.lat && destinationLocation.lon && (
                                <p className="text-xs text-gray-900/40 mt-2">
                                    Coordinates: {destinationLocation.lat.toFixed(6)}, {destinationLocation.lon.toFixed(6)}
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold mb-2 text-gray-900">Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600 pointer-events-none z-10" />
                                    <input
                                        type="date"
                                        value={rideDate}
                                        onChange={(e) => setRideDate(e.target.value)}
                                        min={new Date().toISOString().split('T')[0]}
                                        className="w-full pl-12 pr-4 py-3 bg-[#0A0A0A] border border-gray-200 rounded-lg focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none text-gray-900"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-2 text-gray-900">Time</label>
                                <div className="relative">
                                    <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600 pointer-events-none z-10" />
                                    <input
                                        type="time"
                                        value={rideTime}
                                        onChange={(e) => setRideTime(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3 bg-[#0A0A0A] border border-gray-200 rounded-lg focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none text-gray-900"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-2 text-gray-900">Number of People</label>
                            <div className="relative">
                                <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600 pointer-events-none z-10" />
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={numberOfPeople}
                                    onChange={(e) => setNumberOfPeople(Math.max(1, parseInt(e.target.value) || 1))}
                                    placeholder="Enter number of passengers"
                                    className="w-full pl-12 pr-4 py-3 bg-[#0A0A0A] border border-gray-200 rounded-lg focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none text-gray-900 placeholder:text-gray-900/40"
                                />
                            </div>
                            <p className="text-xs text-gray-900/40 mt-2">
                                This helps drivers bring an appropriate vehicle
                            </p>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleRequestRide}
                            disabled={loading || !pickupAddress.trim() || !destinationAddress.trim() || !rideDate || !rideTime || numberOfPeople < 1}
                            className="w-full py-4 bg-blue-600 text-gray-900 rounded-lg font-semibold hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader className="w-5 h-5 animate-spin" />
                                    Requesting...
                                </>
                            ) : (
                                <>
                                    <MapPin className="w-5 h-5" />
                                    Find Nearby Drivers
                                </>
                            )}
                        </motion.button>
                    </div>
                ) : requestStatus === 'searching' ? (
                    <div className="text-center py-10">
                        <Loader className="w-16 h-16 mx-auto mb-4 text-blue-600 animate-spin" />
                        <h3 className="text-xl font-bold mb-2 text-gray-900">Finding nearby drivers...</h3>
                        <p className="text-gray-900/60 mb-4">
                            Request sent to {availableDrivers.length} nearby drivers
                        </p>
                        <p className="text-sm text-gray-900/40">
                            Waiting for driver to accept...
                        </p>
                    </div>
                ) : requestStatus === 'found' && assignedDriver ? (
                    <div className="text-center py-10">
                        <CheckCircle className="w-16 h-16 mx-auto mb-4 text-[#10b981]" />
                        <h3 className="text-xl font-bold mb-2 text-gray-900">Driver Assigned!</h3>
                        <p className="text-gray-900/60 mb-6">Your ride request has been accepted by a driver.</p>
                        <div className="mt-6 p-6 rounded-lg bg-[#0A0A0A] border border-gray-200 text-left space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900">Driver ID:</span>
                                <span className="text-gray-900/60">{assignedDriver.driver_id}</span>
                            </div>
                            {assignedDriver.ride_id && (
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-900">Ride ID:</span>
                                    <span className="text-gray-900/60">{assignedDriver.ride_id}</span>
                                </div>
                            )}
                            {assignedDriver.booking_id && (
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-900">Booking ID:</span>
                                    <span className="text-gray-900/60">{assignedDriver.booking_id}</span>
                                </div>
                            )}
                            {assignedDriver.pickup && (
                                <div className="flex items-start gap-2">
                                    <MapPin className="w-4 h-4 mt-0.5 text-blue-600" />
                                    <div>
                                        <span className="font-semibold text-gray-900">Pickup Location: </span>
                                        <span className="text-gray-900/60 text-sm">
                                            {assignedDriver.pickup.lat?.toFixed(6)}, {assignedDriver.pickup.lon?.toFixed(6)}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {assignedDriver.destination && (
                                <div className="flex items-start gap-2">
                                    <MapPin className="w-4 h-4 mt-0.5 text-blue-600" />
                                    <div>
                                        <span className="font-semibold text-gray-900">Destination: </span>
                                        <span className="text-gray-900/60">{assignedDriver.destination}</span>
                                    </div>
                                </div>
                            )}
                            {numberOfPeople > 1 && (
                                <div className="flex items-start gap-2">
                                    <Users className="w-4 h-4 mt-0.5 text-blue-600" />
                                    <div>
                                        <span className="font-semibold text-gray-900">Passengers: </span>
                                        <span className="text-gray-900/60">{numberOfPeople} {numberOfPeople === 1 ? 'person' : 'people'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={() => {
                                    navigate('/passenger-dashboard');
                                }}
                                className="px-6 py-3 bg-blue-600 text-gray-900 rounded-lg font-semibold hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200"
                            >
                                View Booking
                            </button>
                            <button
                                onClick={() => {
                                    setRequestStatus(null);
                                    setAssignedDriver(null);
                                    setRequestId(null);
                                    setNumberOfPeople(1);
                                }}
                                className="px-6 py-3 bg-[#1A1A1A] border border-gray-200 text-gray-900 rounded-lg font-semibold hover:bg-[#1F1F1F] transition-all duration-200"
                            >
                                Request Another Ride
                            </button>
                        </div>
                    </div>
                ) : requestStatus === 'timeout' ? (
                    <div className="text-center py-10">
                        <XCircle className="w-16 h-16 mx-auto mb-4 text-[#ef4444]" />
                        <h3 className="text-xl font-bold mb-2 text-gray-900">No Drivers Available</h3>
                        <p className="text-gray-900/60 mb-4">
                            We couldn't find any nearby drivers at this time.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={() => {
                                    setRequestStatus(null);
                                    setRequestId(null);
                                    setNumberOfPeople(1);
                                }}
                                className="mt-6 px-6 py-3 bg-[#1A1A1A] border border-gray-200 text-gray-900 rounded-lg font-semibold hover:bg-[#1F1F1F] transition-all duration-200"
                            >
                                Change Location
                            </button>
                            <button
                                onClick={() => {
                                    const next = Math.min(3, retryCount + 1);
                                    setRetryCount(next);
                                    setTimeout(() => handleRequestRide(), next * 500); // small backoff
                                    setRequestStatus('searching');
                                }}
                                className="mt-6 px-6 py-3 bg-blue-600 text-gray-900 rounded-lg font-semibold hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200"
                            >
                                Retry Search
                            </button>
                        </div>
                    </div>
                ) : null}
            </motion.div>
        </div>
    );
};

export default RequestRide;


