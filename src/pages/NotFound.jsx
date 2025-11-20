import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';

const NotFound = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full blur-3xl opacity-20 bg-[radial-gradient(circle,#6366f1_0%,transparent_70%)] animate-pulse-soft float-1" />
                <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full blur-3xl opacity-20 bg-[radial-gradient(circle,#06b6d4_0%,transparent_70%)] animate-pulse-soft float-2" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center max-w-2xl"
            >
                {/* 404 Number */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
                    className="mb-8"
                >
                    <h1 className="text-9xl sm:text-[200px] font-extrabold gradient-text-vibrant leading-none mb-4">
                        404
                    </h1>
                </motion.div>

                {/* Message */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="space-y-4 mb-10"
                >
                    <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                        Page Not Found
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-md mx-auto">
                        Oops! The page you're looking for doesn't exist. It might have been moved or deleted.
                    </p>
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="flex flex-wrap items-center justify-center gap-4"
                >
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate(-1)}
                        className="px-6 py-3 bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/15 font-semibold rounded-xl transition-all flex items-center gap-2 shadow-soft"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Go Back
                    </motion.button>
                    
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate('/')}
                        className="px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-xl shadow-glow-lg hover:shadow-glow transition-all flex items-center gap-2 relative overflow-hidden group"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            <Home className="w-5 h-5" />
                            Back to Home
                        </span>
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate('/search')}
                        className="px-6 py-3 bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/15 font-semibold rounded-xl transition-all flex items-center gap-2 shadow-soft"
                    >
                        <Search className="w-5 h-5" />
                        Search Rides
                    </motion.button>
                </motion.div>

                {/* Decorative Element */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="mt-16"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-thick border border-white/20">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="text-sm font-medium text-muted-foreground">Lost in the ride</span>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default NotFound;

