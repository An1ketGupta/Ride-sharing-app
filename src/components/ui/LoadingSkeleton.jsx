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


