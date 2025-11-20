import express from 'express';
import {
    addFeedback,
    getFeedbackByRide,
    getFeedbackByUser,
    getMyDriverFeedback
} from '../controllers/feedbackController.js';
import { feedbackValidation, validate } from '../middleware/validator.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/add', protect, feedbackValidation, validate, addFeedback);
router.get('/driver/my', protect, getMyDriverFeedback);
router.get('/:rideId', getFeedbackByRide);
router.get('/user/:userId', getFeedbackByUser);

export default router;

