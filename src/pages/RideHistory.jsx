import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { History, Filter, Calendar, MapPin, Clock, Search, ArrowRight, DollarSign, Navigation } from 'lucide-react';
import api from '../config/api';

const RideHistory = () => {
    const [rides, setRides] = useState([]);
    const [filteredRides, setFilteredRides] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        status: 'all',
        dateFrom: '',
        dateTo: '',
        searchQuery: ''
    });
    const { user } = useAuth();
    const toast = useToast();

    useEffect(() => {
        loadRideHistory();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [filters, rides]);

    const loadRideHistory = async () => {
        setLoading(true);
        try {
            // Fetch both rides and bookings based on user type
            let allRides = [];

            if (user?.user_type === 'driver' || user?.user_type === 'both') {
                const ridesResponse = await api.get('/rides/my-rides');
                const driverRides = Array.isArray(ridesResponse.data?.data) ? ridesResponse.data.data : [];
                allRides = [...allRides, ...driverRides.map(r => ({ ...r, type: 'driver' }))];
            }

            if (user?.user_type === 'passenger' || user?.user_type === 'both') {
                const bookingsResponse = await api.get('/bookings/my');
                const passengerBookings = Array.isArray(bookingsResponse.data?.data) ? bookingsResponse.data.data : [];
                allRides = [...allRides, ...passengerBookings.map(b => ({ ...b, type: 'passenger' }))];
            }

            // Sort by date
            allRides.sort((a, b) => {
                const dateA = new Date(a.created_at || a.booking_date);
                const dateB = new Date(b.created_at || b.booking_date);
                return dateB - dateA;
            });

            setRides(allRides);
        } catch (err) {
            toast.error('Failed to load ride history');
        } finally {
            setLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = [...rides];

        // Status filter
        if (filters.status !== 'all') {
            filtered = filtered.filter(ride =>
                (ride.status || ride.booking_status)?.toLowerCase() === filters.status.toLowerCase()
            );
        }

        // Date range filter
        if (filters.dateFrom) {
            filtered = filtered.filter(ride => {
                const rideDate = new Date(ride.created_at || ride.booking_date);
                return rideDate >= new Date(filters.dateFrom);
            });
        }
        if (filters.dateTo) {
            filtered = filtered.filter(ride => {
                const rideDate = new Date(ride.created_at || ride.booking_date);
                return rideDate <= new Date(filters.dateTo);
            });
        }

        // Search query
        if (filters.searchQuery) {
            const query = filters.searchQuery.toLowerCase();
            filtered = filtered.filter(ride =>
                (ride.source?.toLowerCase().includes(query)) ||
                (ride.destination?.toLowerCase().includes(query)) ||
                (ride.ride_id?.toString().includes(query)) ||
                (ride.booking_id?.toString().includes(query))
            );
        }

        setFilteredRides(filtered);
    };

    const getStatusColor = (status) => {
        const s = status?.toLowerCase();
        if (s === 'completed') return 'bg-green-100 text-green-700 border-green-200';
        if (s === 'confirmed') return 'bg-blue-100 text-blue-700 border-blue-200';
        if (s === 'cancelled') return 'bg-red-100 text-red-700 border-red-200';
        if (s === 'pending') return 'bg-amber-100 text-amber-700 border-amber-200';
        return 'bg-gray-100 text-gray-600 border-gray-200';
    };

    return (
        <div className="min-h-screen bg-gray-50 px-4 sm:px-6 py-8">
            <div className="max-w-6xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mb-8"
                >
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                            <History className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">
                                Ride History
                            </h1>
                            <p className="text-gray-600 text-sm">View and manage your past rides</p>
                        </div>
                    </div>
                </motion.div>

                {/* Filters Section */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.25 }}
                    className="mb-6 p-6 rounded-lg border border-gray-200 bg-white shadow-lg"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Filter className="w-5 h-5 text-blue-600" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Filters</h2>
                        </div>
                        <div className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200">
                            <span className="text-sm font-semibold text-gray-600">
                                Showing <span className="text-blue-600">{filteredRides.length}</span> of <span className="text-gray-900">{rides.length}</span> rides
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Status</label>
                            <select
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none transition-all cursor-pointer hover:border-gray-400"
                            >
                                <option value="all">All Status</option>
                                <option value="completed">Completed</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="pending">Pending</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">From Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none z-10" />
                                <input
                                    type="date"
                                    value={filters.dateFrom}
                                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none transition-all hover:border-gray-400"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">To Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none z-10" />
                                <input
                                    type="date"
                                    value={filters.dateTo}
                                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none transition-all hover:border-gray-400"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Search</label>
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-600 pointer-events-none z-10" />
                                <input
                                    type="text"
                                    value={filters.searchQuery}
                                    onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                                    placeholder="Location or ID"
                                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none transition-all hover:border-gray-400"
                                />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Rides List */}
                {loading ? (
                    <div className="text-center py-16">
                        <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto" />
                        <p className="mt-4 text-gray-500">Loading ride history...</p>
                    </div>
                ) : filteredRides.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-16 rounded-lg border border-gray-200 bg-white shadow-lg"
                    >
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                            <History className="w-10 h-10 text-gray-400" />
                        </div>
                        <p className="text-gray-900 font-semibold mb-2">No rides found</p>
                        <p className="text-sm text-gray-500">Try adjusting your filters</p>
                    </motion.div>
                ) : (
                    <div className="space-y-4">
                        {filteredRides.map((ride, idx) => (
                            <motion.div
                                key={ride.ride_id || ride.booking_id || idx}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                whileHover={{ y: -2 }}
                                className="p-6 rounded-lg border border-gray-200 bg-white shadow-lg hover:shadow-xl transition-all duration-200"
                            >
                                <div className="flex items-start justify-between mb-5">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${ride.type === 'driver'
                                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                                    : 'bg-green-100 text-green-700 border-green-200'
                                                }`}>
                                                {ride.type === 'driver' ? 'Driver' : 'Passenger'}
                                            </span>
                                            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${getStatusColor(ride.status || ride.booking_status)}`}>
                                                {ride.status || ride.booking_status || 'Unknown'}
                                            </span>
                                        </div>

                                        {/* Route Display */}
                                        <div className="space-y-3 mb-4">
                                            <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                                                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                                                    <MapPin className="w-4 h-4 text-green-600" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">From</p>
                                                    <p className="font-bold text-gray-900">{ride.source || 'N/A'}</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-center -my-2">
                                                <ArrowRight className="w-5 h-5 text-blue-600 rotate-90" />
                                            </div>
                                            <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                                                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                                                    <Navigation className="w-4 h-4 text-red-600" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">To</p>
                                                    <p className="font-bold text-gray-900">{ride.destination || 'N/A'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Price & ID */}
                                    <div className="ml-4 text-right">
                                        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 mb-3">
                                            <div className="flex items-center gap-2 justify-end mb-1">
                                                <DollarSign className="w-5 h-5 text-blue-600" />
                                                <span className="text-2xl font-bold text-blue-600">
                                                    ₹{ride.total_fare || ride.amount || '0'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">ID</p>
                                            <p className="text-xs font-bold text-gray-700">
                                                {ride.ride_id || ride.booking_id}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Info */}
                                <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200">
                                        <Calendar className="w-4 h-4 text-blue-600" />
                                        <span className="text-xs font-semibold text-gray-700">
                                            {new Date(ride.created_at || ride.booking_date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {ride.date && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200">
                                            <Clock className="w-4 h-4 text-blue-600" />
                                            <span className="text-xs font-semibold text-gray-700">
                                                {ride.date} {ride.time}
                                            </span>
                                        </div>
                                    )}
                                    {ride.distance_km && (
                                        <div className="px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200">
                                            <span className="text-xs font-semibold text-gray-700">
                                                {ride.distance_km} km
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RideHistory;