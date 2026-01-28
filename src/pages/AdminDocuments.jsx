import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, User, X, Car, FileText, Bell, MapPin, Phone, Mail, Calendar, Navigation, AlertTriangle, Shield } from 'lucide-react';
import io from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';
import { documentService } from '../services/documentService';
import { useToast } from '../components/ui/Toast';

const AdminDocuments = () => {
  const [pending, setPending] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [pendingVehicles, setPendingVehicles] = useState([]);
  const [activeTab, setActiveTab] = useState('notifications');
  const { user } = useAuth();
  const toast = useToast();

  const VERIFIABLE_TYPES = ['license', 'registration'];
  const isVerifiableType = (docType) => VERIFIABLE_TYPES.includes(String(docType || '').toLowerCase());

  const loadPending = async () => {
    try {
      const response = await documentService.listPending();
      const documentList = (Array.isArray(response.data) ? response.data : []).filter(d => isVerifiableType(d.doc_type));
      const driverMap = new Map();
      for (const document of documentList) {
        const driverId = document.driver_id;
        if (!driverMap.has(driverId)) {
          driverMap.set(driverId, {
            driver_id: document.driver_id,
            driver_name: document.driver_name,
            driver_email: document.driver_email,
            driver_phone: document.driver_phone,
            count: 1
          });
        } else {
          driverMap.get(driverId).count += 1;
        }
      }
      setPending(Array.from(driverMap.values()));
    } catch (error) {
      console.error('Failed to load pending drivers:', error);
      setPending([]);
    }
  };

  const loadDocs = async (driverId) => {
    if (!driverId) return;
    setLoading(true);
    setError('');
    try {
      const response = await documentService.list(driverId);
      const onlyVerifiable = (Array.isArray(response.data) ? response.data : []).filter(d => isVerifiableType(d.doc_type));
      setDocs(onlyVerifiable);
    } catch (error) {
      console.error('Failed to load documents:', error);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDriver = async (driver) => {
    setSelectedDriver(driver);
    await loadDocs(driver.driver_id);
  };

  const handleCloseDriver = () => {
    setSelectedDriver(null);
    setDocs([]);
  };

  const handleApprove = async (docId) => {
    if (!selectedDriver) return;
    try {
      await documentService.approve(selectedDriver.driver_id, docId);
      await Promise.all([loadDocs(selectedDriver.driver_id), loadPending()]);
    } catch (error) {
      console.error('Failed to approve document:', error);
      setError('Failed to approve document');
    }
  };

  const handleReject = async (docId) => {
    if (!selectedDriver) return;
    try {
      await documentService.reject(selectedDriver.driver_id, docId);
      await Promise.all([loadDocs(selectedDriver.driver_id), loadPending()]);
    } catch (error) {
      console.error('Failed to reject document:', error);
      setError('Failed to reject document');
    }
  };

  const loadPendingVehicles = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const adminBase = apiBase.replace(/\/api\/?$/, '');
      const { data } = await api.get(`${adminBase}/admin/vehicles/pending`, { baseURL: '' });
      if (data?.success) setPendingVehicles(data.data || []);
    } catch (e) {
      console.error('Failed to load pending vehicles:', e);
      setPendingVehicles([]);
    }
  };

  const handleApproveVehicle = async (vehicleId) => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const adminBase = apiBase.replace(/\/api\/?$/, '');
      await api.put(`${adminBase}/admin/vehicles/${vehicleId}/approve`, { verification_status: 'approved' }, { baseURL: '' });
      toast.success('Vehicle approved');
      loadPendingVehicles();
    } catch (e) {
      toast.error('Failed to approve vehicle');
    }
  };

  const handleRejectVehicle = async (vehicleId) => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const adminBase = apiBase.replace(/\/api\/?$/, '');
      await api.put(`${adminBase}/admin/vehicles/${vehicleId}/approve`, { verification_status: 'rejected' }, { baseURL: '' });
      toast.success('Vehicle rejected');
      loadPendingVehicles();
    } catch (e) {
      toast.error('Failed to reject vehicle');
    }
  };

  useEffect(() => {
    loadPending();
    loadPendingVehicles();
  }, []);

  const loadNotifications = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const adminBase = apiBase.replace(/\/api\/?$/, '');
      const { data } = await api.get(`${adminBase}/admin/notifications`, { baseURL: '' });
      if (data?.success) {
        setNotifications(data.data || []);
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
      toast.error('Failed to load notifications');
    }
  };

  useEffect(() => {
    loadNotifications();
    if (!user) return;
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    const socket = io(socketUrl, { transports: ['websocket'] });

    socket.on('connect', () => {
      socket.emit('user_register', { user_id: user.user_id });
    });

    socket.on('notification', (notification) => {
      setNotifications((prev) => {
        const exists = prev.some(n => n.notification_id === notification.notification_id);
        if (exists) return prev;
        return [notification, ...prev].slice(0, 100);
      });
      setTimeout(() => loadNotifications(), 500);
      if (notification.message && (notification.message.toLowerCase().includes('sos') || notification.message.includes('🚨'))) {
        toast.error('🚨 SOS Alert Received', { duration: 10000 });
      }
    });

    socket.on('sos_alert_admin', (payload) => {
      toast.error('🚨 URGENT SOS ALERT - ADMIN ACTION REQUIRED', { duration: 15000 });
      setTimeout(() => loadNotifications(), 1000);
    });

    socket.on('sos_alert_admin_broadcast', (payload) => {
      toast.error('🚨 URGENT SOS ALERT - ADMIN ACTION REQUIRED', { duration: 15000 });
      setTimeout(() => loadNotifications(), 1000);
    });

    return () => socket.disconnect();
  }, [user, toast]);

  const getStatusColor = (status) => {
    const s = String(status).toLowerCase();
    if (s === 'pending') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (s === 'approved') return 'bg-green-100 text-green-700 border-green-200';
    return 'bg-red-100 text-red-700 border-red-200';
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 sm:px-6 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Admin Panel</h1>
        <p className="text-gray-600">Review and verify driver documents and vehicle registrations.</p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-2 rounded-lg bg-white border border-gray-200 shadow-md w-fit">
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 relative ${activeTab === 'notifications'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
        >
          <Bell className="w-4 h-4" />
          Notifications
          {notifications.filter(n => !n.is_read && (n.message?.toLowerCase().includes('sos') || n.message?.includes('🚨'))).length > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white min-w-[18px] text-center">
              {notifications.filter(n => !n.is_read && (n.message?.toLowerCase().includes('sos') || n.message?.includes('🚨'))).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'documents'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
        >
          <FileText className="w-4 h-4" />
          Documents
        </button>
        <button
          onClick={() => setActiveTab('vehicles')}
          className={`px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'vehicles'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
        >
          <Car className="w-4 h-4" />
          Vehicles
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <div className="w-10 h-10 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <section className="bg-white rounded-lg border border-gray-200 shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">All Notifications</h2>
            {notifications.filter(n => !n.is_read).length > 0 && (
              <button
                onClick={async () => {
                  try {
                    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                    const adminBase = apiBase.replace(/\/api\/?$/, '');
                    await Promise.all(notifications.filter(n => !n.is_read).map(n =>
                      api.patch(`${adminBase}/admin/notifications/${n.notification_id}/read`, {}, { baseURL: '' })
                    ));
                    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
                    toast.success('All notifications marked as read');
                  } catch (e) {
                    toast.error('Failed to mark notifications as read');
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-sm text-gray-500">No notifications yet.</p>
              <button
                onClick={loadNotifications}
                className="mt-4 px-4 py-2 text-xs font-semibold bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                Refresh Notifications
              </button>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-auto">
              {notifications.map((n) => {
                const isSOS = n.message?.toLowerCase().includes('sos') || n.message?.includes('🚨');
                const isUnread = !n.is_read;
                return (
                  <motion.div
                    key={n.notification_id || `notif-${n.created_at}-${Math.random()}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-lg border-2 transition-all ${isSOS
                        ? 'border-red-300 bg-red-50'
                        : isUnread
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        {isSOS && <AlertTriangle className="w-4 h-4 text-red-600" />}
                        {isUnread && <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />}
                        <span className="text-xs text-gray-500">
                          {n.created_at ? new Date(n.created_at).toLocaleString() : 'Just now'}
                        </span>
                      </div>
                      {isUnread && (
                        <button
                          onClick={async () => {
                            try {
                              const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                              const adminBase = apiBase.replace(/\/api\/?$/, '');
                              await api.patch(`${adminBase}/admin/notifications/${n.notification_id}/read`, {}, { baseURL: '' });
                              setNotifications(prev => prev.map(notif =>
                                notif.notification_id === n.notification_id ? { ...notif, is_read: 1 } : notif
                              ));
                              toast.success('Notification marked as read');
                            } catch (e) {
                              toast.error('Failed to mark notification as read');
                            }
                          }}
                          className="px-2 py-1 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-900">
                      {n.message || 'No message'}
                    </pre>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <section className="bg-white rounded-lg border border-gray-200 shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Drivers Pending Verification</h2>
          <p className="text-sm text-gray-500 mb-4">Select a driver to review and approve their documents.</p>
          {pending.length === 0 ? (
            <p className="text-sm text-gray-500">No pending drivers.</p>
          ) : (
            <div className="space-y-2">
              {pending.map((driver) => (
                <button
                  key={driver.driver_id}
                  onClick={() => handleOpenDriver(driver)}
                  className="w-full text-left px-4 py-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                      {String(driver.driver_name || 'U').trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">
                        {driver.driver_name}{' '}
                        <span className="text-xs text-gray-500">(#{driver.driver_id})</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-[240px] sm:max-w-none">
                        {driver.driver_email} • {driver.driver_phone}
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                    {driver.count} {driver.count === 1 ? 'pending document' : 'pending documents'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Vehicles Tab */}
      {activeTab === 'vehicles' && (
        <section className="bg-white rounded-lg border border-gray-200 shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Vehicles Pending Verification</h2>
          <p className="text-sm text-gray-500 mb-4">Review and approve vehicle registrations.</p>
          {pendingVehicles.length === 0 ? (
            <p className="text-sm text-gray-500">No pending vehicles.</p>
          ) : (
            <div className="space-y-3">
              {pendingVehicles.map((vehicle) => (
                <div key={vehicle.vehicle_id} className="rounded-lg border border-gray-200 p-5 flex items-start justify-between bg-gray-50">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 capitalize flex items-center gap-2 mb-2">
                      <Car className="w-5 h-5 text-blue-600" />
                      {vehicle.vehicle_model} • {vehicle.plate_number}
                    </div>
                    <div className="text-sm text-gray-500 mb-2">
                      Owner: {vehicle.driver_name || `Driver #${vehicle.driver_id}`}
                    </div>
                    <div className="text-sm text-gray-500">
                      Color: {vehicle.vehicle_color || 'N/A'} • Year: {vehicle.year || 'N/A'}
                    </div>
                    {vehicle.vehicle_image_url && (
                      <img src={vehicle.vehicle_image_url} alt="Vehicle" className="mt-3 w-full max-w-xs rounded-lg border border-gray-200" />
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleApproveVehicle(vehicle.vehicle_id)}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2 font-semibold hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleRejectVehicle(vehicle.vehicle_id)}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2 font-semibold hover:bg-red-700 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </motion.button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Driver Documents Modal */}
      <AnimatePresence>
        {selectedDriver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={handleCloseDriver}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-lg p-6 sm:p-8 max-w-3xl w-full shadow-xl border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Driver: {selectedDriver.driver_name}{' '}
                    <span className="text-xs text-gray-500">(#{selectedDriver.driver_id})</span>
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedDriver.driver_email} • {selectedDriver.driver_phone}
                  </p>
                </div>
                <button
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  onClick={handleCloseDriver}
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {docs.length === 0 ? (
                <div className="p-8 rounded-lg bg-gray-100 border border-gray-200 text-center mt-2">
                  <User className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-500">No documents loaded.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {docs.map((doc) => (
                    <div
                      key={doc.doc_id}
                      className="rounded-lg p-5 border border-gray-200 bg-gray-50 flex items-start justify-between"
                    >
                      <div className="pr-4">
                        <div className="font-semibold capitalize flex items-center gap-2 text-gray-900">
                          {doc.doc_type}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(doc.status)}`}>
                            {doc.status}
                          </span>
                        </div>
                        <a
                          className="text-blue-600 text-sm break-all underline hover:text-blue-800 transition-colors"
                          href={doc.file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {doc.file_url}
                        </a>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleApprove(doc.document_id)}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2 font-semibold hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleReject(doc.document_id)}
                          className="px-3 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2 font-semibold hover:bg-red-700 transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </motion.button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDocuments;