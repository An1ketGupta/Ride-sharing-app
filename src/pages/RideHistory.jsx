import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { History, Filter, Calendar, MapPin, Clock, Search } from 'lucide-react';
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
        if (s === 'completed') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
        if (s === 'confirmed') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
        if (s === 'cancelled') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
        if (s === 'pending') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400';
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-6">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2 flex items-center gap-3">
                        <History className="w-10 h-10 text-purple-600" />
                        Ride History
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">View and manage your past rides</p>
                </motion.div>

                {/* Filters Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Filter className="w-5 h-5 text-purple-600" />
                            Filters
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Status</label>
                            <select
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-purple-500 outline-none"
                            >
                                <option value="all">All Status</option>
                                <option value="completed">Completed</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="pending">Pending</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">From Date</label>
                            <input
                                type="date"
                                value={filters.dateFrom}
                                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">To Date</label>
                            <input
                                type="date"
                                value={filters.dateTo}
                                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Search</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={filters.searchQuery}
                                    onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                                    placeholder="Location or ID"
                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                        Showing {filteredRides.length} of {rides.length} rides
                    </div>
                </motion.div>

                {/* Rides List */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto"></div>
                        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading ride history...</p>
                    </div>
                ) : filteredRides.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                    >
                        <History className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">No rides found</p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Try adjusting your filters</p>
                    </motion.div>
                ) : (
                    <div className="space-y-4">
                        {filteredRides.map((ride, idx) => (
                            <motion.div
                                key={ride.ride_id || ride.booking_id || idx}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.03 }}
                                className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                                ride.type === 'driver' 
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                            }`}>
                                                {ride.type === 'driver' ? 'Driver' : 'Passenger'}
                                            </span>
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(ride.status || ride.booking_status)}`}>
                                                {ride.status || ride.booking_status || 'Unknown'}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                            <div className="flex items-start gap-2">
                                                <MapPin className="w-4 h-4 text-green-600 mt-1 flex-shrink-0" />
                                                <div>
                                                    <p className="text-xs text-gray-500 dark:text-gray-500">From</p>
                                                    <p className="font-semibold">{ride.source || 'N/A'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <MapPin className="w-4 h-4 text-red-600 mt-1 flex-shrink-0" />
                                                <div>
                                                    <p className="text-xs text-gray-500 dark:text-gray-500">To</p>
                                                    <p className="font-semibold">{ride.destination || 'N/A'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-2 text-2xl font-bold text-purple-600 dark:text-purple-400">
                                            ₹{ride.total_fare || ride.amount || '0'}
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                            ID: {ride.ride_id || ride.booking_id}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4" />
                                        {new Date(ride.created_at || ride.booking_date).toLocaleDateString()}
                                    </div>
                                    {ride.date && (
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-4 h-4" />
                                            {ride.date} {ride.time}
                                        </div>
                                    )}
                                    {ride.distance_km && (
                                        <div>
                                            {ride.distance_km} km
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