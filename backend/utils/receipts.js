import { promisePool } from '../config/db.js';
import { sendEmail } from './notifications.js';

export const generateReceiptText = async (booking_id) => {
    const [rows] = await promisePool.query(
        `SELECT b.*, p.payment_method, p.transaction_id, r.source, r.destination, r.date, r.time, u.name as driver_name
         FROM bookings b
         LEFT JOIN payments p ON p.booking_id = b.booking_id
         JOIN rides r ON r.ride_id = b.ride_id
         JOIN users u ON u.user_id = r.driver_id
         WHERE b.booking_id = ?`,
        [booking_id]
    );
    const b = rows?.[0];
    if (!b) return `Receipt not found for booking ${booking_id}`;
    return [
        `Receipt for Booking #${b.booking_id}`,
        `Route: ${b.source} -> ${b.destination}`,
        `Date: ${b.date} ${b.time}`,
        `Driver: ${b.driver_name}`,
        `Seats: ${b.seats_booked}`,
        `Amount: ₹${b.amount}`,
        `Payment: ${b.payment_method || 'N/A'} ${b.transaction_id || ''}`.trim(),
        `Extras: wait ${b.wait_minutes ?? 0} min, extra ₹${b.extra_charges ?? 0}`
    ].join('\n');
};

export const emailReceipt = async (booking_id, toEmail) => {
    const text = await generateReceiptText(booking_id);
    await sendEmail(toEmail, `Receipt for booking #${booking_id}`, text);
    return true;
};




