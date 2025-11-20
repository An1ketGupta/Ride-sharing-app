import { promisePool } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';

export const uploadDriverDocument = async (req, res) => {
    try {
        const { id } = req.params; // driver user_id
        const { doc_type, file_url } = req.body || {};
        await promisePool.query(
            `INSERT INTO driver_documents (driver_id, doc_type, file_url, status) VALUES (?, ?, ?, 'pending')`,
            [id, doc_type, file_url]
        );
        return successResponse(res, 201, 'Document uploaded');
    } catch (error) {
        return errorResponse(res, 500, 'Failed to upload document');
    }
};

export const getDriverDocuments = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await promisePool.query(`SELECT * FROM driver_documents WHERE driver_id = ? ORDER BY created_at DESC`, [id]);
        return successResponse(res, 200, 'Documents', rows);
    } catch (error) {
        return errorResponse(res, 500, 'Failed to fetch documents');
    }
};

export const updateDriverDocumentStatus = async (req, res) => {
    try {
        const { id, doc_id } = req.params;
        const { status } = req.body || {};
        
        // Validate required parameters
        if (!doc_id || doc_id === 'undefined') {
            return errorResponse(res, 400, 'Document ID is required');
        }
        
        if (!status) {
            return errorResponse(res, 400, 'Status is required');
        }
        
        if (!['pending', 'approved', 'rejected'].includes(status)) {
            return errorResponse(res, 400, 'Invalid status value');
        }
        
        await promisePool.query(`UPDATE driver_documents SET status = ? WHERE document_id = ? AND driver_id = ?`, [status, doc_id, id]);

        // If all approved, set driver is_available = 1
        const [docs] = await promisePool.query(`SELECT status FROM driver_documents WHERE driver_id = ?`, [id]);
        if (docs.length > 0 && docs.every(d => d.status === 'approved')) {
            await promisePool.query(`UPDATE users SET is_available = 1 WHERE user_id = ?`, [id]);
        }
        return successResponse(res, 200, 'Updated');
    } catch (error) {
        return errorResponse(res, 500, 'Failed to update document');
    }
};


export const listPendingDocuments = async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            `SELECT d.document_id, d.driver_id, d.doc_type, d.file_url, d.status, d.created_at,
                    u.name as driver_name, u.email as driver_email, u.phone as driver_phone
             FROM driver_documents d
             JOIN users u ON u.user_id = d.driver_id
             WHERE d.status = 'pending'
             ORDER BY d.created_at DESC`
        );
        return successResponse(res, 200, 'Pending documents', rows);
    } catch (error) {
        return errorResponse(res, 500, 'Failed to fetch pending documents');
    }
};


