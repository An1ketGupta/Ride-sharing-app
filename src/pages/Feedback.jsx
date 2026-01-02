import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { feedbackService } from '../services/feedbackService';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { Star, MessageSquare, Send } from 'lucide-react';

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
        <div className="container mx-auto max-w-6xl px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl font-extrabold">Feedback</h1>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowForm(true)}
                    className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-primary to-secondary text-gray-900 rounded-xl font-semibold shadow-glow flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                    <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                    Submit Feedback
                </motion.button>
            </div>

            {/* Submit Feedback Form */}
            {showForm && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 sm:mb-6 rounded-xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-4 sm:p-6"
                >
                    <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Submit Feedback</h2>
                    <form onSubmit={handleSubmitFeedback} className="space-y-3 sm:space-y-4">
                        <input
                            type="number"
                            placeholder="Ride ID"
                            value={newFeedback.ride_id}
                            onChange={(e) => setNewFeedback({ ...newFeedback, ride_id: e.target.value })}
                            required
                            className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none"
                        />
                        <div>
                            <label className="block mb-2 font-semibold">Rating</label>
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map((rate) => (
                                    <button
                                        key={rate}
                                        type="button"
                                        onClick={() => setNewFeedback({ ...newFeedback, rating: rate })}
                                        className={`p-2 rounded-lg transition-all ${
                                            newFeedback.rating >= rate
                                                ? 'bg-yellow-400 text-gray-900'
                                                : 'bg-white/50 dark:bg-white/5'
                                        }`}
                                    >
                                        <Star className="w-6 h-6" />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <textarea
                            placeholder="Comments (optional)"
                            value={newFeedback.comments}
                            onChange={(e) => setNewFeedback({ ...newFeedback, comments: e.target.value })}
                            rows={4}
                            className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none"
                        />
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForm(false);
                                    setNewFeedback({ ride_id: '', rating: 5, comments: '' });
                                }}
                                className="flex-1 px-4 py-3 bg-white/50 dark:bg-white/5 rounded-xl font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-primary to-secondary text-gray-900 rounded-xl font-semibold shadow-glow"
                            >
                                {loading ? 'Submitting...' : 'Submit'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            )}

            {/* Driver Feedback (if driver) */}
            {(user?.user_type === 'driver' || user?.user_type === 'both') && myFeedback.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 rounded-xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-6"
                >
                    <h2 className="text-xl font-bold mb-4">Feedback Received</h2>
                    <div className="space-y-4">
                        {myFeedback.map((fb) => (
                            <div
                                key={fb.feedback_id}
                                className="p-4 rounded-xl border border-white/20 bg-white/50 dark:bg-white/5"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {renderStars(fb.rating)}
                                        <span className="ml-2 font-semibold">Ride #{fb.ride_id}</span>
                                    </div>
                                    <span className="text-sm text-muted-foreground">
                                        {new Date(fb.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                {fb.comments && (
                                    <p className="text-sm text-muted-foreground mt-2">{fb.comments}</p>
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
                transition={{ delay: 0.1 }}
                className="rounded-xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-6"
            >
                <h2 className="text-xl font-bold mb-4">My Feedback</h2>
                {feedback.length === 0 ? (
                    <div className="text-center py-10">
                        <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">No feedback submitted yet</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {feedback.map((fb) => (
                            <div
                                key={fb.feedback_id}
                                className="p-4 rounded-xl border border-white/20 bg-white/50 dark:bg-white/5"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {renderStars(fb.rating)}
                                        <span className="ml-2 font-semibold">Ride #{fb.ride_id}</span>
                                    </div>
                                    <span className="text-sm text-muted-foreground">
                                        {new Date(fb.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                {fb.comments && (
                                    <p className="text-sm text-muted-foreground mt-2">{fb.comments}</p>
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

