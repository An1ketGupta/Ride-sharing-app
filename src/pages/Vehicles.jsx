import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { vehicleExtras } from '../services/vehicleExtras';
import { documentService } from '../services/documentService';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { Car, Upload, CheckCircle, XCircle, Clock, Camera, Trash2 } from 'lucide-react';
import api from '../config/api';

const Vehicles = () => {
    const { user } = useAuth();
    const toast = useToast();
    const [vehicles, setVehicles] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddVehicle, setShowAddVehicle] = useState(false);
    const [showUploadDoc, setShowUploadDoc] = useState(false);
    const [vehicleForm, setVehicleForm] = useState({
        model: '',
        plate_number: '',
        seats: '',
        color: '',
        vehicle_image_url: ''
    });
    const [formErrors, setFormErrors] = useState({});
    const [docForm, setDocForm] = useState({
        doc_type: 'license',
        file_url: ''
    });

    const loadVehicles = async () => {
        if (!user?.user_id) return;
        try {
            setLoading(true);
            // Get vehicles for driver
            const response = await api.get(`/vehicles?driver_id=${user.user_id}`);
            setVehicles(Array.isArray(response.data?.data) ? response.data.data : []);
        } catch (err) {
            toast.error('Failed to load vehicles');
        } finally {
            setLoading(false);
        }
    };

    const loadDocuments = async () => {
        if (!user?.user_id) return;
        try {
            const resp = await documentService.list(user.user_id);
            setDocuments(Array.isArray(resp.data) ? resp.data : []);
        } catch (err) {
            console.error('Failed to load documents');
        }
    };

    useEffect(() => {
        loadVehicles();
        loadDocuments();
    }, [user?.user_id]);

    const handleCreateVehicle = async (e) => {
        e.preventDefault();
        // Reset errors
        const errs = {};
        const plate = String(vehicleForm.plate_number || '').trim();
        const seatsNum = Number(vehicleForm.seats);
        if (!vehicleForm.model.trim()) errs.model = 'Model is required';
        // Basic plate pattern (alphanumeric and dashes/spaces allowed)
        if (!plate) errs.plate_number = 'Plate number is required';
        else if (!/^[A-Za-z0-9\-\s]{5,}$/.test(plate)) errs.plate_number = 'Invalid plate format';
        if (!Number.isFinite(seatsNum) || seatsNum <= 0) errs.seats = 'Seats must be greater than 0';
        setFormErrors(errs);
        if (Object.keys(errs).length > 0) {
            toast.error('Please fix the highlighted fields');
            return;
        }

        // Optimistic create
        const optimistic = {
            vehicle_id: `temp_${Date.now()}`,
            driver_id: user.user_id,
            model: vehicleForm.model,
            license_plate: plate,
            plate_number: plate, // For backward compatibility
            capacity: seatsNum,
            seats: seatsNum, // For backward compatibility
            color: vehicleForm.color,
            vehicle_image_url: vehicleForm.vehicle_image_url
        };
        setVehicles((prev) => [optimistic, ...prev]);

        try {
            setLoading(true);
            const response = await api.post('/vehicles', {
                model: vehicleForm.model,
                license_plate: vehicleForm.plate_number,
                capacity: parseInt(vehicleForm.seats),
                color: vehicleForm.color || null,
                vehicle_image_url: vehicleForm.vehicle_image_url || null
            });
            toast.success('Vehicle added successfully');
            setShowAddVehicle(false);
            setVehicleForm({ model: '', plate_number: '', seats: '', color: '', vehicle_image_url: '' });
            // Reload vehicles from server to get the actual saved data including image URL
            loadVehicles();
        } catch (err) {
            // Rollback optimistic insert
            setVehicles((prev) => prev.filter((v) => v.vehicle_id !== optimistic.vehicle_id));
            toast.error(err.response?.data?.message || 'Failed to add vehicle');
        } finally {
            setLoading(false);
        }
    };

    const handleUploadDoc = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            await documentService.upload(user.user_id, docForm);
            toast.success('Document uploaded');
            setShowUploadDoc(false);
            setDocForm({ doc_type: 'license', file_url: '' });
            loadDocuments();
        } catch (err) {
            toast.error('Failed to upload document');
        } finally {
            setLoading(false);
        }
    };

    const updateVehicleImage = async (vehicleId, imageUrl) => {
        // Optimistic image update
        const prev = vehicles;
        setVehicles((list) => list.map((v) => v.vehicle_id === vehicleId ? { ...v, vehicle_image_url: imageUrl } : v));
        try {
            await vehicleExtras.updateVehicleImage(vehicleId, imageUrl);
            toast.success('Vehicle image updated');
        } catch (err) {
            // Rollback
            setVehicles(prev);
            toast.error(err.response?.data?.message || 'Failed to update image');
        }
    };

    const handleDeleteVehicle = async (vehicleId, vehicleModel) => {
        // Confirmation dialog
        const confirmed = window.confirm(
            `Are you sure you want to delete "${vehicleModel}"?\n\n` +
            `This action cannot be undone. The vehicle will be removed from your list.`
        );
        
        if (!confirmed) return;

        // Optimistic delete
        const prevVehicles = vehicles;
        setVehicles((list) => list.filter((v) => v.vehicle_id !== vehicleId));

        try {
            await vehicleExtras.deleteVehicle(vehicleId);
            toast.success('Vehicle deleted successfully');
        } catch (err) {
            // Rollback on error
            setVehicles(prevVehicles);
            const errorMsg = err.response?.data?.message || 'Failed to delete vehicle';
            toast.error(errorMsg);
            
            // If vehicle has active rides, show more helpful message
            if (errorMsg.includes('active rides')) {
                toast.error('Cannot delete vehicle with active or scheduled rides. Please cancel those rides first.');
            }
        }
    };

    const docStatusIcon = (status) => {
        if (status === 'approved') return <CheckCircle className="w-5 h-5 text-green-500" />;
        if (status === 'rejected') return <XCircle className="w-5 h-5 text-red-500" />;
        return <Clock className="w-5 h-5 text-yellow-500" />;
    };

    return (
        <div className="container mx-auto max-w-6xl px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl font-extrabold">My Vehicles</h1>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowAddVehicle(true)}
                        className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-primary to-secondary text-white rounded-xl font-semibold shadow-glow hover:shadow-glow-lg transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
                    >
                        <Car className="w-4 h-4 sm:w-5 sm:h-5" />
                        Add Vehicle
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowUploadDoc(true)}
                        className="w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 bg-white/70 dark:bg-neutral-900/70 text-foreground rounded-xl font-semibold border-2 border-border hover:border-primary transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
                    >
                        <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                        Upload Document
                    </motion.button>
                </div>
            </div>

            {/* Documents Status */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 sm:mb-6 rounded-2xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft p-4 sm:p-6"
            >
                <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Document Verification</h2>
                {documents.length === 0 ? (
                    <p className="text-muted-foreground">No documents uploaded yet</p>
                ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                        {documents.map((doc) => (
                            <div key={doc.doc_id} className="flex items-center justify-between p-4 rounded-xl border border-white/20 bg-white/50 dark:bg-white/5">
                                <div>
                                    <p className="font-semibold capitalize">{doc.doc_type}</p>
                                    <p className="text-sm text-muted-foreground">{doc.status || 'pending'}</p>
                                </div>
                                {docStatusIcon(doc.status)}
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>

            {/* Vehicles List */}
            {loading && vehicles.length === 0 ? (
                <div className="text-center py-20">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            ) : vehicles.length === 0 ? (
                <div className="text-center py-20 rounded-2xl border border-white/20 bg-white/70 dark:bg-neutral-900/70">
                    <Car className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-semibold mb-2">No vehicles yet</p>
                    <p className="text-muted-foreground">Add your first vehicle to start offering rides</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    {vehicles.map((vehicle) => (
                        <motion.div
                            key={vehicle.vehicle_id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-2xl border border-white/20 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl shadow-soft overflow-hidden"
                        >
                            {vehicle.vehicle_image_url ? (
                                <img src={vehicle.vehicle_image_url} alt={vehicle.model} className="w-full h-40 sm:h-48 object-cover" />
                            ) : (
                                <div className="w-full h-40 sm:h-48 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                                    <Car className="w-16 h-16 sm:w-20 sm:h-20 text-foreground/30" />
                                </div>
                            )}
                            <div className="p-4 sm:p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <h3 className="text-xl font-bold">{vehicle.model}</h3>
                                        <p className="text-sm text-muted-foreground">{vehicle.license_plate || vehicle.plate_number}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                const url = prompt('Enter image URL:');
                                                if (url) updateVehicleImage(vehicle.vehicle_id, url);
                                            }}
                                            className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                                            title="Update image"
                                        >
                                            <Camera className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteVehicle(vehicle.vehicle_id, vehicle.model)}
                                            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors text-red-600 dark:text-red-400"
                                            title="Delete vehicle"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="text-muted-foreground">Seats</p>
                                        <p className="font-semibold">{vehicle.capacity || vehicle.seats}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Color</p>
                                        <p className="font-semibold capitalize">{vehicle.color || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Add Vehicle Modal */}
            {showAddVehicle && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-glow-lg p-6 max-w-md w-full"
                    >
                        <h2 className="text-2xl font-bold mb-6">Add Vehicle</h2>
                        <form onSubmit={handleCreateVehicle} className="space-y-4">
                            <input
                                type="text"
                                placeholder="Model (e.g., Toyota Innova)"
                                value={vehicleForm.model}
                                onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                                required
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none"
                            />
                            {formErrors.model && <div className="text-xs text-red-600 mt-1">{formErrors.model}</div>}
                            <input
                                type="text"
                                placeholder="Plate Number"
                                value={vehicleForm.plate_number}
                                onChange={(e) => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })}
                                required
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none"
                            />
                            {formErrors.plate_number && <div className="text-xs text-red-600 mt-1">{formErrors.plate_number}</div>}
                            <input
                                type="number"
                                placeholder="Seats"
                                value={vehicleForm.seats}
                                onChange={(e) => setVehicleForm({ ...vehicleForm, seats: e.target.value })}
                                required
                                min="1"
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none"
                            />
                            {formErrors.seats && <div className="text-xs text-red-600 mt-1">{formErrors.seats}</div>}
                            <input
                                type="text"
                                placeholder="Color"
                                value={vehicleForm.color}
                                onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none"
                            />
                            <input
                                type="url"
                                placeholder="Vehicle Image URL (optional)"
                                value={vehicleForm.vehicle_image_url}
                                onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_image_url: e.target.value })}
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none"
                            />
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddVehicle(false)}
                                    className="flex-1 px-4 py-3 bg-white/50 dark:bg-white/5 rounded-xl font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 px-4 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl font-semibold shadow-glow"
                                >
                                    {loading ? 'Adding...' : 'Add Vehicle'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Upload Document Modal */}
            {showUploadDoc && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-glow-lg p-6 max-w-md w-full"
                    >
                        <h2 className="text-2xl font-bold mb-6">Upload Document</h2>
                        <form onSubmit={handleUploadDoc} className="space-y-4">
                            <select
                                value={docForm.doc_type}
                                onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none"
                            >
                                <option value="license">License</option>
                                <option value="registration">Registration</option>
                                <option value="insurance">Insurance</option>
                                <option value="vehicle_image">Vehicle Image</option>
                            </select>
                            <input
                                type="url"
                                placeholder="Document/Image URL"
                                value={docForm.file_url}
                                onChange={(e) => setDocForm({ ...docForm, file_url: e.target.value })}
                                required
                                className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border-2 border-border rounded-xl focus:border-primary outline-none"
                            />
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowUploadDoc(false)}
                                    className="flex-1 px-4 py-3 bg-white/50 dark:bg-white/5 rounded-xl font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 px-4 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-xl font-semibold shadow-glow"
                                >
                                    {loading ? 'Uploading...' : 'Upload'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default Vehicles;

