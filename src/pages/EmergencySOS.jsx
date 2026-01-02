import { useState, useEffect } from 'react';
import { sosService } from '../services/sosService';
import { userExtras } from '../services/userExtras';
import { bookingService } from '../services/bookingService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { motion } from 'framer-motion';
import { AlertTriangle, Phone, MapPin, Shield, User, Save, PhoneCall, Navigation, Info } from 'lucide-react';

const EmergencySOS = () => {
    const [emergencyContact, setEmergencyContact] = useState({ name: '', phone: '' });
    const [loading, setLoading] = useState(false);
    const [sosDetails, setSosDetails] = useState('');
    const [currentLocation, setCurrentLocation] = useState(null);
    const [activeRide, setActiveRide] = useState(null);
    const [checkingRide, setCheckingRide] = useState(true);
    const { user } = useAuth();
    const toast = useToast();

    useEffect(() => {
        loadEmergencyContact();
        getCurrentLocation();
        checkActiveRide();
    }, [user]);

    const checkActiveRide = async () => {
        if (!user?.user_id || (user.user_type !== 'passenger' && user.user_type !== 'both')) {
            setCheckingRide(false);
            return;
        }
        setCheckingRide(true);
        try {
            const response = await bookingService.getMyBookings();
            const bookings = Array.isArray(response.data) ? response.data : [];
            
            // Find active ride - booking status should be 'confirmed', 'in_progress', or ride_status should be 'ongoing'
            const normalize = (s) => (s || '').toLowerCase();
            const active = bookings.find((b) => {
                const bookingStatus = normalize(b.booking_status || b.status);
                const rideStatus = normalize(b.ride_status);
                return (bookingStatus === 'confirmed' || bookingStatus === 'in_progress' || rideStatus === 'ongoing') 
                    && rideStatus !== 'completed';
            });
            
            setActiveRide(active || null);
        } catch (err) {
            console.error('Failed to check active ride:', err);
            setActiveRide(null);
        } finally {
            setCheckingRide(false);
        }
    };

    const loadEmergencyContact = async () => {
        if (!user?.user_id) return;
        try {
            const response = await userExtras.getEmergencyContact(user.user_id);
            if (response.data) {
                setEmergencyContact({
                    name: response.data.emergency_contact_name || '',
                    phone: response.data.emergency_contact_phone || ''
                });
            }
        } catch (err) {
            // No emergency contact set yet
        }
    };

    const getCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setCurrentLocation({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                },
                (error) => {
                    console.error('Location error:', error);
                }
            );
        }
    };

    const handleSaveEmergencyContact = async (e) => {
        e.preventDefault();
        if (!emergencyContact.name || !emergencyContact.phone) {
            toast.error('Both name and phone are required');
            return;
        }
        setLoading(true);
        try {
            await userExtras.updateEmergencyContact(user.user_id, {
                emergency_contact_name: emergencyContact.name,
                emergency_contact_phone: emergencyContact.phone
            });
            toast.success('Emergency contact saved');
        } catch (err) {
            toast.error('Failed to save emergency contact');
        } finally {
            setLoading(false);
        }
    };

    const handleRaiseSOS = async (rideId) => {
        if (!rideId) {
            toast.error('No active ride found. SOS requires an active ride.');
            return;
        }
        if (!currentLocation) {
            toast.error('Unable to get your location');
            return;
        }
        if (!window.confirm('Raise SOS alert? This will notify authorities and your emergency contact.')) {
            return;
        }
        setLoading(true);
        try {
            await sosService.raise(rideId, {
                user_id: user.user_id,
                details: sosDetails || 'Emergency SOS raised',
                passenger_lat: currentLocation.lat,
                passenger_lon: currentLocation.lon
            });
            toast.success('SOS alert raised! Help is on the way.');
            setSosDetails('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to raise SOS');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 px-6 sm:px-8 md:px-10 py-8 sm:py-10 md:py-12 max-w-6xl mx-auto page-transition">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="mb-8 sm:mb-10 md:mb-12"
            >
                <div className="flex items-center gap-4 mb-3">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center shadow-lg">
                        <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-gray-900" />
                    </div>
                    <div>
                        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-2">
                            Emergency SOS
                        </h1>
                        <p className="text-gray-900/60 text-lg sm:text-xl">Your safety is our priority</p>
                    </div>
                </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                {/* Left Column - Emergency Contact & Safety Tips */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Emergency Contact Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.25 }}
                        className="bg-white rounded-lg p-6 sm:p-8 border border-gray-200 hover:border-[#0EA5E9]/30 transition-all duration-200"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                                <User className="w-5 h-5 text-blue-600" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Emergency Contact</h2>
                        </div>
                        <form onSubmit={handleSaveEmergencyContact} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-900/80">Contact Name</label>
                                <input
                                    type="text"
                                    value={emergencyContact.name}
                                    onChange={(e) => setEmergencyContact({ ...emergencyContact, name: e.target.value })}
                                    placeholder="e.g., John Doe"
                                    className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#0A0A0A] text-gray-900 placeholder:text-gray-900/40 focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-900/80">Phone Number</label>
                                <input
                                    type="tel"
                                    value={emergencyContact.phone}
                                    onChange={(e) => setEmergencyContact({ ...emergencyContact, phone: e.target.value })}
                                    placeholder="+91 98765 43210"
                                    className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-[#0A0A0A] text-gray-900 placeholder:text-gray-900/40 focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none transition-all"
                                />
                            </div>
                            <Button
                                type="submit"
                                disabled={loading}
                                variant="primary"
                                className="w-full"
                            >
                                <Save className="w-4 h-4" />
                                Save Contact
                            </Button>
                        </form>
                    </motion.div>

                    {/* Safety Tips */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.25 }}
                        className="bg-white rounded-lg p-6 sm:p-8 border border-gray-200"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                                <Info className="w-5 h-5 text-blue-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Safety Tips</h3>
                        </div>
                        <ul className="space-y-3 text-gray-900/70 text-sm">
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 mt-1">•</span>
                                <span>Always share your trip details with friends or family</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 mt-1">•</span>
                                <span>Verify driver details before starting the ride</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 mt-1">•</span>
                                <span>Keep your emergency contact updated</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 mt-1">•</span>
                                <span>Trust your instincts - if something feels wrong, take action</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-blue-600 mt-1">•</span>
                                <span>For immediate danger, call emergency services: <strong className="text-gray-900">112</strong></span>
                            </li>
                        </ul>
                    </motion.div>
                </div>

                {/* Right Column - SOS Alert Section */}
                <div className="lg:col-span-2">
                    {checkingRide ? (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1, duration: 0.25 }}
                            className="bg-white rounded-lg p-8 sm:p-12 border border-gray-200"
                        >
                            <div className="text-center py-12">
                                <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-[#0EA5E9] border-t-transparent mb-4"></div>
                                <p className="text-gray-900/60 text-lg">Checking for active rides...</p>
                            </div>
                        </motion.div>
                    ) : activeRide ? (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1, duration: 0.25 }}
                            className="bg-gradient-to-br from-red-950/30 via-red-900/20 to-orange-950/30 rounded-lg p-6 sm:p-8 border-2 border-red-500/30 relative overflow-hidden"
                        >
                            {/* Animated background pulse */}
                            <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 to-orange-600/10 animate-pulse"></div>
                            
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-12 h-12 rounded-lg bg-red-600/20 flex items-center justify-center">
                                        <AlertTriangle className="w-6 h-6 text-red-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900 mb-1">Raise SOS Alert</h2>
                                        <p className="text-gray-900/60 text-sm">Use only in case of emergency</p>
                                    </div>
                                </div>

                                <div className="mb-6 p-4 bg-black/40 rounded-lg border border-red-500/20">
                                    <p className="text-gray-900/80 text-sm mb-3 font-medium">This will:</p>
                                    <ul className="space-y-2 text-gray-900/70 text-sm">
                                        <li className="flex items-start gap-2">
                                            <PhoneCall className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                            <span>Notify your emergency contact with your current location</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Shield className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                            <span>Alert the driver and platform administrators</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <Navigation className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                            <span>Share your live location with authorities</span>
                                        </li>
                                    </ul>
                                </div>

                                {/* Active Ride Info */}
                                <div className="mb-4 p-4 bg-black/40 rounded-lg border border-gray-200">
                                    <p className="text-gray-900/80 text-sm font-medium mb-2">Active Ride</p>
                                    <p className="text-gray-900 text-base mb-1">
                                        {activeRide.pickup_location || activeRide.source} → {activeRide.dropoff_location || activeRide.destination}
                                    </p>
                                    {activeRide.booking_id && (
                                        <p className="text-xs text-gray-900/50 mt-1">Booking ID: {activeRide.booking_id}</p>
                                    )}
                                </div>

                                {/* Current Location */}
                                {currentLocation ? (
                                    <div className="mb-4 p-4 bg-black/40 rounded-lg border border-gray-200 flex items-center gap-3">
                                        <MapPin className="w-5 h-5 text-green-500 flex-shrink-0" />
                                        <div>
                                            <p className="text-gray-900/80 text-sm font-medium">Current Location</p>
                                            <p className="text-gray-900/60 text-xs">
                                                {currentLocation.lat.toFixed(4)}, {currentLocation.lon.toFixed(4)}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-4 p-4 bg-black/40 rounded-lg border border-yellow-500/30 flex items-center gap-3">
                                        <MapPin className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                                        <p className="text-yellow-500/80 text-sm">Getting location...</p>
                                    </div>
                                )}

                                {/* Additional Details */}
                                <div className="mb-6">
                                    <label className="block text-sm font-medium mb-2 text-gray-900/80">Additional Details (Optional)</label>
                                    <textarea
                                        value={sosDetails}
                                        onChange={(e) => setSosDetails(e.target.value)}
                                        placeholder="Describe the emergency situation..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-black/40 text-gray-900 placeholder:text-gray-900/40 focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none"
                                    />
                                </div>

                                {/* SOS Button */}
                                <motion.button
                                    onClick={() => handleRaiseSOS(activeRide.booking_id || activeRide.ride_id)}
                                    disabled={loading || !currentLocation}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="w-full px-8 py-5 bg-gradient-to-r from-red-600 to-orange-600 text-gray-900 rounded-lg font-bold text-lg sm:text-xl hover:shadow-[0_8px_24px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-red-700 to-orange-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <AlertTriangle className="w-6 h-6 relative z-10 animate-pulse" />
                                    <span className="relative z-10">RAISE SOS ALERT</span>
                                </motion.button>

                                <p className="text-xs text-gray-900/50 mt-4 text-center">
                                    For immediate help, call emergency services: <strong className="text-gray-900">112</strong>
                                </p>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1, duration: 0.25 }}
                            className="bg-white rounded-lg p-8 sm:p-12 border border-gray-200"
                        >
                            <div className="text-center py-8">
                                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#1A1A1A] flex items-center justify-center">
                                    <Shield className="w-10 h-10 text-gray-900/40" />
                                </div>
                                <h2 className="text-2xl font-bold mb-3 text-gray-900">
                                    No Active Ride
                                </h2>
                                <p className="text-gray-900/60 mb-6 max-w-md mx-auto">
                                    The SOS emergency feature is only available when you are in an active ride.
                                </p>
                                <p className="text-gray-900/50 text-sm mb-4">
                                    Once you book a ride and it's confirmed or in progress, you'll be able to use this feature.
                                </p>
                                <div className="mt-8 p-4 bg-[#0A0A0A] rounded-lg border border-gray-200 inline-block">
                                    <p className="text-gray-900/80 text-sm">
                                        For immediate emergencies, call: <strong className="text-blue-600 text-lg">112</strong>
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmergencySOS;
