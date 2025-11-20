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
            toast.error('Please enter a promo code');
            return;
        }
        try {
            const response = await api.post('/promo-codes/apply', { code: applyCode });
            toast.success(response.data?.message || 'Promo code applied successfully!');
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

    const activePromos = promoCodes.filter(promo => isActive(promo));
    const inactivePromos = promoCodes.filter(promo => !isActive(promo));

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="container mx-auto max-w-4xl px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mb-6 sm:mb-8"
                >
                    <h1 className="text-2xl sm:text-3xl font-extrabold mb-2 text-white">Promo Codes</h1>
                    <p className="text-white/60 text-sm sm:text-base">Save more on your rides with exclusive offers</p>
                </motion.div>

                {/* Apply Promo Code Section */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.25 }}
                    className="rounded-xl border border-gray-800 bg-gray-900 shadow-lg p-4 sm:p-6 mb-4 sm:mb-6"
                >
                    <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-white flex items-center gap-2">
                        <Tag className="w-5 h-5 text-[#0EA5E9]" />
                        Have a Promo Code?
                    </h2>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            value={applyCode}
                            onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                            placeholder="Enter promo code"
                            className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-800 border-2 border-gray-700 rounded-xl focus:border-[#0EA5E9] focus:ring-4 focus:ring-[#0EA5E9]/10 outline-none text-sm sm:text-base text-white placeholder:text-gray-500 uppercase font-semibold tracking-wider"
                            onKeyPress={(e) => e.key === 'Enter' && handleApply()}
                        />
                        <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleApply}
                            className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-[#0EA5E9] text-white rounded-xl font-semibold shadow-md hover:bg-[#0c94d6] transition-all duration-200 text-sm sm:text-base"
                        >
                            Apply
                        </motion.button>
                    </div>
                </motion.div>

                {/* Loading State */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-[#0EA5E9]/30 border-t-[#0EA5E9] rounded-full animate-spin" />
                            <p className="text-white/60">Loading promo codes...</p>
                        </div>
                    </div>
                ) : promoCodes.length === 0 ? (
                    // Empty State
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.25 }}
                        className="rounded-xl border border-gray-800 bg-gray-900 shadow-lg p-12 text-center"
                    >
                        <Tag className="w-16 h-16 mx-auto mb-4 text-white/40" />
                        <h3 className="text-xl font-semibold mb-2 text-white">No promo codes available</h3>
                        <p className="text-white/60">Check back later for exciting offers</p>
                    </motion.div>
                ) : (
                    <div className="space-y-6">
                        {/* Active Promo Codes */}
                        {activePromos.length > 0 && (
                            <div>
                                <h2 className="text-xl font-bold mb-4 text-white">Active Offers ({activePromos.length})</h2>
                                <div className="grid gap-4">
                                    {activePromos.map((promo, idx) => (
                                        <motion.div
                                            key={promo.promo_id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.05, duration: 0.25 }}
                                            whileHover={{ y: -2 }}
                                            className="rounded-xl border border-gray-800 bg-gray-900 shadow-lg p-4 sm:p-6 hover:border-[#0EA5E9]/30 hover:bg-[#1A1A1A] transition-all duration-200"
                                        >
                                            <div className="flex items-start justify-between gap-4 mb-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                                                        <div className="px-4 py-2 bg-gray-800 border-2 border-dashed border-[#0EA5E9] rounded-xl">
                                                            <code className="text-lg sm:text-xl font-bold text-[#0EA5E9] tracking-wider">
                                                                {promo.code}
                                                            </code>
                                                        </div>
                                                        <button
                                                            onClick={() => handleCopy(promo.code)}
                                                            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                                                            title="Copy code"
                                                        >
                                                            <Copy className="w-4 h-4 text-white/60 hover:text-[#0EA5E9]" />
                                                        </button>
                                                        <span className="px-3 py-1 bg-[#10b981]/20 text-[#10b981] text-xs font-semibold rounded-full flex items-center gap-1.5 border border-[#10b981]/30">
                                                            <Check className="w-3.5 h-3.5" />
                                                            ACTIVE
                                                        </span>
                                                    </div>
                                                    <p className="text-white mb-3 font-medium">
                                                        {promo.description || 'Special discount offer'}
                                                    </p>
                                                    <div className="flex flex-wrap gap-4 text-sm text-white/60 mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <Percent className="w-4 h-4 text-[#10b981]" />
                                                            <span className="font-semibold text-white">
                                                                {promo.discount_type === 'percentage' 
                                                                    ? `${promo.discount_value}% off` 
                                                                    : `₹${promo.discount_value} off`}
                                                            </span>
                                                        </div>
                                                        {promo.expiry_date && (
                                                            <div className="flex items-center gap-2">
                                                                <Calendar className="w-4 h-4 text-[#0EA5E9]" />
                                                                <span>Valid till {new Date(promo.expiry_date).toLocaleDateString()}</span>
                                                            </div>
                                                        )}
                                                        {promo.max_uses && (
                                                            <div className="flex items-center gap-2">
                                                                <Tag className="w-4 h-4 text-purple-400" />
                                                                <span>{promo.used_count || 0}/{promo.max_uses} used</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {promo.min_ride_amount && (
                                                        <p className="text-xs text-white/50 mt-2">
                                                            * Minimum ride amount: ₹{promo.min_ride_amount}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Inactive/Expired Promo Codes */}
                        {inactivePromos.length > 0 && (
                            <div>
                                <h2 className="text-xl font-bold mb-4 text-white/60">Expired Offers ({inactivePromos.length})</h2>
                                <div className="grid gap-4">
                                    {inactivePromos.map((promo, idx) => {
                                        const expired = isExpired(promo.expiry_date);
                                        return (
                                            <motion.div
                                                key={promo.promo_id}
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.05, duration: 0.25 }}
                                                className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 sm:p-6 opacity-60"
                                            >
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                            <code className="text-lg font-bold text-white/40 tracking-wider">
                                                                {promo.code}
                                                            </code>
                                                            <span className="px-3 py-1 bg-[#ef4444]/20 text-[#ef4444] text-xs font-semibold rounded-full flex items-center gap-1.5 border border-[#ef4444]/30">
                                                                <X className="w-3.5 h-3.5" />
                                                                {expired ? 'EXPIRED' : 'INACTIVE'}
                                                            </span>
                                                        </div>
                                                        <p className="text-white/40 text-sm">
                                                            {promo.description || 'Special discount offer'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PromoCodes;
