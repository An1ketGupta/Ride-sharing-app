import { useState, useEffect } from 'react';
import { userExtras } from '../services/userExtras';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Plus, Trash2, Home, Briefcase, Heart, Star, Navigation } from 'lucide-react';

const SavedLocations = () => {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', address: '' });
    const [geoCache] = useState(() => new Map());
    const { user } = useAuth();
    const toast = useToast();

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
        loadLocations();
    }, []);

    const loadLocations = async () => {
        if (!user?.user_id) return;
        setLoading(true);
        try {
            const response = await userExtras.getSavedLocations(user.user_id);
            setLocations(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            toast.error('Failed to load saved locations');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.address) {
            toast.error('Name and address are required');
            return;
        }
        try {
            // Geocode the address
            const coords = await forwardGeocode(formData.address.trim());
            if (!coords) {
                toast.error('Could not locate that address. Please try a more specific address.');
                return;
            }
            await userExtras.addSavedLocation(user.user_id, {
                name: formData.name,
                lat: coords.lat,
                lon: coords.lon
            });
            toast.success('Location saved');
            setFormData({ name: '', address: '' });
            setShowAddForm(false);
            loadLocations();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save location');
        }
    };

    const handleDelete = async (locationId) => {
        if (!window.confirm('Delete this location?')) return;
        try {
            await userExtras.deleteSavedLocation(user.user_id, locationId);
            toast.success('Location deleted');
            setLocations(locations.filter(loc => loc.location_id !== locationId));
        } catch (err) {
            toast.error('Failed to delete location');
        }
    };

    const getIcon = (name) => {
        const lower = name.toLowerCase();
        if (lower.includes('home')) return <Home className="w-5 h-5" />;
        if (lower.includes('work') || lower.includes('office')) return <Briefcase className="w-5 h-5" />;
        if (lower.includes('favorite') || lower.includes('favourite')) return <Heart className="w-5 h-5" />;
        return <MapPin className="w-5 h-5" />;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-6">
            <div className="max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                        Saved Locations
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">Manage your frequently visited places</p>
                </motion.div>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="mb-6 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Add New Location
                </motion.button>

                <AnimatePresence>
                    {showAddForm && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                        >
                            <form onSubmit={handleAdd} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Location Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g., Home, Office, Gym"
                                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Address</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
                                            <input
                                                type="text"
                                                value={formData.address}
                                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                                placeholder="Enter full address (e.g., 123 Main St, City, State)"
                                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (navigator.geolocation) {
                                                    navigator.geolocation.getCurrentPosition(async (pos) => {
                                                        const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                                                        if (address) {
                                                            setFormData({ ...formData, address });
                                                        } else {
                                                            toast.error('Could not get address from location');
                                                        }
                                                    }, () => {
                                                        toast.error('Unable to get your location');
                                                    });
                                                } else {
                                                    toast.error('Geolocation is not supported');
                                                }
                                            }}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                                            title="Use current location"
                                        >
                                            <Navigation className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="submit"
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Save Location
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowAddForm(false)}
                                        className="px-6 py-2 bg-gray-300 dark:bg-gray-600 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading locations...</p>
                    </div>
                ) : locations.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                    >
                        <MapPin className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">No saved locations yet</p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Add your frequently visited places for quick access</p>
                    </motion.div>
                ) : (
                    <div className="grid gap-4">
                        {locations.map((loc, idx) => (
                            <motion.div
                                key={loc.location_id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                            {getIcon(loc.name)}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold mb-1">{loc.name}</h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                {loc.lat && loc.lon ? `${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}` : 'Coordinates not available'}
                                            </p>
                                            {loc.created_at && (
                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                                                    Added {new Date(loc.created_at).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(loc.location_id)}
                                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SavedLocations;
