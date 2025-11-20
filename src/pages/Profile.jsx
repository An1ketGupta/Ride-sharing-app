import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { userExtras } from '../services/userExtras';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { User as UserIcon, Mail, Phone, ShieldCheck, MapPin, Camera, Plus, X, Navigation } from 'lucide-react';

const Profile = () => {
    const { user, setUser } = useAuth();
    const toast = useToast();
    const [emergency, setEmergency] = useState({ name: '', phone: '', email: '' });
    const [savingEmergency, setSavingEmergency] = useState(false);
    const [profilePicUrl, setProfilePicUrl] = useState('');
    const [savedLocations, setSavedLocations] = useState([]);
    const [newLocation, setNewLocation] = useState({ name: '', address: '' });
    const [uploadingPic, setUploadingPic] = useState(false);
    const [geoCache] = useState(() => new Map());
    const displayRole = (user?.user_type || '').charAt(0).toUpperCase() + (user?.user_type || '').slice(1);

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
        (async () => {
            try {
                if (!user?.user_id) return;
                const resp = await userExtras.getEmergencyContact(user.user_id);
                const ec = resp?.data || resp || {};
                setEmergency({
                    name: ec.emergency_contact_name || '',
                    phone: ec.emergency_contact_phone || '',
                    email: ec.emergency_contact_email || ''
                });
                setProfilePicUrl(user?.profile_pic_url || '');
                
                // Load saved locations
                const locsResp = await userExtras.getSavedLocations(user.user_id);
                setSavedLocations(Array.isArray(locsResp?.data) ? locsResp.data : []);
            } catch {}
        })();
    }, [user?.user_id]);

    const handleUpdateProfilePic = async (url) => {
        if (!url.trim()) return;
        try {
            setUploadingPic(true);
            await userExtras.updateProfilePic(user.user_id, url);
            setProfilePicUrl(url);
            setUser({ ...user, profile_pic_url: url });
            toast.success('Profile picture updated');
        } catch (err) {
            toast.error('Failed to update profile picture');
        } finally {
            setUploadingPic(false);
        }
    };

    const handleAddLocation = async () => {
        if (!newLocation.name || !newLocation.address) {
            toast.error('Please fill all fields');
            return;
        }
        try {
            // Geocode the address
            const coords = await forwardGeocode(newLocation.address.trim());
            if (!coords) {
                toast.error('Could not locate that address. Please try a more specific address.');
                return;
            }
            await userExtras.addSavedLocation(user.user_id, {
                name: newLocation.name,
                lat: coords.lat,
                lon: coords.lon
            });
            toast.success('Location saved');
            setNewLocation({ name: '', address: '' });
            const locsResp = await userExtras.getSavedLocations(user.user_id);
            setSavedLocations(Array.isArray(locsResp?.data) ? locsResp.data : []);
        } catch (err) {
            toast.error('Failed to save location');
        }
    };

    const handleDeleteLocation = async (locationId) => {
        try {
            await userExtras.deleteSavedLocation(user.user_id, locationId);
            toast.success('Location deleted');
            const locsResp = await userExtras.getSavedLocations(user.user_id);
            setSavedLocations(Array.isArray(locsResp?.data) ? locsResp.data : []);
        } catch (err) {
            toast.error('Failed to delete location');
        }
    };

    if (!user) return null;

    return (
        <div className="container mx-auto max-w-4xl px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10">
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-primary/10 via-secondary/10 to-transparent dark:from-white/5 dark:via-white/0 dark:to-transparent shadow-soft"
            >
                <div className="p-4 sm:p-6 md:p-8">
                    <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-5">
                        <div className="relative">
                            <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-full ring-4 ring-white/50 dark:ring-white/10 shadow-glow overflow-hidden bg-white/70 dark:bg-white/10 flex items-center justify-center">
                                {profilePicUrl ? (
                                    <img src={profilePicUrl} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <UserIcon className="w-10 h-10 sm:w-12 sm:h-12 text-foreground/50" />
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    const url = prompt('Enter profile picture URL:');
                                    if (url) handleUpdateProfilePic(url);
                                }}
                                className="absolute -bottom-2 -left-2 bg-primary text-white rounded-full p-2 shadow-soft hover:scale-110 transition-transform z-10"
                                disabled={uploadingPic}
                                title="Update profile picture"
                            >
                                <Camera className="w-4 h-4" />
                            </button>
                            <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-primary to-secondary text-white rounded-xl px-3 py-1 text-xs font-bold shadow-soft">
                                {displayRole || 'User'}
                            </div>
                        </div>
                        <div className="flex-1 text-center sm:text-left w-full sm:w-auto">
                            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight break-words">{user.name || '—'}</h1>
                            <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-center sm:gap-4 text-xs sm:text-sm text-foreground/80">
                                <div className="inline-flex items-center gap-2">
                                    <Mail className="w-4 h-4" />
                                    <span>{user.email || '—'}</span>
                                </div>
                                {user.phone && (
                                    <div className="inline-flex items-center gap-2">
                                        <Phone className="w-4 h-4" />
                                        <span>{user.phone}</span>
                                    </div>
                                )}
                                <div className="inline-flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4" />
                                    <span className="font-semibold">Verified Account</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <div className="mt-4 sm:mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.08 }}
                    className="rounded-2xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-4 sm:p-6"
                >
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <h2 className="text-base sm:text-lg font-bold">Emergency Contact</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">Name</label>
                            <input
                                value={emergency.name}
                                onChange={(e) => setEmergency({ ...emergency, name: e.target.value })}
                                placeholder="Contact name"
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">Phone</label>
                            <input
                                value={emergency.phone}
                                onChange={(e) => setEmergency({ ...emergency, phone: e.target.value })}
                                placeholder="e.g. +91XXXXXXXXXX"
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">Email</label>
                            <input
                                value={emergency.email}
                                onChange={(e) => setEmergency({ ...emergency, email: e.target.value })}
                                placeholder="contact@example.com"
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none"
                            />
                        </div>
                    </div>
                    <div className="mt-4">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            disabled={savingEmergency}
                            onClick={async () => {
                                try {
                                    setSavingEmergency(true);
                                    await userExtras.updateEmergencyContact(user.user_id, {
                                        emergency_contact_name: emergency.name || null,
                                        emergency_contact_phone: emergency.phone || null,
                                        emergency_contact_email: emergency.email || null,
                                    });
                                } catch (e) {
                                } finally {
                                    setSavingEmergency(false);
                                }
                            }}
                            className="px-4 py-2 bg-primary text-white font-semibold rounded-lg hover:brightness-110 transition-colors"
                        >
                            {savingEmergency ? 'Saving...' : 'Save Emergency Contact'}
                        </motion.button>
                    </div>
                </motion.div>

                {/* Saved Locations */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.16 }}
                    className="rounded-2xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-6"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold">Saved Locations</h2>
                    </div>
                    <div className="space-y-3">
                        {savedLocations.map((loc) => (
                            <div key={loc.location_id} className="flex items-center justify-between p-3 rounded-xl border border-white/20 bg-white/50 dark:bg-white/5">
                                <div className="flex items-center gap-3">
                                    <MapPin className="w-5 h-5 text-primary" />
                                    <div>
                                        <p className="font-semibold">{loc.name}</p>
                                        <p className="text-xs text-muted-foreground">{loc.lat && loc.lon ? `${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}` : 'Coordinates not available'}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteLocation(loc.location_id)}
                                    className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                                >
                                    <X className="w-4 h-4 text-red-500" />
                                </button>
                            </div>
                        ))}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-2 mt-4">
                            <input
                                type="text"
                                placeholder="Location name"
                                value={newLocation.name}
                                onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                                className="col-span-1 px-3 py-2 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none text-xs sm:text-sm"
                            />
                            <div className="col-span-1 sm:col-span-2 relative flex gap-2">
                                <div className="flex-1 relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                                    <input
                                        type="text"
                                        placeholder="Enter address"
                                        value={newLocation.address}
                                        onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none text-sm"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (navigator.geolocation) {
                                            navigator.geolocation.getCurrentPosition(async (pos) => {
                                                const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                                                if (address) {
                                                    setNewLocation({ ...newLocation, address });
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
                                    className="px-3 py-2 bg-primary text-white rounded-xl hover:brightness-110 transition-colors flex items-center justify-center"
                                    title="Use current location"
                                >
                                    <Navigation className="w-4 h-4" />
                                </button>
                            </div>
                            <button
                                onClick={handleAddLocation}
                                className="col-span-1 sm:col-span-1 px-3 py-2 bg-primary text-white rounded-xl font-semibold hover:brightness-110 transition-colors flex items-center justify-center gap-1 text-xs sm:text-sm"
                            >
                                <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                                Add
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Profile;


