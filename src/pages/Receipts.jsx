import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { receiptService } from '../services/receiptService';
import { bookingService } from '../services/bookingService';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { Receipt, Download, Mail, Calendar, MapPin, DollarSign, CreditCard } from 'lucide-react';

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
        <div className="container mx-auto max-w-6xl px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10">
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-4 sm:mb-6 md:mb-8">My Receipts</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Bookings List */}
                <div>
                    <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Completed Bookings</h2>
                    {loading && bookings.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        </div>
                    ) : bookings.length === 0 ? (
                        <div className="rounded-2xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-10 text-center">
                            <Receipt className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-muted-foreground">No completed bookings yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {bookings.map((booking) => (
                                <motion.div
                                    key={booking.booking_id}
                                    whileHover={{ scale: 1.02 }}
                                    onClick={() => loadReceipt(booking.booking_id)}
                                    className={`p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                        selectedBooking === booking.booking_id
                                            ? 'border-primary bg-primary/10'
                                            : 'border-white/20 bg-white/70 dark:bg-neutral-900/70'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-sm sm:text-base truncate">Booking #{booking.booking_id}</p>
                                            <p className="text-xs sm:text-sm text-muted-foreground">₹{booking.amount}</p>
                                        </div>
                                        <Receipt className="w-6 h-6 text-primary" />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Receipt Display */}
                <div>
                    <h2 className="text-xl font-bold mb-4">Receipt</h2>
                    {!selectedBooking ? (
                        <div className="rounded-2xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-10 text-center">
                            <Receipt className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-muted-foreground">Select a booking to view receipt</p>
                        </div>
                    ) : receipt ? (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-2xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-6"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-bold">Receipt</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleEmailReceipt(selectedBooking)}
                                        className="p-2 rounded-lg bg-white/50 dark:bg-white/5 hover:bg-white/70 transition-colors"
                                        title="Email receipt"
                                    >
                                        <Mail className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="p-2 rounded-lg bg-white/50 dark:bg-white/5 hover:bg-white/70 transition-colors"
                                        title="Download receipt"
                                    >
                                        <Download className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Booking ID</p>
                                        <p className="font-semibold">#{receipt.booking_id || selectedBooking}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Date</p>
                                        <p className="font-semibold">
                                            {new Date(receipt.booking_date || new Date()).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>

                                {receipt.ride && (
                                    <>
                                        <div className="border-t border-white/20 pt-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <MapPin className="w-5 h-5 text-primary" />
                                                <p className="font-semibold">Route</p>
                                            </div>
                                            <p className="text-sm text-muted-foreground">From: {receipt.ride.source}</p>
                                            <p className="text-sm text-muted-foreground">
                                                To: {receipt.ride.destination}
                                            </p>
                                        </div>
                                    </>
                                )}

                                <div className="border-t border-white/20 pt-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="w-5 h-5 text-primary" />
                                            <p className="font-semibold">Amount</p>
                                        </div>
                                        <p className="text-2xl font-bold">₹{receipt.amount || receipt.total_amount || 0}</p>
                                    </div>
                                </div>

                                {receipt.payment && (
                                    <div className="border-t border-white/20 pt-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CreditCard className="w-5 h-5 text-primary" />
                                            <p className="font-semibold">Payment</p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Method: {receipt.payment.payment_method || 'N/A'}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Status: {receipt.payment.payment_status || 'N/A'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <div className="rounded-2xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-10 text-center">
                            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Receipts;

