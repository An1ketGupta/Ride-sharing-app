import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { feedbackService } from '../services/feedbackService';
import { useToast } from '../components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, MessageSquare, Send, X } from 'lucide-react';

const Feedback = () => {
    const { user } = useAuth();
    const toast = useToast();
    const [feedback, setFeedback] = useState([]);
    const [myFeedback, setMyFeedback] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newFeedback, setNewFeedback] = useState({
        ride_id: '',
        rating: 5,
        comments: ''
    });
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        loadFeedback();
    }, [user?.user_id]);

    const loadFeedback = async () => {
        if (!user?.user_id) return;
        try {
            setLoading(true);
            // Load driver feedback if user is driver
            if (user.user_type === 'driver' || user.user_type === 'both') {
                const resp = await feedbackService.getMyDriverFeedback();
                setMyFeedback(Array.isArray(resp.data) ? resp.data : []);
            }
            // Load user feedback
            const userResp = await feedbackService.getFeedbackByUser(user.user_id);
            setFeedback(Array.isArray(userResp.data) ? userResp.data : []);
        } catch (err) {
            console.error('Failed to load feedback');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitFeedback = async (e) => {
        e.preventDefault();
        if (!newFeedback.ride_id || !newFeedback.rating) {
            toast.error('Please fill all required fields');
            return;
        }
        try {
            setLoading(true);
            await feedbackService.addFeedback(newFeedback);
            toast.success('Feedback submitted');
            setNewFeedback({ ride_id: '', rating: 5, comments: '' });
            setShowForm(false);
            loadFeedback();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit feedback');
        } finally {
            setLoading(false);
        }
    };

    const renderStars = (rating) => {
        return Array.from({ length: 5 }).map((_, i) => (
            <Star
                key={i}
                className={`w-5 h-5 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
            />
        ));
    };

    return (
        <div className="min-h-screen bg-gray-50 px-4 sm:px-6 py-8 max-w-4xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
            >
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Feedback</h1>
                <motion.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowForm(true)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold shadow-md hover:bg-blue-700 transition-all duration-200 flex items-center justify-center gap-2"
                >
                    <Send className="w-4 h-4" />
                    Submit Feedback
                </motion.button>
            </motion.div>

            {/* Submit Feedback Modal */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowForm(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 8 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white rounded-lg p-6 max-w-md w-full border border-gray-200 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-gray-900">Submit Feedback</h2>
                                <button
                                    onClick={() => setShowForm(false)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                            <form onSubmit={handleSubmitFeedback} className="space-y-4">
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 mb-2 block">Ride ID</label>
                                    <input
                                        type="number"
                                        placeholder="Enter Ride ID"
                                        value={newFeedback.ride_id}
                                        onChange={(e) => setNewFeedback({ ...newFeedback, ride_id: e.target.value })}
                                        required
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none text-gray-900 placeholder:text-gray-400"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 mb-2 block">Rating</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map((rate) => (
                                            <button
                                                key={rate}
                                                type="button"
                                                onClick={() => setNewFeedback({ ...newFeedback, rating: rate })}
                                                className={`p-2 rounded-lg transition-all ${newFeedback.rating >= rate
                                                        ? 'bg-yellow-400 text-gray-900'
                                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                                    }`}
                                            >
                                                <Star className="w-6 h-6" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 mb-2 block">Comments (optional)</label>
                                    <textarea
                                        placeholder="Share your experience..."
                                        value={newFeedback.comments}
                                        onChange={(e) => setNewFeedback({ ...newFeedback, comments: e.target.value })}
                                        rows={4}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none text-gray-900 placeholder:text-gray-400 resize-none"
                                    />
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowForm(false);
                                            setNewFeedback({ ride_id: '', rating: 5, comments: '' });
                                        }}
                                        className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all disabled:opacity-50"
                                    >
                                        {loading ? 'Submitting...' : 'Submit'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Driver Feedback (if driver) */}
            {(user?.user_type === 'driver' || user?.user_type === 'both') && myFeedback.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.25 }}
                    className="mb-6 rounded-lg border border-gray-200 bg-white shadow-lg p-6"
                >
                    <h2 className="text-xl font-bold mb-4 text-gray-900">Feedback Received</h2>
                    <div className="space-y-4">
                        {myFeedback.map((fb) => (
                            <div
                                key={fb.feedback_id}
                                className="p-4 rounded-lg border border-gray-200 bg-gray-50"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {renderStars(fb.rating)}
                                        <span className="ml-2 font-semibold text-gray-900">Ride #{fb.ride_id}</span>
                                    </div>
                                    <span className="text-sm text-gray-500">
                                        {new Date(fb.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                {fb.comments && (
                                    <p className="text-sm text-gray-600 mt-2">{fb.comments}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* User Feedback */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.25 }}
                className="rounded-lg border border-gray-200 bg-white shadow-lg p-6"
            >
                <h2 className="text-xl font-bold mb-4 text-gray-900">My Feedback</h2>
                {feedback.length === 0 ? (
                    <div className="text-center py-10">
                        <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p className="text-gray-500">No feedback submitted yet</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {feedback.map((fb) => (
                            <div
                                key={fb.feedback_id}
                                className="p-4 rounded-lg border border-gray-200 bg-gray-50"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {renderStars(fb.rating)}
                                        <span className="ml-2 font-semibold text-gray-900">Ride #{fb.ride_id}</span>
                                    </div>
                                    <span className="text-sm text-gray-500">
                                        {new Date(fb.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                {fb.comments && (
                                    <p className="text-sm text-gray-600 mt-2">{fb.comments}</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default Feedback;
