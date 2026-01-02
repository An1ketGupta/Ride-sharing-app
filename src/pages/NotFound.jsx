import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';

const NotFound = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50 relative overflow-hidden">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="text-center max-w-2xl"
            >
                {/* 404 Number */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.25, ease: 'easeOut' }}
                    className="mb-8"
                >
                    <h1 className="text-9xl sm:text-[200px] font-extrabold text-gray-900 leading-none mb-4">
                        404
                    </h1>
                </motion.div>

                {/* Message */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.25, ease: 'easeOut' }}
                    className="space-y-4 mb-10"
                >
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
                        Page Not Found
                    </h2>
                    <p className="text-lg text-gray-500 max-w-md mx-auto">
                        Oops! The page you're looking for doesn't exist. It might have been moved or deleted.
                    </p>
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.25, ease: 'easeOut' }}
                    className="flex flex-wrap items-center justify-center gap-4"
                >
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate(-1)}
                        className="px-6 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg transition-all duration-200 flex items-center gap-2"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Go Back
                    </motion.button>
                    
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/')}
                        className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 hover:shadow-md transition-all duration-200 flex items-center gap-2"
                    >
                        <Home className="w-5 h-5" />
                        Back to Home
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/search')}
                        className="px-6 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg transition-all duration-200 flex items-center gap-2"
                    >
                        <Search className="w-5 h-5" />
                        Search Rides
                    </motion.button>
                </motion.div>

                {/* Decorative Element */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.25, ease: 'easeOut' }}
                    className="mt-16"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200">
                        <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></div>
                        <span className="text-sm font-medium text-gray-500">Lost in the ride</span>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default NotFound;
