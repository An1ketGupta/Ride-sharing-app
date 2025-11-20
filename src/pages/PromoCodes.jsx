import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { Tag, Percent, Calendar, Check, X, Copy } from 'lucide-react';
import api from '../config/api';

const PromoCodes = () => {
    const [promoCodes, setPromoCodes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [applyCode, setApplyCode] = useState('');
    const { user } = useAuth();
    const toast = useToast();

    useEffect(() => {
        loadPromoCodes();
    }, []);

    const loadPromoCodes = async () => {
        setLoading(true);
        try {
            const response = await api.get('/promo-codes');
            setPromoCodes(Array.isArray(response.data?.data) ? response.data.data : []);
        } catch (err) {
            toast.error('Failed to load promo codes');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (code) => {
        navigator.clipboard.writeText(code);
        toast.success('Promo code copied!');
    };

    const handleApply = async () => {
        if (!applyCode.trim()) {
            toast.error('Enter a promo code');
            return;
        }
        try {
            const response = await api.post('/promo-codes/apply', { code: applyCode });
            toast.success(response.data?.message || 'Promo code applied!');
            setApplyCode('');
            loadPromoCodes();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Invalid or expired promo code');
        }
    };

    const isExpired = (expiryDate) => {
        if (!expiryDate) return false;
        return new Date(expiryDate) < new Date();
    };

    const isActive = (promo) => {
        if (!promo.is_active) return false;
        if (isExpired(promo.expiry_date)) return false;
        if (promo.max_uses && promo.used_count >= promo.max_uses) return false;
        return true;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-6">
            <div className="max-w-5xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent mb-2">
                        Promo Codes
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">Save more on your rides with exclusive offers</p>
                </motion.div>

                {/* Apply Promo Code Section */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                >
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Tag className="w-5 h-5 text-green-600" />
                        Have a Promo Code?
                    </h2>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={applyCode}
                            onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                            placeholder="Enter promo code"
                            className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-green-500 outline-none uppercase"
                        />
                        <button
                            onClick={handleApply}
                            className="px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all"
                        >
                            Apply
                        </button>
                    </div>
                </motion.div>

                {/* Available Promo Codes */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full mx-auto"></div>
                        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading promo codes...</p>
                    </div>
                ) : promoCodes.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-lg"
                    >
                        <Tag className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">No promo codes available</p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Check back later for exciting offers</p>
                    </motion.div>
                ) : (
                    <div className="grid gap-4">
                        {promoCodes.map((promo, idx) => {
                            const active = isActive(promo);
                            const expired = isExpired(promo.expiry_date);
                            
                            return (
                                <motion.div
                                    key={promo.promo_id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={`p-6 rounded-xl shadow-lg hover:shadow-xl transition-all ${
                                        active 
                                            ? 'bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20' 
                                            : 'bg-gray-100 dark:bg-gray-800 opacity-60'
                                    }`}
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="px-4 py-2 bg-white dark:bg-gray-700 rounded-lg border-2 border-dashed border-green-500 dark:border-green-400">
                                                    <code className="text-lg font-bold text-green-600 dark:text-green-400">
                                                        {promo.code}
                                                    </code>
                                                </div>
                                                <button
                                                    onClick={() => handleCopy(promo.code)}
                                                    className="p-2 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
                                                    title="Copy code"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                                {active ? (
                                                    <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold rounded-full flex items-center gap-1">
                                                        <Check className="w-3 h-3" />
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-semibold rounded-full flex items-center gap-1">
                                                        <X className="w-3 h-3" />
                                                        {expired ? 'Expired' : 'Inactive'}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-gray-700 dark:text-gray-300 mb-3">
                                                {promo.description || 'Special discount offer'}
                                            </p>
                                            <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                                                <div className="flex items-center gap-2">
                                                    <Percent className="w-4 h-4 text-green-600" />
                                                    <span>
                                                        {promo.discount_type === 'percentage' 
                                                            ? `${promo.discount_value}% off` 
                                                            : `₹${promo.discount_value} off`}
                                                    </span>
                                                </div>
                                                {promo.expiry_date && (
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="w-4 h-4 text-blue-600" />
                                                        <span>Valid till {new Date(promo.expiry_date).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                                {promo.max_uses && (
                                                    <div className="flex items-center gap-2">
                                                        <Tag className="w-4 h-4 text-purple-600" />
                                                        <span>{promo.used_count || 0}/{promo.max_uses} used</span>
                                                    </div>
                                                )}
                                            </div>
                                            {promo.min_ride_amount && (
                                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                                                    * Minimum ride amount: ₹{promo.min_ride_amount}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PromoCodes;
