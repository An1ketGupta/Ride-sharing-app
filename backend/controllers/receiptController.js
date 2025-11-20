import { prisma } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';
import { generateReceiptText, emailReceipt } from '../utils/receipts.js';

// @desc    Get receipt for a booking
// @route   GET /api/receipts/:bookingId
// @access  Private
export const getReceipt = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const user_id = req.user.id;

        // Get complete booking details with ride and payment info
        const booking = await prisma.booking.findUnique({
            where: { bookingId: parseInt(bookingId) },
            include: {
                ride: {
                    include: {
                        driver: {
                            select: {
                                name: true,
                                phone: true
                            }
                        }
                    }
                },
                payments: {
                    take: 1,
                    orderBy: { paymentDate: 'desc' },
                    select: {
                        paymentMethod: true,
                        paymentStatus: true,
                        transactionId: true,
                        paymentId: true
                    }
                }
            }
        });
        
        if (!booking) return errorResponse(res, 404, 'Booking not found');
        
        // Verify ownership
        if (Number(booking.passengerId) !== Number(user_id) && Number(booking.ride.driverId) !== Number(user_id)) {
            return errorResponse(res, 403, 'Unauthorized');
        }

        const payment = booking.payments[0] || null;

        // Format receipt data
        const receipt = {
            booking_id: booking.bookingId,
            booking_date: booking.bookingDate,
            amount: booking.amount,
            seats_booked: booking.seatsBooked,
            booking_status: booking.bookingStatus,
            ride: {
                source: booking.ride.source,
                destination: booking.ride.destination,
                date: booking.ride.date,
                time: booking.ride.time,
                driver_name: booking.ride.driver.name,
                driver_phone: booking.ride.driver.phone
            },
            payment: {
                payment_method: payment?.paymentMethod || null,
                payment_status: payment?.paymentStatus || null,
                transaction_id: payment?.transactionId || null
            }
        };

        return successResponse(res, 200, 'Receipt generated', receipt);
    } catch (error) {
        console.error('Get receipt error:', error);
        return errorResponse(res, 500, 'Failed to generate receipt');
    }
};

// @desc    Email receipt
// @route   POST /api/receipts/:bookingId/email
// @access  Private
export const emailReceiptEndpoint = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const user_id = req.user.id;

        // Verify booking ownership
        const booking = await prisma.booking.findUnique({
            where: { bookingId: parseInt(bookingId) },
            include: {
                ride: {
                    select: {
                        driverId: true
                    }
                },
                passenger: {
                    select: {
                        email: true
                    }
                }
            }
        });
        
        if (!booking) return errorResponse(res, 404, 'Booking not found');
        if (Number(booking.passengerId) !== Number(user_id) && Number(booking.ride.driverId) !== Number(user_id)) {
            return errorResponse(res, 403, 'Unauthorized');
        }

        await emailReceipt(Number(bookingId), booking.passenger.email);
        return successResponse(res, 200, 'Receipt emailed successfully');
    } catch (error) {
        console.error('Email receipt error:', error);
        return errorResponse(res, 500, 'Failed to email receipt');
    }
};
