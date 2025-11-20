import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { paymentService } from '../services/paymentService';
import { walletService } from '../services/walletService';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { Wallet as WalletIcon, Plus, ArrowUp, ArrowDown, DollarSign, CreditCard } from 'lucide-react';

const Wallet = () => {
    const { user } = useAuth();
    const toast = useToast();
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [topupAmount, setTopupAmount] = useState('');

    useEffect(() => {
        loadWallet();
    }, [user?.user_id]);

    const loadWallet = async () => {
        if (!user?.user_id) return;
        try {
            const balanceResp = await walletService.getWalletBalance();
            setBalance(Number(balanceResp.balance) || 0);
            
            const txResp = await walletService.getTransactions();
            setTransactions(Array.isArray(txResp.transactions) ? txResp.transactions : []);
        } catch (err) {
            console.error('Failed to load wallet', err);
        }
    };

    const handleTopup = async () => {
        const amount = parseFloat(topupAmount);
        if (!amount || amount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }
        if (amount < 10) {
            toast.error('Minimum topup amount is ₹10');
            return;
        }
        
        try {
            setLoading(true);
            
            // Step 1: Create Razorpay order
            const orderData = await paymentService.walletTopup(amount);
            
            // Step 2: Initialize Razorpay
            const options = {
                key: orderData.data.key,
                amount: orderData.data.amount,
                currency: orderData.data.currency,
                name: 'Wallet Topup',
                description: `Add ₹${amount} to wallet`,
                order_id: orderData.data.order_id,
                handler: async function (response) {
                    try {
                        // Step 3: Verify payment
                        await paymentService.verifyWalletTopup({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            amount: amount
                        });
                        
                        toast.success(`₹${amount} added to wallet successfully!`);
                        setTopupAmount('');
                        loadWallet();
                    } catch (verifyErr) {
                        console.error('Payment verification error:', verifyErr);
                        toast.error('Payment verification failed. Please contact support.');
                    }
                },
                prefill: {
                    name: user?.name || '',
                    email: user?.email || '',
                    contact: user?.phone || ''
                },
                theme: {
                    color: '#0EA5E9'
                },
                modal: {
                    ondismiss: function() {
                        toast.error('Payment cancelled');
                        setLoading(false);
                    }
                }
            };
            
            const razorpay = new window.Razorpay(options);
            razorpay.open();
            
        } catch (err) {
            console.error('Topup error:', err);
            toast.error(err.response?.data?.message || 'Failed to initiate payment');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="container mx-auto max-w-4xl px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10">
                <h1 className="text-2xl sm:text-3xl font-extrabold mb-4 sm:mb-6 md:mb-8 text-white">My Wallet</h1>

                {/* Balance Card */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-gray-800 bg-gray-900 shadow-lg p-4 sm:p-6 md:p-8 mb-4 sm:mb-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-400 mb-1 sm:mb-2 text-sm sm:text-base">Wallet Balance</p>
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white">₹{balance.toFixed(2)}</h2>
                        </div>
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#0EA5E9] flex items-center justify-center shadow-md flex-shrink-0">
                            <WalletIcon className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                        </div>
                    </div>
                </motion.div>

                {/* Topup Section */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-xl border border-gray-800 bg-gray-900 shadow-lg p-4 sm:p-6 mb-4 sm:mb-6"
                >
                    <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-white">Top Up Wallet</h2>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="number"
                            placeholder="Enter amount"
                            value={topupAmount}
                            onChange={(e) => setTopupAmount(e.target.value)}
                            min="1"
                            step="0.01"
                            className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-800 border-2 border-gray-700 rounded-xl focus:border-[#0EA5E9] outline-none text-sm sm:text-base text-white placeholder:text-gray-500"
                        />
                        <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleTopup}
                            disabled={loading}
                            className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-[#0EA5E9] text-white rounded-xl font-semibold shadow-md flex items-center justify-center gap-2 text-sm sm:text-base hover:bg-[#0c94d6] transition-all duration-200"
                        >
                            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                            {loading ? 'Processing...' : 'Top Up'}
                        </motion.button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                        {[100, 500, 1000, 2000].map((amt) => (
                            <button
                                key={amt}
                                onClick={() => setTopupAmount(amt.toString())}
                                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-gray-800 border border-gray-700 rounded-lg hover:border-[#0EA5E9] transition-colors text-gray-300"
                            >
                                ₹{amt}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* Transactions */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-xl border border-gray-800 bg-gray-900 shadow-lg p-4 sm:p-6"
                >
                    <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-white">Transaction History</h2>
                    {transactions.length === 0 ? (
                        <div className="text-center py-10">
                            <CreditCard className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                            <p className="text-gray-400">No transactions yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {transactions.map((tx) => (
                                <div
                                    key={tx.tx_id}
                                    className="flex items-center justify-between p-3 sm:p-4 rounded-xl border border-gray-800 bg-gray-800"
                                >
                                    <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                                        {tx.type === 'topup' ? (
                                            <ArrowDown className="w-5 h-5 sm:w-6 sm:h-6 text-green-500 flex-shrink-0" />
                                        ) : tx.type === 'refund' ? (
                                            <ArrowUp className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 flex-shrink-0" />
                                        ) : (
                                            <ArrowUp className="w-5 h-5 sm:w-6 sm:h-6 text-red-500 rotate-180 flex-shrink-0" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold capitalize text-sm sm:text-base truncate text-white">{tx.type}</p>
                                            <p className="text-xs sm:text-sm text-gray-400 truncate">
                                                {new Date(tx.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-2">
                                        <p className={`font-bold text-sm sm:text-base ${tx.type === 'debit' ? 'text-red-500' : 'text-green-500'}`}>
                                            {tx.type === 'debit' ? '-' : '+'}₹{Math.abs(Number(tx.amount)).toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default Wallet;
