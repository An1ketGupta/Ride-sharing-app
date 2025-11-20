import { useState, useEffect } from 'react';
import { sosService } from '../services/sosService';
import { userExtras } from '../services/userExtras';
import { bookingService } from '../services/bookingService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { AlertTriangle, Phone, MapPin, Shield, User, Save } from 'lucide-react';

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
        <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-6">
            <div className="max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent mb-2 flex items-center gap-3">
                        <Shield className="w-10 h-10 text-red-600" />
                        Emergency SOS
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">Your safety is our priority</p>
                </motion.div>

                {/* Emergency Contact Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                >
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-blue-600" />
                        Emergency Contact
                    </h2>
                    <form onSubmit={handleSaveEmergencyContact} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Contact Name</label>
                            <input
                                type="text"
                                value={emergencyContact.name}
                                onChange={(e) => setEmergencyContact({ ...emergencyContact, name: e.target.value })}
                                placeholder="e.g., John Doe"
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Phone Number</label>
                            <input
                                type="tel"
                                value={emergencyContact.phone}
                                onChange={(e) => setEmergencyContact({ ...emergencyContact, phone: e.target.value })}
                                placeholder="+91 98765 43210"
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            Save Emergency Contact
                        </button>
                    </form>
                </motion.div>

                {/* SOS Alert Section - Only show if passenger has active ride */}
                {checkingRide ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                    >
                        <div className="text-center py-8">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mb-4"></div>
                            <p className="text-gray-600 dark:text-gray-400">Checking for active rides...</p>
                        </div>
                    </motion.div>
                ) : activeRide ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="p-6 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-xl shadow-lg border-2 border-red-200 dark:border-red-800"
                    >
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-red-600 dark:text-red-400">
                            <AlertTriangle className="w-6 h-6" />
                            Raise SOS Alert
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Use this feature only in case of emergency during an active ride. This will:
                        </p>
                        <ul className="text-sm text-gray-600 dark:text-gray-400 mb-6 space-y-2">
                            <li className="flex items-start gap-2">
                                <span className="text-red-500">•</span>
                                <span>Notify your emergency contact with your current location</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-red-500">•</span>
                                <span>Alert the driver and platform administrators</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-red-500">•</span>
                                <span>Share your live location with authorities</span>
                            </li>
                        </ul>

                        {activeRide && (
                            <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg text-sm">
                                <p className="text-gray-700 dark:text-gray-300 font-semibold mb-1">Active Ride:</p>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {activeRide.pickup_location || activeRide.source} → {activeRide.dropoff_location || activeRide.destination}
                                </p>
                                {activeRide.booking_id && (
                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Booking ID: {activeRide.booking_id}</p>
                                )}
                            </div>
                        )}

                        {currentLocation && (
                            <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg flex items-center gap-2 text-sm">
                                <MapPin className="w-4 h-4 text-green-600" />
                                <span className="text-gray-600 dark:text-gray-400">
                                    Current Location: {currentLocation.lat.toFixed(4)}, {currentLocation.lon.toFixed(4)}
                                </span>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Additional Details (Optional)</label>
                            <textarea
                                value={sosDetails}
                                onChange={(e) => setSosDetails(e.target.value)}
                                placeholder="Describe the emergency situation..."
                                rows={3}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-red-500 outline-none"
                            />
                        </div>

                        <button
                            onClick={() => handleRaiseSOS(activeRide.booking_id || activeRide.ride_id)}
                            disabled={loading || !currentLocation}
                            className="w-full px-6 py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-xl font-bold text-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            <AlertTriangle className="w-6 h-6" />
                            RAISE SOS ALERT
                        </button>

                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-4 text-center">
                            For immediate help, call emergency services: 112
                        </p>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="p-6 bg-gray-50 dark:bg-gray-800 rounded-xl shadow-lg border-2 border-gray-200 dark:border-gray-700"
                    >
                        <div className="text-center py-8">
                            <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                            <h2 className="text-xl font-semibold mb-2 text-gray-700 dark:text-gray-300">
                                No Active Ride
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                The SOS emergency feature is only available when you are in an active ride.
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500">
                                Once you book a ride and it's confirmed or in progress, you'll be able to use this feature.
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                                For immediate emergencies, please call emergency services: <strong>112</strong>
                            </p>
                        </div>
                    </motion.div>
                )}

                {/* Safety Tips */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-6 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl"
                >
                    <h3 className="font-semibold mb-3 flex items-center gap-2 text-blue-600 dark:text-blue-400">
                        <Shield className="w-5 h-5" />
                        Safety Tips
                    </h3>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                        <li>• Always share your trip details with friends or family</li>
                        <li>• Verify driver details before starting the ride</li>
                        <li>• Keep your emergency contact updated</li>
                        <li>• Trust your instincts - if something feels wrong, take action</li>
                        <li>• For immediate danger, call local emergency services: 112</li>
                    </ul>
                </motion.div>
            </div>
        </div>
    );
};

export default EmergencySOS;
