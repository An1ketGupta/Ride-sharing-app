import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Phone, Lock, ArrowRight, AlertCircle, UserCircle } from 'lucide-react';

const Register = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        user_type: 'passenger',
        documents: [
            { doc_type: 'license', file_url: '' },
            { doc_type: 'registration', file_url: '' }
        ]
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const errs = {};
        // Email format
        const emailOk = /.+@.+\..+/.test(formData.email);
        if (!emailOk) errs.email = 'Please enter a valid email address';
        // Phone number
        if (!/^\d{10}$/.test(formData.phone)) errs.phone = 'Phone number must be 10 digits';
        // Password rules
        const pwd = formData.password || '';
        if (pwd.length < 8) errs.password = 'Password must be at least 8 characters';
        if (!/[0-9]/.test(pwd) || !/[A-Za-z]/.test(pwd)) errs.password = (errs.password ? errs.password + '; ' : '') + 'Include letters and numbers';
        if (formData.password !== formData.confirmPassword) errs.confirmPassword = 'Passwords do not match';
        // Driver docs rule
        if ((formData.user_type === 'driver' || formData.user_type === 'both')) {
            const docs = (formData.documents || []).filter(d => (d.file_url || '').trim());
            if (docs.length === 0) errs.documents = 'At least one document URL is required for driver registration';
        }

        setFieldErrors(errs);
        if (Object.keys(errs).length > 0) {
            setError('Please fix the highlighted fields');
            return;
        }

        setLoading(true);

        try {
            const { confirmPassword, ...userData } = formData;
            // Clean empty doc entries
            if (userData.documents) userData.documents = userData.documents.filter(d => d.file_url);
            await register(userData);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[#000000]">
            <div className="w-full max-w-2xl">
                <div className="rounded-xl border border-[#1A1A1A] bg-[#111111] shadow-[0_4px_16px_rgba(0,0,0,0.4)] p-6 sm:p-8 md:p-10">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[#0EA5E9] mb-4">
                            <UserCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2">Create Account</h2>
                        <p className="text-white/60 text-base sm:text-lg">Join thousands of riders today</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-[#ef4444] flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-[#ef4444]">{error}</p>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid md:grid-cols-2 gap-5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-white">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="John Doe"
                                        className="w-full pl-11 pr-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none text-white placeholder:text-white/40"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-white">Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="your@email.com"
                                        className="w-full pl-11 pr-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none text-white placeholder:text-white/40"
                                        required
                                    />
                                </div>
                                {fieldErrors.email && <div className="text-xs text-[#ef4444]">{fieldErrors.email}</div>}
                            </div>
                        </div>

                        {(formData.user_type === 'driver' || formData.user_type === 'both') && (
                            <div className="space-y-4 p-4 rounded-xl bg-[#0A0A0A] border border-[#1A1A1A]">
                                <div className="text-sm font-semibold text-white">Driver Verification</div>
                                <div className="grid md:grid-cols-2 gap-4">
                                    {formData.documents.map((doc, idx) => (
                                        <div key={idx} className="space-y-2">
                                            <label className="text-sm font-semibold capitalize text-white">{doc.doc_type} URL</label>
                                            <input
                                                type="url"
                                                value={doc.file_url}
                                                onChange={(e) => {
                                                    const docs = [...formData.documents];
                                                    docs[idx] = { ...docs[idx], file_url: e.target.value };
                                                    setFormData({ ...formData, documents: docs });
                                                }}
                                                placeholder={`Link to your ${doc.doc_type}`}
                                                className="w-full px-4 py-3 bg-[#000000] border border-[#1A1A1A] rounded-xl focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none text-white placeholder:text-white/40"
                                            />
                                        </div>
                                    ))}
                                </div>
                                {fieldErrors.documents && <div className="text-xs text-[#ef4444]">{fieldErrors.documents}</div>}
                                <p className="text-xs text-white/60">Your documents will be reviewed by an admin. You'll be available only after approval. You can add vehicles after registration.</p>
                            </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-white">Phone Number</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        placeholder="9876543210"
                                        pattern="[0-9]{10}"
                                        className="w-full pl-11 pr-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none text-white placeholder:text-white/40"
                                        required
                                    />
                                </div>
                                {fieldErrors.phone && <div className="text-xs text-[#ef4444]">{fieldErrors.phone}</div>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-white">User Type</label>
                                <select 
                                    name="user_type" 
                                    value={formData.user_type} 
                                    onChange={handleChange}
                                    className="w-full px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none appearance-none cursor-pointer text-white"
                                >
                                    <option value="passenger">🚗 Passenger</option>
                                    <option value="driver">🚙 Driver</option>
                                    <option value="both">🚕 Both (Driver & Passenger)</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-white">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <input
                                        type="password"
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        placeholder="••••••••"
                                        minLength="8"
                                        className="w-full pl-11 pr-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none text-white placeholder:text-white/40"
                                        required
                                    />
                                </div>
                                {fieldErrors.password && <div className="text-xs text-[#ef4444]">{fieldErrors.password}</div>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-white">Confirm Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        value={formData.confirmPassword}
                                        onChange={handleChange}
                                        placeholder="••••••••"
                                        minLength="8"
                                        className="w-full pl-11 pr-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none text-white placeholder:text-white/40"
                                        required
                                    />
                                </div>
                                {fieldErrors.confirmPassword && <div className="text-xs text-[#ef4444]">{fieldErrors.confirmPassword}</div>}
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-[#0EA5E9] text-white font-semibold rounded-xl hover:bg-[#0EA5E9] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Creating account...
                                </>
                            ) : (
                                <>
                                    Create Account
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-6 text-center">
                        <p className="text-sm text-white/60">
                            Already have an account?{' '}
                            <Link 
                                to="/login" 
                                className="font-semibold text-[#0EA5E9] hover:text-[#0EA5E9] hover:brightness-110 transition-colors"
                            >
                                Sign in instead
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Additional Info */}
                <p className="text-center text-xs text-white/40 mt-6">
                    By creating an account, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    );
};

export default Register;




