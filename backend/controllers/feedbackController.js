import { promisePool } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';

// @desc    Add feedback for a ride
// @route   POST /api/feedback/add
// @access  Private
export const addFeedback = async (req, res) => {
    try {
        const { ride_id, rating, comments } = req.body;
        const user_id = req.user.id;

        // Check if ride exists and is completed
        const [rides] = await promisePool.query(
            'SELECT * FROM rides WHERE ride_id = ?',
            [ride_id]
        );

        if (rides.length === 0) {
            return errorResponse(res, 404, 'Ride not found');
        }

        // Check if user has booked this ride
        const [bookings] = await promisePool.query(
            'SELECT * FROM bookings WHERE ride_id = ? AND passenger_id = ? AND booking_status IN ("confirmed", "completed")',
            [ride_id, user_id]
        );

        if (bookings.length === 0) {
            return errorResponse(res, 403, 'You must have a confirmed booking for this ride to leave feedback');
        }

        // Check if feedback already exists
        const [existingFeedback] = await promisePool.query(
            'SELECT * FROM feedback WHERE ride_id = ? AND user_id = ?',
            [ride_id, user_id]
        );

        if (existingFeedback.length > 0) {
            return errorResponse(res, 400, 'You have already provided feedback for this ride');
        }

        // Insert feedback
        const [result] = await promisePool.query(
            'INSERT INTO feedback (ride_id, user_id, rating, comments) VALUES (?, ?, ?, ?)',
            [ride_id, user_id, rating, comments]
        );

        // Get created feedback
        const [newFeedback] = await promisePool.query(
            'SELECT * FROM feedback WHERE feedback_id = ?',
            [result.insertId]
        );

        // Update driver rating
        const driver_id = rides[0].driver_id;
        const [avgRating] = await promisePool.query(
            `SELECT AVG(f.rating) as avg_rating
             FROM feedback f
             JOIN rides r ON f.ride_id = r.ride_id
             WHERE r.driver_id = ?`,
            [driver_id]
        );

        // Note: users table doesn't have rating column in schema
        // Driver rating can be calculated dynamically from feedback

        return successResponse(res, 201, 'Feedback added successfully', newFeedback[0]);

    } catch (error) {
        console.error('Add feedback error:', error);
        return errorResponse(res, 500, 'Server error while adding feedback');
    }
};

// @desc    Get feedback for a ride
// @route   GET /api/feedback/:rideId
// @access  Public
export const getFeedbackByRide = async (req, res) => {
    try {
        const { rideId } = req.params;

        const [feedback] = await promisePool.query(
            `SELECT f.*, u.name as passenger_name
             FROM feedback f
             JOIN users u ON f.user_id = u.user_id
             WHERE f.ride_id = ?
             ORDER BY f.created_at DESC`,
            [rideId]
        );

        // Calculate average rating
        let averageRating = 0;
        if (feedback.length > 0) {
            const sum = feedback.reduce((acc, curr) => acc + curr.rating, 0);
            averageRating = (sum / feedback.length).toFixed(2);
        }

        return successResponse(res, 200, 'Feedback retrieved successfully', {
            feedback,
            averageRating,
            totalFeedback: feedback.length
        });

    } catch (error) {
        console.error('Get feedback error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Get feedback by user
// @route   GET /api/feedback/user/:userId
// @access  Public
export const getFeedbackByUser = async (req, res) => {
    try {
        const { userId } = req.params;

        const [feedback] = await promisePool.query(
            `SELECT f.*, r.source, r.destination, r.date
             FROM feedback f
             JOIN rides r ON f.ride_id = r.ride_id
             WHERE f.user_id = ?
             ORDER BY f.created_at DESC`,
            [userId]
        );

        return successResponse(res, 200, 'User feedback retrieved successfully', feedback);

    } catch (error) {
        console.error('Get user feedback error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Get feedback for driver's rides
// @route   GET /api/feedback/driver/my
// @access  Private (Driver only)
export const getMyDriverFeedback = async (req, res) => {
    try {
        const driver_id = req.user.id;

        const [feedback] = await promisePool.query(
            `SELECT f.*, u.name as passenger_name, r.source, r.destination, r.date
             FROM feedback f
             JOIN rides r ON f.ride_id = r.ride_id
             JOIN users u ON f.user_id = u.user_id
             WHERE r.driver_id = ?
             ORDER BY f.created_at DESC`,
            [driver_id]
        );

        // Calculate average rating
        let averageRating = 0;
        if (feedback.length > 0) {
            const sum = feedback.reduce((acc, curr) => acc + curr.rating, 0);
            averageRating = (sum / feedback.length).toFixed(2);
        }

        return successResponse(res, 200, 'Driver feedback retrieved successfully', {
            feedback,
            averageRating,
            totalFeedback: feedback.length
        });

    } catch (error) {
        console.error('Get driver feedback error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

