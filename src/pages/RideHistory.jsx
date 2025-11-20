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
        if (s === 'completed') return 'bg-[#10b981]/20 text-[#10b981] border-[#10b981]/30';
        if (s === 'confirmed') return 'bg-[#0EA5E9]/20 text-[#0EA5E9] border-[#0EA5E9]/30';
        if (s === 'cancelled') return 'bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30';
        if (s === 'pending') return 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30';
        return 'bg-[#1A1A1A] text-white/60 border-[#1A1A1A]';
    };

    return (
        <div className="min-h-screen bg-[#000000] p-6 sm:p-8">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0EA5E9]/20 to-[#0891b2]/20 border-2 border-dashed border-[#0EA5E9]/40 flex items-center justify-center">
                            <History className="w-6 h-6 text-[#0EA5E9]" />
                        </div>
                        <div>
                            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-[#0EA5E9] to-[#0891b2] bg-clip-text text-transparent mb-1">
                                Ride History
                            </h1>
                            <p className="text-white/60 text-sm">View and manage your past rides</p>
                        </div>
                    </div>
                </motion.div>

                {/* Filters Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-6 rounded-2xl border border-[#1A1A1A] bg-gradient-to-br from-[#111111] to-[#0A0A0A] shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#0EA5E9]/10 border border-[#0EA5E9]/20 flex items-center justify-center">
                                <Filter className="w-5 h-5 text-[#0EA5E9]" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Filters</h2>
                        </div>
                        <div className="px-4 py-2 rounded-xl bg-[#1A1A1A] border border-[#1F1F1F]">
                            <span className="text-sm font-semibold text-white/80">
                                Showing <span className="text-[#0EA5E9]">{filteredRides.length}</span> of <span className="text-white">{rides.length}</span> rides
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Status</label>
                            <div className="relative">
                                <select
                                    value={filters.status}
                                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-[#1A1A1A] bg-[#0A0A0A] text-white focus:border-[#0EA5E9]/40 focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none transition-all cursor-pointer hover:border-[#1F1F1F]"
                                >
                                    <option value="all" className="bg-[#0A0A0A]">All Status</option>
                                    <option value="completed" className="bg-[#0A0A0A]">Completed</option>
                                    <option value="confirmed" className="bg-[#0A0A0A]">Confirmed</option>
                                    <option value="pending" className="bg-[#0A0A0A]">Pending</option>
                                    <option value="cancelled" className="bg-[#0A0A0A]">Cancelled</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">From Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0EA5E9] pointer-events-none z-10" />
                                <input
                                    type="date"
                                    value={filters.dateFrom}
                                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-dashed border-[#1A1A1A] bg-[#0A0A0A] text-white focus:border-[#0EA5E9]/40 focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none transition-all hover:border-[#1F1F1F]"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">To Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0EA5E9] pointer-events-none z-10" />
                                <input
                                    type="date"
                                    value={filters.dateTo}
                                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-dashed border-[#1A1A1A] bg-[#0A0A0A] text-white focus:border-[#0EA5E9]/40 focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none transition-all hover:border-[#1F1F1F]"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Search</label>
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0EA5E9] pointer-events-none z-10" />
                                <input
                                    type="text"
                                    value={filters.searchQuery}
                                    onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                                    placeholder="Location or ID"
                                    className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-dashed border-[#1A1A1A] bg-[#0A0A0A] text-white placeholder:text-white/40 focus:border-[#0EA5E9]/40 focus:ring-2 focus:ring-[#0EA5E9]/20 outline-none transition-all hover:border-[#1F1F1F]"
                                />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Rides List */}
                {loading ? (
                    <div className="text-center py-16">
                        <div className="animate-spin w-12 h-12 border-4 border-[#0EA5E9] border-t-transparent rounded-full mx-auto"></div>
                        <p className="mt-4 text-white/60">Loading ride history...</p>
                    </div>
                ) : filteredRides.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-16 rounded-2xl border border-[#1A1A1A] bg-gradient-to-br from-[#111111] to-[#0A0A0A] shadow-lg"
                    >
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[#1A1A1A] flex items-center justify-center">
                            <History className="w-10 h-10 text-white/20" />
                        </div>
                        <p className="text-white font-semibold mb-2">No rides found</p>
                        <p className="text-sm text-white/50">Try adjusting your filters</p>
                    </motion.div>
                ) : (
                    <div className="space-y-4">
                        {filteredRides.map((ride, idx) => (
                            <motion.div
                                key={ride.ride_id || ride.booking_id || idx}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                whileHover={{ scale: 1.01, y: -2 }}
                                className="p-6 rounded-2xl border border-[#1A1A1A] bg-gradient-to-br from-[#111111] to-[#0A0A0A] shadow-lg hover:shadow-xl transition-all duration-200"
                            >
                                <div className="flex items-start justify-between mb-5">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 border-dashed ${
                                                ride.type === 'driver' 
                                                    ? 'bg-[#0EA5E9]/10 text-[#0EA5E9] border-[#0EA5E9]/30'
                                                    : 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/30'
                                            }`}>
                                                {ride.type === 'driver' ? 'Driver' : 'Passenger'}
                                            </span>
                                            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 border-dashed ${getStatusColor(ride.status || ride.booking_status)}`}>
                                                {ride.status || ride.booking_status || 'Unknown'}
                                            </span>
                                        </div>
                                        
                                        {/* Route Display */}
                                        <div className="space-y-3 mb-4">
                                            <div className="flex items-start gap-3 p-3 rounded-xl bg-[#0A0A0A] border border-[#1A1A1A]">
                                                <div className="w-8 h-8 rounded-lg bg-[#10b981]/10 border-2 border-dashed border-[#10b981]/30 flex items-center justify-center flex-shrink-0">
                                                    <MapPin className="w-4 h-4 text-[#10b981]" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-1">From</p>
                                                    <p className="font-bold text-white">{ride.source || 'N/A'}</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-center -my-2">
                                                <ArrowRight className="w-5 h-5 text-[#0EA5E9] rotate-90" />
                                            </div>
                                            <div className="flex items-start gap-3 p-3 rounded-xl bg-[#0A0A0A] border border-[#1A1A1A]">
                                                <div className="w-8 h-8 rounded-lg bg-[#ef4444]/10 border-2 border-dashed border-[#ef4444]/30 flex items-center justify-center flex-shrink-0">
                                                    <Navigation className="w-4 h-4 text-[#ef4444]" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-1">To</p>
                                                    <p className="font-bold text-white">{ride.destination || 'N/A'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Price & ID */}
                                    <div className="ml-4 text-right">
                                        <div className="p-4 rounded-xl bg-gradient-to-br from-[#0EA5E9]/10 to-[#0891b2]/10 border-2 border-dashed border-[#0EA5E9]/30 mb-3">
                                            <div className="flex items-center gap-2 justify-end mb-1">
                                                <DollarSign className="w-5 h-5 text-[#0EA5E9]" />
                                                <span className="text-2xl font-bold bg-gradient-to-r from-[#0EA5E9] to-[#0891b2] bg-clip-text text-transparent">
                                                    {ride.total_fare || ride.amount || '0'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#1F1F1F]">
                                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-0.5">ID</p>
                                            <p className="text-xs font-bold text-white/80">
                                                {ride.ride_id || ride.booking_id}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Footer Info */}
                                <div className="flex items-center gap-4 pt-4 border-t border-[#1A1A1A]">
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#1F1F1F]">
                                        <Calendar className="w-4 h-4 text-[#0EA5E9]" />
                                        <span className="text-xs font-semibold text-white/80">
                                            {new Date(ride.created_at || ride.booking_date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {ride.date && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#1F1F1F]">
                                            <Clock className="w-4 h-4 text-[#0EA5E9]" />
                                            <span className="text-xs font-semibold text-white/80">
                                                {ride.date} {ride.time}
                                            </span>
                                        </div>
                                    )}
                                    {ride.distance_km && (
                                        <div className="px-3 py-1.5 rounded-lg bg-[#1A1A1A] border border-[#1F1F1F]">
                                            <span className="text-xs font-semibold text-white/80">
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