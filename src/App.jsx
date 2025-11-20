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
              
              <footer className="footer">
                <p>&copy; 2025 Ride Sharing DBMS. All rights reserved.</p>
              </footer>
            </div>
          </Router>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
