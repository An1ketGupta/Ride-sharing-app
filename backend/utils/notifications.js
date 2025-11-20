import { prisma } from '../config/db.js';
import { getIO, getSocketIdForUser } from './socketRegistry.js';

// Inserts a notification in DB and emits it in realtime to the user if online
export const sendNotification = async (user_id, message) => {
    try {
        const notification = await prisma.notification.create({
            data: {
                userId: user_id ? parseInt(user_id) : null,
                message: message
            }
        });

        const formattedNotification = {
            notification_id: notification.notificationId,
            user_id: notification.userId,
            message: notification.message,
            is_read: notification.isRead ? 1 : 0,
            created_at: notification.createdAt
        };

        const io = getIO();
        const socketId = getSocketIdForUser(Number(user_id));
        if (io && socketId) {
            io.to(socketId).emit('notification', formattedNotification);
        }

        return formattedNotification;
    } catch (error) {
        console.error('❌ Failed to create notification:', error);
        throw error;
    }
};

// Optional: SMS via Twilio if configured; otherwise no-op
export const sendSMS = async (toPhone, message) => {
    if (!toPhone) return false;
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
    try {
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER) {
            try {
                const twilioMod = await import('twilio');
                const client = twilioMod.default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
                await client.messages.create({ body: message, from: TWILIO_FROM_NUMBER, to: toPhone });
                return true;
            } catch (e) {
                return true;
            }
        }
        return true;
    } catch (e) {
        console.error('SMS send failed:', e.message);
        return false;
    }
};

export const sendEmail = async (toEmail, subject, text, html = null) => {
    if (!toEmail) return false;
    try {
        const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
        if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
            try {
                const nodemailerMod = await import('nodemailer');
                const transporter = nodemailerMod.default.createTransport({
                    host: SMTP_HOST,
                    port: Number(SMTP_PORT),
                    secure: Number(SMTP_PORT) === 465,
                    auth: { user: SMTP_USER, pass: SMTP_PASS }
                });
                const mailOptions = {
                    from: SMTP_FROM || SMTP_USER,
                    to: toEmail,
                    subject,
                    text
                };
                if (html) {
                    mailOptions.html = html;
                }
                await transporter.sendMail(mailOptions);
                return true;
            } catch (e) {
                console.error('[Email send failed] to', toEmail, ':', e.message);
                return false;
            }
        }
        return true;
    } catch (e) {
        console.error('Email send failed:', e.message);
        return false;
    }
};
