import { useEffect, useState } from 'react';
import { safetyService } from '../services/safetyService';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { ShieldCheck, AlertTriangle, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SafetyCheck = () => {
    const { user } = useAuth();
    const toast = useToast();
    const [pendingChecks, setPendingChecks] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user?.user_id) {
            loadPendingChecks();
            // Refresh every 30 seconds
            const interval = setInterval(loadPendingChecks, 30000);
            return () => clearInterval(interval);
        }
    }, [user?.user_id]);

    const loadPendingChecks = async () => {
        try {
            setLoading(true);
            const response = await safetyService.getPendingSafetyChecks();
            setPendingChecks(response.data || []);
        } catch (error) {
            console.error('Failed to load pending safety checks:', error);
        } finally {
            setLoading(false);
        }
    };

    const confirmSafety = async (bookingId) => {
        try {
            await safetyService.confirmSafety(bookingId);
            toast.success('Thank you for confirming your safety!');
            // Remove from pending list
            setPendingChecks(prev => prev.filter(check => check.booking_id !== bookingId));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to confirm safety');
        }
    };

    const reportUnsafe = async (bookingId) => {
        if (!window.confirm('Are you sure you want to report that you are NOT SAFE? This will immediately notify our safety team and administrators.')) {
            return;
        }

        try {
            await safetyService.reportUnsafe(bookingId);
            toast.success('Safety alert sent! Our team has been notified and will contact you shortly. If this is an emergency, please call 911 immediately.');
            // Remove from pending list
            setPendingChecks(prev => prev.filter(check => check.booking_id !== bookingId));
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to report unsafe situation');
        }
    };

    if (pendingChecks.length === 0) {
        return null; // Don't show anything if no pending checks
    }

    return (
        <div className="mb-6 space-y-4">
            {pendingChecks.map((check) => {
                const completedAt = new Date(check.ride_completed_at);
                const now = new Date();
                const hoursSinceCompletion = (now - completedAt) / (1000 * 60 * 60);

                return (
                    <motion.div
                        key={check.safety_check_id}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-6 rounded-xl border-2 ${hoursSinceCompletion >= 1
                                ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                                : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-xl ${hoursSinceCompletion >= 1
                                    ? 'bg-red-100 dark:bg-red-900/40'
                                    : 'bg-yellow-100 dark:bg-yellow-900/40'
                                }`}>
                                {hoursSinceCompletion >= 1 ? (
                                    <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                ) : (
                                    <ShieldCheck className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold mb-2">
                                    {hoursSinceCompletion >= 1 ? 'Urgent: Safety Check Required' : 'Night Ride Safety Check'}
                                </h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                                    Your ride from <strong>{check.source}</strong> to <strong>{check.destination}</strong> has been completed.
                                    {hoursSinceCompletion >= 1 && (
                                        <span className="block mt-2 text-red-600 dark:text-red-400 font-semibold">
                                            ⚠️ Please confirm your safety immediately. If you don't confirm, we will contact your emergency contact.
                                        </span>
                                    )}
                                </p>
                                <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400 mb-4">
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        Completed {completedAt.toLocaleString()}
                                    </div>
                                    {check.passenger_called && (
                                        <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                                            <AlertTriangle className="w-4 h-4" />
                                            Call attempted
                                        </div>
                                    )}
                                    {check.emergency_contact_called && (
                                        <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                            <AlertTriangle className="w-4 h-4" />
                                            Emergency contact notified
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-3 flex-wrap">
                                    <button
                                        onClick={() => confirmSafety(check.booking_id)}
                                        className={`px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all ${hoursSinceCompletion >= 1
                                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                                : 'bg-green-600 hover:bg-green-700 text-white'
                                            }`}
                                    >
                                        <CheckCircle className="w-5 h-5" />
                                        I'm Safe - Confirm Safety
                                    </button>
                                    <button
                                        onClick={() => reportUnsafe(check.booking_id)}
                                        className="px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all bg-red-700 hover:bg-red-800 text-white border-2 border-red-800"
                                    >
                                        <AlertCircle className="w-5 h-5" />
                                        I Am NOT Safe
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
};

export default SafetyCheck;




