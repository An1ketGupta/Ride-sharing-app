import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { rideService } from '../services/rideService';
import { bookingService } from '../services/bookingService';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Clock, Car, Phone, ArrowLeft, ArrowRight, DollarSign, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sosService } from '../services/sosService';
import { useToast } from '../components/ui/Toast';

const RideDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [ride, setRide] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [seats, setSeats] = useState(1);
    const [notes, setNotes] = useState('');
    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingError, setBookingError] = useState('');
    const [sosLoading, setSosLoading] = useState(false);
    const [activeBooking, setActiveBooking] = useState(null);
    const toast = useToast();

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true);
                const resp = await rideService.getRideById(id);
                if (!mounted) return;
                setRide(resp.data);
            } catch (e) {
                if (!mounted) return;
                setError('Failed to load ride');
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [id]);

    // Check for active booking for this ride
    useEffect(() => {
        if (!user?.user_id || (user.user_type !== 'passenger' && user.user_type !== 'both') || !ride?.ride_id) {
            setActiveBooking(null);
            return;
        }
        let mounted = true;
        (async () => {
            try {
                const resp = await bookingService.getMyBookings();
                if (!mounted) return;
                const bookings = Array.isArray(resp.data) ? resp.data : [];
                
                // Find active booking for this ride
                const normalize = (s) => (s || '').toLowerCase();
                const active = bookings.find((b) => {
                    const bookingStatus = normalize(b.booking_status || b.status);
                    const rideStatus = normalize(b.ride_status);
                    return (b.ride_id === ride.ride_id || b.ride_id === id) 
                        && (bookingStatus === 'confirmed' || bookingStatus === 'in_progress' || rideStatus === 'ongoing')
                        && rideStatus !== 'completed';
                });
                
                setActiveBooking(active || null);
            } catch (err) {
                console.error('Failed to check active booking:', err);
                if (mounted) setActiveBooking(null);
            }
        })();
        return () => { mounted = false; };
    }, [user, ride?.ride_id, id]);

    const handleBook = async () => {
        if (!user) {
            navigate('/login');
            return;
        }
        if (!ride) return;

        const requestedSeats = Number(seats) || 0;
        const available = Number(ride.available_seats);
        if (requestedSeats <= 0) {
            setBookingError('Please choose at least 1 seat');
            return;
        }
        if (Number.isFinite(available) && requestedSeats > available) {
            setBookingError(`Only ${available} seats are available`);
            return;
        }

        try {
            setBookingLoading(true);
            setBookingError('');
            const resp = await bookingService.createBooking({
                ride_id: ride.ride_id,
                seats_booked: requestedSeats,
                notes: notes || undefined
            });
            const created = resp.data;
            navigate(`/payment?bookingId=${created.booking_id}&amount=${created.amount}`);
        } catch (e) {
            setBookingError(e.response?.data?.message || 'Failed to create booking');
        } finally {
            setBookingLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
                <div className="flex items-center justify-center py-24">
                    <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    if (error || !ride) {
        return (
            <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
                <div className="mb-6">
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-white/50 dark:bg-white/10 border border-white/20 hover:bg-white/70 transition">
                        <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                </div>
                <div className="p-6 rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">{error || 'Ride not found'}</div>
            </div>
        );
    }

    // Fixed fare: 10rs per seat per km
    const farePerKmPerSeat = 10;

    return (
        <div className="min-h-screen px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-5xl mx-auto">
            <div className="mb-4 sm:mb-6 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/50 dark:bg-white/10 border border-white/20 hover:bg-white/70 transition">
                    <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" /> Back
                </button>
            </div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-thick rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-soft-xl border border-white/20">
                <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        {ride.vehicle_image_url ? (
                            <div className="overflow-hidden rounded-xl sm:rounded-2xl border border-white/20">
                                <img src={ride.vehicle_image_url} alt="Vehicle" className="w-full h-48 sm:h-64 md:h-72 object-cover" />
                            </div>
                        ) : (
                            <div className="h-48 sm:h-64 md:h-72 rounded-xl sm:rounded-2xl border border-white/20 bg-white/30 dark:bg-white/5 flex items-center justify-center text-muted-foreground">
                                <Car className="w-8 h-8 sm:w-10 sm:h-10" />
                            </div>
                        )}

                        <div className="space-y-3 sm:space-y-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-xl sm:text-2xl font-extrabold">
                                <span className="gradient-text break-words">{ride.source}</span>
                                <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
                                <span className="gradient-text break-words">{ride.destination}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 text-xs sm:text-sm">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-primary" />
                                    <span className="font-medium">{ride.source} → {ride.destination}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-secondary" />
                                    <span className="font-medium">{new Date(ride.date).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-primary" />
                                    <span className="font-medium">{ride.time}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Car className="w-4 h-4 text-emerald-600" />
                                    <span className="font-medium">{(ride.total_seats - ride.available_seats)}/{ride.total_seats} seats</span>
                                </div>
                                {ride.vehicle_model && (
                                    <div className="flex items-center gap-2">
                                        <Car className="w-4 h-4 text-primary" />
                                        <span className="font-medium">{ride.vehicle_model} • {ride.vehicle_color} • {ride.license_plate || ride.plate_number}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-emerald-600" />
                                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">₹{(farePerKmPerSeat * ride.distance_km).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="rounded-2xl border border-white/20 p-5 bg-white/50 dark:bg-white/5">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-secondary/80 text-white flex items-center justify-center font-bold shadow-soft">
                                    {(ride.driver_name || '?').toString().trim().charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-bold">{ride.driver_name}</div>
                                    <div className="text-xs text-muted-foreground">Rating: {ride.driver_rating || 'New'}</div>
                                </div>
                            </div>
                            {ride.driver_phone && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Phone className="w-4 h-4 text-primary" />
                                    <span className="font-medium">{ride.driver_phone}</span>
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-white/20 p-5 bg-white/50 dark:bg-white/5 space-y-4">
                            <div className="text-lg font-bold">Book this ride</div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">Number of Seats</label>
                                <input
                                    type="number"
                                    min="1"
                                    max={ride.available_seats}
                                    value={seats}
                                    onChange={(e) => setSeats(parseInt(e.target.value))}
                                    className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold">Notes for driver</label>
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="I'm at the blue gate"
                                    className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                                />
                            </div>
                            <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border-2 border-primary/20">
                                <span className="font-semibold">Total Fare</span>
                                <span className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                                    ₹{(farePerKmPerSeat * ride.distance_km * seats).toFixed(2)}
                                </span>
                            </div>
                            {bookingError && (
                                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{bookingError}</div>
                            )}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleBook}
                                disabled={bookingLoading}
                                className="w-full py-3 bg-gradient-to-r from-primary to-secondary text-white font-semibold rounded-xl shadow-glow hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {bookingLoading ? 'Booking...' : 'Book Ride'}
                            </motion.button>
                        </div>

                        {/* SOS Button - Only show if passenger has active booking for this ride */}
                        {user && activeBooking && (
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={async () => {
                                    if (!window.confirm('Raise SOS alert? This will notify authorities and your emergency contact.')) {
                                        return;
                                    }
                                    try {
                                        setSosLoading(true);
                                        // Get user location if available
                                        navigator.geolocation.getCurrentPosition(async (position) => {
                                            await sosService.raise(activeBooking.booking_id || ride.ride_id, {
                                                user_id: user.user_id,
                                                details: 'Emergency SOS alert',
                                                passenger_lat: position.coords.latitude,
                                                passenger_lon: position.coords.longitude
                                            });
                                            toast.success('SOS alert sent! Emergency contacts have been notified.');
                                        }, async () => {
                                            await sosService.raise(activeBooking.booking_id || ride.ride_id, {
                                                user_id: user.user_id,
                                                details: 'Emergency SOS alert'
                                            });
                                            toast.success('SOS alert sent! Emergency contacts have been notified.');
                                        });
                                    } catch (err) {
                                        toast.error('Failed to send SOS alert');
                                    } finally {
                                        setSosLoading(false);
                                    }
                                }}
                                disabled={sosLoading}
                                className="w-full py-3 bg-red-600 text-white font-semibold rounded-xl shadow-glow hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <AlertTriangle className="w-5 h-5" />
                                {sosLoading ? 'Sending...' : 'SOS Emergency'}
                            </motion.button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default RideDetails;