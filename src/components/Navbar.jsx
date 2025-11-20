import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ui/ThemeToggle';
import { Menu, X, Search, LayoutDashboard, Receipt, LogOut, User, Bell, Car, DollarSign, Star, MapPin, Tag, Shield, History, MessageSquare, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import io from 'socket.io-client';
import Lottie from 'lottie-react';
import logoAnimation from '../../public/logo.json';
import { notificationService } from '../services/notificationService';

const Navbar = () => {
    const lottieRef = useRef(null);
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [notifPage, setNotifPage] = useState(1);
    const [notifHasMore, setNotifHasMore] = useState(false);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (profileMenuOpen && menuRef.current && !menuRef.current.contains(e.target)) {
                setProfileMenuOpen(false);
            }
            if (notifOpen && notifRef.current && !notifRef.current.contains(e.target)) {
                setNotifOpen(false);
            }
        };
        const handleEsc = (e) => {
            if (e.key === 'Escape') setProfileMenuOpen(false);
            if (e.key === 'Escape') setNotifOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [profileMenuOpen, notifOpen]);

    // Socket notifications
    useEffect(() => {
        if (!user?.user_id) return;
        const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
        const s = io(socketUrl, { transports: ['websocket'] });
        s.on('connect', () => {
            s.emit('user_register', { user_id: user.user_id });
        });
        s.on('notification', (n) => {
            setNotifications((prev) => [n, ...prev].slice(0, 20));
            setUnreadCount((c) => c + 1);
        });
        return () => s.disconnect();
    }, [user]);

    // Load latest notifications when menu opens
    useEffect(() => {
        const load = async () => {
            try {
                if (!notifOpen) return;
                const resp = await notificationService.list({ page: 1, limit: 20 });
                const list = Array.isArray(resp.data) ? resp.data : [];
                setNotifications(list);
                const unread = list.filter((n) => !n.is_read).length;
                setUnreadCount(unread);
                setNotifPage(1);
                setNotifHasMore(!!resp.hasMore);
            } catch {}
        };
        load();
    }, [notifOpen]);

    const handleMarkRead = async (id) => {
        try {
            await notificationService.markRead(id);
            setNotifications((prev) => prev.map((n) => n.notification_id === id ? { ...n, is_read: 1 } : n));
            setUnreadCount((c) => Math.max(0, c - 1));
        } catch {}
    };

    const handleAckSafety = async (id) => {
        try {
            await notificationService.ackSafety(id);
            setNotifications((prev) => prev.map((n) => n.notification_id === id ? { ...n, is_read: 1 } : n));
            setUnreadCount((c) => Math.max(0, c - 1));
        } catch {}
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
        setMobileMenuOpen(false);
    };

    return (    
        <nav className="fixed inset-x-0 top-0 z-50 bg-[#000000] border-b border-[#1A1A1A]">
            <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-10 relative z-10">
                <div className="flex items-center justify-between h-20">
                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-3 group">
                        <div className="w-[50px] h-[50px] rounded-full overflow-hidden flex items-center justify-center">
                            <Lottie
                                lottieRef={lottieRef}
                                animationData={logoAnimation}
                                loop
                                autoplay={true}
                                className="w-full h-full"
                            />
                        </div>
                        <div className="hidden sm:flex flex-col">
                            <span className="font-bold text-xl text-white">Cab Bazaar</span>
                            <span className="text-[10px] text-white/60 font-medium tracking-wider uppercase">Ride Sharing</span>
                        </div>
                    </Link>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center gap-2 relative">
                        {user ? (
                            <>
                                {/* Primary Actions */}
                                <div className="flex items-center gap-2 px-2 py-1 rounded-xl bg-[#111111] border border-[#1A1A1A]">
                                    <Link to="/search" className="px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1A1A1A] rounded-lg transition-all duration-200 flex items-center gap-2">
                                        <Search className="w-4 h-4" />
                                        <span className="hidden lg:inline">Search</span>
                                    </Link>
                                    
                                    {(user.user_type === 'driver' || user.user_type === 'both') && (
                                        <>
                                            <div className="h-6 w-px bg-[#1A1A1A] mx-1" />
                                            <Link to="/driver/dashboard" className="px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1A1A1A] rounded-lg transition-all duration-200 flex items-center gap-2">
                                                <LayoutDashboard className="w-4 h-4" />
                                                <span className="hidden lg:inline">Driver</span>
                                            </Link>
                                            <Link to="/vehicles" className="px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1A1A1A] rounded-lg transition-all duration-200 flex items-center gap-2">
                                                <Car className="w-4 h-4" />
                                                <span className="hidden lg:inline">Vehicles</span>
                                            </Link>
                                        </>
                                    )}
                                    
                                    {(user.user_type === 'passenger' || user.user_type === 'both') && (
                                        <>
                                            <div className="h-6 w-px bg-[#1A1A1A] mx-1" />
                                            <Link to="/passenger/dashboard" className="px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1A1A1A] rounded-lg transition-all duration-200 flex items-center gap-2">
                                                <Receipt className="w-4 h-4" />
                                                <span className="hidden lg:inline">Bookings</span>
                                            </Link>
                                        </>
                                    )}
                                </div>

                                {/* Secondary Actions */}
                                <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-[#111111] border border-[#1A1A1A]">
                                    <Link to="/wallet" className="px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#1A1A1A] rounded-lg transition-all duration-200" title="Wallet">
                                        <DollarSign className="w-4 h-4" />
                                    </Link>

                                    <Link to="/messages" className="px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#1A1A1A] rounded-lg transition-all duration-200" title="Messages">
                                        <MessageSquare className="w-4 h-4" />
                                    </Link>

                                    <Link to="/feedback" className="px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#1A1A1A] rounded-lg transition-all duration-200" title="Feedback">
                                        <Star className="w-4 h-4" />
                                    </Link>

                                    <Link to="/receipts" className="px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#1A1A1A] rounded-lg transition-all duration-200" title="Receipts">
                                        <Receipt className="w-4 h-4" />
                                    </Link>
                                </div>

                                <div className="h-8 w-px bg-[#1A1A1A] mx-2" />

                                {/* Notifications bell */}
                                <div className="relative">
                                    <button
                                        onClick={() => { setNotifOpen((v) => !v); setUnreadCount(0); }}
                                        className="relative px-3 py-2.5 rounded-xl hover:bg-[#111111] transition-all duration-200 group"
                                        aria-label="Notifications"
                                    >
                                        <Bell className={`w-5 h-5 text-white transition-all ${unreadCount > 0 ? 'text-[#0EA5E9]' : ''} group-hover:scale-110`} />
                                        {unreadCount > 0 && (
                                            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ef4444] text-white min-w-[18px] text-center">
                                                {unreadCount > 99 ? '99+' : unreadCount}
                                            </span>
                                        )}
                                    </button>
                                    <AnimatePresence>
                                        {notifOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                                ref={notifRef}
                                                className="absolute right-0 top-12 w-96 max-w-[85vw] rounded-2xl border border-[#1A1A1A] bg-gradient-to-b from-[#111111] to-[#0A0A0A] shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl z-50 overflow-hidden"
                                            >
                                            {/* Header */}
                                            <div className="px-5 py-4 border-b border-[#1A1A1A] bg-gradient-to-r from-[#0EA5E9]/5 to-transparent">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-[#0EA5E9]/20 flex items-center justify-center">
                                                            <Bell className="w-4 h-4 text-[#0EA5E9]" />
                                                        </div>
                                                        <span className="text-sm font-bold text-white">Notifications</span>
                                                        {unreadCount > 0 && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ef4444] text-white">
                                                                {unreadCount > 99 ? '99+' : unreadCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {notifications.length > 0 && (
                                                        <motion.button
                                                            whileHover={{ scale: 1.05 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={async () => {
                                                                try {
                                                                    await notificationService.markAllRead();
                                                                    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
                                                                    setUnreadCount(0);
                                                                } catch {}
                                                            }}
                                                            className="px-3 py-1.5 rounded-lg border border-[#1A1A1A] hover:bg-[#1A1A1A] hover:border-[#0EA5E9]/30 text-[11px] font-semibold text-white/80 hover:text-white transition-all duration-200"
                                                        >
                                                            Mark all read
                                                        </motion.button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Notifications List */}
                                            {notifications.length === 0 ? (
                                                <div className="px-5 py-12 text-center">
                                                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-[#1A1A1A] flex items-center justify-center">
                                                        <Bell className="w-8 h-8 text-white/20" />
                                                    </div>
                                                    <div className="text-sm font-medium text-white/60">No notifications</div>
                                                    <div className="text-xs text-white/40 mt-1">You're all caught up!</div>
                                                </div>
                                            ) : (
                                                <div className="max-h-96 overflow-auto">
                                                    <div className="p-2 space-y-2">
                                                        {notifications.map((n, idx) => {
                                                            const id = n.notification_id ?? n.id ?? null;
                                                            const msg = String(n.message || '');
                                                            const isSafety = /reached\s+safe|reached\s+safely|hope you reached/i.test(msg);
                                                            const isUnread = !n.is_read;
                                                            return (
                                                                <motion.div
                                                                    key={id || msg}
                                                                    initial={{ opacity: 0, x: -20 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    transition={{ delay: idx * 0.03 }}
                                                                    whileHover={{ scale: 1.01, y: -2 }}
                                                                    className={`p-4 rounded-xl border transition-all duration-200 shadow-lg hover:shadow-xl ${
                                                                        isUnread
                                                                            ? 'border-[#0EA5E9]/40 bg-gradient-to-br from-[#0EA5E9]/15 to-[#0A0A0A]'
                                                                            : 'border-[#1A1A1A] bg-gradient-to-br from-[#111111] to-[#0A0A0A] hover:border-[#1F1F1F]'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-start gap-3">
                                                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border-2 border-dashed transition-all ${
                                                                            isUnread 
                                                                                ? 'bg-gradient-to-br from-[#0EA5E9]/20 to-[#0891b2]/20 border-[#0EA5E9]/40' 
                                                                                : 'bg-[#1A1A1A] border-[#1A1A1A]'
                                                                        }`}>
                                                                            <Bell className={`w-5 h-5 ${isUnread ? 'text-[#0EA5E9]' : 'text-white/40'}`} />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                <div className="text-xs text-white/50 font-medium">
                                                                                    {new Date(n.created_at).toLocaleString?.() || ''}
                                                                                </div>
                                                                                {isUnread && (
                                                                                    <span className="px-2 py-0.5 bg-[#0EA5E9]/20 text-[#0EA5E9] text-[10px] font-semibold rounded-full">New</span>
                                                                                )}
                                                                            </div>
                                                                            <div className={`font-bold mb-3 leading-relaxed ${
                                                                                isUnread ? 'text-white' : 'text-white/90'
                                                                            }`}>
                                                                                {msg}
                                                                            </div>
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                {isSafety && id && (
                                                                                    <motion.button
                                                                                        whileHover={{ scale: 1.05 }}
                                                                                        whileTap={{ scale: 0.95 }}
                                                                                        onClick={() => handleAckSafety(id)}
                                                                                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-xs font-semibold hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)] transition-all duration-200 flex items-center gap-1.5 border border-[#10b981]/30"
                                                                                    >
                                                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                                                        I'm Safe
                                                                                    </motion.button>
                                                                                )}
                                                                                {id && (
                                                                                    <motion.button
                                                                                        whileHover={{ scale: 1.05 }}
                                                                                        whileTap={{ scale: 0.95 }}
                                                                                        onClick={() => handleMarkRead(id)}
                                                                                        className="px-3 py-1.5 rounded-lg border-2 border-dashed border-[#1A1A1A] hover:border-[#1F1F1F] hover:bg-[#1A1A1A] text-white/70 hover:text-white text-xs font-semibold transition-all duration-200"
                                                                                    >
                                                                                        Dismiss
                                                                                    </motion.button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </motion.div>
                                                            );
                                                        })}
                                                    </div>
                                                    {notifHasMore && (
                                                        <div className="p-3 border-t border-[#1A1A1A]">
                                                            <motion.button
                                                                whileHover={{ scale: 1.02, y: -2 }}
                                                                whileTap={{ scale: 0.98 }}
                                                                onClick={async () => {
                                                                    try {
                                                                        const next = notifPage + 1;
                                                                        const resp = await notificationService.list({ page: next, limit: 20 });
                                                                        const list = Array.isArray(resp.data) ? resp.data : [];
                                                                        setNotifications((prev) => [...prev, ...list]);
                                                                        setNotifPage(next);
                                                                        setNotifHasMore(!!resp.hasMore);
                                                                    } catch {}
                                                                }}
                                                                className="w-full px-4 py-2.5 rounded-xl border-2 border-dashed border-[#1A1A1A] hover:border-[#0EA5E9]/30 hover:bg-[#1A1A1A] text-white text-xs font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                                                            >
                                                                Load more
                                                            </motion.button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <button
                                    onClick={() => setProfileMenuOpen((v) => !v)}
                                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#111111] border border-[#1A1A1A] hover:bg-[#1A1A1A] transition-all duration-200"
                                >
                                    <div className="w-8 h-8 rounded-full bg-[#0EA5E9] flex items-center justify-center">
                                        <User className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="hidden lg:flex flex-col items-start">
                                        <span className="text-sm font-semibold text-white leading-tight">{user.name}</span>
                                        <span className="text-[10px] text-white/60 font-medium capitalize">{user.user_type}</span>
                                    </div>
                                </button>

                                <AnimatePresence>
                                    {profileMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ duration: 0.15 }}
                                            ref={menuRef}
                                            className="absolute right-0 top-16 w-64 rounded-xl border border-[#1A1A1A] bg-[#111111] shadow-lg p-2 z-50"
                                            role="menu"
                                            aria-label="User menu"
                                        >
                                        {/* User Info Header */}
                                        <div className="px-3 py-3 mb-2 border-b border-[#1A1A1A]">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full bg-[#0EA5E9] flex items-center justify-center">
                                                    <User className="w-4 h-4 text-white" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-semibold text-white truncate">{user.name}</div>
                                                    <div className="text-xs text-white/60 capitalize">{user.user_type}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Menu Items */}
                                        <div className="space-y-1">
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); navigate('/profile'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-[#1A1A1A] rounded-lg transition-colors flex items-center gap-3"
                                                role="menuitem"
                                            >
                                                <User className="w-4 h-4 text-[#0EA5E9]" />
                                                <span>My Profile</span>
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); navigate('/ride-history'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-[#1A1A1A] rounded-lg transition-colors flex items-center gap-3"
                                                role="menuitem"
                                            >
                                                <History className="w-4 h-4 text-[#0EA5E9]" />
                                                <span>Ride History</span>
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); navigate('/saved-locations'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-[#1A1A1A] rounded-lg transition-colors flex items-center gap-3"
                                                role="menuitem"
                                            >
                                                <MapPin className="w-4 h-4 text-[#0EA5E9]" />
                                                <span>Saved Locations</span>
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); navigate('/promo-codes'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-[#1A1A1A] rounded-lg transition-colors flex items-center gap-3"
                                                role="menuitem"
                                            >
                                                <Tag className="w-4 h-4 text-[#0EA5E9]" />
                                                <span>Promo Codes</span>
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); navigate('/emergency'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-[#1A1A1A] rounded-lg transition-colors flex items-center gap-3"
                                                role="menuitem"
                                            >
                                                <Shield className="w-4 h-4 text-[#ef4444]" />
                                                <span>Emergency SOS</span>
                                            </button>
                                        </div>

                                        {/* Divider */}
                                        <div className="my-2 h-px bg-[#1A1A1A]" />

                                        {/* Theme Toggle */}
                                        <div className="px-3 py-2.5 flex items-center justify-between">
                                            <span className="text-sm font-medium text-white">Theme</span>
                                            <ThemeToggle />
                                        </div>

                                        {/* Divider */}
                                        <div className="my-2 h-px bg-[#1A1A1A]" />

                                        {/* Logout Button */}
                                        <button
                                            onClick={() => { setProfileMenuOpen(false); handleLogout(); }}
                                            className="w-full px-3 py-2.5 text-sm font-semibold bg-[#ef4444] text-white rounded-lg hover:bg-[#dc2626] transition-colors flex items-center gap-3 justify-center"
                                            role="menuitem"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            <span>Logout</span>
                                        </button>
                                    </motion.div>
                                    )}
                                </AnimatePresence>
                            </>
                        ) : (
                            <>
                                <Link to="/search" className="px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#111111] rounded-xl transition-all duration-200 flex items-center gap-2 group">
                                    <Search className="w-4 h-4 group-hover:scale-110 group-hover:text-[#0EA5E9] transition-all" />
                                    <span className="hidden lg:inline">Search</span>
                                </Link>
                                <div className="flex items-center gap-2">
                                    <Link to="/login" className="px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#111111] rounded-xl transition-all duration-200">
                                        Login
                                    </Link>
                                    <Link to="/register" className="px-6 py-2.5 text-sm font-bold bg-[#0EA5E9] text-white rounded-xl hover:bg-[#0EA5E9] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200">
                                        Register
                                    </Link>
                                </div>
                            </>
                        )}
                        {/* Theme toggle moved into profile dropdown */}
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="flex md:hidden items-center gap-2">
                        {user && (
                            <div className="relative mr-2">
                                <button
                                    onClick={() => { setNotifOpen((v) => !v); setUnreadCount(0); }}
                                    className="relative p-2.5 text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all"
                                    aria-label="Notifications"
                                >
                                    <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-primary' : ''}`} />
                                    {unreadCount > 0 && (
                                        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white min-w-[16px] text-center">
                                            {unreadCount > 99 ? '99+' : unreadCount}
                                        </span>
                                    )}
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="p-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="md:hidden border-t border-[#1A1A1A] bg-[#000000]">
                    <div className="px-6 py-6 space-y-3">
                            {user ? (
                                <>
                                    <button
                                        onClick={() => setProfileMenuOpen((v) => !v)}
                                        className="w-full px-4 py-3 mb-1 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 flex items-center justify-between gap-2"
                                    >
                                        <span className="flex items-center gap-2">
                                            <User className="w-5 h-5 text-primary" />
                                            <span className="font-bold">{user.name}</span>
                                        </span>
                                        <span className="text-xs font-semibold text-foreground/70">{profileMenuOpen ? 'Hide' : 'Menu'}</span>
                                    </button>
                                    {profileMenuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.15 }}
                                            className="px-2 pb-2 space-y-1"
                                        >
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); navigate('/profile'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-3"
                                            >
                                                <User className="w-4 h-4 text-[#0EA5E9]" />
                                                <span>My Profile</span>
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); setMobileMenuOpen(false); navigate('/ride-history'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-3"
                                            >
                                                <History className="w-4 h-4 text-[#0EA5E9]" />
                                                <span>Ride History</span>
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); setMobileMenuOpen(false); navigate('/saved-locations'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-3"
                                            >
                                                <MapPin className="w-4 h-4 text-[#0EA5E9]" />
                                                <span>Saved Locations</span>
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); setMobileMenuOpen(false); navigate('/promo-codes'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-3"
                                            >
                                                <Tag className="w-4 h-4 text-[#0EA5E9]" />
                                                <span>Promo Codes</span>
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); setMobileMenuOpen(false); navigate('/emergency'); }}
                                                className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-3"
                                            >
                                                <Shield className="w-4 h-4 text-[#ef4444]" />
                                                <span>Emergency SOS</span>
                                            </button>
                                            <div className="my-2 h-px bg-white/10" />
                                            <div className="px-3 py-2.5 flex items-center justify-between">
                                                <span className="text-sm font-medium text-white">Theme</span>
                                                <ThemeToggle />
                                            </div>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); handleLogout(); }}
                                                className="w-full px-3 py-2.5 text-sm font-semibold bg-[#ef4444] text-white rounded-lg hover:bg-[#dc2626] transition-colors flex items-center gap-3 justify-center"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                <span>Logout</span>
                                            </button>
                                        </motion.div>
                                    )}
                                    
                                    {/* Mobile Notifications Button */}
                                    <div className="relative">
                                        <button
                                            onClick={() => { setNotifOpen((v) => !v); setUnreadCount(0); }}
                                            className="w-full px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center justify-between gap-2 group"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Bell className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                                <span>Notifications</span>
                                            </div>
                                            {unreadCount > 0 && (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white min-w-[20px] text-center">
                                                    {unreadCount}
                                                </span>
                                            )}
                                        </button>
                                        <AnimatePresence>
                                            {notifOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                                    transition={{ duration: 0.2 }}
                                                    ref={notifRef}
                                                    className="absolute right-0 top-full mt-2 w-full max-w-[85vw] rounded-2xl border border-[#1A1A1A] bg-gradient-to-b from-[#111111] to-[#0A0A0A] shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl z-50 overflow-hidden"
                                                >
                                                    {/* Header */}
                                                    <div className="px-4 py-3 border-b border-[#1A1A1A] bg-gradient-to-r from-[#0EA5E9]/5 to-transparent">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-7 h-7 rounded-lg bg-[#0EA5E9]/20 flex items-center justify-center">
                                                                    <Bell className="w-3.5 h-3.5 text-[#0EA5E9]" />
                                                                </div>
                                                                <span className="text-sm font-bold text-white">Notifications</span>
                                                                {unreadCount > 0 && (
                                                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ef4444] text-white">
                                                                        {unreadCount > 99 ? '99+' : unreadCount}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {notifications.length > 0 && (
                                                                <motion.button
                                                                    whileHover={{ scale: 1.05 }}
                                                                    whileTap={{ scale: 0.95 }}
                                                                    onClick={async () => {
                                                                        try {
                                                                            await notificationService.markAllRead();
                                                                            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
                                                                            setUnreadCount(0);
                                                                        } catch {}
                                                                    }}
                                                                    className="px-2.5 py-1 rounded-lg border border-[#1A1A1A] hover:bg-[#1A1A1A] hover:border-[#0EA5E9]/30 text-[10px] font-semibold text-white/80 hover:text-white transition-all"
                                                                >
                                                                    Mark all read
                                                                </motion.button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Notifications List */}
                                                    {notifications.length === 0 ? (
                                                        <div className="px-4 py-10 text-center">
                                                            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-[#1A1A1A] flex items-center justify-center">
                                                                <Bell className="w-6 h-6 text-white/20" />
                                                            </div>
                                                            <div className="text-sm font-medium text-white/60">No notifications</div>
                                                        </div>
                                                    ) : (
                                                        <div className="max-h-80 overflow-auto">
                                                            <div className="p-2 space-y-1.5">
                                                                {notifications.map((n, idx) => {
                                                                    const id = n.notification_id ?? n.id ?? null;
                                                                    const msg = String(n.message || '');
                                                                    const isSafety = /reached\s+safe|reached\s+safely|hope you reached/i.test(msg);
                                                                    const isUnread = !n.is_read;
                                                                    return (
                                                                        <motion.div
                                                                            key={id || msg}
                                                                            initial={{ opacity: 0, x: -20 }}
                                                                            animate={{ opacity: 1, x: 0 }}
                                                                            transition={{ delay: idx * 0.03 }}
                                                                            whileHover={{ scale: 1.01, y: -2 }}
                                                                            className={`p-3 rounded-xl border transition-all duration-200 shadow-lg hover:shadow-xl ${
                                                                                isUnread
                                                                                    ? 'border-[#0EA5E9]/40 bg-gradient-to-br from-[#0EA5E9]/15 to-[#0A0A0A]'
                                                                                    : 'border-[#1A1A1A] bg-gradient-to-br from-[#111111] to-[#0A0A0A] hover:border-[#1F1F1F]'
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-start gap-2.5">
                                                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border-2 border-dashed transition-all ${
                                                                                    isUnread 
                                                                                        ? 'bg-gradient-to-br from-[#0EA5E9]/20 to-[#0891b2]/20 border-[#0EA5E9]/40' 
                                                                                        : 'bg-[#1A1A1A] border-[#1A1A1A]'
                                                                                }`}>
                                                                                    <Bell className={`w-4 h-4 ${isUnread ? 'text-[#0EA5E9]' : 'text-white/40'}`} />
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex items-center gap-2 mb-1.5">
                                                                                        <div className="text-[10px] text-white/50 font-medium">
                                                                                            {new Date(n.created_at).toLocaleString?.() || ''}
                                                                                        </div>
                                                                                        {isUnread && (
                                                                                            <span className="px-1.5 py-0.5 bg-[#0EA5E9]/20 text-[#0EA5E9] text-[9px] font-semibold rounded-full">New</span>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className={`text-xs font-bold mb-2 leading-relaxed ${
                                                                                        isUnread ? 'text-white' : 'text-white/90'
                                                                                    }`}>
                                                                                        {msg}
                                                                                    </div>
                                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                                        {isSafety && id && (
                                                                                            <motion.button
                                                                                                whileHover={{ scale: 1.05 }}
                                                                                                whileTap={{ scale: 0.95 }}
                                                                                                onClick={() => handleAckSafety(id)}
                                                                                                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-[10px] font-semibold hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)] transition-all flex items-center gap-1 border border-[#10b981]/30"
                                                                                            >
                                                                                                <CheckCircle className="w-3 h-3" />
                                                                                                I'm Safe
                                                                                            </motion.button>
                                                                                        )}
                                                                                        {id && (
                                                                                            <motion.button
                                                                                                whileHover={{ scale: 1.05 }}
                                                                                                whileTap={{ scale: 0.95 }}
                                                                                                onClick={() => handleMarkRead(id)}
                                                                                                className="px-2.5 py-1 rounded-lg border-2 border-dashed border-[#1A1A1A] hover:border-[#1F1F1F] hover:bg-[#1A1A1A] text-white/70 hover:text-white text-[10px] font-semibold transition-all"
                                                                                            >
                                                                                                Dismiss
                                                                                            </motion.button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </motion.div>
                                                                    );
                                                                })}
                                                            </div>
                                                            {notifHasMore && (
                                                                <div className="p-2 border-t border-[#1A1A1A]">
                                                                    <motion.button
                                                                        whileHover={{ scale: 1.02, y: -2 }}
                                                                        whileTap={{ scale: 0.98 }}
                                                                        onClick={async () => {
                                                                            try {
                                                                                const next = notifPage + 1;
                                                                                const resp = await notificationService.list({ page: next, limit: 20 });
                                                                                const list = Array.isArray(resp.data) ? resp.data : [];
                                                                                setNotifications((prev) => [...prev, ...list]);
                                                                                setNotifPage(next);
                                                                                setNotifHasMore(!!resp.hasMore);
                                                                            } catch {}
                                                                        }}
                                                                        className="w-full px-3 py-2 rounded-xl border-2 border-dashed border-[#1A1A1A] hover:border-[#0EA5E9]/30 hover:bg-[#1A1A1A] text-white text-[10px] font-semibold transition-all shadow-lg hover:shadow-xl"
                                                                    >
                                                                        Load more
                                                                    </motion.button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    
                                    <Link
                                        to="/search"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="block px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center gap-2 group"
                                    >
                                        <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                        Search Rides
                                    </Link>
                                    
                                    {(user.user_type === 'driver' || user.user_type === 'both') && (
                                        <>
                                            <Link
                                                to="/driver/dashboard"
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="block px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center gap-2 group"
                                            >
                                                <LayoutDashboard className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                                Driver Dashboard
                                            </Link>
                                            <Link
                                                to="/vehicles"
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="block px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center gap-2 group"
                                            >
                                                <Car className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                                Vehicles
                                            </Link>
                                        </>
                                    )}
                                    
                                    {(user.user_type === 'passenger' || user.user_type === 'both') && (
                                        <Link
                                            to="/passenger/dashboard"
                                            onClick={() => setMobileMenuOpen(false)}
                                            className="block px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center gap-2 group"
                                        >
                                            <Receipt className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                            My Bookings
                                        </Link>
                                    )}

                                    <Link
                                        to="/wallet"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="block px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center gap-2 group"
                                    >
                                        <DollarSign className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                        Wallet
                                    </Link>

                                    <Link
                                        to="/feedback"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center gap-2 group"
                                    >
                                        <Star className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                        Feedback
                                    </Link>

                                    <Link
                                        to="/messages"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center gap-2 group"
                                    >
                                        <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                        Messages
                                    </Link>

                                    <Link
                                        to="/receipts"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center gap-2 group"
                                    >
                                        <Receipt className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                        Receipts
                                    </Link>

                                    {/* Logout moved inside profile dropdown above */}
                                </>
                            ) : (
                                <>
                                    <Link
                                        to="/search"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="px-4 py-3 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft flex items-center gap-2 group"
                                    >
                                        <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                        Search Rides
                                    </Link>
                                    <Link
                                        to="/login"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="block px-4 py-3.5 text-sm font-bold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-soft text-center"
                                    >
                                        Login
                                    </Link>
                                    <Link
                                        to="/register"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="block px-4 py-3.5 text-sm font-bold bg-gradient-to-r from-primary to-secondary text-white rounded-xl shadow-glow-lg hover:shadow-glow hover:brightness-110 transition-all text-center"
                                    >
                                        Register
                                    </Link>
                                </>
                            )}
                        </div>
                </div>
            )}
        </nav>
    );
};

export default Navbar;




