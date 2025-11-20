import { prisma } from '../config/db.js';
import { sendEmail } from './notifications.js';

export const generateReceiptText = async (booking_id) => {
    const booking = await prisma.booking.findUnique({
        where: { bookingId: parseInt(booking_id) },
        include: {
            payments: {
                take: 1,
                orderBy: { paymentDate: 'desc' },
                select: {
                    paymentMethod: true,
                    transactionId: true
                }
            },
            ride: {
                include: {
                    driver: {
                        select: {
                            name: true
                        }
                    }
                },
                select: {
                    source: true,
                    destination: true,
                    date: true,
                    time: true
                }
            }
        }
    });
    
    if (!booking) return `Receipt not found for booking ${booking_id}`;
    
    const payment = booking.payments[0] || null;
    
    return [
        `Receipt for Booking #${booking.bookingId}`,
        `Route: ${booking.ride.source} -> ${booking.ride.destination}`,
        `Date: ${booking.ride.date} ${booking.ride.time}`,
        `Driver: ${booking.ride.driver.name}`,
        `Seats: ${booking.seatsBooked}`,
        `Amount: ₹${booking.amount}`,
        `Payment: ${payment?.paymentMethod || 'N/A'} ${payment?.transactionId || ''}`.trim(),
        `Extras: wait ${booking.waitMinutes ?? 0} min, extra ₹${booking.extraCharges ?? 0}`
    ].join('\n');
};

export const emailReceipt = async (booking_id, toEmail) => {
    const text = await generateReceiptText(booking_id);
    await sendEmail(toEmail, `Receipt for booking #${booking_id}`, text);
    return true;
};
