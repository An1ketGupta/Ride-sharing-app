import { promisePool } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';
import { sendNotification, sendEmail } from '../utils/notifications.js';

// @desc    Confirm safety after night ride
// @route   POST /api/safety/confirm/:bookingId
// @access  Private (Passenger only)
export const confirmSafety = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const passenger_id = Number(req.user?.id);

        if (!Number.isFinite(passenger_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        if (!Number.isFinite(Number(bookingId))) {
            return errorResponse(res, 400, 'Invalid booking ID');
        }

        // Check if safety check exists and belongs to passenger
        const [safetyChecks] = await promisePool.query(
            `SELECT sc.*, b.passenger_id 
             FROM night_ride_safety_checks sc
             JOIN bookings b ON sc.booking_id = b.booking_id
             WHERE sc.booking_id = ? AND b.passenger_id = ?`,
            [bookingId, passenger_id]
        );

        if (safetyChecks.length === 0) {
            return errorResponse(res, 404, 'Safety check not found or unauthorized');
        }

        const safetyCheck = safetyChecks[0];

        if (safetyCheck.is_confirmed) {
            return successResponse(res, 200, 'Safety already confirmed', safetyCheck);
        }

        // Update safety check
        await promisePool.query(
            `UPDATE night_ride_safety_checks 
             SET is_confirmed = 1, confirmation_time = NOW() 
             WHERE safety_check_id = ?`,
            [safetyCheck.safety_check_id]
        );

        // Send confirmation notification
        await sendNotification(
            passenger_id,
            'Thank you for confirming your safety. We\'re glad you arrived safely!'
        );

        return successResponse(res, 200, 'Safety confirmed successfully');

    } catch (error) {
        console.error('Confirm safety error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Report unsafe situation after night ride
// @route   POST /api/safety/report-unsafe/:bookingId
// @access  Private (Passenger only)
export const reportUnsafe = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { message } = req.body; // Optional message from passenger
        const passenger_id = Number(req.user?.id);

        if (!Number.isFinite(passenger_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        if (!Number.isFinite(Number(bookingId))) {
            return errorResponse(res, 400, 'Invalid booking ID');
        }

        // Get safety check and related information
        const [safetyChecks] = await promisePool.query(
            `SELECT sc.*, b.passenger_id, 
                    u.name as passenger_name, u.email as passenger_email, u.phone as passenger_phone,
                    u.emergency_contact_name, u.emergency_contact_phone, u.emergency_contact_email,
                    r.source, r.destination, r.date, r.time,
                    ud.name as driver_name, ud.phone as driver_phone, ud.email as driver_email
             FROM night_ride_safety_checks sc
             JOIN bookings b ON sc.booking_id = b.booking_id
             JOIN users u ON b.passenger_id = u.user_id
             JOIN rides r ON sc.ride_id = r.ride_id
             JOIN users ud ON r.driver_id = ud.user_id
             WHERE sc.booking_id = ? AND b.passenger_id = ?`,
            [bookingId, passenger_id]
        );

        if (safetyChecks.length === 0) {
            return errorResponse(res, 404, 'Safety check not found or unauthorized');
        }

        const safetyCheck = safetyChecks[0];

        // Update safety check to mark as unsafe (we'll use a flag or update status)
        // For now, we'll add a note field or use the existing structure
        await promisePool.query(
            `UPDATE night_ride_safety_checks 
             SET is_confirmed = 0, 
                 admin_notified = 1
             WHERE safety_check_id = ?`,
            [safetyCheck.safety_check_id]
        );

        // Get all admin users
        const [admins] = await promisePool.query(
            `SELECT user_id, name, email FROM users WHERE user_type = 'admin'`
        );

        // Prepare email content
        const emailSubject = `🚨 URGENT: Passenger Safety Alert - ${safetyCheck.passenger_name}`;
        const emailText = `
URGENT SAFETY ALERT

A passenger has reported that they are NOT SAFE after completing a ride.

Passenger Details:
- Name: ${safetyCheck.passenger_name}
- Email: ${safetyCheck.passenger_email}
- Phone: ${safetyCheck.passenger_phone}
- Passenger ID: ${passenger_id}

Ride Details:
- Route: ${safetyCheck.source} → ${safetyCheck.destination}
- Date: ${safetyCheck.date}
- Time: ${safetyCheck.time}
- Booking ID: ${bookingId}

Driver Details:
- Name: ${safetyCheck.driver_name}
- Phone: ${safetyCheck.driver_phone}
- Email: ${safetyCheck.driver_email}

Emergency Contact:
${safetyCheck.emergency_contact_name ? `- Name: ${safetyCheck.emergency_contact_name}` : ''}
${safetyCheck.emergency_contact_phone ? `- Phone: ${safetyCheck.emergency_contact_phone}` : ''}
${safetyCheck.emergency_contact_email ? `- Email: ${safetyCheck.emergency_contact_email}` : ''}

${message ? `Additional Message from Passenger:\n${message}\n` : ''}

Time Reported: ${new Date().toLocaleString()}

ACTION REQUIRED: Please contact the passenger immediately and take appropriate safety measures.
        `;

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .alert { background-color: #ff4444; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #333; }
        .label { font-weight: bold; color: #555; }
        .value { margin-left: 10px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; }
    </style>
</head>
<body>
    <div class="container">
        <div class="alert">
            <h1>🚨 URGENT: Passenger Safety Alert</h1>
        </div>
        
        <p>A passenger has reported that they are <strong>NOT SAFE</strong> after completing a ride.</p>
        
        <div class="section">
            <h2>Passenger Details</h2>
            <p><span class="label">Name:</span><span class="value">${safetyCheck.passenger_name}</span></p>
            <p><span class="label">Email:</span><span class="value">${safetyCheck.passenger_email}</span></p>
            <p><span class="label">Phone:</span><span class="value">${safetyCheck.passenger_phone}</span></p>
            <p><span class="label">Passenger ID:</span><span class="value">${passenger_id}</span></p>
        </div>
        
        <div class="section">
            <h2>Ride Details</h2>
            <p><span class="label">Route:</span><span class="value">${safetyCheck.source} → ${safetyCheck.destination}</span></p>
            <p><span class="label">Date:</span><span class="value">${safetyCheck.date}</span></p>
            <p><span class="label">Time:</span><span class="value">${safetyCheck.time}</span></p>
            <p><span class="label">Booking ID:</span><span class="value">${bookingId}</span></p>
        </div>
        
        <div class="section">
            <h2>Driver Details</h2>
            <p><span class="label">Name:</span><span class="value">${safetyCheck.driver_name}</span></p>
            <p><span class="label">Phone:</span><span class="value">${safetyCheck.driver_phone}</span></p>
            <p><span class="label">Email:</span><span class="value">${safetyCheck.driver_email}</span></p>
        </div>
        
        ${safetyCheck.emergency_contact_name || safetyCheck.emergency_contact_phone ? `
        <div class="section">
            <h2>Emergency Contact</h2>
            ${safetyCheck.emergency_contact_name ? `<p><span class="label">Name:</span><span class="value">${safetyCheck.emergency_contact_name}</span></p>` : ''}
            ${safetyCheck.emergency_contact_phone ? `<p><span class="label">Phone:</span><span class="value">${safetyCheck.emergency_contact_phone}</span></p>` : ''}
            ${safetyCheck.emergency_contact_email ? `<p><span class="label">Email:</span><span class="value">${safetyCheck.emergency_contact_email}</span></p>` : ''}
        </div>
        ` : ''}
        
        ${message ? `
        <div class="section">
            <h2>Additional Message from Passenger</h2>
            <p>${message.replace(/\n/g, '<br>')}</p>
        </div>
        ` : ''}
        
        <div class="section">
            <p><span class="label">Time Reported:</span><span class="value">${new Date().toLocaleString()}</span></p>
        </div>
        
        <div class="alert">
            <strong>ACTION REQUIRED:</strong> Please contact the passenger immediately and take appropriate safety measures.
        </div>
        
        <div class="footer">
            <p>This is an automated safety alert from Ride Sharing System.</p>
            <p>Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
        `;

        // Send email to all admins
        const emailResults = [];
        if (admins && admins.length > 0) {
            for (const admin of admins) {
                if (admin.email) {
                    try {
                        const emailSent = await sendEmail(
                            admin.email,
                            emailSubject,
                            emailText,
                            emailHtml
                        );
                        emailResults.push({
                            admin_id: admin.user_id,
                            admin_name: admin.name,
                            email: admin.email,
                            sent: emailSent
                        });
                    } catch (emailError) {
                        console.error(`Failed to send email to admin ${admin.user_id}:`, emailError);
                        emailResults.push({
                            admin_id: admin.user_id,
                            admin_name: admin.name,
                            email: admin.email,
                            sent: false,
                            error: emailError.message
                        });
                    }
                }
            }
        }

        // Send in-app notification to all admins
        const alertMessage = `🚨 URGENT: Passenger ${safetyCheck.passenger_name} (ID: ${passenger_id}) has reported they are NOT SAFE. Phone: ${safetyCheck.passenger_phone}. Ride: ${safetyCheck.source} → ${safetyCheck.destination}.`;
        
        if (admins && admins.length > 0) {
            for (const admin of admins) {
                await sendNotification(admin.user_id, alertMessage);
            }
        }

        // Send notification to passenger
        await sendNotification(
            passenger_id,
            'We have received your safety report. Our team has been notified and will contact you shortly. If this is an emergency, please call 911 immediately.'
        );

        console.log(`🚨 Passenger ${passenger_id} reported unsafe situation. Emails sent to ${emailResults.filter(r => r.sent).length} admins.`);

        return successResponse(res, 200, 'Safety alert reported successfully. Admins have been notified.', {
            emails_sent: emailResults.filter(r => r.sent).length,
            total_admins: admins.length,
            email_results: emailResults
        });

    } catch (error) {
        console.error('Report unsafe error:', error);
        return errorResponse(res, 500, 'Server error while reporting unsafe situation');
    }
};

// @desc    Get pending safety checks for a passenger
// @route   GET /api/safety/pending
// @access  Private (Passenger only)
export const getPendingSafetyChecks = async (req, res) => {
    try {
        const passenger_id = Number(req.user?.id);

        if (!Number.isFinite(passenger_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        const [safetyChecks] = await promisePool.query(
            `SELECT sc.*, r.source, r.destination, r.date, r.time
             FROM night_ride_safety_checks sc
             JOIN rides r ON sc.ride_id = r.ride_id
             WHERE sc.passenger_id = ? AND sc.is_confirmed = 0
             ORDER BY sc.ride_completed_at DESC`,
            [passenger_id]
        );

        return successResponse(res, 200, 'Pending safety checks', safetyChecks);

    } catch (error) {
        console.error('Get pending safety checks error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    Check and process unconfirmed night ride safety checks
// @route   POST /api/safety/check-pending (Admin/System)
// @access  Private (System/Admin)
export const checkPendingSafetyChecks = async (req, res) => {
    try {
        // Find all unconfirmed safety checks older than 1 hour
        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);

        const [pendingChecks] = await promisePool.query(
            `SELECT sc.*, u.phone, u.name, u.emergency_contact_phone, u.emergency_contact_name,
                    r.source, r.destination
             FROM night_ride_safety_checks sc
             JOIN users u ON sc.passenger_id = u.user_id
             JOIN rides r ON sc.ride_id = r.ride_id
             WHERE sc.is_confirmed = 0 
             AND sc.passenger_called = 0
             AND sc.ride_completed_at < ?
             ORDER BY sc.ride_completed_at ASC`,
            [oneHourAgo]
        );

        const results = {
            checked: 0,
            calls_made: 0,
            emergency_calls_made: 0,
            errors: []
        };

        return successResponse(res, 200, 'Safety checks processed', results);

    } catch (error) {
        console.error('Check pending safety checks error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

// @desc    TwiML webhook endpoint for safety check calls
// @route   POST /api/safety/twiml
// @access  Public (Twilio webhook)
export const handleTwiML = async (req, res) => {
    try {
        // Get phone number from Twilio request
        const toPhone = req.body.To || req.query.To;
        const fromPhone = req.body.From || req.query.From;
        
        console.log(`📞 TwiML request received for call to ${toPhone} from ${fromPhone}`);
        
        // Find the safety check for this phone number
        const [safetyChecks] = await promisePool.query(
            `SELECT sc.*, u.name, u.phone, r.source, r.destination
             FROM night_ride_safety_checks sc
             JOIN users u ON sc.passenger_id = u.user_id
             JOIN rides r ON sc.ride_id = r.ride_id
             WHERE (u.phone = ? OR u.emergency_contact_phone = ?)
             AND sc.is_confirmed = 0
             ORDER BY sc.ride_completed_at DESC
             LIMIT 1`,
            [toPhone, toPhone]
        );
        
        let message = 'This is a safety check call from Ride Sharing. Please confirm your safety.';
        
        if (safetyChecks.length > 0) {
            const check = safetyChecks[0];
            message = `Hello ${check.name || 'there'}, this is a safety check call from Ride Sharing. Your ride from ${check.source || 'your pickup location'} to ${check.destination || 'your destination'} has been completed. Please confirm that you have arrived safely.`;
        }
        
        
        res.type('text/xml');
        res.send(twiml);
    } catch (error) {
        console.error('TwiML handler error:', error);
    }
};

// @desc    Handle call response from passenger (DTMF input)
// @route   POST /api/safety/call-response
// @access  Public (Twilio webhook)
export const handleCallResponse = async (req, res) => {
    try {
        const digits = req.body.Digits || req.query.Digits;
        const callSid = req.body.CallSid || req.query.CallSid;
        const toPhone = req.body.To || req.query.To;
        
        console.log(`📞 Call response received: Digits=${digits}, CallSID=${callSid}, To=${toPhone}`);
        
        // Find the safety check for this phone number
        const [safetyChecks] = await promisePool.query(
            `SELECT sc.*, u.name, u.phone, r.source, r.destination
             FROM night_ride_safety_checks sc
             JOIN users u ON sc.passenger_id = u.user_id
             JOIN rides r ON sc.ride_id = r.ride_id
             WHERE (u.phone = ? OR u.emergency_contact_phone = ?)
             AND sc.is_confirmed = 0
             ORDER BY sc.ride_completed_at DESC
             LIMIT 1`,
            [toPhone, toPhone]
        );
        
        if (digits === '1' && safetyChecks.length > 0) {
            // Passenger confirmed safety
            const check = safetyChecks[0];
            
            await promisePool.query(
                `UPDATE night_ride_safety_checks 
                 SET is_confirmed = 1, confirmation_time = NOW(), passenger_call_answered = 1 
                 WHERE safety_check_id = ?`,
                [check.safety_check_id]
            );
            
            // Send confirmation notification
            await sendNotification(
                check.passenger_id,
                'Thank you for confirming your safety via phone call. We\'re glad you arrived safely!'
            );
            
            console.log(`✅ Safety confirmed via phone call for passenger ${check.passenger_id}`);
        } else if (digits === '0' && safetyChecks.length > 0) {
            // Passenger needs assistance
            const check = safetyChecks[0];
            
            // Notify admins immediately
            const [admins] = await promisePool.query(`SELECT user_id FROM users WHERE user_type = 'admin'`);
            const alertMessage = `🚨 URGENT: Passenger ${check.name} (ID: ${check.passenger_id}) pressed 0 during safety check call, indicating they need assistance. Phone: ${check.phone}. Ride: ${check.source} → ${check.destination}.`;
            
            if (admins && admins.length > 0) {
                for (const admin of admins) {
                    await sendNotification(admin.user_id, alertMessage);
                }
            }
            
            console.log(`🚨 Passenger ${check.passenger_id} requested assistance via phone call`);
        }
        
        // Return TwiML response
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Thank you for your response. ${digits === '1' ? 'We have recorded your safety confirmation.' : 'We have received your request for assistance and will contact you shortly.'}</Say>
    <Hangup/>
</Response>`;
        
        res.type('text/xml');
        res.send(twiml);
    } catch (error) {
        console.error('Call response handler error:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Thank you for your response.</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
    }
};

// @desc    Handle call status updates from Twilio
// @route   POST /api/safety/call-status
// @access  Public (Twilio webhook)
export const handleCallStatus = async (req, res) => {
    try {
        const callSid = req.body.CallSid;
        const callStatus = req.body.CallStatus;
        const toPhone = req.body.To;
        const fromPhone = req.body.From;
        const duration = req.body.CallDuration;
        const answeredBy = req.body.AnsweredBy;
        
        console.log(`📞 Call status update: CallSID=${callSid}, Status=${callStatus}, To=${toPhone}, Duration=${duration}s`);
        
        // Log call status for debugging
        // You could store this in a separate call_logs table if needed
        
        // If call was answered but safety not confirmed, mark as answered
        if (callStatus === 'completed' && answeredBy && toPhone) {
            const [safetyChecks] = await promisePool.query(
                `SELECT sc.* FROM night_ride_safety_checks sc
                 JOIN users u ON sc.passenger_id = u.user_id
                 WHERE (u.phone = ? OR u.emergency_contact_phone = ?)
                 AND sc.is_confirmed = 0
                 AND sc.passenger_call_answered IS NULL
                 ORDER BY sc.ride_completed_at DESC
                 LIMIT 1`,
                [toPhone, toPhone]
            );
            
            if (safetyChecks.length > 0) {
                await promisePool.query(
                    `UPDATE night_ride_safety_checks 
                     SET passenger_call_answered = 1 
                     WHERE safety_check_id = ?`,
                    [safetyChecks[0].safety_check_id]
                );
            }
        }
        
        // Return 200 to acknowledge receipt
        res.status(200).send('OK');
    } catch (error) {
        console.error('Call status handler error:', error);
        // Still return 200 to prevent Twilio from retrying
        res.status(200).send('OK');
    }
};
