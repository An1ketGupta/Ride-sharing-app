import { useState, useEffect } from 'react';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { 
    TrendingUp, Users, Car, DollarSign, MapPin, Calendar, 
    Activity, AlertCircle, CheckCircle, XCircle, Clock 
} from 'lucide-react';
import api from '../config/api';

const AdminAnalytics = () => {
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({
        totalUsers: 0,
        totalDrivers: 0,
        totalPassengers: 0,
        totalRides: 0,
        completedRides: 0,
        cancelledRides: 0,
        totalRevenue: 0,
        avgRating: 0,
        activeRides: 0,
        pendingDocuments: 0
    });
    const [recentActivity, setRecentActivity] = useState([]);
    const [topDrivers, setTopDrivers] = useState([]);
    const [revenueData, setRevenueData] = useState([]);
    const toast = useToast();

    useEffect(() => {
        loadAnalytics();
    }, []);

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            // Fetch various analytics endpoints
            const [usersRes, ridesRes, bookingsRes, feedbackRes, docsRes] = await Promise.allSettled([
                api.get('/admin/users/stats'),
                api.get('/admin/rides/stats'),
                api.get('/admin/bookings/stats'),
                api.get('/admin/feedback/stats'),
                api.get('/admin/documents/pending')
            ]);

            // Process users stats
            if (usersRes.status === 'fulfilled') {
                const data = usersRes.value.data?.data || {};
                setStats(prev => ({
                    ...prev,
                    totalUsers: data.total || 0,
                    totalDrivers: data.drivers || 0,
                    totalPassengers: data.passengers || 0
                }));
            }

            // Process rides stats
            if (ridesRes.status === 'fulfilled') {
                const data = ridesRes.value.data?.data || {};
                setStats(prev => ({
                    ...prev,
                    totalRides: data.total || 0,
                    completedRides: data.completed || 0,
                    cancelledRides: data.cancelled || 0,
                    activeRides: data.active || 0,
                    totalRevenue: data.revenue || 0
                }));
            }

            // Process feedback stats
            if (feedbackRes.status === 'fulfilled') {
                const data = feedbackRes.value.data?.data || {};
                setStats(prev => ({
                    ...prev,
                    avgRating: data.avgRating || 0
                }));
                setTopDrivers(data.topDrivers || []);
            }

            // Process pending documents
            if (docsRes.status === 'fulfilled') {
                const data = docsRes.value.data?.data || [];
                setStats(prev => ({
                    ...prev,
                    pendingDocuments: Array.isArray(data) ? data.length : 0
                }));
            }

            // Mock recent activity (replace with actual endpoint)
            setRecentActivity([
                { type: 'ride', message: 'New ride created', time: '2 mins ago' },
                { type: 'booking', message: 'Booking confirmed', time: '5 mins ago' },
                { type: 'user', message: 'New user registered', time: '10 mins ago' }
            ]);

        } catch (err) {
            toast.error('Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    const StatCard = ({ title, value, icon: Icon, color, trend }) => (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all"
        >
            <div className="flex items-start justify-between mb-4">
                <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{title}</p>
                    <p className="text-3xl font-bold">{value}</p>
                </div>
                <div className={`p-3 rounded-lg ${color}`}>
                    <Icon className="w-6 h-6 text-gray-900" />
                </div>
            </div>
            {trend && (
                <div className="flex items-center gap-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span className="text-green-600 font-semibold">{trend}</span>
                    <span className="text-gray-500">vs last month</span>
                </div>
            )}
        </motion.div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-6">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                        Admin Analytics
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">Platform overview and insights</p>
                </motion.div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading analytics...</p>
                    </div>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                            <StatCard
                                title="Total Users"
                                value={stats.totalUsers}
                                icon={Users}
                                color="bg-gradient-to-br from-blue-500 to-blue-600"
                                trend="+12%"
                            />
                            <StatCard
                                title="Total Rides"
                                value={stats.totalRides}
                                icon={Car}
                                color="bg-gradient-to-br from-green-500 to-green-600"
                                trend="+8%"
                            />
                            <StatCard
                                title="Total Revenue"
                                value={`₹${stats.totalRevenue.toLocaleString()}`}
                                icon={DollarSign}
                                color="bg-gradient-to-br from-purple-500 to-purple-600"
                                trend="+15%"
                            />
                            <StatCard
                                title="Avg Rating"
                                value={stats.avgRating.toFixed(1)}
                                icon={Activity}
                                color="bg-gradient-to-br from-orange-500 to-orange-600"
                            />
                        </div>

                        {/* Secondary Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold">Ride Status</h3>
                                    <MapPin className="w-5 h-5 text-blue-600" />
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                            Completed
                                        </span>
                                        <span className="font-bold">{stats.completedRides}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-blue-600" />
                                            Active
                                        </span>
                                        <span className="font-bold">{stats.activeRides}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm flex items-center gap-2">
                                            <XCircle className="w-4 h-4 text-red-600" />
                                            Cancelled
                                        </span>
                                        <span className="font-bold">{stats.cancelledRides}</span>
                                    </div>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold">User Distribution</h3>
                                    <Users className="w-5 h-5 text-purple-600" />
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">Drivers</span>
                                        <span className="font-bold">{stats.totalDrivers}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">Passengers</span>
                                        <span className="font-bold">{stats.totalPassengers}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">Pending Docs</span>
                                        <span className="font-bold text-orange-600">{stats.pendingDocuments}</span>
                                    </div>
                                </div>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold">Recent Activity</h3>
                                    <Activity className="w-5 h-5 text-green-600" />
                                </div>
                                <div className="space-y-3">
                                    {recentActivity.map((activity, idx) => (
                                        <div key={idx} className="text-sm">
                                            <p className="font-medium">{activity.message}</p>
                                            <p className="text-xs text-gray-500">{activity.time}</p>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </div>

                        {/* Top Drivers */}
                        {topDrivers.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                            >
                                <h3 className="font-semibold mb-4 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-green-600" />
                                    Top Rated Drivers
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {topDrivers.slice(0, 3).map((driver, idx) => (
                                        <div key={idx} className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg">
                                            <p className="font-bold">{driver.name}</p>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                Rating: {driver.rating}/5 ({driver.totalRides} rides)
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Quick Actions */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="mt-8 p-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg text-gray-900"
                        >
                            <h3 className="font-semibold mb-4">Quick Actions</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <button className="px-4 py-3 bg-white/20 hover:bg-white/30 rounded-lg transition-all font-semibold">
                                    View All Users
                                </button>
                                <button className="px-4 py-3 bg-white/20 hover:bg-white/30 rounded-lg transition-all font-semibold">
                                    Manage Documents
                                </button>
                                <button className="px-4 py-3 bg-white/20 hover:bg-white/30 rounded-lg transition-all font-semibold">
                                    View Reports
                                </button>
                                <button className="px-4 py-3 bg-white/20 hover:bg-white/30 rounded-lg transition-all font-semibold">
                                    System Settings
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminAnalytics;
