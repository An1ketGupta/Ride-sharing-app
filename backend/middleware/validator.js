import { body, validationResult } from 'express-validator';

// Validation middleware
export const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }
    next();
};

// Register validation rules
export const registerValidation = [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('phone').matches(/^[0-9]{10}$/).withMessage('Please provide a valid 10-digit phone number'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('user_type').isIn(['driver', 'passenger', 'both', 'admin']).withMessage('Invalid user type'),
    // If registering as driver or both, optionally validate document links
    body('documents')
        .optional()
        .custom((value, { req }) => {
            if (!Array.isArray(value)) {
                throw new Error('Documents must be an array');
            }

            for (const d of value) {
                const docType = d && typeof d.doc_type === 'string' && d.doc_type.trim();
                const fileUrl = d && typeof d.file_url === 'string' && d.file_url.trim();
                if (!docType || !fileUrl) {
                    throw new Error('Each document must include doc_type and file_url');
                }
            }
            return true;
        })
];

// Login validation rules
export const loginValidation = [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required')
];

// Create ride validation rules
export const createRideValidation = [
    body('source').trim().notEmpty().withMessage('Source is required'),
    body('destination').trim().notEmpty().withMessage('Destination is required'),
    body('date').isDate().withMessage('Valid date is required'),
    // Accept HH:MM or HH:MM:SS
    body('time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Valid time is required (HH:MM or HH:MM:SS)'),
    body('total_seats').isInt({ min: 1 }).withMessage('Total seats must be at least 1'),
    // fare_per_km removed - fare is fixed at 10rs per seat
    body('distance_km').isFloat({ min: 0 }).withMessage('Distance must be a positive number')
];

// Create booking validation rules
export const createBookingValidation = [
    body('ride_id').isInt().withMessage('Valid ride ID is required'),
    body('seats_booked').isInt({ min: 1 }).withMessage('At least 1 seat must be booked')
];

// Payment validation rules
export const paymentValidation = [
    body('booking_id').isInt().withMessage('Valid booking ID is required'),
    body('payment_method').isIn(['cash', 'card', 'upi', 'wallet']).withMessage('Invalid payment method')
];

// Feedback validation rules
export const feedbackValidation = [
    body('ride_id').isInt().withMessage('Valid ride ID is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comments').optional().trim()
];

