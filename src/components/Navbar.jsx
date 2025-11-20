import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ui/ThemeToggle';
import { Menu, X, Search, LayoutDashboard, Receipt, LogOut, User, Bell, Car, DollarSign, Star, MapPin, Tag, Shield, History, MessageSquare } from 'lucide-react';
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
        <nav className="fixed inset-x-0 top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="flex items-center justify-between h-20">
                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-3 group">
                        <Lottie
                            lottieRef={lottieRef}
                            animationData={logoAnimation}
                            loop
                            autoplay={true}
                            className="w-[45px] h-[60px] rounded-full"
                        />
                        <div className="hidden sm:flex flex-col">
                            <span className="font-bold text-xl text-gray-900 dark:text-gray-100">Cab Bazaar</span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-wider uppercase">Ride Sharing</span>
                        </div>
                    </Link>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center gap-2 relative">
                        {user ? (
                            <>
                                {/* Primary Actions */}
                                <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                    <Link to="/search" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2">
                                        <Search className="w-4 h-4" />
                                        <span className="hidden lg:inline">Search</span>
                                    </Link>
                                    
                                    {(user.user_type === 'driver' || user.user_type === 'both') && (
                                        <>
                                            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
                                            <Link to="/driver/dashboard" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2">
                                                <LayoutDashboard className="w-4 h-4" />
                                                <span className="hidden lg:inline">Driver</span>
                                            </Link>
                                            <Link to="/vehicles" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2">
                                                <Car className="w-4 h-4" />
                                                <span className="hidden lg:inline">Vehicles</span>
                                            </Link>
                                        </>
                                    )}
                                    
                                    {(user.user_type === 'passenger' || user.user_type === 'both') && (
                                        <>
                                            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
                                            <Link to="/passenger/dashboard" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2">
                                                <Receipt className="w-4 h-4" />
                                                <span className="hidden lg:inline">Bookings</span>
                                            </Link>
                                        </>
                                    )}
                                </div>

                                {/* Secondary Actions */}
                                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                                    <Link to="/wallet" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Wallet">
                                        <DollarSign className="w-4 h-4" />
                                    </Link>

                                    <Link to="/messages" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Messages">
                                        <MessageSquare className="w-4 h-4" />
                                    </Link>

                                    <Link to="/feedback" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Feedback">
                                        <Star className="w-4 h-4" />
                                    </Link>

                                    <Link to="/receipts" className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Receipts">
                                        <Receipt className="w-4 h-4" />
                                    </Link>
                                </div>

                                <div className="h-8 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

                                {/* Notifications bell */}
                                <div className="relative">
                                    <button
                                        onClick={() => { setNotifOpen((v) => !v); setUnreadCount(0); }}
                                        className="relative px-3 py-2.5 rounded-xl hover:bg-white/30 dark:hover:bg-white/10 transition-all hover:scale-105 hover:shadow-md group"
                                        aria-label="Notifications"
                                    >
                                        <Bell className={`w-5 h-5 transition-all ${unreadCount > 0 ? 'text-primary animate-pulse' : ''} group-hover:scale-110`} />
                                        {unreadCount > 0 && (
                                            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white min-w-[18px] text-center">
                                                {unreadCount > 99 ? '99+' : unreadCount}
                                            </span>
                                        )}
                                    </button>
                                    {notifOpen && (
                                        <div
                                            ref={notifRef}
                                            className="absolute right-0 top-12 w-96 max-w-[85vw] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3 z-50"
                                        >
                                                <div className="px-3 py-2 text-xs font-semibold text-foreground/70 flex items-center justify-between gap-2">
                                                    <span>Notifications</span>
                                                    {notifications.length > 0 && (
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await notificationService.markAllRead();
                                                                    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
                                                                    setUnreadCount(0);
                                                                } catch {}
                                                            }}
                                                            className="px-2 py-1 rounded-lg border border-border hover:bg-white/20 text-[11px] font-semibold"
                                                        >
                                                            Mark all read
                                                        </button>
                                                    )}
                                                </div>
                                                {notifications.length === 0 ? (
                                                    <div className="px-3 py-4 text-sm text-muted-foreground">No notifications</div>
                                                ) : (
                                                    <div className="max-h-64 overflow-auto pr-1 space-y-1">
                                                        {notifications.map((n) => {
                                                            const id = n.notification_id ?? n.id ?? null;
                                                            const msg = String(n.message || '');
                                                            const isSafety = /reached\s+safe|reached\s+safely|hope you reached/i.test(msg);
                                                            return (
                                                                <div key={id || msg} className="px-3 py-2 rounded-xl border border-white/10 bg-white/40 dark:bg-white/10 text-sm">
                                                                    <div className="text-xs text-muted-foreground mb-0.5">{new Date(n.created_at).toLocaleString?.() || ''}</div>
                                                                    <div className="font-medium mb-2">{msg}</div>
                                                                    <div className="flex items-center gap-2">
                                                                        {isSafety && id && (
                                                                            <button
                                                                                onClick={() => handleAckSafety(id)}
                                                                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                                                                            >
                                                                                I'm Safe
                                                                            </button>
                                                                        )}
                                                                        {id && (
                                                                            <button
                                                                                onClick={() => handleMarkRead(id)}
                                                                                className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-white/20"
                                                                            >
                                                                                Dismiss
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        {notifHasMore && (
                                                            <div className="px-3 py-2">
                                                                <button
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
                                                                    className="w-full px-3 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-white/20"
                                                                >
                                                                    Load more
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                </div>

                                <button
                                    onClick={() => setProfileMenuOpen((v) => !v)}
                                    className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                                        <User className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="hidden lg:flex flex-col items-start">
                                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{user.name}</span>
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium capitalize">{user.user_type}</span>
                                    </div>
                                </button>

                                {profileMenuOpen && (
                                    <div
                                        ref={menuRef}
                                        className="absolute right-0 top-16 w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3 z-50"
                                        role="menu"
                                        aria-label="User menu"
                                    >
                                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Account</div>
                                        <button
                                            onClick={() => { setProfileMenuOpen(false); navigate('/profile'); }}
                                            className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                                            role="menuitem"
                                        >
                                            <User className="w-4 h-4" />
                                            My Profile
                                        </button>
                                        <button
                                            onClick={() => { setProfileMenuOpen(false); navigate('/ride-history'); }}
                                            className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                                            role="menuitem"
                                        >
                                            <History className="w-4 h-4" />
                                            Ride History
                                        </button>
                                        <button
                                            onClick={() => { setProfileMenuOpen(false); navigate('/saved-locations'); }}
                                            className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                                            role="menuitem"
                                        >
                                            <MapPin className="w-4 h-4" />
                                            Saved Locations
                                        </button>
                                        <button
                                            onClick={() => { setProfileMenuOpen(false); navigate('/promo-codes'); }}
                                            className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                                            role="menuitem"
                                        >
                                            <Tag className="w-4 h-4" />
                                            Promo Codes
                                        </button>
                                        <button
                                            onClick={() => { setProfileMenuOpen(false); navigate('/emergency'); }}
                                            className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                                            role="menuitem"
                                        >
                                            <Shield className="w-4 h-4" />
                                            Emergency SOS
                                        </button>
                                        <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                                        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</span>
                                            <ThemeToggle />
                                        </div>
                                        <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                                        <button
                                            onClick={() => { setProfileMenuOpen(false); handleLogout(); }}
                                            className="w-full mt-1 px-3 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 justify-center"
                                            role="menuitem"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            Logout
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <Link to="/search" className="px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-md hover:scale-105 flex items-center gap-2 group">
                                    <Search className="w-4 h-4 group-hover:scale-110 group-hover:text-primary transition-all" />
                                    <span className="hidden lg:inline">Search</span>
                                </Link>
                                <div className="flex items-center gap-2">
                                    <Link to="/login" className="px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-white/30 dark:hover:bg-white/10 rounded-xl transition-all hover:shadow-md hover:scale-105">
                                        Login
                                    </Link>
                                    <Link to="/register" className="px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-primary to-secondary text-white rounded-xl shadow-lg hover:shadow-xl hover:brightness-110 hover:scale-105 transition-all">
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
                <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                    <div className="px-4 py-6 space-y-3">
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
                                        <div className="px-3 pb-2">
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); navigate('/profile'); }}
                                                className="w-full text-left px-3 py-3 text-sm font-semibold hover:bg-white/30 dark:hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 mb-1"
                                            >
                                                <User className="w-5 h-5" />
                                                My Profile
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); setMobileMenuOpen(false); navigate('/ride-history'); }}
                                                className="w-full text-left px-3 py-3 text-sm font-semibold hover:bg-white/30 dark:hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 mb-1"
                                            >
                                                <History className="w-5 h-5" />
                                                Ride History
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); setMobileMenuOpen(false); navigate('/saved-locations'); }}
                                                className="w-full text-left px-3 py-3 text-sm font-semibold hover:bg-white/30 dark:hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 mb-1"
                                            >
                                                <MapPin className="w-5 h-5" />
                                                Saved Locations
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); setMobileMenuOpen(false); navigate('/promo-codes'); }}
                                                className="w-full text-left px-3 py-3 text-sm font-semibold hover:bg-white/30 dark:hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 mb-1"
                                            >
                                                <Tag className="w-5 h-5" />
                                                Promo Codes
                                            </button>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); setMobileMenuOpen(false); navigate('/emergency'); }}
                                                className="w-full text-left px-3 py-3 text-sm font-semibold hover:bg-white/30 dark:hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 mb-1"
                                            >
                                                <Shield className="w-5 h-5" />
                                                Emergency SOS
                                            </button>
                                            <div className="my-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                                            <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl hover:bg-white/20 dark:hover:bg-white/10 transition-colors mb-2">
                                                <span className="text-sm font-semibold">Theme</span>
                                                <ThemeToggle />
                                            </div>
                                            <button
                                                onClick={() => { setProfileMenuOpen(false); handleLogout(); }}
                                                className="w-full px-4 py-3.5 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-soft hover:shadow-glow flex items-center justify-center gap-2"
                                            >
                                                <LogOut className="w-5 h-5" />
                                                Logout
                                            </button>
                                        </div>
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
                                        {notifOpen && (
                                            <div
                                                ref={notifRef}
                                                className="absolute right-0 top-full mt-2 w-full max-w-[85vw] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-2 z-50"
                                            >
                                                    <div className="px-3 py-2 text-xs font-semibold text-foreground/70 flex items-center justify-between gap-2">
                                                        <span>Notifications</span>
                                                        {notifications.length > 0 && (
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        await notificationService.markAllRead();
                                                                        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
                                                                        setUnreadCount(0);
                                                                    } catch {}
                                                                }}
                                                                className="px-2 py-1 rounded-lg border border-border hover:bg-white/20 text-[11px] font-semibold"
                                                            >
                                                                Mark all read
                                                            </button>
                                                        )}
                                                    </div>
                                                    {notifications.length === 0 ? (
                                                        <div className="px-3 py-4 text-sm text-muted-foreground">No notifications</div>
                                                    ) : (
                                                        <div className="max-h-64 overflow-auto pr-1 space-y-1">
                                                            {notifications.map((n) => {
                                                                const id = n.notification_id ?? n.id ?? null;
                                                                const msg = String(n.message || '');
                                                                const isSafety = /reached\s+safe|reached\s+safely|hope you reached/i.test(msg);
                                                                return (
                                                                    <div key={id || msg} className="px-3 py-2 rounded-xl border border-white/10 bg-white/40 dark:bg-white/10 text-sm">
                                                                        <div className="text-xs text-muted-foreground mb-0.5">{new Date(n.created_at).toLocaleString?.() || ''}</div>
                                                                        <div className="font-medium mb-2">{msg}</div>
                                                                        <div className="flex items-center gap-2">
                                                                            {isSafety && id && (
                                                                                <button
                                                                                    onClick={() => handleAckSafety(id)}
                                                                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                                                                                >
                                                                                    I'm Safe
                                                                                </button>
                                                                            )}
                                                                            {id && (
                                                                                <button
                                                                                    onClick={() => handleMarkRead(id)}
                                                                                    className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-white/20"
                                                                                >
                                                                                    Dismiss
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                            {notifHasMore && (
                                                                <div className="px-3 py-2">
                                                                    <button
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
                                                                        className="w-full px-3 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-white/20"
                                                                    >
                                                                        Load more
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                            </div>
                                        )}
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




