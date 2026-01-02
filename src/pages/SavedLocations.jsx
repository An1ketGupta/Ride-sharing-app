import { useState, useEffect } from 'react';
import { userExtras } from '../services/userExtras';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Plus, Trash2, Home, Briefcase, Heart, Star, Navigation, X, Search, Clock } from 'lucide-react';

const SavedLocations = () => {
    const [locations, setLocations] = useState([]);
    const [locationAddresses, setLocationAddresses] = useState({});
    const [loading, setLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({ name: '', address: '' });
    const [searchQuery, setSearchQuery] = useState('');
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
            const locs = Array.isArray(response.data) ? response.data : [];
            setLocations(locs);
            
            // Reverse geocode addresses for all locations
            const addressMap = {};
            await Promise.all(
                locs.map(async (loc) => {
                    if (loc.lat && loc.lon) {
                        try {
                            const address = await reverseGeocode(loc.lat, loc.lon);
                            if (address) {
                                addressMap[loc.location_id] = address;
                            }
                        } catch (err) {
                            console.error('Failed to geocode location', err);
                        }
                    }
                })
            );
            setLocationAddresses(addressMap);
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
            toast.success('Location saved successfully');
            setFormData({ name: '', address: '' });
            setShowAddForm(false);
            loadLocations();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save location');
        }
    };

    const handleDelete = async (locationId) => {
        if (!window.confirm('Are you sure you want to delete this location?')) return;
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
        if (lower.includes('home')) return <Home className="w-5 h-5 text-blue-400" />;
        if (lower.includes('work') || lower.includes('office')) return <Briefcase className="w-5 h-5 text-purple-400" />;
        if (lower.includes('favorite') || lower.includes('favourite')) return <Heart className="w-5 h-5 text-red-400" />;
        return <MapPin className="w-5 h-5 text-blue-600" />;
    };

    const getIconColor = (name) => {
        const lower = name.toLowerCase();
        if (lower.includes('home')) return 'from-blue-500/20 to-cyan-500/20';
        if (lower.includes('work') || lower.includes('office')) return 'from-purple-500/20 to-pink-500/20';
        if (lower.includes('favorite') || lower.includes('favourite')) return 'from-red-500/20 to-rose-500/20';
        return 'from-indigo-500/20 to-blue-500/20';
    };

    const filteredLocations = locations.filter(loc =>
        loc.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        locationAddresses[loc.location_id]?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-black text-gray-900 p-4 sm:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header Section */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-bold mb-2 bg-gradient-to-r from-[#0EA5E9] via-blue-400 to-purple-500 bg-clip-text text-transparent">
                                Saved Locations
                            </h1>
                            <p className="text-gray-400 text-sm sm:text-base">
                                Manage your frequently visited places for quick access
                            </p>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowAddForm(!showAddForm)}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-600/90 text-gray-900 rounded-lg font-semibold shadow-lg hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
                        >
                            <Plus className="w-5 h-5" />
                            <span>Add New Location</span>
                        </motion.button>
                    </div>

                    {/* Search Bar */}
                    {locations.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="relative"
                        >
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search locations..."
                                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent text-gray-900 placeholder-gray-500"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </motion.div>
                    )}
                </motion.div>

                {/* Add Location Form */}
                <AnimatePresence>
                    {showAddForm && (
                        <motion.div
                            initial={{ opacity: 0, height: 0, y: -20 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0, y: -20 }}
                            className="mb-8 overflow-hidden"
                        >
                            <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-xl">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-semibold text-gray-900">Add New Location</h2>
                                    <button
                                        onClick={() => {
                                            setShowAddForm(false);
                                            setFormData({ name: '', address: '' });
                                        }}
                                        className="p-2 hover:bg-[#1A1A1A] rounded-lg transition-colors"
                                    >
                                        <X className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>
                                <form onSubmit={handleAdd} className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Location Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Home, Office, Gym, Favorite Restaurant"
                                            className="w-full px-4 py-3 bg-[#0A0A0A] border border-gray-200 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all"
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Address
                                        </label>
                                        <div className="flex gap-3">
                                            <div className="flex-1 relative">
                                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600" />
                                                <input
                                                    type="text"
                                                    value={formData.address}
                                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                                    placeholder="Enter full address or use current location"
                                                    className="w-full pl-12 pr-4 py-3 bg-[#0A0A0A] border border-gray-200 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:border-transparent transition-all"
                                                />
                                            </div>
                                            <motion.button
                                                type="button"
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={async () => {
                                                    if (navigator.geolocation) {
                                                        navigator.geolocation.getCurrentPosition(async (pos) => {
                                                            const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                                                            if (address) {
                                                                setFormData({ ...formData, address });
                                                                toast.success('Location detected');
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
                                                className="px-5 py-3 bg-[#1A1A1A] hover:bg-[#252525] border border-gray-200 text-gray-900 rounded-lg transition-all flex items-center gap-2"
                                                title="Use current location"
                                            >
                                                <Navigation className="w-5 h-5" />
                                            </motion.button>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <motion.button
                                            type="submit"
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-600/90 text-gray-900 rounded-lg font-semibold transition-all shadow-lg hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)]"
                                        >
                                            Save Location
                                        </motion.button>
                                        <motion.button
                                            type="button"
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => {
                                                setShowAddForm(false);
                                                setFormData({ name: '', address: '' });
                                            }}
                                            className="px-6 py-3 bg-[#1A1A1A] hover:bg-[#252525] text-gray-900 rounded-lg font-semibold transition-all border border-gray-200"
                                        >
                                            Cancel
                                        </motion.button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Content Section */}
                {loading ? (
                    <div className="text-center py-20">
                        <div className="animate-spin w-12 h-12 border-4 border-[#0EA5E9] border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-gray-400">Loading your locations...</p>
                    </div>
                ) : filteredLocations.length === 0 && locations.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-20 bg-white border border-gray-200 rounded-lg"
                    >
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#0EA5E9]/20 to-purple-500/20 mb-6">
                            <MapPin className="w-10 h-10 text-blue-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No saved locations yet</h3>
                        <p className="text-gray-400 mb-6 max-w-md mx-auto">
                            Add your frequently visited places for quick access when booking rides
                        </p>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setShowAddForm(true)}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-600/90 text-gray-900 rounded-lg font-semibold transition-all flex items-center gap-2 mx-auto"
                        >
                            <Plus className="w-5 h-5" />
                            Add Your First Location
                        </motion.button>
                    </motion.div>
                ) : filteredLocations.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-20 bg-white border border-gray-200 rounded-lg"
                    >
                        <Search className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No locations found</h3>
                        <p className="text-gray-400">Try adjusting your search query</p>
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredLocations.map((loc, idx) => (
                            <motion.div
                                key={loc.location_id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                whileHover={{ y: -4, scale: 1.02 }}
                                className="group relative p-6 bg-white border border-gray-200 rounded-lg hover:border-[#0EA5E9]/50 transition-all cursor-pointer"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`p-3 rounded-lg bg-gradient-to-br ${getIconColor(loc.name)} border border-white/10`}>
                                        {getIcon(loc.name)}
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.1, rotate: 5 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(loc.location_id);
                                        }}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </motion.button>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{loc.name}</h3>
                                    <div className="space-y-2">
                                        {locationAddresses[loc.location_id] ? (
                                            <p className="text-sm text-gray-400 line-clamp-2 flex items-start gap-2">
                                                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
                                                <span>{locationAddresses[loc.location_id]}</span>
                                            </p>
                                        ) : (
                                            <p className="text-sm text-gray-500 flex items-start gap-2">
                                                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                <span>
                                                    {loc.lat && loc.lon 
                                                        ? `${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}` 
                                                        : 'Coordinates not available'}
                                                </span>
                                            </p>
                                        )}
                                        {loc.created_at && (
                                            <p className="text-xs text-gray-500 flex items-center gap-2">
                                                <Clock className="w-3 h-3" />
                                                <span>Added {new Date(loc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Stats Footer */}
                {locations.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-8 p-4 bg-white border border-gray-200 rounded-lg text-center"
                    >
                        <p className="text-sm text-gray-400">
                            You have <span className="text-blue-600 font-semibold">{locations.length}</span> saved location{locations.length !== 1 ? 's' : ''}
                        </p>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default SavedLocations;
