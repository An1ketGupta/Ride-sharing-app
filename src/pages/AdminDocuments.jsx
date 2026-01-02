import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, User, X, Car, FileText, Bell, MapPin, Phone, Mail, Calendar, Navigation, AlertTriangle, Shield } from 'lucide-react';
import io from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';
import { documentService } from '../services/documentService';
import { useToast } from '../components/ui/Toast';

// ============================================================================
// Component: AdminDocuments
// ============================================================================
const AdminDocuments = () => {
  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------
  const [pending, setPending] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [pendingVehicles, setPendingVehicles] = useState([]);
  const [activeTab, setActiveTab] = useState('notifications'); // 'notifications', 'documents', or 'vehicles'
  const { user } = useAuth();
  const toast = useToast();

  // --------------------------------------------------------------------------
  // Data Fetching Functions
  // --------------------------------------------------------------------------
  const VERIFIABLE_TYPES = ['license', 'registration'];
  const isVerifiableType = (docType) => VERIFIABLE_TYPES.includes(String(docType || '').toLowerCase());

  /**
   * Load all pending drivers with document counts
   * Groups documents by driver ID and counts pending items
   */
  const loadPending = async () => {
    try {
      const response = await documentService.listPending();
      const documentList = (Array.isArray(response.data) ? response.data : []).filter(d => isVerifiableType(d.doc_type));

      // Group documents by driver and count them
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

  /**
   * Load all documents for a specific driver
   * @param {string|number} driverId - The ID of the driver
   */
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

  // --------------------------------------------------------------------------
  // Event Handlers
  // --------------------------------------------------------------------------

  /**
   * Open driver modal and load their documents
   * @param {Object} driver - Driver object with id, name, email, phone
   */
  const handleOpenDriver = async (driver) => {
    setSelectedDriver(driver);
    await loadDocs(driver.driver_id);
  };

  /**
   * Close driver modal and clear document state
   */
  const handleCloseDriver = () => {
    setSelectedDriver(null);
    setDocs([]);
  };

  /**
   * Approve a document and refresh data
   * @param {string|number} docId - Document ID to approve
   */
  const handleApprove = async (docId) => {
    if (!selectedDriver) return;

    try {
      await documentService.approve(selectedDriver.driver_id, docId);

      // Refresh both documents and pending list
      await Promise.all([
        loadDocs(selectedDriver.driver_id),
        loadPending()
      ]);
    } catch (error) {
      console.error('Failed to approve document:', error);
      setError('Failed to approve document');
    }
  };

  /**
   * Reject a document and refresh data
   * @param {string|number} docId - Document ID to reject
   */
  const handleReject = async (docId) => {
    if (!selectedDriver) return;

    try {
      await documentService.reject(selectedDriver.driver_id, docId);

      // Refresh both documents and pending list
      await Promise.all([
        loadDocs(selectedDriver.driver_id),
        loadPending()
      ]);
    } catch (error) {
      console.error('Failed to reject document:', error);
      setError('Failed to reject document');
    }
  };

  // --------------------------------------------------------------------------
  // Effects
  // --------------------------------------------------------------------------
  const loadPendingVehicles = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const adminBase = apiBase.replace(/\/api\/?$/, '');
      // Query vehicles with pending verification
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
      await api.put(`${adminBase}/admin/vehicles/${vehicleId}/approve`,
        { verification_status: 'approved' },
        { baseURL: '' }
      );
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
      await api.put(`${adminBase}/admin/vehicles/${vehicleId}/approve`,
        { verification_status: 'rejected' },
        { baseURL: '' }
      );
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

  // Load notifications function - defined outside useEffect so it can be called from socket handlers
  const loadNotifications = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const adminBase = apiBase.replace(/\/api\/?$/, '');
      const { data } = await api.get(`${adminBase}/admin/notifications`, { baseURL: '' });
      if (data?.success) {
        setNotifications(data.data || []);
        console.log(`✅ Loaded ${data.data?.length || 0} notifications`);
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
      toast.error('Failed to load notifications');
    }
  };

  // Load notifications and setup realtime
  useEffect(() => {
    loadNotifications();

    if (!user) return;
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    const socket = io(socketUrl, { transports: ['websocket'] });
    socket.on('connect', () => {
      socket.emit('user_register', { user_id: user.user_id });
      console.log('✅ Admin socket connected:', socket.id);
    });

    socket.on('notification', (notification) => {
      console.log('📬 New notification received:', notification);
      // Add notification to state and reload to get latest
      setNotifications((prev) => {
        // Check if notification already exists
        const exists = prev.some(n => n.notification_id === notification.notification_id);
        if (exists) return prev;
        return [notification, ...prev].slice(0, 100);
      });
      // Also reload to ensure we have the latest from DB
      setTimeout(() => loadNotifications(), 500);
      // Show toast for SOS notifications
      if (notification.message && (notification.message.toLowerCase().includes('sos') || notification.message.includes('🚨'))) {
        toast.error('🚨 SOS Alert Received', { duration: 10000 });
      }
    });

    // Listen for SOS admin alerts
    socket.on('sos_alert_admin', (payload) => {
      try {
        console.log('🚨 SOS alert received via socket:', payload);
        // Build comprehensive alert message
        let alertMsg = `🚨🚨 EMERGENCY SOS ALERT 🚨🚨\n\n`;
        alertMsg += `Booking ID: #${payload.booking_id}\n`;
        if (payload.ride_id) alertMsg += `Ride ID: #${payload.ride_id}\n`;
        alertMsg += `\n📱 PASSENGER INFORMATION:\n`;
        alertMsg += `   Name: ${payload.passenger_name || 'N/A'}\n`;
        alertMsg += `   Phone: ${payload.passenger_phone || 'N/A'}\n`;
        if (payload.passenger_email) alertMsg += `   Email: ${payload.passenger_email}\n`;
        alertMsg += `   Passenger ID: ${payload.passenger_id}\n`;
        alertMsg += `\n🚗 DRIVER INFORMATION:\n`;
        alertMsg += `   Name: ${payload.driver_name || 'N/A'}\n`;
        alertMsg += `   Phone: ${payload.driver_phone || 'N/A'}\n`;
        if (payload.driver_email) alertMsg += `   Email: ${payload.driver_email}\n`;
        if (payload.driver_id) alertMsg += `   Driver ID: ${payload.driver_id}\n`;
        if (payload.vehicle_model || payload.vehicle_plate) {
          alertMsg += `\n🚙 VEHICLE INFORMATION:\n`;
          if (payload.vehicle_model) alertMsg += `   Model: ${payload.vehicle_model}\n`;
          if (payload.vehicle_color) alertMsg += `   Color: ${payload.vehicle_color}\n`;
          if (payload.vehicle_plate) alertMsg += `   License Plate: ${payload.vehicle_plate}\n`;
          if (payload.vehicle_capacity) alertMsg += `   Capacity: ${payload.vehicle_capacity} seats\n`;
        }
        alertMsg += `\n📍 RIDE INFORMATION:\n`;
        if (payload.source) alertMsg += `   Source: ${payload.source}\n`;
        if (payload.destination) alertMsg += `   Destination: ${payload.destination}\n`;
        if (payload.ride_date) alertMsg += `   Date: ${payload.ride_date}\n`;
        if (payload.ride_time) alertMsg += `   Time: ${payload.ride_time}\n`;
        if (payload.distance_km) alertMsg += `   Distance: ${payload.distance_km} km\n`;
        alertMsg += `   Fare: ₹10 per seat per km\n`; // Fixed fare
        if (payload.location?.lat && payload.location?.lon) {
          alertMsg += `\n📍 CURRENT LOCATION:\n`;
          alertMsg += `   Coordinates: ${payload.location.lat}, ${payload.location.lon}\n`;
          if (payload.location_link) alertMsg += `   Map: ${payload.location_link}\n`;
        }
        if (payload.details) {
          alertMsg += `\n📝 EMERGENCY DETAILS:\n   ${payload.details}\n`;
        }
        if (payload.emergency_contact_name) {
          alertMsg += `\n🆘 EMERGENCY CONTACT:\n`;
          alertMsg += `   Name: ${payload.emergency_contact_name}\n`;
          if (payload.emergency_contact_phone) alertMsg += `   Phone: ${payload.emergency_contact_phone}\n`;
          if (payload.emergency_contact_email) alertMsg += `   Email: ${payload.emergency_contact_email}\n`;
        }

        toast.error('🚨 URGENT SOS ALERT - ADMIN ACTION REQUIRED', { duration: 15000 });
        // Show critical alert dialog
        const confirmed = window.confirm(`${alertMsg}\n\nDo you want to view the location on OpenStreetMap?`);
        if (confirmed && payload.location?.lat && payload.location?.lon) {
          window.open(`https://www.openstreetmap.org/?mlat=${payload.location.lat}&mlon=${payload.location.lon}&zoom=16`, '_blank');
        }
        // Reload notifications to show the new SOS alert in the list
        setTimeout(() => loadNotifications(), 1000);
      } catch (err) {
        console.error('Error processing admin SOS alert:', err);
        toast.error('SOS admin alert received but failed to process');
      }
    });

    socket.on('sos_alert_admin_broadcast', (payload) => {
      try {
        console.log('🚨 Broadcast SOS alert received via socket:', payload);
        // Use the full formatted message if available, otherwise build from payload
        const alertMsg = payload.message || `🚨🚨 BROADCAST SOS ALERT 🚨🚨\n\nBooking ID: ${payload.booking_id}\nPassenger: ${payload.passenger_name || 'Unknown'} (${payload.passenger_phone || 'N/A'})\nDriver: ${payload.driver_name || 'Unknown'} (${payload.driver_phone || 'N/A'})`;
        toast.error('🚨 URGENT SOS ALERT - ADMIN ACTION REQUIRED', { duration: 15000 });
        if (payload.location?.lat && payload.location?.lon) {
          const confirmed = window.confirm(`${alertMsg}\n\nDo you want to view the location on OpenStreetMap?`);
          if (confirmed) {
            window.open(`https://www.openstreetmap.org/?mlat=${payload.location.lat}&mlon=${payload.location.lon}&zoom=16`, '_blank');
          }
        } else {
          alert(alertMsg);
        }
        // Reload notifications to show the new SOS alert in the list
        setTimeout(() => loadNotifications(), 1000);
      } catch (err) {
        console.error('Error processing broadcast SOS alert:', err);
        toast.error('Broadcast SOS alert received but failed to process');
      }
    });

    return () => socket.disconnect();
  }, [user, toast]);

  // --------------------------------------------------------------------------
  // Render Helpers
  // --------------------------------------------------------------------------

  /**
   * Parse SOS notification message and extract structured information
   */
  const parseSOSNotification = (message) => {
    if (!message) return null;

    const sections = {
      bookingId: null,
      passenger: {},
      driver: {},
      vehicle: {},
      ride: {},
      booking: {},
      emergencyDetails: null,
      location: {},
      emergencyContact: {}
    };

    // Extract Booking ID
    const bookingIdMatch = message.match(/Booking ID:\s*#?(\d+)/i);
    if (bookingIdMatch) sections.bookingId = bookingIdMatch[1];

    // Extract Passenger Information
    const passengerMatch = message.match(/📱 PASSENGER INFORMATION:([\s\S]*?)(?=🚗|📍|📝|🆘|$)/);
    if (passengerMatch) {
      const passengerText = passengerMatch[1];
      sections.passenger.name = passengerText.match(/Name:\s*(.+)/)?.[1]?.trim();
      sections.passenger.phone = passengerText.match(/Phone:\s*(.+)/)?.[1]?.trim();
      sections.passenger.email = passengerText.match(/Email:\s*(.+)/)?.[1]?.trim();
      sections.passenger.id = passengerText.match(/Passenger ID:\s*(\d+)/)?.[1];
    }

    // Extract Driver Information
    const driverMatch = message.match(/🚗 DRIVER INFORMATION:([\s\S]*?)(?=🚙|📍|📝|🆘|$)/);
    if (driverMatch) {
      const driverText = driverMatch[1];
      sections.driver.name = driverText.match(/Name:\s*(.+)/)?.[1]?.trim();
      sections.driver.phone = driverText.match(/Phone:\s*(.+)/)?.[1]?.trim();
      sections.driver.email = driverText.match(/Email:\s*(.+)/)?.[1]?.trim();
      sections.driver.id = driverText.match(/Driver ID:\s*(\d+)/)?.[1];
    }

    // Extract Vehicle Information
    const vehicleMatch = message.match(/🚙 VEHICLE INFORMATION:([\s\S]*?)(?=📍|📝|🆘|$)/);
    if (vehicleMatch) {
      const vehicleText = vehicleMatch[1];
      sections.vehicle.model = vehicleText.match(/Model:\s*(.+)/)?.[1]?.trim();
      sections.vehicle.color = vehicleText.match(/Color:\s*(.+)/)?.[1]?.trim();
      sections.vehicle.plate = vehicleText.match(/License Plate:\s*(.+)/)?.[1]?.trim();
      sections.vehicle.capacity = vehicleText.match(/Capacity:\s*(.+)/)?.[1]?.trim();
    }

    // Extract Ride Information
    const rideMatch = message.match(/📍 RIDE INFORMATION:([\s\S]*?)(?=🎫|📝|🆘|📍 CURRENT|$)/);
    if (rideMatch) {
      const rideText = rideMatch[1];
      sections.ride.source = rideText.match(/Source:\s*(.+)/)?.[1]?.trim();
      sections.ride.destination = rideText.match(/Destination:\s*(.+)/)?.[1]?.trim();
      sections.ride.date = rideText.match(/Date:\s*(.+)/)?.[1]?.trim();
      sections.ride.time = rideText.match(/Time:\s*(.+)/)?.[1]?.trim();
      sections.ride.distance = rideText.match(/Distance:\s*(.+)/)?.[1]?.trim();
      sections.ride.fare = rideText.match(/Fare:\s*(.+)/)?.[1]?.trim();
      sections.ride.status = rideText.match(/Ride Status:\s*(.+)/)?.[1]?.trim();
    }

    // Extract Booking Information
    const bookingMatch = message.match(/🎫 BOOKING INFORMATION:([\s\S]*?)(?=📝|🆘|📍 CURRENT|$)/);
    if (bookingMatch) {
      const bookingText = bookingMatch[1];
      sections.booking.seats = bookingText.match(/Seats Booked:\s*(.+)/)?.[1]?.trim();
      sections.booking.amount = bookingText.match(/Amount:\s*(.+)/)?.[1]?.trim();
      sections.booking.status = bookingText.match(/Booking Status:\s*(.+)/)?.[1]?.trim();
      sections.booking.date = bookingText.match(/Booking Date:\s*(.+)/)?.[1]?.trim();
    }

    // Extract Emergency Details
    const emergencyMatch = message.match(/📝 EMERGENCY DETAILS:\s*(.+?)(?=\n\n|🆘|📍 CURRENT|$)/s);
    if (emergencyMatch) {
      sections.emergencyDetails = emergencyMatch[1]?.trim();
    }

    // Extract Location
    const locationMatch = message.match(/📍 CURRENT PASSENGER LOCATION:([\s\S]*?)(?=🆘|$)/);
    if (locationMatch) {
      const locationText = locationMatch[1];
      sections.location.link = locationText.match(/https:\/\/www\.openstreetmap\.org\/\?mlat=([\d.-]+)&mlon=([\d.-]+)/)?.[0];
      const coordsMatch = locationText.match(/Coordinates:\s*([\d.-]+),\s*([\d.-]+)/);
      if (coordsMatch) {
        sections.location.lat = coordsMatch[1];
        sections.location.lon = coordsMatch[2];
      }
    }

    // Extract Emergency Contact
    const contactMatch = message.match(/🆘 EMERGENCY CONTACT:([\s\S]*?)$/);
    if (contactMatch) {
      const contactText = contactMatch[1];
      sections.emergencyContact.name = contactText.match(/Name:\s*(.+)/)?.[1]?.trim();
      sections.emergencyContact.phone = contactText.match(/Phone:\s*(.+)/)?.[1]?.trim();
      sections.emergencyContact.email = contactText.match(/Email:\s*(.+)/)?.[1]?.trim();
    }

    return sections;
  };

  /**
   * Render structured SOS notification card
   */
  const renderSOSNotification = (notification, parsedData) => {
    const isUnread = !notification.is_read;

    return (
      <motion.div
        key={notification.notification_id || `sos-${notification.created_at}-${Math.random()}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-xl border-2 border-red-500/50 bg-red-500/10 hover:bg-red-500/15 shadow-lg shadow-red-500/20 transition-all"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1">
            <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-600 text-gray-900 animate-pulse flex items-center gap-2">
              <AlertTriangle className="w-3 h-3" />
              🚨 EMERGENCY SOS ALERT
            </span>
            {parsedData.bookingId && (
              <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-white/10 text-foreground">
                Booking #{parsedData.bookingId}
              </span>
            )}
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {notification.created_at ? new Date(notification.created_at).toLocaleString() : 'Just now'}
            </span>
            {isUnread && (
              <button
                onClick={async () => {
                  try {
                    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                    const adminBase = apiBase.replace(/\/api\/?$/, '');
                    await api.patch(`${adminBase}/admin/notifications/${notification.notification_id}/read`, {}, { baseURL: '' });
                    setNotifications(prev => prev.map(notif =>
                      notif.notification_id === notification.notification_id ? { ...notif, is_read: 1 } : notif
                    ));
                    toast.success('Notification marked as read');
                  } catch (e) {
                    console.error('Failed to mark notification as read:', e);
                    toast.error('Failed to mark notification as read');
                  }
                }}
                className="px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Mark as read
              </button>
            )}
          </div>
        </div>

        {/* Structured Information Grid */}
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {/* Passenger Information */}
          {parsedData.passenger.name && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-primary" />
                <h4 className="font-semibold text-sm">Passenger Information</h4>
              </div>
              <div className="space-y-1 text-xs">
                {parsedData.passenger.name && <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{parsedData.passenger.name}</span></div>}
                {parsedData.passenger.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Phone:</span> <span className="font-medium">{parsedData.passenger.phone}</span>
                  </div>
                )}
                {parsedData.passenger.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Email:</span> <span className="font-medium">{parsedData.passenger.email}</span>
                  </div>
                )}
                {parsedData.passenger.id && <div><span className="text-muted-foreground">ID:</span> <span className="font-medium">#{parsedData.passenger.id}</span></div>}
              </div>
            </div>
          )}

          {/* Driver Information */}
          {parsedData.driver.name && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Car className="w-4 h-4 text-secondary" />
                <h4 className="font-semibold text-sm">Driver Information</h4>
              </div>
              <div className="space-y-1 text-xs">
                {parsedData.driver.name && <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{parsedData.driver.name}</span></div>}
                {parsedData.driver.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Phone:</span> <span className="font-medium">{parsedData.driver.phone}</span>
                  </div>
                )}
                {parsedData.driver.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Email:</span> <span className="font-medium">{parsedData.driver.email}</span>
                  </div>
                )}
                {parsedData.driver.id && <div><span className="text-muted-foreground">ID:</span> <span className="font-medium">#{parsedData.driver.id}</span></div>}
              </div>
            </div>
          )}

          {/* Vehicle Information */}
          {(parsedData.vehicle.model || parsedData.vehicle.plate) && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Car className="w-4 h-4 text-amber-500" />
                <h4 className="font-semibold text-sm">Vehicle Information</h4>
              </div>
              <div className="space-y-1 text-xs">
                {parsedData.vehicle.model && <div><span className="text-muted-foreground">Model:</span> <span className="font-medium">{parsedData.vehicle.model}</span></div>}
                {parsedData.vehicle.color && <div><span className="text-muted-foreground">Color:</span> <span className="font-medium">{parsedData.vehicle.color}</span></div>}
                {parsedData.vehicle.plate && <div><span className="text-muted-foreground">License Plate:</span> <span className="font-medium font-mono">{parsedData.vehicle.plate}</span></div>}
                {parsedData.vehicle.capacity && <div><span className="text-muted-foreground">Capacity:</span> <span className="font-medium">{parsedData.vehicle.capacity}</span></div>}
              </div>
            </div>
          )}

          {/* Ride Information */}
          {parsedData.ride.source && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Navigation className="w-4 h-4 text-emerald-500" />
                <h4 className="font-semibold text-sm">Ride Information</h4>
              </div>
              <div className="space-y-1 text-xs">
                {parsedData.ride.source && <div><span className="text-muted-foreground">Source:</span> <span className="font-medium">{parsedData.ride.source}</span></div>}
                {parsedData.ride.destination && <div><span className="text-muted-foreground">Destination:</span> <span className="font-medium">{parsedData.ride.destination}</span></div>}
                {(parsedData.ride.date || parsedData.ride.time) && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {parsedData.ride.date} {parsedData.ride.time}
                    </span>
                  </div>
                )}
                {parsedData.ride.distance && <div><span className="text-muted-foreground">Distance:</span> <span className="font-medium">{parsedData.ride.distance}</span></div>}
                {parsedData.ride.fare && <div><span className="text-muted-foreground">Fare:</span> <span className="font-medium">{parsedData.ride.fare}</span></div>}
                {parsedData.ride.status && <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{parsedData.ride.status}</span></div>}
              </div>
            </div>
          )}

          {/* Booking Information */}
          {parsedData.booking.seats && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-purple-500" />
                <h4 className="font-semibold text-sm">Booking Information</h4>
              </div>
              <div className="space-y-1 text-xs">
                {parsedData.booking.seats && <div><span className="text-muted-foreground">Seats:</span> <span className="font-medium">{parsedData.booking.seats}</span></div>}
                {parsedData.booking.amount && <div><span className="text-muted-foreground">Amount:</span> <span className="font-medium">{parsedData.booking.amount}</span></div>}
                {parsedData.booking.status && <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{parsedData.booking.status}</span></div>}
                {parsedData.booking.date && <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{parsedData.booking.date}</span></div>}
              </div>
            </div>
          )}

          {/* Emergency Contact */}
          {parsedData.emergencyContact.name && (
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-red-500" />
                <h4 className="font-semibold text-sm">Emergency Contact</h4>
              </div>
              <div className="space-y-1 text-xs">
                {parsedData.emergencyContact.name && <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{parsedData.emergencyContact.name}</span></div>}
                {parsedData.emergencyContact.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Phone:</span> <span className="font-medium">{parsedData.emergencyContact.phone}</span>
                  </div>
                )}
                {parsedData.emergencyContact.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Email:</span> <span className="font-medium">{parsedData.emergencyContact.email}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Emergency Details */}
        {parsedData.emergencyDetails && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h4 className="font-semibold text-sm text-amber-700 dark:text-amber-300">Emergency Details</h4>
            </div>
            <p className="text-sm text-foreground">{parsedData.emergencyDetails}</p>
          </div>
        )}

        {/* Location and Actions */}
        <div className="mt-4 pt-4 border-t border-red-500/20 flex flex-wrap items-center justify-between gap-3">
          {parsedData.location.lat && parsedData.location.lon ? (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-500" />
              <div className="text-xs">
                <div className="text-muted-foreground">Location:</div>
                <div className="font-mono font-medium">{parsedData.location.lat}, {parsedData.location.lon}</div>
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            {parsedData.location.lat && parsedData.location.lon && (
              <button
                onClick={() => {
                  window.open(`https://www.openstreetmap.org/?mlat=${parsedData.location.lat}&mlon=${parsedData.location.lon}&zoom=16`, '_blank');
                }}
                className="px-4 py-2 text-xs font-semibold bg-red-600 text-gray-900 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <MapPin className="w-3 h-3" />
                View on Map
              </button>
            )}
            <button
              onClick={() => {
                navigator.clipboard.writeText(notification.message).then(() => {
                  toast.success('SOS details copied to clipboard');
                }).catch(() => {
                  toast.error('Failed to copy to clipboard');
                });
              }}
              className="px-4 py-2 text-xs font-semibold bg-white/10 text-foreground rounded-lg hover:bg-white/20 transition-colors"
            >
              Copy All Details
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  /**
   * Render a single driver card in the pending list
   */
  const renderDriverCard = (driver) => (
    <button
      key={driver.driver_id}
      onClick={() => handleOpenDriver(driver)}
      className="w-full text-left px-4 py-4 rounded-xl border border-white/10 hover:border-primary/30 hover:bg-white/5 transition-all group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-sm font-bold text-primary/90 shadow-inner">
          {String(driver.driver_name || 'U').trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold tracking-wide">
            {driver.driver_name}{' '}
            <span className="text-xs text-muted-foreground">
              (#{driver.driver_id})
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate max-w-[240px] sm:max-w-none">
            {driver.driver_email} • {driver.driver_phone}
          </div>
        </div>
      </div>
      <div className="inline-flex items-center gap-2 self-start sm:self-auto">
        <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/20 whitespace-nowrap">
          {driver.count} {driver.count === 1 ? 'pending document' : 'pending documents'}
        </span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted-foreground">View</span>
      </div>
    </button>
  );

  /**
   * Render document action buttons or informational text
   */
  const renderDocumentActions = (doc) => {
    return (
      <>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => handleApprove(doc.document_id)}
          className="px-3 py-2 bg-emerald-600 text-gray-900 rounded-lg flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          Approve
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => handleReject(doc.document_id)}
          className="px-3 py-2 bg-red-600 text-gray-900 rounded-lg flex items-center gap-2"
        >
          <XCircle className="w-4 h-4" />
          Reject
        </motion.button>
      </>
    );
  };

  /**
   * Render a single document card
   */
  const renderDocumentCard = (doc) => (
    <div
      key={doc.doc_id}
      className="glass rounded-xl p-5 border border-white/20 flex items-start justify-between hover:border-primary/30 hover:bg-white/5 transition-colors"
    >
      <div className="pr-4">
        <div className="font-semibold capitalize flex items-center gap-2">
          {doc.doc_type}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${String(doc.status).toLowerCase() === 'pending' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : String(doc.status).toLowerCase() === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-red-500/10 text-red-600 border-red-500/20'}`}>
            {doc.status}
          </span>
        </div>
        <a
          className="text-primary text-sm break-all underline decoration-transparent hover:decoration-primary/50 transition-[text-decoration-color]"
          href={doc.file_url}
          target="_blank"
          rel="noreferrer"
        >
          {doc.file_url}
        </a>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {renderDocumentActions(doc)}
      </div>
    </div>
  );

  // --------------------------------------------------------------------------
  // Main Render
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">
          Admin Panel
        </h1>
        <p className="text-muted-foreground">
          Review and verify driver documents and vehicle registrations.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-2 glass-thick rounded-xl border border-white/20 w-fit shadow-soft">
        <motion.button
          onClick={() => setActiveTab('notifications')}
          className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 relative ${activeTab === 'notifications'
              ? 'bg-gradient-to-r from-primary to-secondary text-gray-900 shadow-glow'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
            }`}
        >
          <Bell className="w-4 h-4" />
          Notifications
          {notifications.filter(n => !n.is_read && (n.message?.toLowerCase().includes('sos') || n.message?.includes('🚨'))).length > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-gray-900 min-w-[18px] text-center">
              {notifications.filter(n => !n.is_read && (n.message?.toLowerCase().includes('sos') || n.message?.includes('🚨'))).length}
            </span>
          )}
        </motion.button>
        <motion.button
          onClick={() => setActiveTab('documents')}
          className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'documents'
              ? 'bg-gradient-to-r from-primary to-secondary text-gray-900 shadow-glow'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
            }`}
        >
          <FileText className="w-4 h-4" />
          Documents
        </motion.button>
        <motion.button
          onClick={() => setActiveTab('vehicles')}
          className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${activeTab === 'vehicles'
              ? 'bg-gradient-to-r from-primary to-secondary text-gray-900 shadow-glow'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/10'
            }`}
        >
          <Car className="w-4 h-4" />
          Vehicles
        </motion.button>
      </div>

      {/* Notifications Section - Only show when notifications tab is active */}
      {activeTab === 'notifications' && (
        <section className="glass-thick rounded-xl p-6 border border-white/20 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">All Notifications</h2>
            {notifications.filter(n => !n.is_read).length > 0 && (
              <button
                onClick={async () => {
                  try {
                    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
                    const adminBase = apiBase.replace(/\/api\/?$/, '');
                    await Promise.all(
                      notifications.filter(n => !n.is_read).map(n =>
                        api.patch(`${adminBase}/admin/notifications/${n.notification_id}/read`, {}, { baseURL: '' })
                      )
                    );
                    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
                    toast.success('All notifications marked as read');
                  } catch (e) {
                    toast.error('Failed to mark notifications as read');
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
              <button
                onClick={loadNotifications}
                className="mt-4 px-4 py-2 text-xs font-semibold bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
              >
                Refresh Notifications
              </button>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-auto pr-1 custom-scroll">
              {notifications.map((n) => {
                const isSOS = n.message?.toLowerCase().includes('sos') || n.message?.includes('🚨') || n.message?.toLowerCase().includes('emergency');

                // Parse SOS notification if it's an SOS alert
                if (isSOS) {
                  const parsedData = parseSOSNotification(n.message);
                  if (parsedData) {
                    return renderSOSNotification(n, parsedData);
                  }
                }

                // Regular notification display
                const isUnread = !n.is_read;
                return (
                  <motion.div
                    key={n.notification_id || `notif-${n.created_at}-${Math.random()}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-xl border-2 transition-all ${isUnread
                        ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                        )}
                        <span className="text-xs text-muted-foreground">
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
                              console.error('Failed to mark notification as read:', e);
                              toast.error('Failed to mark notification as read');
                            }
                          }}
                          className="px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                      {n.message || 'No message'}
                    </pre>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
        >
          {error}
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <div
            className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"
            role="status"
            aria-label="Loading documents"
          />
        </div>
      )}

      {/* Content based on active tab */}
      {activeTab === 'notifications' ? null : activeTab === 'documents' ? (
        <section className="glass-thick rounded-xl p-6 border border-white/20">
          <h2 className="text-xl font-bold mb-2">
            Drivers Pending Verification
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Select a driver to review and approve their documents.</p>

          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending drivers.
            </p>
          ) : (
            <div className="space-y-2">
              {pending.map(renderDriverCard)}
            </div>
          )}
        </section>
      ) : (
        <section className="glass-thick rounded-xl p-6 border border-white/20">
          <h2 className="text-xl font-bold mb-2">
            Vehicles Pending Verification
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Review and approve vehicle registrations.</p>

          {pendingVehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending vehicles.
            </p>
          ) : (
            <div className="space-y-3">
              {pendingVehicles.map((vehicle) => (
                <div key={vehicle.vehicle_id} className="glass rounded-xl p-5 border border-white/20 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold capitalize flex items-center gap-2 mb-2">
                      <Car className="w-5 h-5 text-primary" />
                      {vehicle.vehicle_model} • {vehicle.plate_number}
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      Owner: {vehicle.driver_name || `Driver #${vehicle.driver_id}`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Color: {vehicle.vehicle_color || 'N/A'} • Year: {vehicle.year || 'N/A'}
                    </div>
                    {vehicle.vehicle_image_url && (
                      <img src={vehicle.vehicle_image_url} alt="Vehicle" className="mt-3 w-full max-w-xs rounded-lg border border-white/20" />
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleApproveVehicle(vehicle.vehicle_id)}
                      className="px-3 py-2 bg-emerald-600 text-gray-900 rounded-lg flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleRejectVehicle(vehicle.vehicle_id)}
                      className="px-3 py-2 bg-red-600 text-gray-900 rounded-lg flex items-center gap-2"
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={handleCloseDriver}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass rounded-xl p-6 sm:p-8 max-w-3xl w-full shadow-glow border border-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 id="modal-title" className="text-lg font-bold">
                    Driver: {selectedDriver.driver_name}{' '}
                    <span className="text-xs text-muted-foreground">
                      (#{selectedDriver.driver_id})
                    </span>
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedDriver.driver_email} • {selectedDriver.driver_phone}
                  </p>
                </div>
                <button
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                  onClick={handleCloseDriver}
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Documents List */}
              {docs.length === 0 ? (
                <div className="p-8 glass rounded-xl border border-border text-center mt-2">
                  <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No documents loaded.
                  </p>
                </div>
              ) : (
                <div>
                  {docs.map(renderDocumentCard)}
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