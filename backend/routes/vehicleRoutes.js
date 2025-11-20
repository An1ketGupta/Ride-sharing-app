import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { getVehicles, createVehicle, updateVehicleImage, deleteVehicle } from '../controllers/vehicleController.js';

const router = express.Router();

router.get('/', protect, authorize('driver', 'both'), getVehicles);
router.post('/', protect, authorize('driver', 'both'), createVehicle);
router.post('/:id/image', protect, authorize('driver', 'both'), updateVehicleImage);
router.delete('/:id', protect, authorize('driver', 'both'), deleteVehicle);

export default router;


