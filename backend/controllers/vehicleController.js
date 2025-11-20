import { promisePool } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';

// Get vehicles for a driver (defaults to current user)
export const getVehicles = async (req, res) => {
    try {
        const driver_id = Number(req.query.driver_id ?? req.user?.id);
        if (!Number.isFinite(driver_id)) {
            return errorResponse(res, 400, 'driver_id is required');
        }
        const [rows] = await promisePool.query(`SELECT * FROM vehicles WHERE user_id = ? ORDER BY created_at DESC`, [driver_id]);
        return successResponse(res, 200, 'OK', rows);
    } catch (error) {
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
            const [r] = await promisePool.query(
                `INSERT INTO vehicles (user_id, model, license_plate, capacity, color, vehicle_image_url)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [driver_id, String(model), String(license_plate), capacityNum, color || null, vehicle_image_url || null]
            );
            return successResponse(res, 201, 'Vehicle created', { vehicle_id: r.insertId });
        } catch (e) {
            if (String(e?.message || '').toLowerCase().includes('duplicate')) {
                return errorResponse(res, 400, 'License plate already exists');
            }
            throw e;
        }
    } catch (error) {
        return errorResponse(res, 500, 'Failed to create vehicle');
    }
};

// Vehicle image (URL-only for simplicity)
export const updateVehicleImage = async (req, res) => {
    try {
        const { id } = req.params; // vehicle_id
        const { vehicle_image_url } = req.body || {};
        await promisePool.query(`UPDATE vehicles SET vehicle_image_url = ? WHERE vehicle_id = ?`, [vehicle_image_url, id]);
        return successResponse(res, 200, 'Updated');
    } catch (error) {
        return errorResponse(res, 500, 'Failed to UPDATE vehicles image');
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
        const [vehicles] = await promisePool.query(
            `SELECT vehicle_id, user_id FROM vehicles WHERE vehicle_id = ?`,
            [vehicle_id]
        );

        if (vehicles.length === 0) {
            return errorResponse(res, 404, 'Vehicle not found');
        }

        const vehicle_user_id = Number(vehicles[0].user_id);
        if (vehicle_user_id !== driver_id) {
            console.error(`Authorization failed: vehicle user_id=${vehicle_user_id}, driver_id=${driver_id}`);
            return errorResponse(res, 403, 'Not authorized to delete this vehicle');
        }

        // Check if vehicle is used in any active rides
        const [activeRides] = await promisePool.query(
            `SELECT COUNT(*) as count FROM rides WHERE vehicle_id = ? AND status IN ('scheduled', 'ongoing')`,
            [vehicle_id]
        );

        if (activeRides[0]?.count > 0) {
            return errorResponse(res, 400, 'Cannot delete vehicle with active rides');
        }

        // Delete the vehicle
        await promisePool.query(`DELETE FROM vehicles WHERE vehicle_id = ?`, [vehicle_id]);
        
        return successResponse(res, 200, 'Vehicle deleted successfully');
    } catch (error) {
        console.error('Delete vehicle error:', error);
        return errorResponse(res, 500, 'Failed to delete vehicle');
    }
};


