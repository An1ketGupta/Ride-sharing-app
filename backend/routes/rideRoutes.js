import express from 'express';
import {
    createRide,
    searchRides,
    getRideById,
    getMyRides,
    updateRideStatus,
    updateRide,
    estimateFare,
    estimateETA,
    scheduleRide,
    getMySchedules,
    addWaypoint,
    listWaypoints
} from '../controllers/rideController.js';
import { createRideValidation, validate } from '../middleware/validator.js';
import { protect, authorize } from '../middleware/auth.js';
import { raiseSOS } from '../controllers/sosController.js';

const router = express.Router();

router.post('/create', protect, authorize('driver', 'both'), createRideValidation, validate, createRide);
router.get('/search', searchRides);
router.get('/estimate', estimateFare);
router.get('/eta', estimateETA);
router.post('/schedule', protect, authorize('driver','both'), scheduleRide);
router.get('/schedule/my', protect, authorize('driver','both'), getMySchedules);
router.post('/:ride_id/waypoints', protect, authorize('driver','both'), addWaypoint);
router.get('/:ride_id/waypoints', listWaypoints);
router.post('/:ride_id/sos', protect, raiseSOS);
router.get('/my-rides', protect, authorize('driver', 'both'), getMyRides);
router.get('/:id', getRideById);
router.put('/:id/status', protect, authorize('driver', 'both'), updateRideStatus);
router.put('/:id', protect, authorize('driver', 'both'), updateRide);

export default router;

