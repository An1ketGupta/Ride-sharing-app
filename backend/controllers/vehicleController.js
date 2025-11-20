import { prisma } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';

// Get vehicles for a driver (defaults to current user)
export const getVehicles = async (req, res) => {
    try {
        const driver_id = Number(req.query.driver_id ?? req.user?.id);
        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 400, 'driver_id is required');
        }
        const vehicles = await prisma.vehicle.findMany({
            where: { userId: driver_id },
            orderBy: { createdAt: 'desc' }
        });
        
        return successResponse(res, 200, 'OK', vehicles.map(v => ({
            vehicle_id: v.vehicleId,
            user_id: v.userId,
            model: v.model,
            license_plate: v.licensePlate,
            capacity: v.capacity,
            color: v.color,
            vehicle_image_url: v.vehicleImageUrl,
            created_at: v.createdAt
        })));
    } catch (error) {
        console.error('Get vehicles error:', error);
        return errorResponse(res, 500, 'Failed to fetch vehicles');
    }
};

// Create vehicle for current driver
export const createVehicle = async (req, res) => {
    try {
        const driver_id = Number(req.user?.id);
        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }
        const { model, license_plate, capacity, color, vehicle_image_url } = req.body || {};
        if (!model || !license_plate || !capacity) {
            return errorResponse(res, 400, 'model, license_plate and capacity are required');
        }
        const capacityNum = Number(capacity);
        if (!Number.isFinite(capacityNum) || capacityNum <= 0) {
            return errorResponse(res, 400, 'capacity must be a positive number');
        }
        // Enforce unique license_plate per schema
        try {
            const vehicle = await prisma.vehicle.create({
                data: {
                    userId: driver_id,
                    model: String(model),
                    licensePlate: String(license_plate),
                    capacity: capacityNum,
                    color: color || null,
                    vehicleImageUrl: vehicle_image_url || null
                }
            });
            return successResponse(res, 201, 'Vehicle created', { vehicle_id: vehicle.vehicleId });
        } catch (e) {
            if (e.code === 'P2002' || String(e?.message || '').toLowerCase().includes('duplicate') || String(e?.message || '').toLowerCase().includes('unique')) {
                return errorResponse(res, 400, 'License plate already exists');
            }
            throw e;
        }
    } catch (error) {
        console.error('Create vehicle error:', error);
        return errorResponse(res, 500, 'Failed to create vehicle');
    }
};

// Vehicle image (URL-only for simplicity)
export const updateVehicleImage = async (req, res) => {
    try {
        const { id } = req.params; // vehicle_id
        const { vehicle_image_url } = req.body || {};
        await prisma.vehicle.update({
            where: { vehicleId: parseInt(id) },
            data: { vehicleImageUrl: vehicle_image_url || null }
        });
        return successResponse(res, 200, 'Updated');
    } catch (error) {
        console.error('Update vehicle image error:', error);
        return errorResponse(res, 500, 'Failed to update vehicle image');
    }
};

// Delete vehicle
export const deleteVehicle = async (req, res) => {
    try {
        const { id } = req.params; // vehicle_id
        const vehicle_id = Number(id);
        const driver_id = Number(req.user?.id);
        
        if (!Number.isFinite(vehicle_id)) {
            return errorResponse(res, 400, 'Invalid vehicle ID');
        }

        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 401, 'Authentication required');
        }

        // Check if vehicle exists and belongs to the current user
        const vehicle = await prisma.vehicle.findUnique({
            where: { vehicleId: vehicle_id },
            select: {
                vehicleId: true,
                userId: true
            }
        });

        if (!vehicle) {
            return errorResponse(res, 404, 'Vehicle not found');
        }

        if (Number(vehicle.userId) !== driver_id) {
            console.error(`Authorization failed: vehicle user_id=${vehicle.userId}, driver_id=${driver_id}`);
            return errorResponse(res, 403, 'Not authorized to delete this vehicle');
        }

        // Check if vehicle is used in any active rides
        const activeRidesCount = await prisma.ride.count({
            where: {
                vehicleId: vehicle_id,
                status: { in: ['scheduled', 'ongoing'] }
            }
        });

        if (activeRidesCount > 0) {
            return errorResponse(res, 400, 'Cannot delete vehicle with active rides');
        }

        // Delete the vehicle
        await prisma.vehicle.delete({
            where: { vehicleId: vehicle_id }
        });
        
        return successResponse(res, 200, 'Vehicle deleted successfully');
    } catch (error) {
        console.error('Delete vehicle error:', error);
        return errorResponse(res, 500, 'Failed to delete vehicle');
    }
};
