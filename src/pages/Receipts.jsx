import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { receiptService } from '../services/receiptService';
import { bookingService } from '../services/bookingService';
import { useToast } from '../components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, Download, Mail, MapPin, DollarSign, CreditCard } from 'lucide-react';

const Receipts = () => {
    const { user } = useAuth();
    const toast = useToast();
    const [bookings, setBookings] = useState([]);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [receipt, setReceipt] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadBookings();
    }, [user?.user_id]);

    const loadBookings = async () => {
        if (!user?.user_id) return;
        try {
            setLoading(true);
            const response = await bookingService.getMyBookings();
            // Show bookings with completed payments OR completed booking status
            const receiptsData = (Array.isArray(response.data) ? response.data : []).filter(
                (b) => {
                    const status = (b.booking_status || '').toLowerCase();
                    const paymentStatus = (b.payment_status || '').toLowerCase();
                    // Include bookings with completed status OR completed payment
                    return status === 'completed' ||
                        status === 'confirmed' ||
                        paymentStatus === 'completed';
                }
            );
            setBookings(receiptsData);
        } catch (err) {
            toast.error('Failed to load bookings');
        } finally {
            setLoading(false);
        }
    };

    const loadReceipt = async (bookingId) => {
        try {
            setLoading(true);
            const response = await receiptService.getReceipt(bookingId);
            setReceipt(response.data || response);
            setSelectedBooking(bookingId);
        } catch (err) {
            toast.error('Failed to load receipt');
        } finally {
            setLoading(false);
        }
    };

    const handleEmailReceipt = async (bookingId) => {
        try {
            await receiptService.emailReceipt(bookingId);
            toast.success('Receipt emailed successfully');
        } catch (err) {
            toast.error('Failed to email receipt');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 px-4 sm:px-6 py-8 max-w-6xl mx-auto">
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
            >
                <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8 text-gray-900">My Receipts</h1>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bookings List */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.25 }}
                >
                    <h2 className="text-lg sm:text-xl font-bold mb-4 text-gray-900">Completed Bookings</h2>
                    {loading && bookings.length === 0 ? (
                        <div className="text-center py-20 rounded-lg border border-gray-200 bg-white">
                            <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto" />
                        </div>
                    ) : bookings.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-white shadow-lg p-10 text-center">
                            <Receipt className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                            <p className="text-gray-500">No completed bookings yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {bookings.map((booking, index) => (
                                <motion.div
                                    key={booking.booking_id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    whileHover={{ y: -2 }}
                                    onClick={() => loadReceipt(booking.booking_id)}
                                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedBooking === booking.booking_id
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-gray-900 truncate">Booking #{booking.booking_id}</p>
                                            <p className="text-sm text-gray-500">₹{booking.amount}</p>
                                        </div>
                                        <Receipt className={`w-6 h-6 ${selectedBooking === booking.booking_id ? 'text-blue-600' : 'text-gray-400'}`} />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Receipt Display */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.25 }}
                >
                    <h2 className="text-lg sm:text-xl font-bold mb-4 text-gray-900">Receipt</h2>
                    <AnimatePresence mode="wait">
                        {!selectedBooking ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="rounded-lg border border-gray-200 bg-white shadow-lg p-10 text-center"
                            >
                                <Receipt className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                <p className="text-gray-500">Select a booking to view receipt</p>
                            </motion.div>
                        ) : receipt ? (
                            <motion.div
                                key="receipt"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="rounded-lg border border-gray-200 bg-white shadow-lg p-6"
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-2xl font-bold text-gray-900">Receipt</h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEmailReceipt(selectedBooking)}
                                            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                                            title="Email receipt"
                                        >
                                            <Mail className="w-5 h-5 text-gray-600" />
                                        </button>
                                        <button
                                            onClick={() => window.print()}
                                            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                                            title="Download receipt"
                                        >
                                            <Download className="w-5 h-5 text-gray-600" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-gray-50 rounded-lg">
                                            <p className="text-sm text-gray-500">Booking ID</p>
                                            <p className="font-semibold text-gray-900">#{receipt.booking_id || selectedBooking}</p>
                                        </div>
                                        <div className="p-3 bg-gray-50 rounded-lg">
                                            <p className="text-sm text-gray-500">Date</p>
                                            <p className="font-semibold text-gray-900">
                                                {new Date(receipt.booking_date || new Date()).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>

                                    {receipt.ride && (
                                        <div className="border-t border-gray-200 pt-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <MapPin className="w-5 h-5 text-blue-600" />
                                                <p className="font-semibold text-gray-900">Route</p>
                                            </div>
                                            <p className="text-sm text-gray-600">From: {receipt.ride.source}</p>
                                            <p className="text-sm text-gray-600">
                                                To: {receipt.ride.destination}
                                            </p>
                                        </div>
                                    )}

                                    <div className="border-t border-gray-200 pt-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="w-5 h-5 text-green-600" />
                                                <p className="font-semibold text-gray-900">Amount</p>
                                            </div>
                                            <p className="text-2xl font-bold text-green-600">₹{receipt.amount || receipt.total_amount || 0}</p>
                                        </div>
                                    </div>

                                    {receipt.payment && (
                                        <div className="border-t border-gray-200 pt-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <CreditCard className="w-5 h-5 text-blue-600" />
                                                <p className="font-semibold text-gray-900">Payment</p>
                                            </div>
                                            <p className="text-sm text-gray-600">
                                                Method: {receipt.payment.payment_method || 'N/A'}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Status: {receipt.payment.payment_status || 'N/A'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="rounded-lg border border-gray-200 bg-white shadow-lg p-10 text-center"
                            >
                                <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
};

export default Receipts;
