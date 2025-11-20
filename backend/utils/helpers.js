import jwt from 'jsonwebtoken';

// Generate JWT token
export const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.user_id,
            email: user.email,
            user_type: user.user_type
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRE || '7d'
        }
    );
};

// Format user response (remove sensitive data)
export const formatUserResponse = (user) => {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
};

// Calculate ride amount - Fixed 10rs per seat per km
export const calculateRideAmount = (farePerKm, distanceKm, seatsBooked) => {
    // farePerKm is 10 (10rs per seat per km), but we use direct calculation
    return (10 * distanceKm * seatsBooked).toFixed(2);
};

// Error response helper
export const errorResponse = (res, statusCode, message) => {
    return res.status(statusCode).json({
        success: false,
        message
    });
};

// Success response helper
export const successResponse = (res, statusCode, message, data = null) => {
    const response = {
        success: true,
        message
    };
    if (data) {
        response.data = data;
    }
    return res.status(statusCode).json(response);
};