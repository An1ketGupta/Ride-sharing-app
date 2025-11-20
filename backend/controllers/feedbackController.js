import { prisma } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';

// @desc    Add feedback for a ride
// @route   POST /api/feedback/add
// @access  Private
export const addFeedback = async (req, res) => {
    try {
        const { ride_id, rating, comments } = req.body;
        const user_id = req.user.id;

        // Check if ride exists
        const ride = await prisma.ride.findUnique({
            where: { rideId: parseInt(ride_id) }
        });

        if (!ride) {
            return errorResponse(res, 404, 'Ride not found');
        }

        // Check if user has booked this ride
        const booking = await prisma.booking.findFirst({
            where: {
                rideId: parseInt(ride_id),
                passengerId: parseInt(user_id),
                bookingStatus: { in: ['confirmed', 'completed'] }
            }
        });

        if (!booking) {
            return errorResponse(res, 403, 'You must have a confirmed booking for this ride to leave feedback');
        }

        // Check if feedback already exists
        const existingFeedback = await prisma.feedback.findFirst({
            where: {
                rideId: parseInt(ride_id),
                userId: parseInt(user_id)
            }
        });

        if (existingFeedback) {
            return errorResponse(res, 400, 'You have already provided feedback for this ride');
        }

        // Insert feedback
        const newFeedback = await prisma.feedback.create({
            data: {
                rideId: parseInt(ride_id),
                userId: parseInt(user_id),
                rating: parseInt(rating),
                comments: comments || null
            }
        });

        // Update driver rating (calculate average)
        const driverId = ride.driverId;
        const avgRatingResult = await prisma.feedback.aggregate({
            where: {
                ride: {
                    driverId: driverId
                }
            },
            _avg: {
                rating: true
            }
        });

        // Update driver's rating in users table
        if (avgRatingResult._avg.rating) {
            await prisma.user.update({
                where: { userId: driverId },
                data: { rating: avgRatingResult._avg.rating }
            });
        }

        return successResponse(res, 201, 'Feedback added successfully', {
            feedback_id: newFeedback.feedbackId,
            ride_id: newFeedback.rideId,
            user_id: newFeedback.userId,
            rating: newFeedback.rating,
            comments: newFeedback.comments,
            created_at: newFeedback.createdAt
        });

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

        const feedback = await prisma.feedback.findMany({
            where: { rideId: parseInt(rideId) },
            include: {
                user: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Calculate average rating
        let averageRating = 0;
        if (feedback.length > 0) {
            const sum = feedback.reduce((acc, curr) => acc + curr.rating, 0);
            averageRating = (sum / feedback.length).toFixed(2);
        }

        return successResponse(res, 200, 'Feedback retrieved successfully', {
            feedback: feedback.map(f => ({
                feedback_id: f.feedbackId,
                ride_id: f.rideId,
                user_id: f.userId,
                passenger_name: f.user.name,
                rating: f.rating,
                comments: f.comments,
                created_at: f.createdAt
            })),
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

        const feedback = await prisma.feedback.findMany({
            where: { userId: parseInt(userId) },
            include: {
                ride: {
                    select: {
                        source: true,
                        destination: true,
                        date: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return successResponse(res, 200, 'User feedback retrieved successfully', 
            feedback.map(f => ({
                feedback_id: f.feedbackId,
                ride_id: f.rideId,
                user_id: f.userId,
                rating: f.rating,
                comments: f.comments,
                created_at: f.createdAt,
                source: f.ride.source,
                destination: f.ride.destination,
                date: f.ride.date
            }))
        );

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

        const feedback = await prisma.feedback.findMany({
            where: {
                ride: {
                    driverId: parseInt(driver_id)
                }
            },
            include: {
                user: {
                    select: {
                        name: true
                    }
                },
                ride: {
                    select: {
                        source: true,
                        destination: true,
                        date: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Calculate average rating
        let averageRating = 0;
        if (feedback.length > 0) {
            const sum = feedback.reduce((acc, curr) => acc + curr.rating, 0);
            averageRating = (sum / feedback.length).toFixed(2);
        }

        return successResponse(res, 200, 'Driver feedback retrieved successfully', {
            feedback: feedback.map(f => ({
                feedback_id: f.feedbackId,
                ride_id: f.rideId,
                user_id: f.userId,
                passenger_name: f.user.name,
                rating: f.rating,
                comments: f.comments,
                created_at: f.createdAt,
                source: f.ride.source,
                destination: f.ride.destination,
                date: f.ride.date
            })),
            averageRating,
            totalFeedback: feedback.length
        });

    } catch (error) {
        console.error('Get driver feedback error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};
