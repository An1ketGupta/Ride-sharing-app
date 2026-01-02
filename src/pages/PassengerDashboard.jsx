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
            pending: 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30',
            confirmed: 'bg-blue-600/20 text-[#0EA5E9] border-[#0EA5E9]/30',
            in_progress: 'bg-blue-600/20 text-[#0EA5E9] border-[#0EA5E9]/30',
            completed: 'bg-[#10b981]/20 text-[#10b981] border-[#10b981]/30',
            cancelled: 'bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30',
            canceled_by_driver: 'bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30',
            canceled_by_passenger: 'bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30'
        };
        return colors[normalized] || 'bg-[#1A1A1A] text-gray-900/60 border-gray-200';
    };

    return (
        <div className="min-h-screen bg-gray-50 px-6 sm:px-8 md:px-10 py-8 sm:py-10 md:py-12 max-w-7xl mx-auto page-transition">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="mb-8 sm:mb-10 md:mb-12"
            >
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-3 text-gray-900">My Bookings</h1>
                <p className="text-gray-900/60 text-lg sm:text-xl">Manage your bookings and track payment history</p>
            </motion.div>

            {/* Safety Check Alert */}
            <SafetyCheck />
            {/* Premium Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10 md:mb-12">
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
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1, duration: 0.25 }}
                                className="bg-white rounded-lg p-6 border border-gray-200 hover:border-[#0EA5E9]/30 hover:bg-[#1A1A1A] transition-all duration-200"
                            >
                                <div className="text-sm text-gray-900/60 mb-2 font-semibold">Upcoming bookings</div>
                                <div className="text-3xl sm:text-4xl font-bold text-gray-900">{upcoming}</div>
                            </motion.div>
                            <motion.div 
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15, duration: 0.25 }}
                                className="bg-white rounded-lg p-6 border border-gray-200 hover:border-[#f59e0b]/30 hover:bg-[#1A1A1A] transition-all duration-200"
                            >
                                <div className="text-sm text-gray-900/60 mb-2 font-semibold">Pending payments</div>
                                <div className={`text-3xl sm:text-4xl font-bold ${pendingPayments>0 ? 'text-[#f59e0b]' : 'text-gray-900'}`}>{pendingPayments}</div>
                            </motion.div>
                            <motion.div 
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2, duration: 0.25 }}
                                className="bg-white rounded-lg p-6 border border-gray-200 hover:border-[#10b981]/30 hover:bg-[#1A1A1A] transition-all duration-200"
                            >
                                <div className="text-sm text-gray-900/60 mb-2 font-semibold">Completed trips</div>
                                <div className="text-3xl sm:text-4xl font-bold text-[#10b981]">{completed}</div>
                            </motion.div>
                        </>
                    );
                })()}
            </div>

            {/* Emergency contact moved to Profile page (Complete Profile) */}

            {/* Premium Tabs */}
            <div className="flex flex-col sm:flex-row gap-2 mb-8 sm:mb-10 md:mb-12 p-1 bg-white rounded-lg border border-gray-200 w-full sm:w-fit">
                <motion.button 
                    onClick={() => setActiveTab('bookings')}
                    whileTap={{ scale: 0.98 }}
                    className={`px-6 sm:px-8 py-3 rounded-lg font-semibold transition-all duration-200 text-sm sm:text-base ${
                        activeTab === 'bookings'
                            ? 'bg-blue-600 text-gray-900 shadow-[0_4px_12px_rgba(14,165,233,0.3)]'
                            : 'text-gray-900/60 hover:text-gray-900 hover:bg-[#1A1A1A]'
                    }`}
                >
                    My Bookings
                </motion.button>
                <motion.button 
                    onClick={() => setActiveTab('payments')}
                    whileTap={{ scale: 0.98 }}
                    className={`px-6 sm:px-8 py-3 rounded-lg font-semibold transition-all duration-200 text-sm sm:text-base ${
                        activeTab === 'payments'
                            ? 'bg-blue-600 text-gray-900 shadow-[0_4px_12px_rgba(14,165,233,0.3)]'
                            : 'text-gray-900/60 hover:text-gray-900 hover:bg-[#1A1A1A]'
                    }`}
                >
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
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
                        onClick={() => setViewBooking(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 8 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white rounded-lg p-6 sm:p-8 max-w-lg w-full border border-gray-200 shadow-xl max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                        <div className="flex items-start justify-between mb-6 gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="text-xs sm:text-sm text-gray-900/60 mb-1">Booking #{viewBooking.booking_id}</div>
                                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{viewBooking.source} → {viewBooking.destination}</h3>
                                <div className="text-xs sm:text-sm text-gray-900/60 mt-1">{new Date(viewBooking.date).toLocaleDateString()} at {viewBooking.time}</div>
                            </div>
                            <button onClick={() => setViewBooking(null)} className="p-2 hover:bg-[#1A1A1A] rounded-lg transition-colors duration-200 flex-shrink-0"><X className="w-5 h-5 text-gray-900/60 hover:text-gray-900" /></button>
                        </div>

                        {/* Vehicle Image */}
                        {viewBooking.vehicle_image_url && (
                            <div className="mb-4 overflow-hidden rounded-lg border border-gray-200">
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
                            <div className="mb-4 p-4 rounded-lg border border-[#0EA5E9]/30 bg-blue-600/10 flex items-center justify-between">
                                <div className="text-sm">
                                    <div className="font-semibold text-gray-900">Driver live location</div>
                                    <div className="text-gray-900/60 text-xs">Lat {Number(livePos.lat).toFixed(5)}, Lon {Number(livePos.lon).toFixed(5)}</div>
                                </div>
                                {Number.isFinite(liveEta) && (
                                    <div className="text-right">
                                        <div className="text-xs text-gray-900/60">ETA to you</div>
                                        <div className="text-lg font-bold text-[#0EA5E9]">{liveEta} min</div>
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
                                                <div className="mt-2 text-sm text-center text-gray-900/60">
                                                    Estimated arrival: {Math.round(liveEta)} minutes
                                                </div>
                                            )}
                                        </div>
                                    );
                                } else {
                                    // Show loading state while fetching driver location
                                    return (
                                        <div className="mb-5 p-4 rounded-lg border border-[#0EA5E9]/30 bg-blue-600/10 flex items-start gap-3">
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#0EA5E9] flex-shrink-0 mt-0.5"></div>
                                            <div className="text-sm">
                                                <div className="font-semibold text-[#0EA5E9]">Waiting for driver location...</div>
                                                <div className="text-gray-900/60 text-xs mt-1">
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
                                <User className="w-4 h-4 text-[#0EA5E9]" />
                                <span className="font-semibold text-gray-900">{viewBooking.driver_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-[#10b981]" />
                                <span className="font-bold text-[#10b981]">₹{viewBooking.amount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-[#0EA5E9]" />
                                <span className="text-gray-900">{new Date(viewBooking.date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-[#0EA5E9]" />
                                <span className="text-gray-900">{viewBooking.time}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-900/60">Seats</span>
                                <span className="font-semibold text-gray-900">{viewBooking.seats_booked}</span>
                            </div>
                            {viewBooking.payment_status && (
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-900/60">Payment</span>
                                    <span className={`font-semibold ${viewBooking.payment_status === 'completed' ? 'text-[#10b981]' : 'text-[#f59e0b]'}`}>{viewBooking.payment_status}</span>
                                </div>
                            )}
                        </div>

                        {viewBooking.notes && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-white border border-gray-200 mb-4">
                                <MessageSquare className="w-4 h-4 text-[#0EA5E9] mt-0.5" />
                                <div>
                                    <div className="text-xs text-gray-900/60">Passenger note</div>
                                    <div className="text-sm font-medium text-gray-900">{viewBooking.notes}</div>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2 mb-4">
                            {(() => { const bookingStatus = viewBooking.booking_status || viewBooking.status; return bookingStatus === 'pending'; })() && (
                                <>
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { handleConfirmBooking(viewBooking.booking_id); setViewBooking(null); }} className="px-4 py-2.5 bg-blue-600 text-gray-900 font-semibold rounded-lg hover:bg-blue-600 hover:brightness-110 transition-all duration-200 flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        Confirm
                                    </motion.button>
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { handleCancelBooking(viewBooking.booking_id); setViewBooking(null); }} className="px-4 py-2.5 bg-[#ef4444] text-gray-900 font-semibold rounded-lg hover:bg-[#dc2626] transition-all duration-200 flex items-center gap-2">
                                        <XCircle className="w-4 h-4" />
                                        Cancel
                                    </motion.button>
                                </>
                            )}
                            {(() => { const bookingStatus = viewBooking.booking_status || viewBooking.status; return bookingStatus === 'confirmed' && !viewBooking.payment_status; })() && (
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { handlePayment(viewBooking); setViewBooking(null); }} className="px-4 py-2.5 bg-blue-600 text-gray-900 font-semibold rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 flex items-center gap-2">
                                    <CreditCard className="w-4 h-4" />
                                    Pay Now
                                </motion.button>
                            )}
                            {(() => { const bookingStatus = viewBooking.booking_status || viewBooking.status; return bookingStatus === 'confirmed'; })() && (
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { handleCancelBooking(viewBooking.booking_id); setViewBooking(null); }} className="px-4 py-2.5 bg-[#ef4444] text-gray-900 font-semibold rounded-lg hover:bg-[#dc2626] transition-all duration-200 flex items-center gap-2">
                                    <XCircle className="w-4 h-4" />
                                    Cancel
                                </motion.button>
                            )}
                            {(() => { const bookingStatus = viewBooking.booking_status || viewBooking.status; return (bookingStatus === 'confirmed' || viewBooking.ride_status === 'ongoing' || bookingStatus === 'in_progress'); })() && (
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={async () => { try { const getGeo = () => new Promise((resolve) => { if (!navigator.geolocation) return resolve({ lat: null, lon: null }); navigator.geolocation.getCurrentPosition((pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }), () => resolve({ lat: null, lon: null }), { enableHighAccuracy: true, timeout: 5000 }); }); const { lat, lon } = await getGeo(); await sosService.raise(viewBooking.booking_id, { user_id: viewBooking.passenger_id, details: 'Emergency', passenger_lat: lat, passenger_lon: lon }); toast.success('SOS sent to admin'); } catch { toast.error('Failed to send SOS'); } }} className="px-4 py-2.5 bg-[#f59e0b] text-gray-900 font-semibold rounded-lg hover:bg-[#d97706] transition-all duration-200 flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4" />
                                    SOS
                                </motion.button>
                            )}
                            {viewBooking.ride_status === 'completed' && (
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { handleAddFeedback(viewBooking.ride_id); setViewBooking(null); }} className="px-4 py-2.5 bg-[#f59e0b] text-gray-900 font-semibold rounded-lg hover:bg-[#d97706] transition-all duration-200 flex items-center gap-2">
                                    <Star className="w-4 h-4" />
                                    Feedback
                                </motion.button>
                            )}
                            {viewBooking.ride_status === 'completed' && viewBooking.payment_method === 'cash' && viewBooking.payment_status === 'pending' && viewBooking.payment_id && (
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { handleCompleteCashPayment(viewBooking.payment_id); }} className="px-4 py-2.5 bg-[#10b981] text-gray-900 font-semibold rounded-lg hover:bg-[#059669] transition-all duration-200 flex items-center gap-2">
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
                                className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all outline-none text-gray-900 placeholder:text-gray-900/40"
                            />
                            <button
                                onClick={() => { sendMessage(viewBooking.booking_id); }}
                                disabled={!((msgByBookingId[viewBooking.booking_id] || '').trim())}
                                className="px-5 py-3 bg-blue-600 text-gray-900 font-semibold rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <MessageSquare className="w-4 h-4" />
                                Send
                            </button>
                        </div>
                        <div className="text-xs text-gray-900/60 mt-1">Sends a real-time message to your driver.</div>
                    </motion.div>
                </motion.div>
            )}
            </AnimatePresence>
            {/* Content */}
            <div>
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-[#0EA5E9]/30 border-t-[#0EA5E9] rounded-full animate-spin" />
                            <p className="text-gray-900/60">Loading...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="p-4 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-[#ef4444] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[#ef4444]">{error}</p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'bookings' && (
                            <div className="space-y-6">
                                {bookings.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.25 }}
                                        className="bg-white rounded-lg p-12 text-center border border-gray-200"
                                    >
                                        <Receipt className="w-16 h-16 text-gray-900/40 mx-auto mb-4" />
                                        <h3 className="text-xl font-semibold mb-2 text-gray-900">No bookings yet</h3>
                                        <p className="text-gray-900/60">
                                            <a href="/search" className="text-[#0EA5E9] hover:underline font-semibold">Search for rides</a> to get started
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
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.05, duration: 0.25 }}
                                                whileHover={{ y: -2 }}
                                                className="bg-white rounded-lg p-6 sm:p-8 border border-gray-200 hover:border-[#0EA5E9]/30 hover:bg-[#1A1A1A] transition-all duration-200"
                                            >
                                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                                    <div className="flex-1 space-y-4">
                                                        {/* Vehicle Image Thumbnail */}
                                                        {booking.vehicle_image_url && (
                                                            <div className="overflow-hidden rounded-lg border border-gray-200 w-full max-w-xs">
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
                                                            <div className="w-10 h-10 rounded-full bg-blue-600 text-gray-900 flex items-center justify-center font-bold">
                                                                {(booking.driver_name || '?').toString().trim().charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="text-2xl font-bold text-gray-900">{booking.source}</div>
                                                            <div className="text-[#0EA5E9] text-xl">→</div>
                                                            <div className="text-2xl font-bold text-gray-900">{booking.destination}</div>
                                                            {/* Status chip */}
                                                            {(() => { const bookingStatus = booking.booking_status || booking.status; return (
                                                                <span className={`ml-auto px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border ${getStatusColor(bookingStatus)}`}> 
                                                                    {bookingStatus}
                                                                </span>
                                                            ); })()}
                                                            {/* Booking id chip */}
                                                            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-900/60">
                                                                #{booking.booking_id}
                                                            </span>
                                                        </div>
                                                
                                                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                            <div className="flex items-center gap-2 text-sm">
                                                                <div className="p-2 rounded-lg bg-blue-600/10">
                                                                    <Calendar className="w-4 h-4 text-[#0EA5E9]" />
                                                                </div>
                                                                <span className="font-semibold text-gray-900">{new Date(booking.date).toLocaleDateString()}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm">
                                                                <div className="p-2 rounded-lg bg-blue-600/10">
                                                                    <Clock className="w-4 h-4 text-[#0EA5E9]" />
                                                                </div>
                                                                <span className="font-semibold text-gray-900">{booking.time}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm">
                                                                <div className="p-2 rounded-lg bg-blue-600/10">
                                                                    <User className="w-4 h-4 text-[#0EA5E9]" />
                                                                </div>
                                                                <span className="font-semibold text-gray-900">{booking.driver_name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm">
                                                                <div className="p-2 rounded-lg bg-[#10b981]/10">
                                                                    <DollarSign className="w-4 h-4 text-[#10b981]" />
                                                                </div>
                                                                <span className="font-bold text-[#10b981]">₹{booking.amount}</span>
                                                            </div>
                                                        </div>
                                                        {/* Optional notes */}
                                                        {booking.notes && (
                                                            <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-white border border-gray-200">
                                                                <MessageSquare className="w-4 h-4 text-[#0EA5E9] mt-0.5" />
                                                                <div>
                                                                    <div className="text-xs text-gray-900/60">Passenger note</div>
                                                                    <div className="text-sm font-medium text-gray-900">{booking.notes}</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Vehicle Information */}
                                                        {booking.vehicle_model && (
                                                            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white w-fit border border-gray-200">
                                                                <Car className="w-4 h-4 text-[#0EA5E9]" />
                                                                <span className="text-sm font-medium text-gray-900">
                                                                    {booking.vehicle_model}
                                                                    {booking.vehicle_color && ` • ${booking.vehicle_color}`}
                                                                    {booking.license_plate && ` • ${booking.license_plate}`}
                                                                </span>
                                                            </div>
                                                        )}

                                                        <div className="mt-3 flex items-center gap-4 text-sm">
                                                            <span className="text-gray-900/60">
                                                                Seats: <span className="font-semibold text-gray-900">{booking.seats_booked}</span>
                                                            </span>
                                                    {booking.payment_status && (
                                                                <span className="text-gray-900/60">
                                                                    Payment: <span className={`font-semibold ${booking.payment_status === 'completed' ? 'text-[#10b981]' : 'text-[#f59e0b]'}`}>
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
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h3 className="text-xl font-bold text-gray-900">Upcoming ({upcoming.length})</h3>
                                                    </div>
                                                    {upcoming.length === 0 ? (
                                                        <div className="p-6 text-sm text-gray-900/60 border border-gray-200 rounded-lg bg-white">No upcoming bookings</div>
                                                    ) : (
                                                        <div className="grid gap-5">
                                                            {upcoming.map((b, i) => renderCard(b, i))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="h-px bg-[#1A1A1A] my-6" />
                                                <div>
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h3 className="text-xl font-bold text-gray-900">Completed ({completed.length})</h3>
                                                    </div>
                                                    {completed.length === 0 ? (
                                                        <div className="p-6 text-sm text-gray-900/60 border border-gray-200 rounded-lg bg-white">No completed rides yet</div>
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
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.25 }}
                                        className="bg-white rounded-lg p-12 text-center border border-gray-200"
                                    >
                                        <CreditCard className="w-16 h-16 text-gray-900/40 mx-auto mb-4" />
                                        <h3 className="text-xl font-semibold mb-2 text-gray-900">No payments yet</h3>
                                        <p className="text-gray-900/60">Your payment history will appear here</p>
                                    </motion.div>
                                ) : (
                                    <div className="grid gap-4">
                                        {payments.map((payment, index) => (
                                            <motion.div
                                                key={payment.payment_id}
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.05, duration: 0.25 }}
                                                className="bg-white rounded-lg p-6 border-l-4 border-l-[#10b981] border-y border-r border-gray-200 hover:bg-[#1A1A1A] transition-all duration-200"
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold text-lg mb-1 text-gray-900">
                                                            {payment.source} → {payment.destination}
                                                        </h4>
                                                        <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm text-gray-900/60">
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
                                                                        ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                                                                        : 'bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30'
                                                                }`}>
                                                                    {payment.payment_status}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-3xl font-extrabold text-[#10b981]">
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
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
                        onClick={() => setSelectedBooking(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 8 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white rounded-lg p-8 max-w-md w-full border border-gray-200 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-bold text-gray-900">Make Payment</h3>
                                <button
                                    onClick={() => setSelectedBooking(null)}
                                    className="p-2 hover:bg-[#1A1A1A] rounded-lg transition-colors duration-200"
                                >
                                    <X className="w-5 h-5 text-gray-900/60 hover:text-gray-900" />
                                </button>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div className="flex items-center justify-between p-4 rounded-lg bg-blue-600/10 border border-[#0EA5E9]/30">
                                    <span className="font-semibold text-gray-900">Total Amount</span>
                                    <span className="text-2xl font-bold text-[#0EA5E9]">
                                        ₹{selectedBooking.amount}
                                    </span>
                                </div>

                                <div className="flex items-center gap-3 p-4 rounded-lg bg-white border border-gray-200">
                                    <MapPin className="w-5 h-5 text-[#0EA5E9]" />
                                    <div>
                                        <div className="text-sm text-gray-900/60">Route</div>
                                        <div className="font-semibold text-gray-900">{selectedBooking.source} → {selectedBooking.destination}</div>
                                    </div>
                        </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-900">Payment Method</label>
                                    <select
                                        value={paymentMethod}
                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all outline-none appearance-none cursor-pointer text-gray-900"
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
                                    className="flex-1 py-3 bg-[#1A1A1A] hover:bg-[#1F1F1F] text-gray-900 font-semibold rounded-lg transition-all duration-200"
                                >
                                    Cancel
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={confirmPayment}
                                    className="flex-1 py-3 bg-blue-600 text-gray-900 font-semibold rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 flex items-center justify-center gap-2"
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
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
                        onClick={() => setFeedbackForm({ ride_id: null, rating: 5, comments: '' })}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 8 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white rounded-lg p-8 max-w-md w-full border border-gray-200 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-bold text-gray-900">Add Feedback</h3>
                                <button
                                    onClick={() => setFeedbackForm({ ride_id: null, rating: 5, comments: '' })}
                                    className="p-2 hover:bg-[#1A1A1A] rounded-lg transition-colors duration-200"
                                >
                                    <X className="w-5 h-5 text-gray-900/60 hover:text-gray-900" />
                                </button>
                            </div>

                            <form onSubmit={submitFeedback} className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-900">Rating</label>
                                <select 
                                    value={feedbackForm.rating}
                                    onChange={(e) => setFeedbackForm({...feedbackForm, rating: parseInt(e.target.value)})}
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all outline-none appearance-none cursor-pointer text-gray-900"
                                    >
                                        <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
                                        <option value="4">⭐⭐⭐⭐ Good</option>
                                        <option value="3">⭐⭐⭐ Average</option>
                                        <option value="2">⭐⭐ Poor</option>
                                        <option value="1">⭐ Very Poor</option>
                                </select>
                            </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-900">Comments</label>
                                <textarea
                                    value={feedbackForm.comments}
                                    onChange={(e) => setFeedbackForm({...feedbackForm, comments: e.target.value})}
                                    rows="4"
                                    placeholder="Share your experience..."
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all outline-none resize-none text-gray-900 placeholder:text-gray-900/40"
                                />
                            </div>

                                <div className="flex gap-3">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                    type="button" 
                                    onClick={() => setFeedbackForm({ ride_id: null, rating: 5, comments: '' })}
                                        className="flex-1 py-3 bg-[#1A1A1A] hover:bg-[#1F1F1F] text-gray-900 font-semibold rounded-lg transition-all duration-200"
                                >
                                    Cancel
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        type="submit"
                                        className="flex-1 py-3 bg-blue-600 text-gray-900 font-semibold rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 flex items-center justify-center gap-2"
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
