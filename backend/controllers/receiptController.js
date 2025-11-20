import { promisePool } from '../config/db.js';
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
        const [rows] = await promisePool.query(
            `SELECT b.*, 
                    r.source, r.destination, r.date, r.time, r.driver_id,
                    u.name as driver_name, u.phone as driver_phone,
                    p.payment_method, p.payment_status, p.transaction_id, p.payment_id
             FROM bookings b
             JOIN rides r ON b.ride_id = r.ride_id
             JOIN users u ON r.driver_id = u.user_id
             LEFT JOIN payments p ON b.booking_id = p.booking_id
             WHERE b.booking_id = ?`,
            [bookingId]
        );
        
        if (!rows.length) return errorResponse(res, 404, 'Booking not found');
        const booking = rows[0];
        
        // Verify ownership
        if (Number(booking.passenger_id) !== Number(user_id) && Number(booking.driver_id) !== Number(user_id)) {
            return errorResponse(res, 403, 'Unauthorized');
        }

        // Format receipt data
        const receipt = {
            booking_id: booking.booking_id,
            booking_date: booking.booking_date,
            amount: booking.amount,
            seats_booked: booking.seats_booked,
            booking_status: booking.booking_status,
            ride: {
                source: booking.source,
                destination: booking.destination,
                date: booking.date,
                time: booking.time,
                driver_name: booking.driver_name,
                driver_phone: booking.driver_phone
            },
            payment: {
                payment_method: booking.payment_method || null,
                payment_status: booking.payment_status || null,
                transaction_id: booking.transaction_id || null
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
        const [rows] = await promisePool.query(
            `SELECT b.*, r.driver_id, u.email FROM bookings b 
             JOIN rides r ON r.ride_id = b.ride_id 
             JOIN users u ON u.user_id = b.passenger_id 
             WHERE b.booking_id = ?`,
            [bookingId]
        );
        if (!rows.length) return errorResponse(res, 404, 'Booking not found');
        const booking = rows[0];
        if (Number(booking.passenger_id) !== Number(user_id) && Number(booking.driver_id) !== Number(user_id)) {
            return errorResponse(res, 403, 'Unauthorized');
        }

        await emailReceipt(Number(bookingId), booking.email);
        return successResponse(res, 200, 'Receipt emailed successfully');
    } catch (error) {
        console.error('Email receipt error:', error);
        return errorResponse(res, 500, 'Failed to email receipt');
    }
};


