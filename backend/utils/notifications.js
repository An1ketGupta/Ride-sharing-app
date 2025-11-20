import { promisePool } from '../config/db.js';
import { getIO, getSocketIdForUser } from './socketRegistry.js';

// Inserts a notification in DB and emits it in realtime to the user if online
export const sendNotification = async (user_id, message) => {
    let result;
    let tableName = 'notifications'; // default
    
    try {
        [result] = await promisePool.execute(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [user_id, message]
        );
        tableName = 'notifications';
    } catch (e) {
        // Try capital N if lowercase doesn't work
        if (e?.code === 'ER_NO_SUCH_TABLE' || String(e?.message || '').toLowerCase().includes('table')) {
            try {
                [result] = await promisePool.execute(
                    'INSERT INTO Notifications (user_id, message) VALUES (?, ?)',
                    [user_id, message]
                );
                tableName = 'Notifications';
            } catch (e2) {
                // If table missing, create and retry once
                if (e2?.code === 'ER_NO_SUCH_TABLE' || String(e2?.message || '').includes('Table') && String(e2?.message || '').includes('notifications')) {
                    try {
                        // Try to determine users table name first
                        let usersTableName = 'users';
                        try {
                            await promisePool.query('SELECT 1 FROM users LIMIT 1');
                        } catch {
                            usersTableName = 'User';
                        }
                        
                        await promisePool.query(`CREATE TABLE IF NOT EXISTS notifications (
                            notification_id INT PRIMARY KEY AUTO_INCREMENT,
                            user_id INT NULL,
                            message TEXT NOT NULL,
                            is_read TINYINT(1) NOT NULL DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES ${usersTableName}(user_id) ON DELETE SET NULL,
                            INDEX idx_user_id (user_id),
                            INDEX idx_is_read (is_read),
                            INDEX idx_created_at (created_at)
                        )`);
                        [result] = await promisePool.execute(
                            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                            [user_id, message]
                        );
                        tableName = 'notifications';
                    } catch (e3) {
                        console.error('❌ Failed to create notifications table:', e3);
                        throw e3;
                    }
                } else {
                    throw e2;
                }
            }
        } else {
            throw e;
        }
    }
    
    if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
        console.log(`📬 Notification inserted into ${tableName} table for user_id: ${user_id || 'NULL (broadcast)'}`);
    }

    const notification = {
        notification_id: result.insertId,
        user_id,
        message,
        is_read: 0,
        created_at: new Date().toISOString()
    };

    const io = getIO();
    const socketId = getSocketIdForUser(Number(user_id));
    if (io && socketId) {
        io.to(socketId).emit('notification', notification);
    }

    return notification;
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
                console.log('[SMS Mock - module missing or failed] to', toPhone, ':', message);
                return true;
            }
        }
        console.log(`[SMS Mock] to ${toPhone}: ${message}`);
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
                console.log(`✅ Email sent successfully to ${toEmail}`);
                return true;
            } catch (e) {
                console.error('[Email send failed] to', toEmail, ':', e.message);
                return false;
            }
        }
        console.log(`[Email Mock] to ${toEmail}: ${subject} -> ${text}`);
        return true;
    } catch (e) {
        console.error('Email send failed:', e.message);
        return false;
    }
};