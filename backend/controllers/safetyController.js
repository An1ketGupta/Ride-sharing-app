import { prisma } from '../config/db.js';
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
        const safetyCheck = await prisma.nightRideSafetyCheck.findFirst({
            where: {
                bookingId: parseInt(bookingId),
                booking: {
                    passengerId: passenger_id
                }
            },
            include: {
                booking: {
                    select: {
                        passengerId: true
                    }
                }
            }
        });

        if (!safetyCheck) {
            return errorResponse(res, 404, 'Safety check not found or unauthorized');
        }

        if (safetyCheck.isConfirmed) {
            return successResponse(res, 200, 'Safety already confirmed', {
                safety_check_id: safetyCheck.safetyCheckId,
                booking_id: safetyCheck.bookingId,
                passenger_id: safetyCheck.passengerId,
                is_confirmed: safetyCheck.isConfirmed,
                confirmation_time: safetyCheck.confirmationTime
            });
        }

        // Update safety check
        const updated = await prisma.nightRideSafetyCheck.update({
            where: { safetyCheckId: safetyCheck.safetyCheckId },
            data: {
                isConfirmed: true,
                confirmationTime: new Date()
            }
        });

        // Send confirmation notification
        await sendNotification(
            passenger_id,
            'Thank you for confirming your safety. We\'re glad you arrived safely!'
        );

        return successResponse(res, 200, 'Safety confirmed successfully', {
            safety_check_id: updated.safetyCheckId,
            is_confirmed: updated.isConfirmed,
            confirmation_time: updated.confirmationTime
        });

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
        const safetyCheck = await prisma.nightRideSafetyCheck.findFirst({
            where: {
                bookingId: parseInt(bookingId),
                booking: {
                    passengerId: passenger_id
                }
            },
            include: {
                booking: {
                    include: {
                        passenger: {
                            select: {
                                name: true,
                                email: true,
                                phone: true,
                                emergencyContactName: true,
                                emergencyContactPhone: true,
                                emergencyContactEmail: true
                            }
                        },
                        ride: {
                            include: {
                                driver: {
                                    select: {
                                        name: true,
                                        phone: true,
                                        email: true
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
                }
            }
        });

        if (!safetyCheck) {
            return errorResponse(res, 404, 'Safety check not found or unauthorized');
        }

        // Update safety check to mark as unsafe
        await prisma.nightRideSafetyCheck.update({
            where: { safetyCheckId: safetyCheck.safetyCheckId },
            data: {
                isConfirmed: false,
                adminNotified: true
            }
        });

        // Get all admin users
        const admins = await prisma.user.findMany({
            where: { userType: 'admin' },
            select: {
                userId: true,
                name: true,
                email: true
            }
        });

        // Prepare email content
        const passenger = safetyCheck.booking.passenger;
        const ride = safetyCheck.booking.ride;
        const driver = ride.driver;
        
        const emailSubject = `🚨 URGENT: Passenger Safety Alert - ${passenger.name}`;
        const emailText = `
URGENT SAFETY ALERT

A passenger has reported that they are NOT SAFE after completing a ride.

Passenger Details:
- Name: ${passenger.name}
- Email: ${passenger.email}
- Phone: ${passenger.phone}
- Passenger ID: ${passenger_id}

Ride Details:
- Route: ${ride.source} → ${ride.destination}
- Date: ${ride.date}
- Time: ${ride.time}
- Booking ID: ${bookingId}

Driver Details:
- Name: ${driver.name}
- Phone: ${driver.phone}
- Email: ${driver.email}

Emergency Contact:
${passenger.emergencyContactName ? `- Name: ${passenger.emergencyContactName}` : ''}
${passenger.emergencyContactPhone ? `- Phone: ${passenger.emergencyContactPhone}` : ''}
${passenger.emergencyContactEmail ? `- Email: ${passenger.emergencyContactEmail}` : ''}

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
            <p><span class="label">Name:</span><span class="value">${passenger.name}</span></p>
            <p><span class="label">Email:</span><span class="value">${passenger.email}</span></p>
            <p><span class="label">Phone:</span><span class="value">${passenger.phone}</span></p>
            <p><span class="label">Passenger ID:</span><span class="value">${passenger_id}</span></p>
        </div>
        
        <div class="section">
            <h2>Ride Details</h2>
            <p><span class="label">Route:</span><span class="value">${ride.source} → ${ride.destination}</span></p>
            <p><span class="label">Date:</span><span class="value">${ride.date}</span></p>
            <p><span class="label">Time:</span><span class="value">${ride.time}</span></p>
            <p><span class="label">Booking ID:</span><span class="value">${bookingId}</span></p>
        </div>
        
        <div class="section">
            <h2>Driver Details</h2>
            <p><span class="label">Name:</span><span class="value">${driver.name}</span></p>
            <p><span class="label">Phone:</span><span class="value">${driver.phone}</span></p>
            <p><span class="label">Email:</span><span class="value">${driver.email}</span></p>
        </div>
        
        ${passenger.emergencyContactName || passenger.emergencyContactPhone ? `
        <div class="section">
            <h2>Emergency Contact</h2>
            ${passenger.emergencyContactName ? `<p><span class="label">Name:</span><span class="value">${passenger.emergencyContactName}</span></p>` : ''}
            ${passenger.emergencyContactPhone ? `<p><span class="label">Phone:</span><span class="value">${passenger.emergencyContactPhone}</span></p>` : ''}
            ${passenger.emergencyContactEmail ? `<p><span class="label">Email:</span><span class="value">${passenger.emergencyContactEmail}</span></p>` : ''}
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
                            admin_id: admin.userId,
                            admin_name: admin.name,
                            email: admin.email,
                            sent: emailSent
                        });
                    } catch (emailError) {
                        console.error(`Failed to send email to admin ${admin.userId}:`, emailError);
                        emailResults.push({
                            admin_id: admin.userId,
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
        const alertMessage = `🚨 URGENT: Passenger ${passenger.name} (ID: ${passenger_id}) has reported they are NOT SAFE. Phone: ${passenger.phone}. Ride: ${ride.source} → ${ride.destination}.`;
        
        if (admins && admins.length > 0) {
            for (const admin of admins) {
                await sendNotification(admin.userId, alertMessage);
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

        const safetyChecks = await prisma.nightRideSafetyCheck.findMany({
            where: {
                passengerId: passenger_id,
                isConfirmed: false
            },
            include: {
                ride: {
                    select: {
                        source: true,
                        destination: true,
                        date: true,
                        time: true
                    }
                }
            },
            orderBy: { rideCompletedAt: 'desc' }
        });

        return successResponse(res, 200, 'Pending safety checks', safetyChecks.map(sc => ({
            safety_check_id: sc.safetyCheckId,
            booking_id: sc.bookingId,
            ride_id: sc.rideId,
            passenger_id: sc.passengerId,
            is_confirmed: sc.isConfirmed,
            confirmation_time: sc.confirmationTime,
            ride_completed_at: sc.rideCompletedAt,
            created_at: sc.createdAt,
            source: sc.ride.source,
            destination: sc.ride.destination,
            date: sc.ride.date,
            time: sc.ride.time
        })));

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

        const pendingChecks = await prisma.nightRideSafetyCheck.findMany({
            where: {
                isConfirmed: false,
                passengerCalled: false,
                rideCompletedAt: { lt: oneHourAgo }
            },
            include: {
                passenger: {
                    select: {
                        phone: true,
                        name: true,
                        emergencyContactPhone: true,
                        emergencyContactName: true
                    }
                },
                ride: {
                    select: {
                        source: true,
                        destination: true
                    }
                }
            },
            orderBy: { rideCompletedAt: 'asc' }
        });

        const results = {
            checked: pendingChecks.length,
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
        const safetyCheck = await prisma.nightRideSafetyCheck.findFirst({
            where: {
                isConfirmed: false,
                OR: [
                    { passenger: { phone: toPhone } },
                    { passenger: { emergencyContactPhone: toPhone } }
                ]
            },
            include: {
                passenger: {
                    select: {
                        name: true,
                        phone: true
                    }
                },
                ride: {
                    select: {
                        source: true,
                        destination: true
                    }
                }
            },
            orderBy: { rideCompletedAt: 'desc' }
        });
        
        let message = 'This is a safety check call from Ride Sharing. Please confirm your safety.';
        
        if (safetyCheck) {
            message = `Hello ${safetyCheck.passenger.name || 'there'}, this is a safety check call from Ride Sharing. Your ride from ${safetyCheck.ride.source || 'your pickup location'} to ${safetyCheck.ride.destination || 'your destination'} has been completed. Please confirm that you have arrived safely.`;
        }
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">${message}</Say>
    <Gather numDigits="1" action="/api/safety/call-response" method="POST" timeout="10">
        <Say voice="alice">Press 1 to confirm you are safe, or press 0 if you need assistance.</Say>
    </Gather>
    <Say voice="alice">We did not receive your response. Please contact us if you need assistance.</Say>
    <Hangup/>
</Response>`;
        
        res.type('text/xml');
        res.send(twiml);
    } catch (error) {
        console.error('TwiML handler error:', error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Thank you for your response.</Say>
    <Hangup/>
</Response>`;
        res.type('text/xml');
        res.send(twiml);
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
        const safetyCheck = await prisma.nightRideSafetyCheck.findFirst({
            where: {
                isConfirmed: false,
                OR: [
                    { passenger: { phone: toPhone } },
                    { passenger: { emergencyContactPhone: toPhone } }
                ]
            },
            include: {
                passenger: {
                    select: {
                        name: true,
                        phone: true
                    }
                },
                ride: {
                    select: {
                        source: true,
                        destination: true
                    }
                }
            },
            orderBy: { rideCompletedAt: 'desc' }
        });
        
        if (digits === '1' && safetyCheck) {
            // Passenger confirmed safety
            await prisma.nightRideSafetyCheck.update({
                where: { safetyCheckId: safetyCheck.safetyCheckId },
                data: {
                    isConfirmed: true,
                    confirmationTime: new Date(),
                    passengerCallAnswered: true
                }
            });
            
            // Send confirmation notification
            await sendNotification(
                safetyCheck.passengerId,
                'Thank you for confirming your safety via phone call. We\'re glad you arrived safely!'
            );
            
            console.log(`✅ Safety confirmed via phone call for passenger ${safetyCheck.passengerId}`);
        } else if (digits === '0' && safetyCheck) {
            // Passenger needs assistance
            // Notify admins immediately
            const admins = await prisma.user.findMany({
                where: { userType: 'admin' },
                select: { userId: true }
            });
            
            const alertMessage = `🚨 URGENT: Passenger ${safetyCheck.passenger.name} (ID: ${safetyCheck.passengerId}) pressed 0 during safety check call, indicating they need assistance. Phone: ${safetyCheck.passenger.phone}. Ride: ${safetyCheck.ride.source} → ${safetyCheck.ride.destination}.`;
            
            if (admins && admins.length > 0) {
                for (const admin of admins) {
                    await sendNotification(admin.userId, alertMessage);
                }
            }
            
            console.log(`🚨 Passenger ${safetyCheck.passengerId} requested assistance via phone call`);
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
        
        // If call was answered but safety not confirmed, mark as answered
        if (callStatus === 'completed' && answeredBy && toPhone) {
            const safetyCheck = await prisma.nightRideSafetyCheck.findFirst({
                where: {
                    isConfirmed: false,
                    passengerCallAnswered: null,
                    OR: [
                        { passenger: { phone: toPhone } },
                        { passenger: { emergencyContactPhone: toPhone } }
                    ]
                },
                orderBy: { rideCompletedAt: 'desc' }
            });
            
            if (safetyCheck) {
                await prisma.nightRideSafetyCheck.update({
                    where: { safetyCheckId: safetyCheck.safetyCheckId },
                    data: { passengerCallAnswered: true }
                });
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
