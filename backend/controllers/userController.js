import { prisma } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';

// Saved Locations
export const addSavedLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, lat, lon } = req.body || {};
        
        await prisma.savedLocation.create({
            data: {
                userId: parseInt(id),
                name,
                lat: parseFloat(lat),
                lon: parseFloat(lon)
            }
        });
        
        return successResponse(res, 201, 'Location saved');
    } catch (error) {
        console.error('Add saved location error:', error);
        return errorResponse(res, 500, 'Failed to save location');
    }
};

export const getSavedLocations = async (req, res) => {
    try {
        const { id } = req.params;
        const locations = await prisma.savedLocation.findMany({
            where: { userId: parseInt(id) },
            orderBy: { createdAt: 'desc' }
        });
        
        return successResponse(res, 200, 'Locations', locations.map(loc => ({
            location_id: loc.locationId,
            user_id: loc.userId,
            name: loc.name,
            lat: loc.lat,
            lon: loc.lon,
            created_at: loc.createdAt
        })));
    } catch (error) {
        console.error('Get saved locations error:', error);
        return errorResponse(res, 500, 'Failed to fetch locations');
    }
};

export const deleteSavedLocation = async (req, res) => {
    try {
        const { id, location_id } = req.params;
        await prisma.savedLocation.deleteMany({
            where: {
                locationId: parseInt(location_id),
                userId: parseInt(id)
            }
        });
        return successResponse(res, 200, 'Deleted');
    } catch (error) {
        console.error('Delete saved location error:', error);
        return errorResponse(res, 500, 'Failed to delete');
    }
};

// Profile Picture (URL-only for simplicity)
export const updateProfilePic = async (req, res) => {
    try {
        const { id } = req.params;
        const { profile_pic_url } = req.body || {};
        
        await prisma.user.update({
            where: { userId: parseInt(id) },
            data: { profilePicUrl: profile_pic_url || null }
        });
        
        return successResponse(res, 200, 'Updated');
    } catch (error) {
        console.error('Update profile pic error:', error);
        return errorResponse(res, 500, 'Failed to update profile picture');
    }
};

// Emergency Contact
export const getEmergencyContact = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({
            where: { userId: parseInt(id) },
            select: {
                emergencyContactName: true,
                emergencyContactPhone: true,
                emergencyContactEmail: true
            }
        });
        
        const data = user || {
            emergency_contact_name: null,
            emergency_contact_phone: null,
            emergency_contact_email: null
        };
        
        return successResponse(res, 200, 'Emergency contact', {
            emergency_contact_name: data.emergencyContactName,
            emergency_contact_phone: data.emergencyContactPhone,
            emergency_contact_email: data.emergencyContactEmail
        });
    } catch (error) {
        console.error('Get emergency contact error:', error);
        return errorResponse(res, 500, 'Failed to fetch emergency contact');
    }
};

export const updateEmergencyContact = async (req, res) => {
    try {
        const { id } = req.params;
        const { emergency_contact_name, emergency_contact_phone, emergency_contact_email } = req.body || {};
        
        await prisma.user.update({
            where: { userId: parseInt(id) },
            data: {
                emergencyContactName: emergency_contact_name || null,
                emergencyContactPhone: emergency_contact_phone || null,
                emergencyContactEmail: emergency_contact_email || null
            }
        });
        
        return successResponse(res, 200, 'Emergency contact updated');
    } catch (error) {
        console.error('Update emergency contact error:', error);
        return errorResponse(res, 500, 'Failed to update emergency contact');
    }
};

// Update driver availability status
export const updateDriverAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_available } = req.body || {};
        const userId = parseInt(id);
        const available = Boolean(is_available);

        if (!Number.isFinite(userId)) {
            return errorResponse(res, 400, 'Invalid user ID');
        }

        // Check if user is a driver
        const user = await prisma.user.findUnique({
            where: { userId },
            select: { userType: true }
        });

        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        if (user.userType !== 'driver' && user.userType !== 'both') {
            return errorResponse(res, 403, 'Only drivers can update availability');
        }

        await prisma.user.update({
            where: { userId },
            data: { isAvailable: available }
        });

        return successResponse(res, 200, `Driver ${available ? 'online' : 'offline'}`, { is_available: available });
    } catch (error) {
        console.error('Update driver availability error:', error);
        return errorResponse(res, 500, 'Failed to update availability');
    }
};
