import { motion } from 'framer-motion';

export const RideCardSkeleton = () => {
    return (
        <div className="glass-thick rounded-3xl p-6 sm:p-8 border border-white/20 animate-pulse">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1 space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                        <div className="h-7 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg w-32"></div>
                        <div className="h-7 w-7 bg-muted rounded-full"></div>
                        <div className="h-7 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg w-32"></div>
                        <div className="h-6 bg-muted rounded-full w-20 ml-auto"></div>
                    </div>
                    
                    {/* Info Grid */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-muted w-10 h-10"></div>
                                <div className="h-4 bg-muted rounded w-20"></div>
                            </div>
                        ))}
                    </div>

                    {/* Bottom Info */}
                    <div className="flex items-center gap-3">
                        <div className="h-8 bg-muted rounded-xl w-32"></div>
                        <div className="h-8 bg-muted rounded-xl w-32"></div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                    <div className="h-10 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-xl w-32"></div>
                </div>
            </div>
        </div>
    );
};

export const BookingCardSkeleton = () => {
    return (
        <div className="glass-thick rounded-3xl p-6 sm:p-8 border border-white/20 animate-pulse">
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-7 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg w-32"></div>
                    <div className="h-7 w-7 bg-muted rounded-full"></div>
                    <div className="h-7 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg w-32"></div>
                    <div className="h-6 bg-muted rounded-full w-20 ml-auto"></div>
                </div>
                
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-muted w-10 h-10"></div>
                            <div className="h-4 bg-muted rounded w-24"></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const PaymentCardSkeleton = () => {
    return (
        <div className="glass-thick rounded-3xl p-6 border-l-4 border-l-emerald-600/50 border-y border-r border-white/20 animate-pulse">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                    <div className="h-6 bg-muted rounded-lg w-48"></div>
                    <div className="grid sm:grid-cols-2 gap-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-4 h-4 bg-muted rounded"></div>
                                <div className="h-4 bg-muted rounded w-28"></div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="h-10 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 rounded w-24"></div>
            </div>
        </div>
    );
};

export const FeedbackCardSkeleton = () => {
    return (
        <div className="glass-thick rounded-3xl p-6 border-l-4 border-l-primary/50 border-y border-r border-white/20 animate-pulse">
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <div className="h-5 bg-muted rounded w-32"></div>
                        <div className="h-4 bg-muted rounded w-48"></div>
                    </div>
                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="w-5 h-5 bg-muted rounded-full"></div>
                        ))}
                    </div>
                </div>
                <div className="h-16 bg-muted rounded-lg"></div>
                <div className="h-3 bg-muted rounded w-24"></div>
            </div>
        </div>
    );
};

export const LoadingSpinner = ({ size = 'md' }) => {
    const sizes = {
        sm: 'w-5 h-5 border-2',
        md: 'w-8 h-8 border-3',
        lg: 'w-12 h-12 border-4',
        xl: 'w-16 h-16 border-4',
    };

    return (
        <div className="flex items-center justify-center">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className={`${sizes[size]} border-primary/30 border-t-primary rounded-full`}
            />
        </div>
    );
};

export const FullPageLoader = ({ message = 'Loading...' }) => {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="flex flex-col items-center gap-6">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full"
                />
                <p className="text-lg font-semibold text-muted-foreground">{message}</p>
            </div>
        </div>
    );
};

