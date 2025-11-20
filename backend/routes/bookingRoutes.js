import express from 'express';
import {
    createBooking,
    getMyBookings,
    getBookingById,
    confirmBooking,
    cancelBooking,
    applyWaitTimeCharge,
    getDriverLocation,
    getBookingMessages
} from '../controllers/bookingController.js';
import { createBookingValidation, validate } from '../middleware/validator.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/create', protect, createBookingValidation, validate, createBooking);
router.get('/my', protect, getMyBookings);
router.get('/:id', protect, getBookingById);
router.get('/:id/messages', protect, getBookingMessages);
router.get('/:id/driver-location', protect, getDriverLocation);
router.put('/:id/confirm', protect, confirmBooking);
router.put('/:id/cancel', protect, cancelBooking);
// mirror POST variant for spec compatibility
router.post('/:id/cancel', protect, cancelBooking);
router.put('/:id/wait-time', protect, applyWaitTimeCharge);

export default router;

