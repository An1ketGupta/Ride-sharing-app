import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';

const Login = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const resp = await login(formData);
            const role = resp?.data?.user?.user_type;
            // Redirect back to originally requested page if available
            const fromPath = location.state?.from?.pathname;
            if (fromPath && fromPath !== '/login') {
                navigate(fromPath, { replace: true });
                return;
            }
            if (role === 'admin') {
                navigate('/admin/documents');
            } else if (role === 'driver' || role === 'both') {
                navigate('/driver/dashboard');
            } else {
                navigate('/passenger/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
            <div className="w-full max-w-md">
                <div className="rounded-lg border border-gray-200 bg-white shadow-lg p-8 sm:p-10">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-600 mb-4">
                            <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-2">Welcome Back</h2>
                        <p className="text-gray-500 text-base sm:text-lg">Sign in to continue your journey</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="your@email.com"
                                    className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all outline-none text-gray-900 placeholder:text-gray-400"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder="••••••••"
                                    className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all outline-none text-gray-900 placeholder:text-gray-400"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Logging in...
                                </>
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-500">
                            Don't have an account?{' '}
                            <Link
                                to="/register"
                                className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                            >
                                Create one now
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Additional Info */}
                <p className="text-center text-xs text-gray-400 mt-6">
                    By signing in, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    );
};

export default Login;
