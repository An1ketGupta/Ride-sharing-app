import express from 'express';
import {
    confirmSafety,
    reportUnsafe,
    getPendingSafetyChecks,
    checkPendingSafetyChecks,
    handleTwiML,
    handleCallResponse,
    handleCallStatus
} from '../controllers/safetyController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Passenger routes
router.post('/confirm/:bookingId', protect, confirmSafety);
router.post('/report-unsafe/:bookingId', protect, reportUnsafe);
router.get('/pending', protect, getPendingSafetyChecks);

// Admin/System route for checking pending safety checks
router.post('/check-pending', protect, checkPendingSafetyChecks);

// Twilio webhook endpoints (public - no auth required)
router.post('/twiml', handleTwiML);
router.get('/twiml', handleTwiML); // Also support GET for testing
router.post('/call-response', handleCallResponse);
router.get('/call-response', handleCallResponse); // Also support GET for testing
router.post('/call-status', handleCallStatus);

export default router;



