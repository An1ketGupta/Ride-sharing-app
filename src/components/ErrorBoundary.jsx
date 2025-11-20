import { Component } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error Boundary caught an error:', error, errorInfo);
        this.setState({
            error,
            errorInfo,
        });
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background relative overflow-hidden">
                    {/* Background Gradients */}
                    <div className="absolute inset-0 -z-10">
                        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full blur-3xl opacity-20 bg-[radial-gradient(circle,#ef4444_0%,transparent_70%)] animate-pulse-soft" />
                        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full blur-3xl opacity-20 bg-[radial-gradient(circle,#f59e0b_0%,transparent_70%)] animate-pulse-soft" />
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="max-w-2xl w-full text-center"
                    >
                        {/* Icon */}
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                            className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-red-100 dark:bg-red-950 mb-8"
                        >
                            <AlertTriangle className="w-12 h-12 text-red-600 dark:text-red-400" />
                        </motion.div>

                        {/* Error Message */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <h1 className="text-4xl font-extrabold tracking-tight mb-4">
                                Oops! Something went wrong
                            </h1>
                            <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
                                We apologize for the inconvenience. The application encountered an unexpected error.
                            </p>
                        </motion.div>

                        {/* Error Details (Development Only) */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                className="mb-8 p-6 rounded-2xl bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900 text-left max-w-xl mx-auto overflow-auto"
                            >
                                <h3 className="font-bold text-red-800 dark:text-red-200 mb-2">
                                    Error Details (Development Mode):
                                </h3>
                                <pre className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">
                                    {this.state.error.toString()}
                                </pre>
                                {this.state.errorInfo && (
                                    <details className="mt-4">
                                        <summary className="cursor-pointer font-semibold text-red-800 dark:text-red-200">
                                            Component Stack
                                        </summary>
                                        <pre className="mt-2 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    </details>
                                )}
                            </motion.div>
                        )}

                        {/* Action Buttons */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="flex flex-wrap items-center justify-center gap-4"
                        >
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={this.handleReset}
                                className="px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-xl shadow-glow-lg hover:shadow-glow transition-all flex items-center gap-2 relative overflow-hidden group"
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    <RefreshCw className="w-5 h-5" />
                                    Try Again
                                </span>
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={this.handleGoHome}
                                className="px-6 py-3 bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/15 font-semibold rounded-xl transition-all flex items-center gap-2 shadow-soft"
                            >
                                <Home className="w-5 h-5" />
                                Back to Home
                            </motion.button>
                        </motion.div>

                        {/* Help Text */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.6 }}
                            className="mt-8"
                        >
                            <p className="text-sm text-muted-foreground">
                                If the problem persists, please contact support or try refreshing the page.
                            </p>
                        </motion.div>
                    </motion.div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

