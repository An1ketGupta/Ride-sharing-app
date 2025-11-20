import { useState, useEffect } from 'react';
import { bookingService } from '../services/bookingService';
import { paymentService } from '../services/paymentService';
import { feedbackService } from '../services/feedbackService';
import { Banknote } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    MapPin, Calendar, Clock, User, DollarSign, 
    CheckCircle, XCircle, CreditCard, Star, 
    MessageSquare, AlertCircle, X, Receipt, ShieldAlert, Car
} from 'lucide-react';
import { sosService } from '../services/sosService';
import io from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import axios from 'axios';
import ORSMap from '../components/Map/ORSMap';
import SafetyCheck from '../components/SafetyCheck';

const PassengerDashboard = () => {
    const [activeTab, setActiveTab] = useState('bookings');
    const [bookings, setBookings] = useState([]);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [viewBooking, setViewBooking] = useState(null);
    const [socket, setSocket] = useState(null);
    const [msgByBookingId, setMsgByBookingId] = useState({});
    const [livePos, setLivePos] = useState(null); // { driver_id, lat, lon, ts }
    const [liveEta, setLiveEta] = useState(null); // minutes
    const { user } = useAuth();
    const toast = useToast();
    
    const [paymentMethod, setPaymentMethod] = useState('upi');
    const [feedbackForm, setFeedbackForm] = useState({
        ride_id: null,
        rating: 5,
        comments: ''
    });

    useEffect(() => {
        if (activeTab === 'bookings') {
            loadBookings();
        } else if (activeTab === 'payments') {
            loadPayments();
        }
    }, [activeTab]);

    // Reset live position when viewing a different booking or when ride status changes
    useEffect(() => {
        if (viewBooking) {
            const rideStatus = (viewBooking?.ride_status || '').toLowerCase();
            const bookingStatus = (viewBooking?.booking_status || '').toLowerCase();
            // Show driver location for ongoing rides OR confirmed/in_progress bookings
            const isOngoing = rideStatus === 'ongoing' || 
                             bookingStatus === 'confirmed' || 
                             bookingStatus === 'in_progress';
            
            // Clear location if ride is no longer ongoing
            if (!isOngoing) {
                setLivePos(null);
                setLiveEta(null);
                return;
            }
            
            // Clear previous position when switching bookings
            setLivePos(null);
            setLiveEta(null);
            
            // Request passenger location for ongoing rides only
            if (isOngoing && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const myPos = { lat: position.coords.latitude, lon: position.coords.longitude };
                        try { window.__passenger_last_pos__ = myPos; } catch {}
                    },
                    (err) => {
                        if (import.meta.env.DEV) {
                            console.warn('Failed to get passenger location:', err);
                        }
                    },
                    { enableHighAccuracy: true, timeout: 5000 }
                );
            }

            // Fetch driver location only when ride is actively ongoing
            if (isOngoing && viewBooking.booking_id) {
                const fetchDriverLocation = async () => {
                    try {
                        const response = await bookingService.getDriverLocation(viewBooking.booking_id);
                        if (import.meta.env.DEV) {
                            console.log('📍 Driver location API response:', response);
                        }
                        if (response.success && response.data && response.data.lat && response.data.lon) {
                            setLivePos({
                                driver_id: response.data.driver_id,
                                lat: response.data.lat,
                                lon: response.data.lon,
                                ride_id: response.data.ride_id,
                                ts: response.data.ts || Date.now()
                            });
                        } else {
                            if (import.meta.env.DEV) {
                                console.log('📍 Driver location not available yet, will wait for socket updates');
                            }
                            // Set up polling if location not available
                            const pollInterval = setInterval(async () => {
                                try {
                                    const pollResponse = await bookingService.getDriverLocation(viewBooking.booking_id);
                                    if (pollResponse.success && pollResponse.data && pollResponse.data.lat && pollResponse.data.lon) {
                                        setLivePos({
                                            driver_id: pollResponse.data.driver_id,
                                            lat: pollResponse.data.lat,
                                            lon: pollResponse.data.lon,
                                            ride_id: pollResponse.data.ride_id,
                                            ts: pollResponse.data.ts || Date.now()
                                        });
                                        clearInterval(pollInterval); // Stop polling once we have location
                                    }
                                } catch (err) {
                                    if (import.meta.env.DEV) {
                                        console.log('Polling driver location:', err.message);
                                    }
                                }
                            }, 5000); // Poll every 5 seconds
                            
                            // Clean up polling when component unmounts or booking changes
                            return () => clearInterval(pollInterval);
                        }
                    } catch (err) {
                        if (import.meta.env.DEV) {
                            console.log('Driver location not available:', err.response?.data?.message || err.message);
                        }
                    }
                };
                
                fetchDriverLocation();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewBooking?.booking_id]);

    // Setup socket once user is available - keep connection stable
    useEffect(() => {
        if (!user?.user_id) return;
        const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
        const s = io(socketUrl, { transports: ['websocket'] });
        s.on('connect', () => {
            s.emit('user_register', { user_id: user.user_id });
            if (import.meta.env.DEV) {
                console.log('✅ Socket connected for passenger:', user.user_id);
            }
        });
        
        // Listen for ride assignment (when driver accepts ride request)
        s.on(`ride_assigned_passenger_${user.user_id}`, (payload) => {
            if (import.meta.env.DEV) {
                console.log('🚗 Ride assigned!', payload);
            }
            // Refresh bookings to show new booking
            loadBookings();
            toast.success('Driver has accepted your ride request!');
        });
        
        // Listen to driver position broadcasts
        const onDriverPos = async (payload) => {
            try {
                if (import.meta.env.DEV) {
                    console.log('📍 Received driver position event:', payload);
                }
                
                // Find the active booking (use viewBooking if available, otherwise search bookings)
                // Only process location updates for ongoing rides
                const activeBooking = viewBooking || bookings.find((x) => {
                    const rideStatus = (x.ride_status || '').toLowerCase();
                    const bookingStatus = (x.booking_status || '').toLowerCase();
                    // Show driver location for ongoing rides OR confirmed/in_progress bookings
                    return rideStatus === 'ongoing' || 
                           bookingStatus === 'confirmed' || 
                           bookingStatus === 'in_progress';
                });
                
                // Only process position updates for ongoing rides or confirmed/in_progress bookings
                if (!activeBooking || !payload?.lat || !payload?.lon) {
                    if (import.meta.env.DEV) {
                        console.log('⚠️ Skipping position update - no active booking or missing location');
                    }
                    return;
                }
                
                const rideStatus = (activeBooking.ride_status || '').toLowerCase();
                const bookingStatus = (activeBooking.booking_status || '').toLowerCase();
                const isValidStatus = rideStatus === 'ongoing' || 
                                      bookingStatus === 'confirmed' || 
                                      bookingStatus === 'in_progress';
                
                if (!isValidStatus) {
                    if (import.meta.env.DEV) {
                        console.log('⚠️ Skipping position update - booking/ride is not in valid status');
                    }
                    return;
                }
                
                // Filter by driver_id if available
                const bookingDriverId = activeBooking.driver_id;
                if (bookingDriverId && Number(payload.driver_id) !== Number(bookingDriverId)) {
                    if (import.meta.env.DEV) {
                        console.log('⚠️ Skipping position update - driver ID mismatch');
                    }
                    return; // Ignore positions from other drivers
                }
                
                if (import.meta.env.DEV) {
                    console.log('✅ Setting driver position:', payload);
                }
                setLivePos(payload);
                
                // Compute ETA passenger->driver
                const getGeo = () => new Promise((resolve) => {
                    if (!navigator.geolocation) return resolve({ lat: null, lon: null });
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const myPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                            try { window.__passenger_last_pos__ = myPos; } catch {}
                            resolve(myPos);
                        },
                        () => resolve({ lat: null, lon: null }),
                        { enableHighAccuracy: true, timeout: 4000 }
                    );
                });
                const me = await getGeo();
                const startLat = Number.isFinite(me.lat) ? me.lat : activeBooking?.pickup_lat;
                const startLon = Number.isFinite(me.lon) ? me.lon : activeBooking?.pickup_lon;
                if (startLat == null || startLon == null) return;
                const api = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                const res = await axios.get(`${api}/rides/eta`, {
                    params: {
                        start_lat: startLat,
                        start_lon: startLon,
                        end_lat: payload.lat,
                        end_lon: payload.lon
                    }
                });
                const minutes = res?.data?.data?.eta_minutes;
                if (Number.isFinite(minutes)) setLiveEta(minutes);
            } catch (err) {
                console.error('Error processing driver position:', err);
            }
        };
        
        s.on('driver:position', onDriverPos);
        setSocket(s);
        
        return () => {
            if (import.meta.env.DEV) {
                console.log('🔌 Cleaning up socket connection');
            }
            s.off('driver:position', onDriverPos);
            s.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.user_id]); // Only depend on user_id, not viewBooking or bookings to avoid reconnecting

    const loadBookings = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await bookingService.getMyBookings();
            setBookings(response.data);
        } catch (err) {
            setError('Failed to load bookings');
        } finally {
            setLoading(false);
        }
    };

    const loadPayments = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await paymentService.getMyPayments();
            setPayments(response.data);
        } catch (err) {
            setError('Failed to load payments');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmBooking = async (bookingId) => {
        try {
            await bookingService.confirmBooking(bookingId);
            toast.success('Booking confirmed!');
            loadBookings();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to confirm booking');
        }
    };

    const handleCancelBooking = async (bookingId) => {
        if (!window.confirm('Are you sure you want to cancel this booking?')) return;

        try {
            await bookingService.cancelBooking(bookingId);
            toast.success('Booking cancelled!');
            loadBookings();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel booking');
        }
    };

    const handlePayment = async (booking) => {
        setSelectedBooking(booking);
    };

    const confirmPayment = async () => {
        if (!selectedBooking) return;

        try {
            await paymentService.confirmPayment({
                booking_id: selectedBooking.booking_id,
                payment_method: paymentMethod
            });
            toast.success('Payment successful!');
            setSelectedBooking(null);
            loadBookings();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Payment failed');
        }
    };

    const handleAddFeedback = async (ride_id) => {
        setFeedbackForm({ ...feedbackForm, ride_id });
    };

    const sendMessage = (bookingId) => {
        const text = (msgByBookingId[bookingId] || '').trim();
        if (!socket || !text || !user?.user_id) return;
        socket.emit('booking_message', {
            booking_id: Number(bookingId),
            text,
            from_user_id: Number(user.user_id)
        });
        setMsgByBookingId((prev) => ({ ...prev, [bookingId]: '' }));
    };

    const submitFeedback = async (e) => {
        e.preventDefault();
        try {
            await feedbackService.addFeedback(feedbackForm);
            toast.success('Feedback submitted successfully!');
            setFeedbackForm({ ride_id: null, rating: 5, comments: '' });
            loadBookings();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit feedback');
        }
    };

    const handleCompleteCashPayment = async (paymentId) => {
        if (!window.confirm('Mark this cash payment as completed?')) return;
        try {
            await paymentService.completeCashPayment(paymentId);
            toast.success('Cash payment marked as completed!');
            loadBookings();
            if (viewBooking) {
                setViewBooking(null);
            }
            // Redirect to home after 2 seconds
            setTimeout(() => {
                window.location.href = '/passenger/dashboard';
            }, 2000);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to complete cash payment');
        }
    };

    const getStatusColor = (status) => {
        const normalized = (status || '').toLowerCase();
        const colors = {
            pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
            confirmed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
            in_progress: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
            completed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
            cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
            canceled_by_driver: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
            canceled_by_passenger: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
        };
        return colors[normalized] || 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300';
    };

    return (
        <div className="min-h-screen px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl mx-auto page-transition">
            {/* Enhanced Background */}
            <div className="fixed inset-0 -z-10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl opacity-50" />
            </div>
            
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 sm:mb-8 md:mb-10 relative z-10"
            >
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-2 sm:mb-3 md:mb-4 gradient-text">My Bookings</h1>
                <p className="text-muted-foreground text-base sm:text-lg md:text-xl">Manage your bookings and track payment history</p>
            </motion.div>

            {/* Safety Check Alert */}
            <SafetyCheck />
            {/* Enhanced Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 md:gap-5 mb-6 sm:mb-8 md:mb-10 relative z-10">
                {(() => {
                    const normalize = (s) => (s || '').toLowerCase();
                    const upcoming = bookings.filter((b) => {
                        const status = normalize(b.booking_status || b.status);
                        const rideStatus = normalize(b.ride_status);
                        if (rideStatus === 'completed') return false;
                        return ['pending','confirmed','in_progress','ongoing'].includes(status) || rideStatus === 'ongoing';
                    }).length;
                    const pendingPayments = bookings.filter((b) => {
                        const status = normalize(b.booking_status || b.status);
                        const paid = normalize(b.payment_status);
                        return (status === 'confirmed' || status === 'completed') && paid !== 'completed';
                    }).length;
                    const completed = bookings.filter((b) => normalize(b.ride_status) === 'completed' || normalize(b.booking_status || b.status) === 'completed').length;
                    return (
                        <>
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="glass-thick rounded-3xl p-6 border-2 border-white/30 hover:border-primary/50 hover:shadow-glow-lg hover:scale-105 transition-all duration-300 card-hover relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-colors" />
                                <div className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2 relative z-10 font-semibold">Upcoming bookings</div>
                                <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold gradient-text relative z-10">{upcoming}</div>
                            </motion.div>
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="glass-thick rounded-3xl p-6 border-2 border-white/30 hover:border-amber-500/50 hover:shadow-glow-lg hover:scale-105 transition-all duration-300 card-hover relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-colors" />
                                <div className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2 relative z-10 font-semibold">Pending payments</div>
                                <div className={`text-2xl sm:text-3xl md:text-4xl font-extrabold ${pendingPayments>0 ? 'text-amber-600' : 'gradient-text'} relative z-10`}>{pendingPayments}</div>
                            </motion.div>
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="glass-thick rounded-3xl p-6 border-2 border-white/30 hover:border-emerald-500/50 hover:shadow-glow-lg hover:scale-105 transition-all duration-300 card-hover relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors" />
                                <div className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2 relative z-10 font-semibold">Completed trips</div>
                                <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-emerald-600 relative z-10">{completed}</div>
                            </motion.div>
                        </>
                    );
                })()}
            </div>

            {/* Emergency contact moved to Profile page (Complete Profile) */}

            {/* Enhanced Tabs */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-6 sm:mb-8 md:mb-10 p-2 glass-thick rounded-2xl sm:rounded-3xl border-2 border-white/30 w-full sm:w-fit shadow-glow-lg relative z-10">
                <motion.button 
                    onClick={() => setActiveTab('bookings')}
                    whileTap={{ scale: 0.97 }}
                    className={`px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 rounded-xl font-bold transition-all relative text-sm sm:text-base ${
                        activeTab === 'bookings'
                            ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-glow'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
                    }`}
                >
                    {activeTab === 'bookings' && (
                        <motion.div 
                            layoutId="activeTab"
                            className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-xl"
                            style={{ zIndex: -1 }}
                        />
                    )}
                    My Bookings
                </motion.button>
                <motion.button 
                    onClick={() => setActiveTab('payments')}
                    whileTap={{ scale: 0.97 }}
                    className={`px-4 sm:px-6 md:px-8 py-2.5 sm:py-3 rounded-xl font-bold transition-all relative text-sm sm:text-base ${
                        activeTab === 'payments'
                            ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-glow'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
                    }`}
                >
                    {activeTab === 'payments' && (
                        <motion.div 
                            layoutId="activeTab"
                            className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-xl"
                            style={{ zIndex: -1 }}
                        />
                    )}
                    Payment History
                </motion.button>
            </div>

            {/* Booking Details Modal */}
            <AnimatePresence>
            {viewBooking && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4"
                        onClick={() => setViewBooking(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 max-w-lg w-full shadow-glow border border-white/20 max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                        <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="text-xs sm:text-sm text-muted-foreground mb-1">Booking #{viewBooking.booking_id}</div>
                                <h3 className="text-lg sm:text-xl md:text-2xl font-bold break-words">{viewBooking.source} → {viewBooking.destination}</h3>
                                <div className="text-xs sm:text-sm text-muted-foreground mt-1">{new Date(viewBooking.date).toLocaleDateString()} at {viewBooking.time}</div>
                            </div>
                            <button onClick={() => setViewBooking(null)} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors flex-shrink-0"><X className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                        </div>

                        {/* Vehicle Image */}
                        {viewBooking.vehicle_image_url && (
                            <div className="mb-4 overflow-hidden rounded-xl border border-white/20">
                                <img 
                                    src={viewBooking.vehicle_image_url} 
                                    alt="Vehicle" 
                                    className="w-full h-48 object-cover" 
                                />
                            </div>
                        )}

                        {/* Live tracking pill - only show for ongoing rides */}
                        {livePos && (() => {
                            const rideStatus = (viewBooking?.ride_status || '').toLowerCase();
                            const bookingStatus = (viewBooking?.booking_status || '').toLowerCase();
                            return rideStatus === 'ongoing' || 
                                   bookingStatus === 'confirmed' || 
                                   bookingStatus === 'in_progress';
                        })() && (
                            <div className="mb-4 p-3 rounded-xl border border-white/20 bg-white/50 dark:bg-white/5 flex items-center justify-between">
                                <div className="text-sm">
                                    <div className="font-semibold">Driver live location</div>
                                    <div className="text-muted-foreground text-xs">Lat {Number(livePos.lat).toFixed(5)}, Lon {Number(livePos.lon).toFixed(5)}</div>
                                </div>
                                {Number.isFinite(liveEta) && (
                                    <div className="text-right">
                                        <div className="text-xs text-muted-foreground">ETA to you</div>
                                        <div className="text-lg font-bold">{liveEta} min</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Map - only show for ongoing rides */}
                        {(() => {
                            const rideStatus = (viewBooking?.ride_status || '').toLowerCase();
                            const bookingStatus = (viewBooking?.booking_status || '').toLowerCase();
                            const isOngoing = rideStatus === 'ongoing' || 
                                             bookingStatus === 'confirmed' || 
                                             bookingStatus === 'in_progress';
                            
                            if (!isOngoing) {
                                return null; // Don't show map unless ride is ongoing
                            }
                            
                            // Show map only for ongoing rides
                            if (isOngoing) {
                                if (livePos && livePos.lat && livePos.lon) {
                                    // Debug: Log driver location
                                    if (import.meta.env.DEV) {
                                        console.log('📍 Displaying driver location on map:', { driver_id: livePos.driver_id, lat: livePos.lat, lon: livePos.lon });
                                    }
                                    return (
                                        <div className="mb-5">
                                            <ORSMap
                                                driver={{ 
                                                    driver_id: livePos.driver_id, 
                                                    lat: livePos.lat, 
                                                    lon: livePos.lon,
                                                    route: livePos.route // Include route data from OpenRouteService
                                                }}
                                                passenger={(() => {
                                                    // Prefer device location cache. If not available, fall back to ride source as a rough point.
                                                    const cache = window.__passenger_last_pos__;
                                                    if (cache && cache.lat && cache.lon) {
                                                        return cache;
                                                    }
                                                    // Fallback to pickup location
                                                    if (viewBooking?.pickup_lat && viewBooking?.pickup_lon) {
                                                        return { lat: viewBooking.pickup_lat, lon: viewBooking.pickup_lon };
                                                    }
                                                    return null;
                                                })()}
                                            />
                                            {liveEta != null && (
                                                <div className="mt-2 text-sm text-center text-muted-foreground">
                                                    Estimated arrival: {Math.round(liveEta)} minutes
                                                </div>
                                            )}
                                        </div>
                                    );
                                } else {
                                    // Show loading state while fetching driver location
                                    return (
                                        <div className="mb-5 p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 flex items-start gap-3">
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 flex-shrink-0 mt-0.5"></div>
                                            <div className="text-sm">
                                                <div className="font-semibold text-blue-700 dark:text-blue-300">Waiting for driver location...</div>
                                                <div className="text-muted-foreground text-xs mt-1">
                                                    The driver's location will appear here once they start sharing their location.
                                                    {viewBooking?.driver_id && (
                                                        <div className="mt-1">Driver ID: {viewBooking.driver_id}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                            }
                            
                            return null;
                        })()}

                        <div className="grid sm:grid-cols-2 gap-3 mb-4 text-sm">
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-primary" />
                                <span className="font-medium">{viewBooking.driver_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                                <span className="font-bold text-emerald-600">₹{viewBooking.amount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-secondary" />
                                <span>{new Date(viewBooking.date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" />
                                <span>{viewBooking.time}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Seats</span>
                                <span className="font-semibold">{viewBooking.seats_booked}</span>
                            </div>
                            {viewBooking.payment_status && (
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Payment</span>
                                    <span className={`font-semibold ${viewBooking.payment_status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>{viewBooking.payment_status}</span>
                                </div>
                            )}
                        </div>

                        {viewBooking.notes && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-white/60 dark:bg-white/10 border border-white/20 mb-4">
                                <MessageSquare className="w-4 h-4 text-primary mt-0.5" />
                                <div>
                                    <div className="text-xs text-muted-foreground">Passenger note</div>
                                    <div className="text-sm font-medium">{viewBooking.notes}</div>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2 mb-4">
                            {(() => { const bookingStatus = viewBooking.booking_status || viewBooking.status; return bookingStatus === 'pending'; })() && (
                                <>
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { handleConfirmBooking(viewBooking.booking_id); setViewBooking(null); }} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        Confirm
                                    </motion.button>
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { handleCancelBooking(viewBooking.booking_id); setViewBooking(null); }} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2">
                                        <XCircle className="w-4 h-4" />
                                        Cancel
                                    </motion.button>
                                </>
                            )}
                            {(() => { const bookingStatus = viewBooking.booking_status || viewBooking.status; return bookingStatus === 'confirmed' && !viewBooking.payment_status; })() && (
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { handlePayment(viewBooking); setViewBooking(null); }} className="px-4 py-2 bg-gradient-to-r from-primary to-secondary text-white font-semibold rounded-lg hover:brightness-110 transition-all flex items-center gap-2">
                                    <CreditCard className="w-4 h-4" />
                                    Pay Now
                                </motion.button>
                            )}
                            {(() => { const bookingStatus = viewBooking.booking_status || viewBooking.status; return bookingStatus === 'confirmed'; })() && (
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { handleCancelBooking(viewBooking.booking_id); setViewBooking(null); }} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2">
                                    <XCircle className="w-4 h-4" />
                                    Cancel
                                </motion.button>
                            )}
                            {(() => { const bookingStatus = viewBooking.booking_status || viewBooking.status; return (bookingStatus === 'confirmed' || viewBooking.ride_status === 'ongoing' || bookingStatus === 'in_progress'); })() && (
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={async () => { try { const getGeo = () => new Promise((resolve) => { if (!navigator.geolocation) return resolve({ lat: null, lon: null }); navigator.geolocation.getCurrentPosition((pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }), () => resolve({ lat: null, lon: null }), { enableHighAccuracy: true, timeout: 5000 }); }); const { lat, lon } = await getGeo(); await sosService.raise(viewBooking.booking_id, { user_id: viewBooking.passenger_id, details: 'Emergency', passenger_lat: lat, passenger_lon: lon }); toast.success('SOS sent to admin'); } catch { toast.error('Failed to send SOS'); } }} className="px-4 py-2 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4" />
                                    SOS
                                </motion.button>
                            )}
                            {viewBooking.ride_status === 'completed' && (
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { handleAddFeedback(viewBooking.ride_id); setViewBooking(null); }} className="px-4 py-2 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2">
                                    <Star className="w-4 h-4" />
                                    Feedback
                                </motion.button>
                            )}
                            {viewBooking.ride_status === 'completed' && viewBooking.payment_method === 'cash' && viewBooking.payment_status === 'pending' && viewBooking.payment_id && (
                                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { handleCompleteCashPayment(viewBooking.payment_id); }} className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2">
                                    <Banknote className="w-4 h-4" />
                                    Mark Cash Paid
                                </motion.button>
                            )}
                        </div>

                        {/* Message driver */}
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={msgByBookingId[viewBooking.booking_id] || ''}
                                onChange={(e) => setMsgByBookingId((prev) => ({ ...prev, [viewBooking.booking_id]: e.target.value }))}
                                placeholder="Message your driver (e.g., I'm at the blue gate)"
                                className="flex-1 px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                            />
                            <button
                                onClick={() => { sendMessage(viewBooking.booking_id); }}
                                disabled={!((msgByBookingId[viewBooking.booking_id] || '').trim())}
                                className="px-5 py-3 bg-gradient-to-r from-primary to-secondary text-white font-semibold rounded-xl shadow-glow hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <MessageSquare className="w-4 h-4" />
                                Send
                            </button>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Sends a real-time message to your driver.</div>
                    </motion.div>
                </motion.div>
            )}
            </AnimatePresence>
            {/* Content */}
            <div>
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <p className="text-muted-foreground">Loading...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'bookings' && (
                            <div className="space-y-6">
                                {bookings.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="glass rounded-2xl p-12 text-center border border-border"
                                    >
                                        <Receipt className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                                        <h3 className="text-xl font-semibold mb-2">No bookings yet</h3>
                                        <p className="text-muted-foreground">
                                            <a href="/search" className="text-primary hover:underline font-semibold">Search for rides</a> to get started
                                        </p>
                                    </motion.div>
                                ) : (
                                    (() => {
                                        const normalize = (s) => (s || '').toLowerCase();
                                        const upcoming = bookings.filter((b) => {
                                            const status = normalize(b.booking_status || b.status);
                                            const rideStatus = normalize(b.ride_status);
                                            if (rideStatus === 'completed') return false;
                                            return ['pending','confirmed','in_progress','ongoing'].includes(status) || rideStatus === 'ongoing';
                                        });
                                        const completed = bookings.filter((b) => {
                                            const status = normalize(b.booking_status || b.status);
                                            const rideStatus = normalize(b.ride_status);
                                            return rideStatus === 'completed' || status === 'completed' || status === 'cancelled' || status.startsWith('canceled_');
                                        });
                                        const renderCard = (booking, index) => (
                                            <motion.div
                                                key={booking.booking_id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.05 }}
                                                whileHover={{ y: -4, scale: 1.01 }}
                                                className="glass-thick rounded-3xl p-6 sm:p-8 border-2 border-white/30 hover:shadow-glow-xl hover:border-primary/40 transition-all duration-300 group relative overflow-hidden card-hover"
                                            >
                                                {/* Enhanced gradient overlay on hover */}
                                                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl" />
                                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                
                                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                                                    <div className="flex-1 space-y-4">
                                                        {/* Vehicle Image Thumbnail */}
                                                        {booking.vehicle_image_url && (
                                                            <div className="overflow-hidden rounded-xl border border-white/20 w-full max-w-xs">
                                                                <img 
                                                                    src={booking.vehicle_image_url} 
                                                                    alt="Vehicle" 
                                                                    className="w-full h-32 object-cover" 
                                                                />
                                                            </div>
                                                        )}
                    <div
                        className="flex items-center gap-3 flex-wrap cursor-pointer select-none"
                        onClick={() => setViewBooking(booking)}
                    >
                                                            {/* Driver avatar */}
                                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-secondary/80 text-white flex items-center justify-center font-bold shadow-soft">
                                                                {(booking.driver_name || '?').toString().trim().charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="text-2xl font-bold gradient-text">{booking.source}</div>
                                                            <div className="text-primary text-xl">→</div>
                                                            <div className="text-2xl font-bold gradient-text">{booking.destination}</div>
                                                            {/* Status chip */}
                                                            {(() => { const bookingStatus = booking.booking_status || booking.status; return (
                                                                <span className={`ml-auto px-3 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wide border ${getStatusColor(bookingStatus)} border-white/20`}> 
                                                                    {bookingStatus}
                                                                </span>
                                                            ); })()}
                                                            {/* Booking id chip */}
                                                            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/50 dark:bg-white/10 border border-white/20 text-muted-foreground">
                                                                #{booking.booking_id}
                                                            </span>
                                                        </div>
                                                
                                                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                            <div className="flex items-center gap-2 text-sm group/item">
                                                                <div className="p-2 rounded-lg bg-secondary/10 group-hover/item:bg-secondary/20 transition-colors">
                                                                    <Calendar className="w-4 h-4 text-secondary" />
                                                                </div>
                                                                <span className="font-medium">{new Date(booking.date).toLocaleDateString()}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm group/item">
                                                                <div className="p-2 rounded-lg bg-primary/10 group-hover/item:bg-primary/20 transition-colors">
                                                                    <Clock className="w-4 h-4 text-primary" />
                                                                </div>
                                                                <span className="font-medium">{booking.time}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm group/item">
                                                                <div className="p-2 rounded-lg bg-primary/10 group-hover/item:bg-primary/20 transition-colors">
                                                                    <User className="w-4 h-4 text-primary" />
                                                                </div>
                                                                <span className="font-medium">{booking.driver_name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm group/item">
                                                                <div className="p-2 rounded-lg bg-emerald-500/10 group-hover/item:bg-emerald-500/20 transition-colors">
                                                                    <DollarSign className="w-4 h-4 text-emerald-600" />
                                                                </div>
                                                                <span className="font-bold text-emerald-600">₹{booking.amount}</span>
                                                            </div>
                                                        </div>
                                                        {/* Optional notes */}
                                                        {booking.notes && (
                                                            <div className="flex items-start gap-2 mt-2 p-3 rounded-xl bg-white/60 dark:bg-white/10 border border-white/20">
                                                                <MessageSquare className="w-4 h-4 text-primary mt-0.5" />
                                                                <div>
                                                                    <div className="text-xs text-muted-foreground">Passenger note</div>
                                                                    <div className="text-sm font-medium">{booking.notes}</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Vehicle Information */}
                                                        {booking.vehicle_model && (
                                                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/50 dark:bg-white/5 w-fit border border-white/20">
                                                                <Car className="w-4 h-4 text-primary" />
                                                                <span className="text-sm font-medium">
                                                                    {booking.vehicle_model}
                                                                    {booking.vehicle_color && ` • ${booking.vehicle_color}`}
                                                                    {booking.license_plate && ` • ${booking.license_plate}`}
                                                                </span>
                                                            </div>
                                                        )}

                                                        <div className="mt-3 flex items-center gap-4 text-sm">
                                                            <span className="text-muted-foreground">
                                                                Seats: <span className="font-semibold text-foreground">{booking.seats_booked}</span>
                                                            </span>
                                                    {booking.payment_status && (
                                                                <span className="text-muted-foreground">
                                                                    Payment: <span className={`font-semibold ${booking.payment_status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                                        {booking.payment_status}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </div>
                                                </div>

                                                    
                                                </div>
                                            </motion.div>
                                        );
                                        return (
                                            <>
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h3 className="text-lg font-bold">Upcoming ({upcoming.length})</h3>
                                                    </div>
                                                    {upcoming.length === 0 ? (
                                                        <div className="p-6 text-sm text-muted-foreground border border-white/20 rounded-xl">No upcoming bookings</div>
                                                    ) : (
                                                        <div className="grid gap-5">
                                                            {upcoming.map((b, i) => renderCard(b, i))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent my-2" />
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h3 className="text-lg font-bold">Completed ({completed.length})</h3>
                                                    </div>
                                                    {completed.length === 0 ? (
                                                        <div className="p-6 text-sm text-muted-foreground border border-white/20 rounded-xl">No completed rides yet</div>
                                                    ) : (
                                                        <div className="grid gap-5">
                                                            {completed.map((b, i) => renderCard(b, i))}
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        );
                                    })()
                                )}
                            </div>
                        )}

                        {activeTab === 'payments' && (
                            <div className="space-y-4">
                                {payments.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="glass rounded-2xl p-12 text-center border border-border"
                                    >
                                        <CreditCard className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                                        <h3 className="text-xl font-semibold mb-2">No payments yet</h3>
                                        <p className="text-muted-foreground">Your payment history will appear here</p>
                                    </motion.div>
                                ) : (
                                    <div className="grid gap-4">
                                        {payments.map((payment, index) => (
                                            <motion.div
                                                key={payment.payment_id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.05 }}
                                                className="glass rounded-2xl p-6 border-l-4 border-l-emerald-600 border-y border-r border-white/20 hover:shadow-soft transition-all"
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold text-lg mb-1">
                                                            {payment.source} → {payment.destination}
                                                        </h4>
                                                        <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm text-muted-foreground">
                                                            <div className="flex items-center gap-2">
                                                                <Calendar className="w-4 h-4" />
                                                                {new Date(payment.date).toLocaleDateString()}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <CreditCard className="w-4 h-4" />
                                                                {payment.payment_method.toUpperCase()}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Receipt className="w-4 h-4" />
                                                                {payment.transaction_id}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                                    payment.payment_status === 'completed' 
                                                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                                                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                                                }`}>
                                                                    {payment.payment_status}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-3xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                                                            ₹{payment.amount}
                                                        </div>
                                                </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Payment Modal */}
            <AnimatePresence>
            {selectedBooking && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setSelectedBooking(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="glass rounded-3xl p-8 max-w-md w-full shadow-glow border border-white/20"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-bold">Make Payment</h3>
                                <button
                                    onClick={() => setSelectedBooking(null)}
                                    className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border-2 border-primary/20">
                                    <span className="font-semibold">Total Amount</span>
                                    <span className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                                        ₹{selectedBooking.amount}
                                    </span>
                                </div>

                                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/50 dark:bg-white/5">
                                    <MapPin className="w-5 h-5 text-primary" />
                                    <div>
                                        <div className="text-sm text-muted-foreground">Route</div>
                                        <div className="font-semibold">{selectedBooking.source} → {selectedBooking.destination}</div>
                                    </div>
                        </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">Payment Method</label>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none appearance-none cursor-pointer"
                                    >
                                        <option value="upi">💳 UPI</option>
                                        <option value="card">💰 Card</option>
                                        <option value="wallet">👛 Wallet</option>
                                        <option value="cash">💵 Cash</option>
                                    </select>
                        </div>
                    </div>

                            <div className="flex gap-3">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setSelectedBooking(null)}
                                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 font-semibold rounded-xl transition-all"
                                >
                                    Cancel
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={confirmPayment}
                                    className="flex-1 py-3 bg-gradient-to-r from-primary to-secondary text-white font-semibold rounded-xl shadow-glow hover:brightness-110 transition-all flex items-center justify-center gap-2"
                                >
                                    <CreditCard className="w-4 h-4" />
                                    Confirm Payment
                                </motion.button>
                </div>
                        </motion.div>
                    </motion.div>
            )}
            </AnimatePresence>

            {/* Feedback Modal */}
            <AnimatePresence>
            {feedbackForm.ride_id && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setFeedbackForm({ ride_id: null, rating: 5, comments: '' })}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="glass rounded-3xl p-8 max-w-md w-full shadow-glow border border-white/20"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-bold">Add Feedback</h3>
                                <button
                                    onClick={() => setFeedbackForm({ ride_id: null, rating: 5, comments: '' })}
                                    className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={submitFeedback} className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">Rating</label>
                                <select 
                                    value={feedbackForm.rating}
                                    onChange={(e) => setFeedbackForm({...feedbackForm, rating: parseInt(e.target.value)})}
                                        className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none appearance-none cursor-pointer"
                                    >
                                        <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
                                        <option value="4">⭐⭐⭐⭐ Good</option>
                                        <option value="3">⭐⭐⭐ Average</option>
                                        <option value="2">⭐⭐ Poor</option>
                                        <option value="1">⭐ Very Poor</option>
                                </select>
                            </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">Comments</label>
                                <textarea
                                    value={feedbackForm.comments}
                                    onChange={(e) => setFeedbackForm({...feedbackForm, comments: e.target.value})}
                                    rows="4"
                                    placeholder="Share your experience..."
                                        className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none resize-none"
                                />
                            </div>

                                <div className="flex gap-3">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    type="button" 
                                    onClick={() => setFeedbackForm({ ride_id: null, rating: 5, comments: '' })}
                                        className="flex-1 py-3 bg-white/10 hover:bg-white/20 font-semibold rounded-xl transition-all"
                                >
                                    Cancel
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        type="submit"
                                        className="flex-1 py-3 bg-gradient-to-r from-primary to-secondary text-white font-semibold rounded-xl shadow-glow hover:brightness-110 transition-all flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                    Submit Feedback
                                    </motion.button>
                            </div>
                        </form>
                        </motion.div>
                    </motion.div>
            )}
            </AnimatePresence>
        </div>
    );
};

export default PassengerDashboard;
