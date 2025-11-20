import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import LandingRedirect from './pages/LandingRedirect';
import Login from './pages/Login';
import Register from './pages/Register';
import SearchRides from './pages/SearchRides';
import RideDetails from './pages/RideDetails';
import DriverDashboard from './pages/DriverDashboard';
import PassengerDashboard from './pages/PassengerDashboard';
import Payment from './pages/Payment';
import NotFound from './pages/NotFound';
import AdminDocuments from './pages/AdminDocuments';
import Profile from './pages/Profile';
import Vehicles from './pages/Vehicles';
import Wallet from './pages/Wallet';
import Feedback from './pages/Feedback';
import Receipts from './pages/Receipts';
import RequestRide from './pages/RequestRide';
import Notifications from './pages/Notifications';
import SavedLocations from './pages/SavedLocations';
import PromoCodes from './pages/PromoCodes';
import EmergencySOS from './pages/EmergencySOS';
import RideHistory from './pages/RideHistory';
import AdminAnalytics from './pages/AdminAnalytics';
import Messages from './pages/Messages';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <div className="app">
              <Navbar />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<LandingRedirect />} />
                  <Route path="/home" element={<Home />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/search" element={<SearchRides />} />
                  <Route path="/rides/:id" element={<RideDetails />} />
                  <Route path="/payment" element={<Payment />} />
                  
                  <Route 
                    path="/profile" 
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />
                  
                  <Route 
                    path="/driver/dashboard" 
                    element={
                      <ProtectedRoute allowedRoles={['driver']}>
                        <DriverDashboard />
                      </ProtectedRoute>
                    } 
                  />
                  
                  <Route 
                    path="/passenger/dashboard" 
                    element={
                      <ProtectedRoute allowedRoles={['passenger']}>
                        <PassengerDashboard />
                      </ProtectedRoute>
                    } 
                  />

                  <Route 
                    path="/admin/documents" 
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminDocuments />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/admin/analytics" 
                    element={
                      <ProtectedRoute allowedRoles={['admin']}>
                        <AdminAnalytics />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/vehicles" 
                    element={
                      <ProtectedRoute allowedRoles={['driver', 'both']}>
                        <Vehicles />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/wallet" 
                    element={
                      <ProtectedRoute>
                        <Wallet />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/feedback" 
                    element={
                      <ProtectedRoute>
                        <Feedback />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/receipts" 
                    element={
                      <ProtectedRoute>
                        <Receipts />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/request-ride" 
                    element={
                      <ProtectedRoute>
                        <RequestRide />
                      </ProtectedRoute>
                    }
                  />
                  <Route 
                    path="/notifications" 
                    element={
                      <ProtectedRoute>
                        <Notifications />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/saved-locations" 
                    element={
                      <ProtectedRoute>
                        <SavedLocations />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/promo-codes" 
                    element={
                      <ProtectedRoute>
                        <PromoCodes />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/emergency" 
                    element={
                      <ProtectedRoute>
                        <EmergencySOS />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/ride-history" 
                    element={
                      <ProtectedRoute>
                        <RideHistory />
                      </ProtectedRoute>
                    }
                  />

                  <Route 
                    path="/messages" 
                    element={
                      <ProtectedRoute>
                        <Messages />
                      </ProtectedRoute>
                    }
                  />
                  
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
              
              <footer className="border-t border-[#1A1A1A] bg-[#000000] mt-auto">
                <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-12">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                    {/* Brand Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0EA5E9]/20 to-[#0891b2]/20 border-2 border-dashed border-[#0EA5E9]/40 flex items-center justify-center">
                          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#0EA5E9] to-[#0891b2]"></div>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold bg-gradient-to-r from-[#0EA5E9] to-[#0891b2] bg-clip-text text-transparent">
                            Cab Bazaar
                          </h3>
                          <p className="text-[10px] text-white/60 font-medium tracking-wider uppercase">Ride Sharing</p>
                        </div>
                      </div>
                      <p className="text-sm text-white/60 leading-relaxed">
                        Your trusted ride-sharing platform. Connecting drivers and passengers seamlessly.
                      </p>
                    </div>

                    {/* Quick Links */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Quick Links</h4>
                      <ul className="space-y-2">
                        <li>
                          <a href="/search" className="text-sm text-white/60 hover:text-[#0EA5E9] transition-colors duration-200">
                            Search Rides
                          </a>
                        </li>
                        <li>
                          <a href="/ride-history" className="text-sm text-white/60 hover:text-[#0EA5E9] transition-colors duration-200">
                            Ride History
                          </a>
                        </li>
                        <li>
                          <a href="/promo-codes" className="text-sm text-white/60 hover:text-[#0EA5E9] transition-colors duration-200">
                            Promo Codes
                          </a>
                        </li>
                        <li>
                          <a href="/feedback" className="text-sm text-white/60 hover:text-[#0EA5E9] transition-colors duration-200">
                            Feedback
                          </a>
                        </li>
                      </ul>
                    </div>

                    {/* Support */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Support</h4>
                      <ul className="space-y-2">
                        <li>
                          <a href="/emergency" className="text-sm text-white/60 hover:text-[#ef4444] transition-colors duration-200 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]"></span>
                            Emergency SOS
                          </a>
                        </li>
                        <li>
                          <a href="/profile" className="text-sm text-white/60 hover:text-[#0EA5E9] transition-colors duration-200">
                            My Profile
                          </a>
                        </li>
                        <li>
                          <a href="/wallet" className="text-sm text-white/60 hover:text-[#0EA5E9] transition-colors duration-200">
                            Wallet
                          </a>
                        </li>
                        <li>
                          <a href="/receipts" className="text-sm text-white/60 hover:text-[#0EA5E9] transition-colors duration-200">
                            Receipts
                          </a>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-gradient-to-r from-transparent via-[#1A1A1A] to-transparent mb-8"></div>

                  {/* Copyright */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-sm text-white/60">
                      &copy; 2025 <span className="font-bold bg-gradient-to-r from-[#0EA5E9] to-[#0891b2] bg-clip-text text-transparent">Ride Sharing DBMS</span>. All rights reserved.
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/40">Made with</span>
                      <span className="text-[#ef4444] animate-pulse">❤️</span>
                      <span className="text-xs text-white/40">for seamless rides</span>
                    </div>
                  </div>
                </div>
              </footer>
            </div>
          </Router>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
