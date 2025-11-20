import bcrypt from 'bcryptjs';
import { prisma } from '../config/db.js';
import { generateToken, formatUserResponse, errorResponse, successResponse } from '../utils/helpers.js';

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
    try {
        const { name, email, phone, password, user_type, documents } = req.body;
        
        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { phone }
                ]
            }
        });

        if (existingUser) {
            return errorResponse(res, 400, 'User with this email or phone already exists');
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user with documents if driver/both
        const driverLike = user_type === 'driver' || user_type === 'both';
        const documentsData = driverLike && Array.isArray(documents) 
            ? documents
                .filter(d => d && d.doc_type && d.file_url)
                .map(d => ({
                    docType: d.doc_type,
                    fileUrl: d.file_url,
                    status: 'pending'
                }))
            : [];

        // Insert user
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                phone,
                password: hashedPassword,
                userType: user_type || 'passenger',
                ...(documentsData.length > 0 && {
                    driverDocuments: {
                        create: documentsData
                    }
                })
            },
            select: {
                userId: true,
                name: true,
                email: true,
                phone: true,
                userType: true
            }
        });

        // Generate token
        const token = generateToken({
            user_id: newUser.userId,
            email: newUser.email,
            user_type: newUser.userType
        });

        return successResponse(res, 201, 'User registered successfully', {
            user: {
                user_id: newUser.userId,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone,
                user_type: newUser.userType
            },
            token
        });

    } catch (error) {
        console.error('Register error:', error);
        return errorResponse(res, 500, 'Server error during registration');
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return errorResponse(res, 401, 'Invalid email or password');
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return errorResponse(res, 401, 'Invalid email or password');
        }

        // Generate token
        const token = generateToken({
            user_id: user.userId,
            email: user.email,
            user_type: user.userType
        });

        // Remove password from response
        const userResponse = formatUserResponse({
            user_id: user.userId,
            name: user.name,
            email: user.email,
            phone: user.phone,
            user_type: user.userType,
            rating: user.rating,
            profile_pic_url: user.profilePicUrl,
            is_available: user.isAvailable,
            latitude: user.latitude,
            longitude: user.longitude
        });

        return successResponse(res, 200, 'Login successful', {
            user: userResponse,
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        return errorResponse(res, 500, 'Server error during login');
    }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { userId: req.user.id },
            select: {
                userId: true,
                name: true,
                email: true,
                phone: true,
                userType: true
            }
        });

        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        return successResponse(res, 200, 'User retrieved successfully', {
            user_id: user.userId,
            name: user.name,
            email: user.email,
            phone: user.phone,
            user_type: user.userType
        });

    } catch (error) {
        console.error('Get me error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};
