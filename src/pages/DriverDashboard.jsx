import { useState, useEffect, useRef } from 'react';
import { rideService } from '../services/rideService';
import { feedbackService } from '../services/feedbackService';
import { documentService } from '../services/documentService';
import { vehicleExtras } from '../services/vehicleExtras';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, MapPin, Calendar, Clock, Users, DollarSign,
    TrendingUp, Star, MessageSquare, Play, CheckCircle,
    XCircle, AlertCircle, Car, Route, Save, Calculator, Loader, Navigation, X
} from 'lucide-react';
import io from 'socket.io-client';
import ORSMap from '../components/Map/ORSMap';
import api from '../config/api';

const DriverDashboard = () => {
    const [activeTab, setActiveTab] = useState('rides');
    const [selectedRideForWaypoints, setSelectedRideForWaypoints] = useState(null);
    const [rides, setRides] = useState([]);
    const [feedback, setFeedback] = useState([]);
    const [feedbackStats, setFeedbackStats] = useState({ averageRating: 0, totalFeedback: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [socketRef, setSocketRef] = useState(null);
    const geoWatchIdRef = useRef(null);
    const lastSentRef = useRef({ ts: 0, lat: null, lon: null });
    const [myLivePos, setMyLivePos] = useState(null); // { lat, lon }
    const [activeRideId, setActiveRideId] = useState(null); // Track which ride is currently active
    const [formData, setFormData] = useState({
        source: '',
        destination: '',
        date: '',
        time: '',
        total_seats: '',
        distance_km: '',
        vehicle_id: ''
    });
    const [formErrors, setFormErrors] = useState({});
    const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [geoCache] = useState(() => new Map());
    const [waypoints, setWaypoints] = useState([]);
    const [newWaypoint, setNewWaypoint] = useState({ name: '', address: '' });
    const [vehicles, setVehicles] = useState([]);
    const [activeRideRequest, setActiveRideRequest] = useState(null);
    const [selectedVehicleForRequest, setSelectedVehicleForRequest] = useState('');
    const [isOnline, setIsOnline] = useState(false);

    const popularCities = [
        "Mumbai",
        "Delhi",
        "Bengaluru",
        "Hyderabad",
        "Ahmedabad",
        "Chennai",
        "Kolkata",
        "Pune",
        "Jaipur",
        "Surat"
    ];

    const { user } = useAuth();
    const toast = useToast();

    const checkDriverVerified = async () => {
        try {
            if (!user?.user_id) return false;
            const resp = await documentService.list(user.user_id);
            const docs = Array.isArray(resp.data) ? resp.data : [];
            const totalCount = docs.length;
            const approvedCount = docs.filter((d) => String(d.status).toLowerCase() === 'approved').length;
            return totalCount > 0 && approvedCount > 0;
        } catch {
            return false;
        }
    };

    const handleToggleCreateForm = async () => {
        if (!showCreateForm) {
            // About to open form; ensure driver is verified
            const verified = await checkDriverVerified();
            if (!verified) {
                toast.warning('Your documents are not verified yet. Ride creation is disabled until admin approval.');
                return;
            }
            // Reset form when opening
            setFormData({
                source: '',
                destination: '',
                date: '',
                time: '',
                total_seats: '',
                distance_km: '',
                vehicle_id: ''
            });
            setFormErrors({});
            setError('');
            setWaypoints([]);
        }
        setShowCreateForm(!showCreateForm);
    };

    const loadRides = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await rideService.getMyRides();
            // Handle both response structures: response.data or response.data.data
            const list = Array.isArray(response.data?.data) ? response.data.data : (Array.isArray(response.data) ? response.data : []);
            const sorted = [...list].sort((a, b) => {
                const at = new Date(`${a.created_at}`).getTime();
                const bt = new Date(`${b.created_at}`).getTime();
                return bt - at; // newest first
            });
            setRides(sorted);
        } catch (err) {
            if (import.meta.env.DEV) {
                console.error('Failed to load rides:', err);
            }
            setError(err.response?.data?.message || 'Failed to load rides');
            toast.error(err.response?.data?.message || 'Failed to load rides');
        } finally {
            setLoading(false);
        }
    };

    const loadFeedback = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await feedbackService.getMyDriverFeedback();
            if (import.meta.env.DEV) {
                console.log('Feedback API response:', response);
            }
            // Handle both response structures
            if (response.success && response.data) {
                // If response.data has feedback property (nested structure)
                if (response.data.feedback) {
                    setFeedback(Array.isArray(response.data.feedback) ? response.data.feedback : []);
                    // Set stats if available
                    if (response.data.averageRating) {
                        setFeedbackStats({
                            averageRating: parseFloat(response.data.averageRating) || 0,
                            totalFeedback: response.data.totalFeedback || response.data.feedback.length || 0
                        });
                    }
                } else if (Array.isArray(response.data)) {
                    // If response.data is directly an array
                    setFeedback(response.data);
                    // Calculate stats
                    const avg = response.data.length > 0
                        ? response.data.reduce((sum, f) => sum + (f.rating || 0), 0) / response.data.length
                        : 0;
                    setFeedbackStats({
                        averageRating: avg,
                        totalFeedback: response.data.length
                    });
                } else {
                    setFeedback([]);
                    setFeedbackStats({ averageRating: 0, totalFeedback: 0 });
                }
            } else if (Array.isArray(response)) {
                // If response is directly an array
                setFeedback(response);
                const avg = response.length > 0
                    ? response.reduce((sum, f) => sum + (f.rating || 0), 0) / response.length
                    : 0;
                setFeedbackStats({
                    averageRating: avg,
                    totalFeedback: response.length
                });
            } else {
                setFeedback([]);
                setFeedbackStats({ averageRating: 0, totalFeedback: 0 });
            }
        } catch (err) {
            if (import.meta.env.DEV) {
                console.error('Failed to load feedback:', err);
            }
            setError('Failed to load feedback');
            setFeedback([]);
            setFeedbackStats({ averageRating: 0, totalFeedback: 0 });
        } finally {
            setLoading(false);
        }
    };

    // Haversine distance calculation
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    // Forward geocode location
    const forwardGeocode = async (query) => {
        const key = (query || '').trim().toLowerCase();
        if (!key) return null;
        if (geoCache.has(key)) return geoCache.get(key);
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`);
            const data = await resp.json();
            const first = Array.isArray(data) ? data[0] : null;
            const result = first ? { lat: Number(first.lat), lon: Number(first.lon) } : null;
            if (result) geoCache.set(key, result);
            return result;
        } catch {
            geoCache.set(key, null);
            return null;
        }
    };

    // Reverse geocode coordinates to address
    const reverseGeocode = async (lat, lon) => {
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
            const data = await resp.json();
            const addr = data?.display_name || '';
            return addr;
        } catch {
            return '';
        }
    };

    // Calculate distance between source and destination
    const handleCalculateDistance = async (source, destination) => {
        const src = source || formData.source;
        const dest = destination || formData.destination;

        if (!src.trim() || !dest.trim()) {
            toast.warning('Please enter both source and destination');
            return;
        }

        setIsCalculatingDistance(true);
        try {
            const sourceCoords = await forwardGeocode(src);
            const destCoords = await forwardGeocode(dest);

            if (!sourceCoords) {
                setFormErrors(prev => ({ ...prev, source: 'Could not find source location' }));
                setIsCalculatingDistance(false);
                return;
            }
            if (!destCoords) {
                setFormErrors(prev => ({ ...prev, destination: 'Could not find destination location' }));
                setIsCalculatingDistance(false);
                return;
            }

            const distance = calculateDistance(sourceCoords.lat, sourceCoords.lon, destCoords.lat, destCoords.lon);
            setFormData(prev => ({ ...prev, distance_km: distance.toFixed(2) }));
            setFormErrors(prev => {
                const newErrors = { ...prev };
                if (newErrors.source) delete newErrors.source;
                if (newErrors.destination) delete newErrors.destination;
                return newErrors;
            });
            toast.success(`Distance calculated: ${distance.toFixed(2)} km`);
        } catch (err) {
            toast.error('Failed to calculate distance');
        } finally {
            setIsCalculatingDistance(false);
        }
    };

    // Auto-calculate distance when both fields are filled (debounced)
    useEffect(() => {
        if (!showCreateForm) return;

        const timer = setTimeout(() => {
            if (formData.source.trim() && formData.destination.trim() && !formData.distance_km) {
                // Auto-calculate after 1.5 seconds of no typing
                handleCalculateDistance(formData.source, formData.destination);
            }
        }, 1500);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.source, formData.destination, showCreateForm]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        const updatedFormData = {
            ...formData,
            [name]: value
        };

        // Automatically set total_seats when vehicle is selected
        if (name === 'vehicle_id' && value) {
            const selectedVehicle = vehicles.find(v => v.vehicle_id === parseInt(value));
            if (selectedVehicle && selectedVehicle.capacity) {
                updatedFormData.total_seats = selectedVehicle.capacity.toString();
            }
        }

        setFormData(updatedFormData);
        // Clear error for this field
        if (formErrors[name]) {
            setFormErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[name];
                return newErrors;
            });
        }
    };

    const handleQuickSelect = (field, city) => {
        setFormData((prev) => ({ ...prev, [field]: city }));
        if (formErrors[field]) {
            setFormErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    // Get minimum date (today)
    const getMinDate = () => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    };

    // Calculate estimated total fare - Fixed 10rs per seat per km
    const getEstimatedFare = () => {
        // Get seats from selected vehicle's capacity
        let seats = 0;
        if (formData.vehicle_id) {
            const selectedVehicle = vehicles.find(v => v.vehicle_id === parseInt(formData.vehicle_id));
            if (selectedVehicle && selectedVehicle.capacity) {
                seats = selectedVehicle.capacity;
            }
        }
        const distance = parseFloat(formData.distance_km) || 0;
        if (seats > 0 && distance > 0) {
            return (10 * distance * seats).toFixed(2);
        }
        return '0.00';
    };

    // Get selected vehicle's capacity for display
    const getSelectedVehicleCapacity = () => {
        if (formData.vehicle_id) {
            const selectedVehicle = vehicles.find(v => v.vehicle_id === parseInt(formData.vehicle_id));
            return selectedVehicle?.capacity || 0;
        }
        return 0;
    };

    // Validate form
    const validateForm = () => {
        const errors = {};

        if (!formData.source.trim()) errors.source = 'Source is required';
        if (!formData.destination.trim()) errors.destination = 'Destination is required';
        if (!formData.date) errors.date = 'Date is required';
        else {
            const selectedDate = new Date(formData.date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (selectedDate < today) {
                errors.date = 'Date cannot be in the past';
            }
        }
        if (!formData.time) errors.time = 'Time is required';
        // Validate vehicle selection and get seats from selected vehicle's capacity
        if (!formData.vehicle_id) {
            errors.vehicle_id = 'Please select a vehicle';
        } else {
            const selectedVehicle = vehicles.find(v => v.vehicle_id === parseInt(formData.vehicle_id));
            if (!selectedVehicle) {
                errors.vehicle_id = 'Selected vehicle not found';
            } else if (!selectedVehicle.capacity || selectedVehicle.capacity < 1) {
                errors.vehicle_id = 'Selected vehicle has invalid capacity';
            }
        }
        const distance = parseFloat(formData.distance_km);
        if (!distance || distance <= 0) errors.distance_km = 'Distance must be greater than 0';

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreateRide = async (e) => {
        e.preventDefault();
        setError('');
        setFormErrors({});

        if (!validateForm()) {
            toast.error('Please fix the form errors');
            return;
        }

        setIsSubmitting(true);
        try {
            await rideService.createRide(formData);
            toast.success('Ride created successfully!');
            setShowCreateForm(false);
            setFormData({
                source: '',
                destination: '',
                date: '',
                time: '',
                total_seats: '',
                distance_km: '',
                vehicle_id: ''
            });
            setFormErrors({});
            setWaypoints([]);
            loadRides();
        } catch (err) {
            const errorMsg = err.response?.data?.message || 'Failed to create ride';
            setError(errorMsg);
            toast.error(errorMsg);

            // Set field-specific errors if available
            if (err.response?.data?.errors) {
                setFormErrors(err.response.data.errors);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateStatus = async (rideId, status) => {
        try {
            await rideService.updateRideStatus(rideId, status);
            toast.success('Ride status updated!');

            // Auto-start location sharing when ride starts
            if (status === 'ongoing') {
                setActiveRideId(rideId);
            } else if (status === 'completed' || status === 'cancelled') {
                // Stop location sharing when ride ends
                setActiveRideId(null);
            }

            loadRides();
        } catch (err) {
            toast.error('Failed to update ride status');
        }
    };
    const getStatusColor = (status) => {
        const colors = {
            scheduled: 'bg-blue-600/10 border border-[#0EA5E9]/30 text-[#0EA5E9]',
            ongoing: 'bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b]',
            completed: 'bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981]',
            cancelled: 'bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444]'
        };
        return colors[status] || 'bg-[#1A1A1A] border border-gray-200 text-gray-900/60';
    };


    const handleAddWaypoint = async (rideId) => {
        if (!newWaypoint.name || !newWaypoint.address) {
            toast.error('Please fill all waypoint fields');
            return;
        }
        try {
            // Geocode the address
            const coords = await forwardGeocode(newWaypoint.address.trim());
            if (!coords) {
                toast.error('Could not locate that address. Please try a more specific address.');
                return;
            }
            await rideService.addWaypoint(rideId, {
                name: newWaypoint.name,
                lat: coords.lat,
                lon: coords.lon
            });
            toast.success('Waypoint added');
            setNewWaypoint({ name: '', address: '' });
            if (rideId === selectedRideForWaypoints) {
                const waypointsResp = await rideService.listWaypoints(rideId);
                setWaypoints(Array.isArray(waypointsResp.data) ? waypointsResp.data : []);
            }
        } catch (err) {
            toast.error('Failed to add waypoint');
        }
    };

    const loadWaypoints = async (rideId) => {
        try {
            const response = await rideService.listWaypoints(rideId);
            setWaypoints(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            if (import.meta.env.DEV) {
                console.error('Failed to load waypoints');
            }
        }
    };

    const loadVehicles = async () => {
        if (!user?.user_id) return;
        try {
            const response = await api.get(`/vehicles?driver_id=${user.user_id}`);
            const vehiclesList = Array.isArray(response.data?.data) ? response.data.data : (Array.isArray(response.data) ? response.data : []);
            setVehicles(vehiclesList);
            if (import.meta.env.DEV) {
                console.log('Vehicles loaded:', vehiclesList.length, vehiclesList);
            }
            return vehiclesList;
        } catch (err) {
            if (import.meta.env.DEV) {
                console.error('Failed to load vehicles:', err);
            }
            toast.error('Failed to load vehicles');
            return [];
        }
    };

    useEffect(() => {
        if (activeTab === 'rides') {
            loadRides();
            loadVehicles();
        } else if (activeTab === 'feedback') {
            loadFeedback();
        }
    }, [activeTab]);

    // Socket connection for real-time notifications
    useEffect(() => {
        if (!user) return;

        const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
        const socket = io(socketUrl, { transports: ['websocket'] });

        socket.on('connect', () => {
            if (import.meta.env.DEV) {
                console.log('Socket connected for driver:', socket.id);
            }
            // Register as a user to receive notifications
            socket.emit('user_register', { user_id: user.user_id });
            // If driver, also register driver_id for targeted events
            if (user.user_type === 'driver' || user.user_type === 'both') {
                socket.emit('driver_register', { driver_id: user.user_id });
            }
        });

        socket.on('new_booking', () => {
            if (import.meta.env.DEV) {
                console.log('New booking received, reloading rides...');
            }
            loadRides();
        });

        socket.on('new_ride_request', (payload) => {
            try {
                if (payload && payload.request_id && payload.passenger_id) {
                    setActiveRideRequest(payload);
                    setSelectedVehicleForRequest(''); // Reset vehicle selection
                    // Load vehicles when ride request is received - ensure they're loaded before showing UI
                    loadVehicles().then((vehiclesList) => {
                        if (import.meta.env.DEV) {
                            console.log('Vehicles loaded for ride request:', vehiclesList?.length || 0, vehiclesList);
                        }
                    }).catch(err => {
                        console.error('Failed to load vehicles:', err);
                        toast.error('Failed to load vehicles. Please refresh the page.');
                    });
                    const numPeople = payload.number_of_people || 1;
                    const message = `New ride request from passenger ${payload.passenger_id} (${numPeople} ${numPeople === 1 ? 'person' : 'people'})`;
                    toast.info(message, { duration: 10000 });
                }
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.error('Error processing new ride request:', err);
                }
                toast.error('Error processing ride request');
            }
        });

        socket.on('ride_request_taken', (payload) => {
            try {
                if (payload && payload.request_id) {
                    // If this is the current active request, clear it
                    if (activeRideRequest && activeRideRequest.request_id === payload.request_id) {
                        setActiveRideRequest(null);
                        toast.warning('This ride request has been accepted by another driver');
                    }
                }
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.error('Error processing ride_request_taken:', err);
                }
            }
        });

        socket.on('ride_assigned', (payload) => {
            try {
                if (payload && payload.request_id && payload.driver_id === user.user_id) {
                    toast.success('Ride assigned to you!');
                    loadRides();
                }
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.error('Error processing ride assignment:', err);
                }
            }
        });

        socket.on('ride_accept_error', (payload) => {
            try {
                if (payload && payload.request_id) {
                    // If this is the current active request, show error but keep it active
                    if (activeRideRequest && activeRideRequest.request_id === payload.request_id) {
                        toast.error(payload.message || 'Failed to accept ride request. Please check your vehicle capacity.');
                        // Reload vehicles to ensure we have the latest data
                        loadVehicles();
                    }
                }
            } catch (err) {
                if (import.meta.env.DEV) {
                    console.error('Error processing ride accept error:', err);
                }
            }
        });

        socket.on('notification', (notification) => {
            if (import.meta.env.DEV) {
                console.log('Notification received:', notification);
            }
        });

        socket.on('booking_message', (payload) => {
            try {
                const msg = typeof payload?.text === 'string' ? payload.text : '';
                if (msg) {
                    toast.info(`Passenger: ${msg}`);
                }
            } catch { }
        });

        socket.on('sos_alert', (payload) => {
            try {
                const alertMsg = `🚨 URGENT SOS ALERT! Passenger ${payload.passenger_name || 'Unknown'} needs immediate assistance. Location: ${payload.location?.lat}, ${payload.location?.lon}`;
                toast.error(alertMsg, { duration: 10000 });
                // Show alert dialog
                if (window.confirm(`${alertMsg}\n\nDo you want to view the location?`)) {
                    if (payload.location?.lat && payload.location?.lon) {
                        window.open(`https://www.openstreetmap.org/?mlat=${payload.location.lat}&mlon=${payload.location.lon}&zoom=16`, '_blank');
                    }
                }
            } catch (err) {
                toast.error('SOS alert received but failed to process');
            }
        });

        // Listen for SOS admin alerts (if user is admin)
        if (user.user_type === 'admin') {
            socket.on('sos_alert_admin', (payload) => {
                try {
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
                    alertMsg += `   Fare: ₹10 per seat per km\n`;
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
                    // Reload notifications to show the new SOS alert
                    if (typeof loadNotifications === 'function') {
                        loadNotifications();
                    }
                } catch (err) {
                    console.error('Error processing admin SOS alert:', err);
                    toast.error('SOS admin alert received but failed to process');
                }
            });

            socket.on('sos_alert_admin_broadcast', (payload) => {
                try {
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
                } catch (err) {
                    console.error('Error processing broadcast SOS alert:', err);
                    toast.error('Broadcast SOS alert received but failed to process');
                }
            });
        }

        socket.on('disconnect', () => {
            if (import.meta.env.DEV) {
                console.log('Socket disconnected');
            }
        });

        setSocketRef(socket);
        return () => {
            socket.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    // Auto-start location sharing when ride is ongoing OR driver is manually online
    useEffect(() => {
        if (!socketRef || !user) return;
        if (!(user.user_type === 'driver' || user.user_type === 'both')) return;

        // Check if driver has any ongoing rides OR is manually online
        const hasOngoingRide = rides.some(r => (r.status || '').toLowerCase() === 'ongoing');
        const shouldShareLocation = activeRideId != null || hasOngoingRide || isOnline;

        if (shouldShareLocation) {
            if (!('geolocation' in navigator)) {
                toast.error('Geolocation not supported by this browser');
                return;
            }

            // Clear any existing watch first
            if (geoWatchIdRef.current != null) {
                try { navigator.geolocation.clearWatch(geoWatchIdRef.current); } catch { }
            }

            const movedEnough = (aLat, aLon, bLat, bLon) => {
                if (aLat == null || aLon == null) return true;
                const toRad = (d) => (d * Math.PI) / 180;
                const R = 6371000; // meters
                const dLat = toRad(bLat - aLat);
                const dLon = toRad(bLon - aLon);
                const lat1 = toRad(aLat);
                const lat2 = toRad(bLat);
                const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const dist = R * c;
                return dist >= 10; // 10 meters
            };

            const id = navigator.geolocation.watchPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lon = pos.coords.longitude;
                    setMyLivePos({ lat, lon });
                    const now = Date.now();
                    const last = lastSentRef.current || { ts: 0, lat: null, lon: null };
                    if (now - last.ts < 2000 && !movedEnough(last.lat, last.lon, lat, lon)) return;
                    lastSentRef.current = { ts: now, lat, lon };

                    // Check if socket is still connected before emitting
                    if (socketRef && socketRef.connected) {
                        // Include ride_id so backend can filter recipients
                        const currentRideId = activeRideId || rides.find(r => (r.status || '').toLowerCase() === 'ongoing')?.ride_id;
                        socketRef.emit('driver_update_position', {
                            driver_id: user.user_id,
                            lat,
                            lon,
                            ride_id: currentRideId
                        });
                        if (import.meta.env.DEV) {
                            console.log('📍 Location sent:', { lat, lon, driver_id: user.user_id, ride_id: currentRideId });
                        }
                    } else {
                        console.warn('Socket not connected, cannot send location');
                    }
                },
                (err) => {
                    console.error('Geolocation error:', err);
                    let errorMsg = 'Unable to fetch location';
                    if (err.code === err.PERMISSION_DENIED) {
                        errorMsg = 'Location permission denied. Please enable location access in browser settings.';
                    } else if (err.code === err.POSITION_UNAVAILABLE) {
                        errorMsg = 'Location unavailable. Please check your GPS settings.';
                    } else if (err.code === err.TIMEOUT) {
                        errorMsg = 'Location request timed out. Please try again.';
                    }
                    toast.error(errorMsg);
                },
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
            );
            geoWatchIdRef.current = id;
            if (import.meta.env.DEV) {
                console.log('✅ Started automatic location sharing for ongoing ride');
            }
        } else {
            // Stop location sharing when no ongoing rides
            if (geoWatchIdRef.current != null) {
                try {
                    navigator.geolocation.clearWatch(geoWatchIdRef.current);
                    if (import.meta.env.DEV) {
                        console.log('🛑 Stopped location sharing - no ongoing rides');
                    }
                } catch (e) {
                    if (import.meta.env.DEV) {
                        console.error('Error clearing watch:', e);
                    }
                }
                geoWatchIdRef.current = null;
            }
            setMyLivePos(null);
        }

        return () => {
            // Cleanup on unmount or when dependencies change
            if (geoWatchIdRef.current != null) {
                try {
                    navigator.geolocation.clearWatch(geoWatchIdRef.current);
                } catch (e) {
                    if (import.meta.env.DEV) {
                        console.error('Error clearing watch in cleanup:', e);
                    }
                }
                geoWatchIdRef.current = null;
            }
        };
    }, [activeRideId, rides, socketRef, user, toast, isOnline]);

    // Handle going online/offline
    const handleToggleOnline = async () => {
        if (!user?.user_id) return;

        if (!isOnline) {
            // Going online - request location permission and start sharing
            if (!('geolocation' in navigator)) {
                toast.error('Geolocation not supported by this browser');
                return;
            }

            try {
                // Request location permission
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;

                        // Start location sharing (this will set is_available=1 via backend)
                        if (socketRef && socketRef.connected) {
                            socketRef.emit('driver_update_position', {
                                driver_id: user.user_id,
                                lat,
                                lon,
                                ride_id: null
                            });
                        }

                        setIsOnline(true);
                        toast.success('You are now online! Location sharing started.');
                    },
                    (err) => {
                        let errorMsg = 'Unable to get location';
                        if (err.code === err.PERMISSION_DENIED) {
                            errorMsg = 'Location permission denied. Please enable location access in browser settings.';
                        } else if (err.code === err.POSITION_UNAVAILABLE) {
                            errorMsg = 'Location unavailable. Please check your GPS settings.';
                        } else if (err.code === err.TIMEOUT) {
                            errorMsg = 'Location request timed out. Please try again.';
                        }
                        toast.error(errorMsg);
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            } catch (err) {
                toast.error('Failed to go online. Please try again.');
            }
        } else {
            // Going offline - stop location sharing and set is_available=0
            // But don't stop if there's an ongoing ride
            const hasOngoingRide = rides.some(r => (r.status || '').toLowerCase() === 'ongoing');
            if (hasOngoingRide) {
                toast.warning('Cannot go offline while you have an ongoing ride. Please complete the ride first.');
                return;
            }

            try {
                // Stop location sharing only if not in an ongoing ride
                if (geoWatchIdRef.current != null && !activeRideId) {
                    try {
                        navigator.geolocation.clearWatch(geoWatchIdRef.current);
                    } catch (e) {
                        // Ignore errors
                    }
                    geoWatchIdRef.current = null;
                }
                setMyLivePos(null);

                // Update backend to set is_available=0
                await api.put(`/users/${user.user_id}/availability`, { is_available: 0 });

                setIsOnline(false);
                toast.info('You are now offline. Location sharing stopped.');
            } catch (err) {
                toast.error('Failed to go offline. Please try again.');
            }
        }
    };

    const handleAcceptRideRequest = () => {
        if (!activeRideRequest || !socketRef) {
            toast.error('Invalid ride request or connection');
            return;
        }

        // Validate vehicle selection if vehicles are available
        const numPeople = Number(activeRideRequest.number_of_people) || 1;

        // Ensure vehicles are loaded
        if (vehicles.length === 0) {
            toast.error('Loading vehicles... Please wait a moment and try again.');
            loadVehicles();
            return;
        }

        // Vehicle capacity includes driver, so we need capacity > numPeople (e.g., 5-seater = 1 driver + 4 passengers)
        const availableVehicles = vehicles.filter(v => {
            const capacity = Number(v.capacity) || 0;
            return capacity > numPeople; // Must be greater than numPeople to fit driver + passengers
        });

        // Check if driver has any suitable vehicles
        if (availableVehicles.length === 0) {
            toast.error(`You don't have any vehicle that can accommodate ${numPeople} ${numPeople === 1 ? 'person' : 'people'}. You need a vehicle with at least ${numPeople + 1} seats (${numPeople} passengers + 1 driver).`);
            return;
        }

        // If vehicles are available, require selection
        if (availableVehicles.length > 0 && !selectedVehicleForRequest) {
            toast.error('Please select a vehicle that can accommodate ' + numPeople + ' ' + (numPeople === 1 ? 'person' : 'people'));
            return;
        }

        // Validate that the selected vehicle actually has enough capacity (double-check)
        if (selectedVehicleForRequest) {
            const selectedVehicleId = Number(selectedVehicleForRequest);
            const selectedVehicle = vehicles.find(v => {
                const vid = Number(v.vehicle_id);
                return vid === selectedVehicleId;
            });

            if (!selectedVehicle) {
                console.error('Selected vehicle not found:', {
                    selectedVehicleForRequest,
                    selectedVehicleId,
                    vehicles: vehicles.map(v => ({ id: v.vehicle_id, type: typeof v.vehicle_id }))
                });
                toast.error('Selected vehicle not found. Please select a valid vehicle.');
                return;
            }

            const vehicleCapacity = Number(selectedVehicle.capacity) || 0;
            // Vehicle capacity includes driver, so we need capacity > numPeople
            if (vehicleCapacity <= numPeople) {
                const availablePassengers = Math.max(0, vehicleCapacity - 1); // capacity - 1 for driver
                toast.error(`Selected vehicle can only accommodate ${availablePassengers} passengers (${vehicleCapacity}-seater), but ${numPeople} are required. Please select a different vehicle.`);
                return;
            }
        }

        try {
            socketRef.emit('driver_accept_ride', {
                request_id: activeRideRequest.request_id,
                driver_id: user.user_id,
                vehicle_id: selectedVehicleForRequest || null
            });
            toast.success('Ride request accepted!');
            setActiveRideRequest(null);
            setSelectedVehicleForRequest('');
            loadRides();
        } catch (err) {
            toast.error('Failed to accept ride request');
        }
    };

    const handleRejectRideRequest = () => {
        if (!activeRideRequest || !socketRef) return;
        try {
            socketRef.emit('driver_reject_ride', {
                request_id: activeRideRequest.request_id,
                driver_id: user.user_id
            });
            toast.info('Ride request rejected');
            setActiveRideRequest(null);
        } catch (err) {
            toast.error('Failed to reject ride request');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 px-6 sm:px-8 md:px-10 py-8 sm:py-10 md:py-12 max-w-7xl mx-auto">
            {/* Active Ride Request Alert */}
            {activeRideRequest && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mb-6 p-6 rounded-lg border-2 border-[#0EA5E9]/30 bg-blue-600/10"
                >
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                        <div className="flex-1 w-full">
                            <div className="font-bold text-[#0EA5E9] mb-3 text-lg sm:text-xl">🚨 New Ride Request!</div>
                            <div className="text-sm space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-900">Passenger ID:</span>
                                    <span className="text-gray-900/60">{activeRideRequest.passenger_id}</span>
                                </div>
                                {activeRideRequest.pickup && (
                                    <div className="flex items-start gap-2">
                                        <MapPin className="w-4 h-4 mt-0.5 text-[#0EA5E9]" />
                                        <div>
                                            <span className="font-semibold text-gray-900">Pickup Location:</span>
                                            <div className="text-gray-900/60">
                                                {activeRideRequest.pickup.lat?.toFixed(6)}, {activeRideRequest.pickup.lon?.toFixed(6)}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {activeRideRequest.destination && (
                                    <div className="flex items-start gap-2">
                                        <MapPin className="w-4 h-4 mt-0.5 text-[#0EA5E9]" />
                                        <div>
                                            <span className="font-semibold text-gray-900">Destination:</span>
                                            <div className="text-gray-900/60">{activeRideRequest.destination}</div>
                                        </div>
                                    </div>
                                )}
                                {activeRideRequest.destination_lat && activeRideRequest.destination_lon && (
                                    <div className="text-xs text-gray-900/40 ml-6">
                                        Coordinates: {activeRideRequest.destination_lat?.toFixed(6)}, {activeRideRequest.destination_lon?.toFixed(6)}
                                    </div>
                                )}
                                {(activeRideRequest.date || activeRideRequest.time) && (
                                    <div className="flex items-start gap-2">
                                        <Calendar className="w-4 h-4 mt-0.5 text-[#0EA5E9]" />
                                        <div className="flex gap-4">
                                            {activeRideRequest.date && (
                                                <div>
                                                    <span className="font-semibold text-gray-900">Date: </span>
                                                    <span className="text-gray-900/60">{new Date(activeRideRequest.date).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                            {activeRideRequest.time && (
                                                <div>
                                                    <span className="font-semibold text-gray-900">Time: </span>
                                                    <span className="text-gray-900/60">{activeRideRequest.time}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {activeRideRequest.number_of_people && (
                                    <div className="flex items-start gap-2">
                                        <Users className="w-4 h-4 mt-0.5 text-[#0EA5E9]" />
                                        <div>
                                            <span className="font-semibold text-gray-900">Number of People: </span>
                                            <span className="text-gray-900/60">{activeRideRequest.number_of_people} {activeRideRequest.number_of_people === 1 ? 'person' : 'people'}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col items-stretch sm:items-center gap-3 w-full sm:w-auto">
                            {/* Vehicle Selection */}
                            {(() => {
                                const numPeople = activeRideRequest.number_of_people || 1;
                                // Vehicle capacity includes driver, so we need capacity > numPeople
                                const availableVehicles = vehicles.filter(v => (Number(v.capacity) || 0) > numPeople);

                                if (vehicles.length > 0) {
                                    return (
                                        <div className="w-full mb-2">
                                            <label className="block text-xs font-semibold mb-1 text-gray-900">Select Vehicle (min {numPeople + 1} seats for {numPeople} passengers + driver):</label>
                                            {availableVehicles.length > 0 ? (
                                                <select
                                                    value={selectedVehicleForRequest}
                                                    onChange={(e) => setSelectedVehicleForRequest(e.target.value)}
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none text-sm text-gray-900"
                                                >
                                                    <option value="">-- Select Vehicle --</option>
                                                    {availableVehicles.map((vehicle) => (
                                                        <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>
                                                            {vehicle.model || 'Unknown'} - {vehicle.license_plate || vehicle.plate_number || 'N/A'} ({vehicle.capacity || 0} seats)
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <div className="px-3 py-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg">
                                                    <p className="text-xs text-[#f59e0b]">
                                                        No vehicles available with capacity for {numPeople} {numPeople === 1 ? 'person' : 'people'}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                            <div className="flex flex-col sm:flex-row gap-2 w-full">
                                <button
                                    onClick={handleAcceptRideRequest}
                                    disabled={(() => {
                                        const numPeople = activeRideRequest.number_of_people || 1;
                                        // Vehicle capacity includes driver, so we need capacity > numPeople
                                        const availableVehicles = vehicles.filter(v => (Number(v.capacity) || 0) > numPeople);
                                        return availableVehicles.length > 0 && !selectedVehicleForRequest;
                                    })()}
                                    className="flex-1 px-4 sm:px-6 py-2.5 sm:py-2 bg-[#10b981] text-gray-900 font-semibold rounded-lg hover:bg-[#10b981] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                                >
                                    <CheckCircle className="w-4 h-4" />
                                    Accept
                                </button>
                                <button
                                    onClick={handleRejectRideRequest}
                                    className="flex-1 px-4 sm:px-6 py-2.5 sm:py-2 bg-[#ef4444] text-gray-900 font-semibold rounded-lg hover:bg-[#ef4444] hover:brightness-110 transition-all duration-200 flex items-center justify-center gap-2 text-sm sm:text-base"
                                >
                                    <XCircle className="w-4 h-4" />
                                    Reject
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
            >
                <div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-2 sm:mb-3 text-gray-900">Driver Dashboard</h1>
                    <p className="text-gray-900/60 text-base sm:text-lg">Manage your rides and track performance</p>
                </div>
                {/* Location sharing status indicator and Go Online button */}
                {(user?.user_type === 'driver' || user?.user_type === 'both') && (
                    <div className="flex items-center gap-3">
                        {(activeRideId || rides.some(r => (r.status || '').toLowerCase() === 'ongoing') || isOnline) ? (
                            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-[#10b981]/30 bg-[#10b981]/10">
                                {myLivePos ? (
                                    <>
                                        <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse"></div>
                                        <span className="text-[#10b981] font-semibold">Sharing location</span>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-2 h-2 bg-[#f59e0b] rounded-full animate-pulse"></div>
                                        <span className="text-[#f59e0b] font-semibold">Requesting location...</span>
                                    </>
                                )}
                            </div>
                        ) : null}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleToggleOnline}
                            disabled={activeRideId != null || rides.some(r => (r.status || '').toLowerCase() === 'ongoing')}
                            className={`px-6 py-2.5 font-semibold rounded-lg transition-all duration-200 flex items-center gap-2 ${isOnline || activeRideId != null || rides.some(r => (r.status || '').toLowerCase() === 'ongoing')
                                    ? 'bg-[#ef4444] hover:bg-[#ef4444] hover:brightness-110 text-gray-900 border border-[#ef4444] disabled:opacity-50 disabled:cursor-not-allowed'
                                    : 'bg-[#10b981] hover:bg-[#10b981] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)] text-gray-900 border border-[#10b981]'
                                }`}
                        >
                            {(isOnline || activeRideId != null || rides.some(r => (r.status || '').toLowerCase() === 'ongoing')) ? (
                                <>
                                    <XCircle className="w-4 h-4" />
                                    {activeRideId != null || rides.some(r => (r.status || '').toLowerCase() === 'ongoing') ? 'Online (Ride Active)' : 'Go Offline'}
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    Go Online
                                </>
                            )}
                        </motion.button>
                    </div>
                )}
                <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleToggleCreateForm}
                    className="w-full sm:w-auto px-6 md:px-8 py-3 md:py-3.5 bg-blue-600 text-gray-900 font-bold rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                    <Plus className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${showCreateForm ? 'rotate-45' : 'rotate-0'}`} />
                    <span className="hidden sm:inline">{showCreateForm ? 'Cancel' : 'Create New Ride'}</span>
                    <span className="sm:hidden">{showCreateForm ? 'Cancel' : 'New Ride'}</span>
                </motion.button>
            </motion.div>

            {/* Quick stats + Live Map */}
            <div className="grid lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 p-4 rounded-lg border border-gray-200 bg-white">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-3">
                        <div className="font-semibold text-sm sm:text-base text-gray-900">Live Location</div>
                        <div className="text-xs text-gray-900/40 break-all sm:break-normal">{myLivePos ? `${myLivePos.lat.toFixed(5)}, ${myLivePos.lon.toFixed(5)}` : 'Share location to enable'}</div>
                    </div>
                    <ORSMap driver={myLivePos ? { lat: myLivePos.lat, lon: myLivePos.lon } : null} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
                    {(() => {
                        const total = rides.length;
                        const completed = rides.filter(r => (r.status || '').toLowerCase() === 'completed').length;
                        const revenue = rides.reduce((sum, r) => sum + Number(r.total_revenue || 0), 0);
                        return (
                            <>
                                <div className="p-4 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-xs text-gray-900/60 mb-1">Total Rides</div>
                                    <div className="text-2xl font-bold text-gray-900">{total}</div>
                                </div>
                                <div className="p-4 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-xs text-gray-900/60 mb-1">Completed</div>
                                    <div className="text-2xl font-bold text-gray-900">{completed}</div>
                                </div>
                                <div className="p-4 rounded-lg border border-gray-200 bg-white">
                                    <div className="text-xs text-gray-900/60 mb-1">Total Revenue</div>
                                    <div className="text-2xl font-bold text-[#10b981]">₹{revenue.toFixed(2)}</div>
                                </div>
                            </>
                        );
                    })()}
                </div>
            </div>

            {/* Create Ride Modal */}
            <AnimatePresence>
                {showCreateForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto"
                        onClick={() => setShowCreateForm(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 10 }}
                            transition={{ duration: 0.25 }}
                            className="rounded-lg w-full max-w-2xl max-h-[90vh] border border-gray-200 bg-white shadow-xl flex flex-col my-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-gray-200 flex items-start justify-between gap-4 flex-shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-600/10">
                                        <Car className="w-5 h-5 text-[#0EA5E9]" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-gray-900">Create New Ride</h3>
                                        <p className="text-xs text-gray-900/60">Fill the details below and publish your ride</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowCreateForm(false)}
                                    className="p-2 rounded-lg hover:bg-[#1A1A1A] transition-colors duration-200 flex-shrink-0"
                                    aria-label="Close"
                                >
                                    <X className="w-5 h-5 text-gray-900/60 hover:text-gray-900" />
                                </button>
                            </div>

                            <div className="px-6 sm:px-8 py-6 sm:py-8 overflow-y-auto flex-1 min-h-0">
                                {error && (
                                    <div className="mb-6 p-4 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-[#ef4444] flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-[#ef4444]">{error}</p>
                                    </div>
                                )}

                                <form onSubmit={handleCreateRide} className="space-y-4">
                                    <div className="grid md:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-900">Source <span className="text-[#ef4444]">*</span></label>
                                            <div className="relative">
                                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-900/40" />
                                                <input
                                                    type="text"
                                                    name="source"
                                                    value={formData.source}
                                                    onChange={handleChange}
                                                    placeholder="Pickup location"
                                                    className={`w-full pl-11 pr-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-blue-600/20 transition-all outline-none text-gray-900 placeholder:text-gray-900/40 ${formErrors.source ? 'border-[#ef4444] focus:border-[#ef4444]' : 'border-gray-200 focus:border-blue-600'
                                                        }`}
                                                />
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {popularCities.map((city) => (
                                                        <button
                                                            type="button"
                                                            key={`source-${city}`}
                                                            onClick={() => handleQuickSelect('source', city)}
                                                            className={`px-3 py-1 rounded-lg text-xs border transition-all duration-200 ${formData.source === city
                                                                    ? 'bg-blue-600 text-gray-900 border-[#0EA5E9]'
                                                                    : 'bg-white border-gray-200 text-gray-900/60 hover:border-[#0EA5E9]/50 hover:text-gray-900'
                                                                }`}
                                                        >
                                                            {city}
                                                        </button>
                                                    ))}
                                                </div>
                                                {formErrors.source && (
                                                    <p className="text-xs text-[#ef4444] mt-1 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        {formErrors.source}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-900">Destination <span className="text-[#ef4444]">*</span></label>
                                            <div className="relative">
                                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-900/40" />
                                                <input
                                                    type="text"
                                                    name="destination"
                                                    value={formData.destination}
                                                    onChange={handleChange}
                                                    placeholder="Drop-off location"
                                                    className={`w-full pl-11 pr-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-blue-600/20 transition-all outline-none text-gray-900 placeholder:text-gray-900/40 ${formErrors.destination ? 'border-[#ef4444] focus:border-[#ef4444]' : 'border-gray-200 focus:border-blue-600'
                                                        }`}
                                                />
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {popularCities.map((city) => (
                                                        <button
                                                            type="button"
                                                            key={`destination-${city}`}
                                                            onClick={() => handleQuickSelect('destination', city)}
                                                            className={`px-3 py-1 rounded-lg text-xs border transition-all duration-200 ${formData.destination === city
                                                                    ? 'bg-blue-600 text-gray-900 border-[#0EA5E9]'
                                                                    : 'bg-white border-gray-200 text-gray-900/60 hover:border-[#0EA5E9]/50 hover:text-gray-900'
                                                                }`}
                                                        >
                                                            {city}
                                                        </button>
                                                    ))}
                                                </div>
                                                {formErrors.destination && (
                                                    <p className="text-xs text-[#ef4444] mt-1 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        {formErrors.destination}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Distance Calculator */}
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg bg-blue-600/10 border border-[#0EA5E9]/30">
                                        <div className="flex items-center gap-3">
                                            <Calculator className="w-5 h-5 text-[#0EA5E9]" />
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">Distance Calculator</p>
                                                <p className="text-xs text-gray-900/60">Auto-calculates when both locations are entered</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleCalculateDistance()}
                                            disabled={isCalculatingDistance || !formData.source.trim() || !formData.destination.trim()}
                                            className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg font-semibold hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap text-sm"
                                        >
                                            {isCalculatingDistance ? (
                                                <>
                                                    <Loader className="w-4 h-4 animate-spin" />
                                                    Calculating...
                                                </>
                                            ) : (
                                                <>
                                                    <TrendingUp className="w-4 h-4" />
                                                    Calculate Distance
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-900">Date <span className="text-[#ef4444]">*</span></label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-900/40" />
                                                <input
                                                    type="date"
                                                    name="date"
                                                    value={formData.date}
                                                    onChange={handleChange}
                                                    min={getMinDate()}
                                                    className={`w-full pl-11 pr-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-blue-600/20 transition-all outline-none text-gray-900 ${formErrors.date ? 'border-[#ef4444] focus:border-[#ef4444]' : 'border-gray-200 focus:border-blue-600'
                                                        }`}
                                                />
                                                {formErrors.date && (
                                                    <p className="text-xs text-[#ef4444] mt-1 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        {formErrors.date}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-900">Time <span className="text-[#ef4444]">*</span></label>
                                            <div className="relative">
                                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-900/40" />
                                                <input
                                                    type="time"
                                                    name="time"
                                                    value={formData.time}
                                                    onChange={handleChange}
                                                    className={`w-full pl-11 pr-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-blue-600/20 transition-all outline-none text-gray-900 ${formErrors.time ? 'border-[#ef4444] focus:border-[#ef4444]' : 'border-gray-200 focus:border-blue-600'
                                                        }`}
                                                />
                                                {formErrors.time && (
                                                    <p className="text-xs text-[#ef4444] mt-1 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        {formErrors.time}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-gray-900">Distance (KM) <span className="text-[#ef4444]">*</span></label>
                                            <div className="relative">
                                                <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-900/40" />
                                                <input
                                                    type="number"
                                                    name="distance_km"
                                                    value={formData.distance_km}
                                                    onChange={handleChange}
                                                    step="0.01"
                                                    min="0"
                                                    placeholder="25"
                                                    className={`w-full pl-11 pr-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-blue-600/20 transition-all outline-none text-gray-900 placeholder:text-gray-900/40 ${formErrors.distance_km ? 'border-[#ef4444] focus:border-[#ef4444]' : 'border-gray-200 focus:border-blue-600'
                                                        }`}
                                                />
                                                {formErrors.distance_km && (
                                                    <p className="text-xs text-[#ef4444] mt-1 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        {formErrors.distance_km}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Fare Estimation - Fixed 10rs per seat per km */}
                                    {getSelectedVehicleCapacity() > 0 && parseFloat(formData.distance_km) > 0 && (
                                        <div className="p-4 rounded-lg bg-[#10b981]/10 border border-[#10b981]/30">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <DollarSign className="w-5 h-5 text-[#10b981]" />
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900">Estimated Total Fare</p>
                                                        <p className="text-xs text-gray-900/60">
                                                            ₹10/km × {formData.distance_km} km × {getSelectedVehicleCapacity()} seats
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="text-2xl font-bold text-[#10b981]">₹{getEstimatedFare()}</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-900">Select Vehicle <span className="text-[#ef4444]">*</span></label>
                                        <div className="relative">
                                            <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-900/40 z-10" />
                                            <select
                                                name="vehicle_id"
                                                value={formData.vehicle_id}
                                                onChange={handleChange}
                                                className={`w-full pl-11 pr-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-blue-600/20 transition-all outline-none appearance-none cursor-pointer text-gray-900 ${formErrors.vehicle_id ? 'border-[#ef4444] focus:border-[#ef4444]' : 'border-gray-200 focus:border-blue-600'
                                                    }`}
                                            >
                                                <option value="">Select a vehicle</option>
                                                {vehicles.map((vehicle) => (
                                                    <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>
                                                        {vehicle.model} {vehicle.license_plate ? `(${vehicle.license_plate})` : ''} - {vehicle.capacity} seats
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {formErrors.vehicle_id && (
                                            <p className="text-xs text-[#ef4444] flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                {formErrors.vehicle_id}
                                            </p>
                                        )}
                                        {vehicles.length === 0 && (
                                            <p className="text-xs text-gray-900/60">
                                                No vehicles added yet. <a href="/vehicles" className="text-[#0EA5E9] hover:underline">Add a vehicle</a>
                                            </p>
                                        )}
                                    </div>

                                    {/* Waypoints Section */}
                                    <div className="border-t border-gray-200 pt-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-sm font-semibold flex items-center gap-2 text-gray-900">
                                                <Route className="w-4 h-4 text-[#0EA5E9]" />
                                                Waypoints (Optional)
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
                                            <input
                                                type="text"
                                                placeholder="Waypoint name"
                                                value={newWaypoint.name}
                                                onChange={(e) => setNewWaypoint({ ...newWaypoint, name: e.target.value })}
                                                className="col-span-1 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none text-sm text-gray-900 placeholder:text-gray-900/40"
                                            />
                                            <div className="col-span-2 relative flex gap-2">
                                                <div className="flex-1 relative">
                                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0EA5E9]" />
                                                    <input
                                                        type="text"
                                                        placeholder="Enter address"
                                                        value={newWaypoint.address}
                                                        onChange={(e) => setNewWaypoint({ ...newWaypoint, address: e.target.value })}
                                                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none text-sm text-gray-900 placeholder:text-gray-900/40"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        if (navigator.geolocation) {
                                                            navigator.geolocation.getCurrentPosition(async (pos) => {
                                                                const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                                                                if (address) {
                                                                    setNewWaypoint({ ...newWaypoint, address });
                                                                } else {
                                                                    toast.error('Could not get address from location');
                                                                }
                                                            }, () => {
                                                                toast.error('Unable to get your location');
                                                            });
                                                        } else {
                                                            toast.error('Geolocation is not supported');
                                                        }
                                                    }}
                                                    className="px-3 py-2 bg-blue-600 text-gray-900 rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 flex items-center justify-center"
                                                    title="Use current location"
                                                >
                                                    <Navigation className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (!newWaypoint.name || !newWaypoint.address) {
                                                        toast.error('Please fill all waypoint fields');
                                                        return;
                                                    }
                                                    // Geocode the address for temporary storage
                                                    const coords = await forwardGeocode(newWaypoint.address.trim());
                                                    if (!coords) {
                                                        toast.error('Could not locate that address. Please try a more specific address.');
                                                        return;
                                                    }
                                                    const tempWaypoint = { ...newWaypoint, lat: coords.lat, lon: coords.lon };
                                                    setNewWaypoint({ name: '', address: '' });
                                                    // Will be added after ride creation
                                                    setWaypoints([...waypoints, tempWaypoint]);
                                                }}
                                                className="col-span-1 px-3 py-2 bg-blue-600/10 text-[#0EA5E9] rounded-lg font-semibold hover:bg-blue-600/20 transition-all duration-200 flex items-center justify-center gap-1 text-sm"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Add
                                            </button>
                                        </div>
                                        {waypoints.length > 0 && (
                                            <div className="space-y-1 max-h-24 overflow-y-auto">
                                                {waypoints.map((wp, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white border border-gray-200 text-sm">
                                                        <span className="text-gray-900">{wp.name || `Waypoint ${idx + 1}`}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setWaypoints(waypoints.filter((_, i) => i !== idx))}
                                                            className="text-[#ef4444] hover:text-[#ef4444] hover:brightness-110 transition-colors"
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-gray-900/40 mt-2">
                                            Note: Waypoints will be added after ride creation
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowCreateForm(false);
                                                setWaypoints([]);
                                                setFormErrors({});
                                                setError('');
                                            }}
                                            disabled={isSubmitting}
                                            className="px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-[#1A1A1A] text-gray-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Cancel
                                        </button>
                                        <motion.button
                                            whileHover={!isSubmitting ? { scale: 1.02 } : {}}
                                            whileTap={!isSubmitting ? { scale: 0.98 } : {}}
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="px-5 py-2.5 bg-blue-600 text-gray-900 font-semibold rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader className="w-4 h-4 animate-spin" />
                                                    Creating...
                                                </>
                                            ) : (
                                                'Create Ride'
                                            )}
                                        </motion.button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>


            {/* Tabs */}
            <div className="flex gap-2 mb-8 p-2 rounded-lg border border-gray-200 bg-white w-fit">
                <motion.button
                    onClick={() => setActiveTab('rides')}
                    whileTap={{ scale: 0.97 }}
                    className={`px-8 py-3 rounded-lg font-bold transition-all duration-200 relative ${activeTab === 'rides'
                            ? 'bg-blue-600 text-gray-900 shadow-[0_4px_12px_rgba(14,165,233,0.3)]'
                            : 'text-gray-900/60 hover:text-gray-900 hover:bg-[#1A1A1A]'
                        }`}
                >
                    {activeTab === 'rides' && (
                        <motion.div
                            layoutId="driverActiveTab"
                            className="absolute inset-0 bg-blue-600 rounded-lg"
                            style={{ zIndex: -1 }}
                        />
                    )}
                    My Rides
                </motion.button>
                <motion.button
                    onClick={() => setActiveTab('feedback')}
                    whileTap={{ scale: 0.97 }}
                    className={`px-8 py-3 rounded-lg font-bold transition-all duration-200 relative ${activeTab === 'feedback'
                            ? 'bg-blue-600 text-gray-900 shadow-[0_4px_12px_rgba(14,165,233,0.3)]'
                            : 'text-gray-900/60 hover:text-gray-900 hover:bg-[#1A1A1A]'
                        }`}
                >
                    {activeTab === 'feedback' && (
                        <motion.div
                            layoutId="driverActiveTab"
                            className="absolute inset-0 bg-blue-600 rounded-lg"
                            style={{ zIndex: -1 }}
                        />
                    )}
                    Feedback & Ratings
                </motion.button>
            </div>

            {/* Content */}
            <div>
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-[#0EA5E9]/30 border-t-[#0EA5E9] rounded-full animate-spin" />
                            <p className="text-gray-900/60">Loading...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="p-4 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-[#ef4444] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[#ef4444]">{error}</p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'rides' && (
                            <div className="space-y-4">
                                {rides.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.25 }}
                                        className="rounded-lg p-12 text-center border border-gray-200 bg-white"
                                    >
                                        <Car className="w-16 h-16 text-gray-900/40 mx-auto mb-4" />
                                        <h3 className="text-xl font-semibold mb-2 text-gray-900">No rides yet</h3>
                                        <p className="text-gray-900/60">Create your first ride to get started</p>
                                    </motion.div>
                                ) : (
                                    <div className="grid gap-5">
                                        {rides.map((ride, index) => (
                                            <motion.div
                                                key={ride.ride_id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.05, duration: 0.25 }}
                                                whileHover={{ y: -2 }}
                                                className="rounded-lg p-6 sm:p-8 border border-gray-200 bg-white hover:border-[#0EA5E9]/30 hover:bg-[#1A1A1A] transition-all duration-200 group relative overflow-hidden"
                                            >
                                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                                                    <div className="flex-1 space-y-4">
                                                        {/* Vehicle Image */}
                                                        {ride.vehicle_image_url && (
                                                            <div className="overflow-hidden rounded-lg border border-gray-200 w-full max-w-xs">
                                                                <img
                                                                    src={ride.vehicle_image_url}
                                                                    alt="Vehicle"
                                                                    className="w-full h-32 object-cover"
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-3 flex-wrap">
                                                            <div className="text-2xl font-bold text-gray-900">{ride.source}</div>
                                                            <div className="text-[#0EA5E9] text-xl">→</div>
                                                            <div className="text-2xl font-bold text-gray-900">{ride.destination}</div>
                                                            <span className={`ml-auto px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusColor(ride.status)}`}>
                                                                {ride.status}
                                                            </span>
                                                        </div>

                                                        {/* Vehicle Information */}
                                                        {ride.vehicle_model && (
                                                            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 w-fit">
                                                                <Car className="w-4 h-4 text-[#0EA5E9]" />
                                                                <span className="text-sm font-medium text-gray-900">
                                                                    {ride.vehicle_model}
                                                                    {ride.vehicle_color && ` • ${ride.vehicle_color}`}
                                                                    {ride.license_plate && ` • ${ride.license_plate}`}
                                                                </span>
                                                            </div>
                                                        )}

                                                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                            <div className="flex items-center gap-2 text-sm group/item">
                                                                <div className="p-2 rounded-lg bg-white group-hover/item:bg-[#1A1A1A] transition-colors duration-200">
                                                                    <Calendar className="w-4 h-4 text-[#0EA5E9]" />
                                                                </div>
                                                                <span className="font-semibold text-gray-900">{new Date(ride.date).toLocaleDateString()}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm group/item">
                                                                <div className="p-2 rounded-lg bg-white group-hover/item:bg-[#1A1A1A] transition-colors duration-200">
                                                                    <Clock className="w-4 h-4 text-[#0EA5E9]" />
                                                                </div>
                                                                <span className="font-semibold text-gray-900">{ride.time}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm group/item">
                                                                <div className="p-2 rounded-lg bg-white group-hover/item:bg-[#1A1A1A] transition-colors duration-200">
                                                                    <Users className="w-4 h-4 text-[#0EA5E9]" />
                                                                </div>
                                                                <span className="font-semibold text-gray-900">{(ride.seats_booked_count ?? (ride.total_seats - ride.available_seats))}/{ride.total_seats} seats</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-sm group/item">
                                                                <div className="p-2 rounded-lg bg-[#10b981]/10 group-hover/item:bg-[#10b981]/20 transition-colors duration-200">
                                                                    <DollarSign className="w-4 h-4 text-[#10b981]" />
                                                                </div>
                                                                <span className="font-semibold text-gray-900">₹10/km × {ride.distance_km}km</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-3">
                                                            <div className="px-4 py-2 rounded-lg bg-blue-600/10 border border-[#0EA5E9]/30">
                                                                <span className="text-xs text-[#0EA5E9] font-semibold">Bookings: </span>
                                                                <span className="font-bold text-gray-900">{ride.total_bookings || 0}</span>
                                                            </div>
                                                            <div className="px-4 py-2 rounded-lg bg-[#10b981]/10 border border-[#10b981]/30">
                                                                <span className="text-xs text-[#10b981] font-semibold">Revenue: </span>
                                                                <span className="font-bold text-gray-900">₹{ride.total_revenue || 0}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        {ride.status === 'scheduled' && (
                                                            <>
                                                                <motion.button
                                                                    whileHover={{ scale: 1.05 }}
                                                                    whileTap={{ scale: 0.95 }}
                                                                    onClick={() => handleUpdateStatus(ride.ride_id, 'ongoing')}
                                                                    className="px-4 py-2 bg-blue-600 text-gray-900 font-semibold rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 flex items-center gap-2"
                                                                >
                                                                    <Play className="w-4 h-4" />
                                                                    Start
                                                                </motion.button>
                                                                <motion.button
                                                                    whileHover={{ scale: 1.05 }}
                                                                    whileTap={{ scale: 0.95 }}
                                                                    onClick={() => handleUpdateStatus(ride.ride_id, 'cancelled')}
                                                                    className="px-4 py-2 bg-[#ef4444] text-gray-900 font-semibold rounded-lg hover:bg-[#ef4444] hover:brightness-110 transition-all duration-200 flex items-center gap-2"
                                                                >
                                                                    <XCircle className="w-4 h-4" />
                                                                    Cancel
                                                                </motion.button>
                                                            </>
                                                        )}
                                                        {ride.status === 'ongoing' && (
                                                            <motion.button
                                                                whileHover={{ scale: 1.05 }}
                                                                whileTap={{ scale: 0.95 }}
                                                                onClick={() => handleUpdateStatus(ride.ride_id, 'completed')}
                                                                className="px-4 py-2 bg-[#10b981] text-gray-900 font-semibold rounded-lg hover:bg-[#10b981] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)] transition-all duration-200 flex items-center gap-2"
                                                            >
                                                                <CheckCircle className="w-4 h-4" />
                                                                Complete
                                                            </motion.button>
                                                        )}
                                                        <motion.button
                                                            whileHover={{ scale: 1.05 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={async () => {
                                                                setSelectedRideForWaypoints(ride.ride_id);
                                                                await loadWaypoints(ride.ride_id);
                                                            }}
                                                            className="px-4 py-2 bg-[#8b5cf6] text-gray-900 font-semibold rounded-lg hover:bg-[#8b5cf6] hover:brightness-110 transition-all duration-200 flex items-center gap-2"
                                                        >
                                                            <Route className="w-4 h-4" />
                                                            Waypoints
                                                        </motion.button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'feedback' && (
                            <div className="space-y-4">
                                {/* Feedback Summary */}
                                {feedback.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="rounded-lg p-6 border border-gray-200 bg-white"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm text-gray-900/60 mb-1">Average Rating</h3>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-3xl font-bold text-gray-900">{feedbackStats.averageRating.toFixed(1)}</span>
                                                    <div className="flex items-center gap-1">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star
                                                                key={i}
                                                                className={`w-5 h-5 ${i < Math.round(feedbackStats.averageRating)
                                                                        ? 'fill-[#f59e0b] text-[#f59e0b]'
                                                                        : 'text-gray-900/20'
                                                                    }`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <h3 className="text-sm text-gray-900/60 mb-1">Total Feedback</h3>
                                                <p className="text-3xl font-bold text-gray-900">{feedbackStats.totalFeedback}</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {feedback.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.25 }}
                                        className="rounded-lg p-12 text-center border border-gray-200 bg-white"
                                    >
                                        <MessageSquare className="w-16 h-16 text-gray-900/40 mx-auto mb-4" />
                                        <h3 className="text-xl font-semibold mb-2 text-gray-900">No feedback yet</h3>
                                        <p className="text-gray-900/60">Complete rides to receive passenger feedback</p>
                                    </motion.div>
                                ) : (
                                    <div className="grid gap-4">
                                        {feedback.map((item, index) => (
                                            <motion.div
                                                key={item.feedback_id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.05, duration: 0.25 }}
                                                className="rounded-lg p-6 border-l-4 border-l-[#0EA5E9] border-y border-r border-gray-200 bg-white hover:bg-[#1A1A1A] transition-all duration-200"
                                            >
                                                <div className="flex items-start justify-between gap-4 mb-3">
                                                    <div>
                                                        <h4 className="font-semibold text-lg text-gray-900">{item.passenger_name}</h4>
                                                        <p className="text-sm text-gray-900/60">{item.source} → {item.destination}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star
                                                                key={i}
                                                                className={`w-5 h-5 ${i < item.rating
                                                                        ? 'fill-[#f59e0b] text-[#f59e0b]'
                                                                        : 'text-gray-900/20'
                                                                    }`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                                {item.comments && (
                                                    <p className="text-sm text-gray-900/60 mb-3 p-3 rounded-lg bg-white border border-gray-200">
                                                        "{item.comments}"
                                                    </p>
                                                )}
                                                <p className="text-xs text-gray-900/40">
                                                    {new Date(item.created_at).toLocaleDateString()}
                                                </p>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Waypoints Modal */}
            <AnimatePresence>
                {selectedRideForWaypoints && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm"
                        onClick={() => setSelectedRideForWaypoints(null)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 10 }}
                            transition={{ duration: 0.25 }}
                            className="rounded-lg w-full max-w-md border border-gray-200 bg-white shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-6 pt-6 pb-4 border-b border-gray-200 flex items-center justify-between">
                                <h3 className="text-2xl font-bold text-gray-900">Manage Waypoints</h3>
                                <button
                                    onClick={() => setSelectedRideForWaypoints(null)}
                                    className="p-2 rounded-lg hover:bg-[#1A1A1A] transition-colors duration-200"
                                >
                                    <XCircle className="w-5 h-5 text-gray-900/60 hover:text-gray-900" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-4 gap-2">
                                    <input
                                        type="text"
                                        placeholder="Name"
                                        value={newWaypoint.name}
                                        onChange={(e) => setNewWaypoint({ ...newWaypoint, name: e.target.value })}
                                        className="col-span-1 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none text-sm text-gray-900 placeholder:text-gray-900/40"
                                    />
                                    <div className="col-span-2 relative flex gap-2">
                                        <div className="flex-1 relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0EA5E9]" />
                                            <input
                                                type="text"
                                                placeholder="Enter address"
                                                value={newWaypoint.address}
                                                onChange={(e) => setNewWaypoint({ ...newWaypoint, address: e.target.value })}
                                                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none text-sm text-gray-900 placeholder:text-gray-900/40"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (navigator.geolocation) {
                                                    navigator.geolocation.getCurrentPosition(async (pos) => {
                                                        const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                                                        if (address) {
                                                            setNewWaypoint({ ...newWaypoint, address });
                                                        } else {
                                                            toast.error('Could not get address from location');
                                                        }
                                                    }, () => {
                                                        toast.error('Unable to get your location');
                                                    });
                                                } else {
                                                    toast.error('Geolocation is not supported');
                                                }
                                            }}
                                            className="px-3 py-2 bg-blue-600 text-gray-900 rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 flex items-center justify-center"
                                            title="Use current location"
                                        >
                                            <Navigation className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => handleAddWaypoint(selectedRideForWaypoints)}
                                        className="col-span-1 px-3 py-2 bg-blue-600 text-gray-900 rounded-lg font-semibold hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 flex items-center justify-center gap-1 text-sm"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add
                                    </button>
                                </div>
                                <div className="space-y-2 max-h-64 overflow-auto">
                                    {waypoints.map((wp) => (
                                        <div key={wp.waypoint_id || wp.name} className="flex items-center justify-between p-3 rounded-lg bg-white border border-gray-200">
                                            <div>
                                                <p className="font-semibold text-sm text-gray-900">{wp.name}</p>
                                                <p className="text-xs text-gray-900/40">{wp.lat}, {wp.lon}</p>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    if (!wp.waypoint_id) {
                                                        toast.error('Waypoint ID not found');
                                                        return;
                                                    }
                                                    if (!window.confirm(`Delete waypoint "${wp.name}"?`)) return;
                                                    try {
                                                        await rideService.deleteWaypoint(selectedRideForWaypoints.ride_id, wp.waypoint_id);
                                                        toast.success('Waypoint deleted');
                                                        setWaypoints(waypoints.filter(w => w.waypoint_id !== wp.waypoint_id));
                                                    } catch (err) {
                                                        toast.error(err.response?.data?.message || 'Failed to delete waypoint');
                                                    }
                                                }}
                                                className="text-[#ef4444] hover:text-[#ef4444] hover:brightness-110 transition-colors"
                                            >
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DriverDashboard;
