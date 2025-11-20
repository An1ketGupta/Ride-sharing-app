import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { rideService } from '../services/rideService';
import { requestService } from '../services/requestService';
import { bookingService } from '../services/bookingService';
import { useAuth } from '../context/AuthContext';
import { RideCardSkeleton } from '../components/ui/LoadingSkeleton';

import { Search, MapPin, Calendar, Car, Star, User, DollarSign, ArrowRight, X, Loader, Navigation, Clock } from 'lucide-react';

import { useToast } from '../components/ui/Toast';

const SearchRides = () => {
    const [searchParams, setSearchParams] = useState({
        source: '',
        destination: '',
        date: ''
    });
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedRide, setSelectedRide] = useState(null);
    const [seats, setSeats] = useState(1);
    const [saveLocChecked, setSaveLocChecked] = useState(false);
    const [saveLocName, setSaveLocName] = useState('Home');
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingError, setBookingError] = useState('');
    const [notes, setNotes] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [userLocality, setUserLocality] = useState('');
    const [geoCache] = useState(() => new Map());
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [pickupAddress, setPickupAddress] = useState('');
    const [destinationAddress, setDestinationAddress] = useState('');
    const [rideDate, setRideDate] = useState('');
    const [rideTime, setRideTime] = useState('');
    const [pickupCoords, setPickupCoords] = useState({ lat: null, lon: null });
    const [destinationCoords, setDestinationCoords] = useState({ lat: null, lon: null });
    const [requesting, setRequesting] = useState(false);
    const [activeField, setActiveField] = useState('source');
    const [numberOfPeople, setNumberOfPeople] = useState(1);

    const famousCities = [
        'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata', 'Pune',
        'Jaipur', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal'
    ];

    const { user } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();
    const [minRating, setMinRating] = useState('');
    const [timeSlot, setTimeSlot] = useState(''); // morning/afternoon/evening/night
    const [maxPrice, setMaxPrice] = useState('');
    const [debounceTimer, setDebounceTimer] = useState(null);

    useEffect(() => {
        // Ask for user's location first, then load rides
        const requestLocation = () => new Promise((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                () => resolve(null),
                { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
            );
        });

        const reverseGeocode = async (lat, lon) => {
            try {
                const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
                const data = await resp.json();
                const addr = data?.address || {};
                // Prefer city/town/village, fallback to state
                return addr.city || addr.town || addr.village || addr.county || addr.state || '';
            } catch {
                return '';
            }
        };

        (async () => {
            // Sync from URL params on first load
            try {
                const sp = new URLSearchParams(window.location.search);
                const src = sp.get('source') || '';
                const dst = sp.get('destination') || '';
                const dt = sp.get('date') || '';
                if (src || dst || dt) {
                    setSearchParams({ source: src, destination: dst, date: dt });
                }
            } catch {}
            const loc = await requestLocation();
            if (loc) {
                setUserLocation(loc);
                const locality = await reverseGeocode(loc.lat, loc.lon);
                setUserLocality(locality);
            }
        handleSearch();
        })();
    }, []);

    // Debounced search on input changes
    useEffect(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        const t = setTimeout(() => {
            // Push query params to URL for shareability
            const sp = new URLSearchParams();
            if (searchParams.source) sp.set('source', searchParams.source);
            if (searchParams.destination) sp.set('destination', searchParams.destination);
            if (searchParams.date) sp.set('date', searchParams.date);
            const qs = sp.toString();
            const to = qs ? `/search?${qs}` : '/search';
            if (window.location.pathname !== '/search' || window.location.search !== `?${qs}`) {
                navigate(to, { replace: true });
            }
            handleSearch();
        }, 450);
        setDebounceTimer(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams.source, searchParams.destination, searchParams.date]);

    const handleChange = (e) => {
        setSearchParams({
            ...searchParams,
            [e.target.name]: e.target.value
        });
    };

    const handleCityClick = (city) => {
        if (activeField === 'destination') {
            setSearchParams((prev) => ({ ...prev, destination: city }));
        } else {
            setSearchParams((prev) => ({ ...prev, source: city }));
        }
    };

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await rideService.searchRides(searchParams);
            const list = response.data || [];

            const computeDistanceKm = (lat1, lon1, lat2, lon2) => {
                const toRad = (d) => (d * Math.PI) / 180;
                const R = 6371;
                const dLat = toRad(lat2 - lat1);
                const dLon = toRad(lon2 - lon1);
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                          Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.asin(Math.sqrt(a));
                return R * c;
            };

            const forwardGeocode = async (query) => {
                const key = (query || '').trim().toLowerCase();
                if (!key) return null;
                if (geoCache.has(key)) return geoCache.get(key);
                try {
                    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`);
                    const data = await resp.json();
                    const first = Array.isArray(data) ? data[0] : null;
                    const result = first ? { lat: Number(first.lat), lon: Number(first.lon) } : null;
                    geoCache.set(key, result);
                    return result;
                } catch {
                    geoCache.set(key, null);
                    return null;
                }
            };

            let enriched = list;
            if (userLocation) {
                const distancePairs = await Promise.all(list.map(async (ride) => {
                    const src = ride.source || '';
                    const coords = await forwardGeocode(src);
                    if (coords) {
                        const dist = computeDistanceKm(userLocation.lat, userLocation.lon, coords.lat, coords.lon);
                        return [ride.ride_id, dist];
                    }
                    return [ride.ride_id, Number.POSITIVE_INFINITY];
                }));

                const idToDistance = new Map(distancePairs);
                enriched = [...list].sort((a, b) => {
                    const da = idToDistance.get(a.ride_id) ?? Number.POSITIVE_INFINITY;
                    const db = idToDistance.get(b.ride_id) ?? Number.POSITIVE_INFINITY;
                    if (da !== db) return da - db;
                    // tie-breaker: sooner date/time
                    const aTime = new Date(`${a.date} ${a.time}`).getTime();
                    const bTime = new Date(`${b.date} ${b.time}`).getTime();
                    return aTime - bTime;
                });
                // Attach distance for optional display
                enriched = enriched.map((r) => ({ ...r, _distance_km: idToDistance.get(r.ride_id) }));
            } else {
                // Fallback: prioritize locality match, then time
                const normalizedLocality = (userLocality || '').toLowerCase();
                enriched = normalizedLocality
                    ? [...list].sort((a, b) => {
                        const aMatch = (a.source || '').toLowerCase().includes(normalizedLocality) ? 0 : 1;
                        const bMatch = (b.source || '').toLowerCase().includes(normalizedLocality) ? 0 : 1;
                        if (aMatch !== bMatch) return aMatch - bMatch;
                        const aTime = new Date(`${a.date} ${a.time}`).getTime();
                        const bTime = new Date(`${b.date} ${b.time}`).getTime();
                        return aTime - bTime;
                    })
                    : list;
            }

            // Apply client-side filters
            let filtered = [...enriched];
            if (minRating) {
                const mr = Number(minRating);
                if (Number.isFinite(mr)) filtered = filtered.filter(r => Number(r.driver_rating || 0) >= mr);
            }
            if (timeSlot) {
                const slot = String(timeSlot);
                filtered = filtered.filter(r => {
                    const hh = Number(String(r.time || '00:00:00').split(':')[0]);
                    if (slot === 'morning') return hh >= 5 && hh < 12;
                    if (slot === 'afternoon') return hh >= 12 && hh < 17;
                    if (slot === 'evening') return hh >= 17 && hh < 22;
                    if (slot === 'night') return hh >= 22 || hh < 5;
                    return true;
                });
            }
            if (maxPrice) {
                const mp = Number(maxPrice);
                if (Number.isFinite(mp)) filtered = filtered.filter(r => Number(r.estimated_fare) <= mp);
            }
            setRides(filtered);
        } catch (err) {
            setError('Failed to search rides. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const forwardGeocodeOnce = async (query) => {
        const key = (query || '').trim().toLowerCase();
        if (!key) return null;
        if (geoCache.has(key)) return geoCache.get(key);
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`);
            const data = await resp.json();
            const first = Array.isArray(data) ? data[0] : null;
            const result = first ? { lat: Number(first.lat), lon: Number(first.lon) } : null;
            geoCache.set(key, result);
            return result;
        } catch {
            geoCache.set(key, null);
            return null;
        }
    };

    const openRequestModal = () => {
        if (!user) {
            navigate('/login');
            return;
        }
        setPickupAddress('');
        setDestinationAddress('');
        setRideDate('');
        setRideTime('');
        setPickupCoords({ lat: null, lon: null });
        setDestinationCoords({ lat: null, lon: null });
        setNumberOfPeople(1);
        setShowRequestModal(true);
    };

    const reverseGeocode = async (lat, lon) => {
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
            const data = await resp.json();
            return data?.display_name || '';
        } catch {
            return '';
        }
    };

    const submitRideRequest = async () => {
        if (!user) {
            navigate('/login');
            return;
        }
        
        // Validate pickup location
        if (!pickupAddress.trim()) {
            toast.warning('Please enter a pickup location');
            return;
        }
        
        // Validate destination
        if (!destinationAddress.trim()) {
            toast.warning('Please enter a destination');
            return;
        }
        
        // Validate date
        if (!rideDate) {
            toast.warning('Please select a date for the ride');
            return;
        }
        
        // Validate time
        if (!rideTime) {
            toast.warning('Please select a time for the ride');
            return;
        }
        
        setRequesting(true);
        try {
            // Geocode pickup location
            let pickup = pickupCoords;
            if (!pickup.lat || !pickup.lon) {
                const geocoded = await forwardGeocodeOnce(pickupAddress.trim());
                if (!geocoded) {
                    toast.error('Could not locate pickup address. Please try a more specific address.');
                    setRequesting(false);
                    return;
                }
                pickup = geocoded;
                setPickupCoords(pickup);
            }
            
            // Geocode destination
            let destination = destinationCoords;
            if (!destination.lat || !destination.lon) {
                const geocoded = await forwardGeocodeOnce(destinationAddress.trim());
                if (!geocoded) {
                    toast.error('Could not locate destination address. Please try a more specific address.');
                    setRequesting(false);
                    return;
                }
                destination = geocoded;
                setDestinationCoords(destination);
            }
            
            const resp = await requestService.requestRide({
                passenger_id: user.user_id,
                source_lat: pickup.lat,
                source_lon: pickup.lon,
                destination: destinationAddress.trim(),
                destination_lat: destination.lat,
                destination_lon: destination.lon,
                date: rideDate,
                time: rideTime,
                number_of_people: Number(numberOfPeople) || 1
            });
            
            setShowRequestModal(false);
            toast.success(`Ride request sent to ${resp.drivers_notified?.length || 0} nearby drivers!`);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to send ride request');
        } finally {
            setRequesting(false);
        }
    };

    const handleBookRide = async (ride) => {
        if (!user) {
            navigate('/login');
            return;
        }
        navigate(`/rides/${ride.ride_id}`);
    };

    const confirmBooking = async () => {
        if (!selectedRide) return;

        setBookingLoading(true);
        setBookingError('');

        try {
            // Basic client-side validation for seats
            const requestedSeats = Number(seats) || 0;
            const available = Number(selectedRide.available_seats ?? (selectedRide.total_seats - selectedRide.available_seats));
            if (requestedSeats <= 0) {
                setBookingError('Please choose at least 1 seat');
                return;
            }
            if (Number.isFinite(available) && requestedSeats > available) {
                setBookingError(`Only ${available} seats are available`);
                return;
            }
            // Optionally forward geocode the pickup for saving
            let save_location = undefined;
            if (saveLocChecked) {
                try {
                    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(selectedRide.source)}&limit=1`);
                    const data = await resp.json();
                    const first = Array.isArray(data) ? data[0] : null;
                    if (first) {
                        save_location = {
                            name: saveLocName || 'Home',
                            lat: Number(first.lat),
                            lon: Number(first.lon)
                        };
                    }
                } catch {}
            }

            const resp = await bookingService.createBooking({
                ride_id: selectedRide.ride_id,
                seats_booked: seats,
                notes: notes || undefined,
                save_location
            });
            const created = resp.data;
            // Navigate to payment selection with booking id and amount
            navigate(`/payment?bookingId=${created.booking_id}&amount=${created.amount}`);
        } catch (err) {
            setBookingError(err.response?.data?.message || 'Failed to create booking');
        } finally {
            setBookingLoading(false);
        }
    };

    return (
        <div className="min-h-screen px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl mx-auto">
            {/* Loading Overlay */}
            {loading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="rounded-lg p-8 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg text-center">
                        <div className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700">
                            <Loader className="w-8 h-8 text-primary animate-spin" />
                        </div>
                        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">Searching rides...</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Fetching best matches near you</div>
                    </div>
                </div>
            )}
            
            {/* Header Section */}
            <div className="mb-4 sm:mb-6 md:mb-8">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-2 sm:mb-3 text-gray-900 dark:text-gray-100">Find Your Ride</h1>
                <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base md:text-lg">Search and book rides from verified drivers across the city</p>
                {userLocality && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm font-medium">Showing rides near {userLocality}</span>
                    </div>
                )}
            </div>

            {/* Search Form */}
            <div className="rounded-lg p-3 sm:p-4 md:p-6 lg:p-8 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm mb-4 sm:mb-6 md:mb-8">
                <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            name="source"
                            value={searchParams.source}
                            onChange={handleChange}
                            onFocus={() => setActiveField('source')}
                            placeholder="From (e.g., Bangalore)"
                            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                        />
                    </div>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            name="destination"
                            value={searchParams.destination}
                            onChange={handleChange}
                            onFocus={() => setActiveField('destination')}
                            placeholder="To (e.g., Electronic City)"
                            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                        />
                    </div>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="date"
                            name="date"
                            value={searchParams.date}
                            onChange={handleChange}
                            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full sm:w-auto py-2.5 sm:py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                    >
                        <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                        Search
                    </button>

                </form>

                {/* Famous Cities Quick Select */}
                <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold text-muted-foreground">Famous cities</div>
                        <div className="text-xs text-muted-foreground">Fills {activeField}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {famousCities.map((city) => (
                            <button
                                key={city}
                                type="button"
                                onClick={() => handleCityClick(city)}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors text-gray-700 dark:text-gray-300"
                            >
                                {city}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Results Section */}
            <div>
                <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Available Rides ({rides.length})</h2>
                </div>

                {loading ? (
                    <div className="grid gap-4">
                        {[...Array(4)].map((_, idx) => (
                            <RideCardSkeleton key={idx} />
                        ))}
                    </div>
                ) : rides.length === 0 ? (
                    <div className="rounded-lg p-8 sm:p-12 text-center border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">No rides found</h3>
                        <p className="text-gray-600 dark:text-gray-400">Try adjusting your search criteria or clear filters</p>
                        <div className="mt-6">
                            <button
                                onClick={openRequestModal}
                                className="px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                Request a ride to my location
                            </button>
                            <div className="mt-3 text-sm">
                                <button onClick={()=>{ setMinRating(''); setTimeSlot(''); setMaxPrice(''); setSearchParams({ source:'', destination:'', date:'' }); }} className="text-primary hover:underline">Clear all</button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {rides.map((ride) => (
                            <div
                                key={ride.ride_id}
                                className="rounded-lg p-3 sm:p-4 md:p-6 lg:p-8 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                onClick={() => handleBookRide(ride)}
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 md:gap-6">
                                    <div className="flex items-start gap-4">
                                        {/* Vehicle Image */}
                                        <div className="flex-shrink-0">
                                            {ride.vehicle_image_url ? (
                                                <img
                                                    src={ride.vehicle_image_url}
                                                    alt={`${ride.vehicle_model || 'Vehicle'} - ${ride.vehicle_color || ''}`}
                                                    className="w-24 h-20 sm:w-32 sm:h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-24 h-20 sm:w-32 sm:h-24 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                                    <Car className="w-8 h-8 text-gray-400" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                                                    {ride.source}
                                                </div>
                                                <ArrowRight className="w-5 h-5 text-gray-400" />
                                                <div className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                                                    {ride.destination}
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <div className="p-1.5 rounded-lg bg-primary/10">
                                                        <User className="w-4 h-4 text-primary" />
                                                    </div>
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{ride.driver_name}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <div className="p-1.5 rounded-lg bg-amber-500/10">
                                                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                                    </div>
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{ride.driver_rating || 'New'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700">
                                                        <Calendar className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                                    </div>
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{new Date(ride.date).toLocaleDateString()}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <div className="p-1.5 rounded-lg bg-emerald-500/10">
                                                        <Car className="w-4 h-4 text-emerald-600" />
                                                    </div>
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{(ride.total_seats - ride.available_seats)}/{ride.total_seats}</span>
                                                </div>
                                            </div>
                                            
                                            {ride.vehicle_model && (
                                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 w-fit">
                                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                                        {ride.vehicle_model} • {ride.vehicle_color}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex md:flex-col items-center md:items-end gap-3 md:gap-3">
                                        <div className="text-center md:text-right">
                                            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">Fare per Seat</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-500 mb-1">(₹10/km × distance)</div>
                                            <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                                                ₹{ride.estimated_fare}
                                            </div>
                                            {typeof ride._distance_km === 'number' && isFinite(ride._distance_km) && (
                                                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">~{ride._distance_km.toFixed(1)} km away</div>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleBookRide(ride); }}
                                            className="px-6 py-2.5 sm:px-8 sm:py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 whitespace-nowrap"
                                        >
                                            Book Now
                                            <ArrowRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Booking Modal */}
            {selectedRide && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    onClick={() => setSelectedRide(null)}
                >
                    <div
                        className="rounded-lg p-4 sm:p-6 md:p-8 max-w-md w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Confirm Booking</h3>
                                <button
                                    onClick={() => setSelectedRide(null)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                                    <MapPin className="w-5 h-5 text-primary" />
                                    <div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">Route</div>
                                        <div className="font-semibold text-gray-900 dark:text-gray-100">{selectedRide.source} → {selectedRide.destination}</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                                    <Calendar className="w-5 h-5 text-primary" />
                                    <div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">Date & Time</div>
                                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                                            {new Date(selectedRide.date).toLocaleDateString()} at {selectedRide.time}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                                    <User className="w-5 h-5 text-primary" />
                                    <div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">Driver</div>
                                        <div className="font-semibold text-gray-900 dark:text-gray-100">{selectedRide.driver_name}</div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Number of Seats</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={selectedRide.available_seats}
                                        value={seats}
                                        onChange={(e) => setSeats(parseInt(e.target.value))}
                                        className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                                    />
                                </div>

                                {/* Vehicle Image in Booking Modal */}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Vehicle</label>
                                    {selectedRide.vehicle_image_url ? (
                                        <div className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                                            <img
                                                src={selectedRide.vehicle_image_url}
                                                alt={`${selectedRide.vehicle_model || 'Vehicle'} - ${selectedRide.vehicle_color || ''}`}
                                                className="w-full h-48 object-cover"
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                            {selectedRide.vehicle_model && (
                                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-3 text-white">
                                                    <div className="font-semibold text-sm">{selectedRide.vehicle_model}</div>
                                                    <div className="text-xs opacity-90">{selectedRide.vehicle_color} • {selectedRide.license_plate || selectedRide.plate_number}</div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-full h-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                            <div className="text-center">
                                                <Car className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                                                <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">No vehicle image available</span>
                                                {selectedRide.vehicle_model && (
                                                    <div className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                                                        {selectedRide.vehicle_model} • {selectedRide.vehicle_color}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Notes for driver</label>
                                    <input
                                        type="text"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="I'm at the blue gate"
                                        className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                                    />
                                </div>

                                {/* Save location UI */}
                                <div className="grid sm:grid-cols-2 gap-3 mt-2">
                                    <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={saveLocChecked}
                                            onChange={(e) => setSaveLocChecked(e.target.checked)}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Save pickup location</span>
                                    </label>
                                    {saveLocChecked && (
                                        <select
                                            value={saveLocName}
                                            onChange={(e) => setSaveLocName(e.target.value)}
                                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                                        >
                                            <option value="Home">Home</option>
                                            <option value="Work">Work</option>
                                        </select>
                                    )}
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">Total Amount</span>
                                    <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                        ₹{(parseFloat(selectedRide.estimated_fare) * seats).toFixed(2)}
                                    </span>
                                </div>
                                {bookingError && (
                                    <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                                        {bookingError}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setSelectedRide(null)}
                                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-semibold rounded-lg transition-colors text-gray-700 dark:text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmBooking}
                                    disabled={bookingLoading}
                                    className="flex-1 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {bookingLoading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Booking...
                                        </>
                                    ) : (
                                        <>
                                            Confirm Booking
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            {/* Request Ride Modal */}
            {showRequestModal && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    onClick={() => setShowRequestModal(false)}
                >
                    <div
                        className="rounded-lg p-6 sm:p-8 max-w-lg w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-2xl font-bold mb-1 text-gray-900 dark:text-gray-100">Request a Ride</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Fill in the details to find nearby drivers</p>
                                </div>
                                <button
                                    onClick={() => setShowRequestModal(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-5 mb-6">
                                {/* Pickup Location */}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                        <MapPin className="w-4 h-4 text-primary" />
                                        Pickup Location
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />
                                            <input
                                                type="text"
                                                value={pickupAddress}
                                                onChange={(e) => setPickupAddress(e.target.value)}
                                                placeholder="Enter pickup address or landmark"
                                                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
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
                                                        setPickupCoords(coords);
                                                        const address = await reverseGeocode(coords.lat, coords.lon);
                                                        if (address) {
                                                            setPickupAddress(address);
                                                        }
                                                    });
                                                }
                                            }}
                                            className="px-4 py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg font-semibold transition-colors flex items-center gap-2 border border-primary/20"
                                            title="Use current location"
                                        >
                                            <Navigation className="w-5 h-5" />
                                        </button>
                                    </div>
                                    {pickupCoords.lat && pickupCoords.lon && (
                                        <p className="text-xs text-gray-500 dark:text-gray-500">
                                            Coordinates: {pickupCoords.lat.toFixed(6)}, {pickupCoords.lon.toFixed(6)}
                                        </p>
                                    )}
                                </div>

                                {/* Destination */}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                        <MapPin className="w-4 h-4 text-primary" />
                                        Destination
                                    </label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={destinationAddress}
                                            onChange={(e) => setDestinationAddress(e.target.value)}
                                            placeholder="Enter destination address"
                                            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                                        />
                                    </div>
                                    {destinationCoords.lat && destinationCoords.lon && (
                                        <p className="text-xs text-gray-500 dark:text-gray-500">
                                            Coordinates: {destinationCoords.lat.toFixed(6)}, {destinationCoords.lon.toFixed(6)}
                                        </p>
                                    )}
                                </div>

                                {/* Date and Time */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                            <Calendar className="w-4 h-4 text-primary" />
                                            Date
                                        </label>
                                        <input
                                            type="date"
                                            value={rideDate}
                                            onChange={(e) => setRideDate(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                            <Clock className="w-4 h-4 text-primary" />
                                            Time
                                        </label>
                                        <input
                                            type="time"
                                            value={rideTime}
                                            onChange={(e) => setRideTime(e.target.value)}
                                            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                                        />
                                    </div>
                                </div>

                                {/* Number of Seats Required */}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                        <User className="w-4 h-4 text-primary" />
                                        Number of Seats Required
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="20"
                                        value={numberOfPeople}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (value === '' || value === null || value === undefined) {
                                                setNumberOfPeople(1);
                                            } else {
                                                const num = parseInt(value, 10);
                                                if (!isNaN(num) && num >= 1) {
                                                    setNumberOfPeople(Math.min(20, Math.max(1, num)));
                                                }
                                            }
                                        }}
                                        placeholder="Enter number of passengers"
                                        className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-gray-900 dark:text-gray-100"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Only drivers with vehicles that can accommodate this many passengers will be notified
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <button
                                    onClick={() => setShowRequestModal(false)}
                                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-semibold rounded-lg transition-colors text-gray-700 dark:text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitRideRequest}
                                    disabled={requesting || !pickupAddress.trim() || !destinationAddress.trim() || !rideDate || !rideTime || numberOfPeople < 1}
                                    className="flex-1 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {requesting ? (
                                        <>
                                            <Loader className="w-4 h-4 animate-spin" />
                                            Requesting...
                                        </>
                                    ) : (
                                        <>
                                            <MapPin className="w-4 h-4" />
                                            Send Request
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
};

export default SearchRides;




