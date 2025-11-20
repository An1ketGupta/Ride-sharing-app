import { Router } from 'express';
import { promisePool } from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /admin/vehicles/pending - List vehicles pending verification
router.get('/vehicles/pending', protect, requireAdmin, async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            `SELECT v.*, u.name as driver_name
             FROM vehicles v
             JOIN users u ON v.user_id = u.user_id
             WHERE v.verification_status = 'pending' OR v.verification_status IS NULL
             ORDER BY v.created_at DESC`
        );
        res.status(200).json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to fetch pending vehicles', error: e.message });
    }
});

// PUT /admin/vehicles/:vehicle_id/approve
// Body: { verification_status: 'approved' | 'rejected' }
router.put('/vehicles/:vehicle_id/approve', protect, requireAdmin, async (req, res) => {
    const { vehicle_id } = req.params;
    const { verification_status } = req.body || {};

    if (!['approved', 'rejected'].includes(verification_status)) {
        return res.status(400).json({ success: false, message: 'verification_status must be approved or rejected' });
    }

    try {
        const [result] = await promisePool.execute(
            'UPDATE vehicles SET verification_status = ? WHERE vehicle_id = ?',
            [verification_status, vehicle_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }

        return res.status(200).json({ success: true, message: `Vehicle ${vehicle_id} ${verification_status}` });
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Database error', error: e.message });
    }
});

// GET /admin/documents/pending - List driver documents pending verification
router.get('/documents/pending', protect, requireAdmin, async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            `SELECT d.*, u.name as driver_name, u.email as driver_email, u.phone as driver_phone
             FROM driver_documents d
             JOIN users u ON d.driver_id = u.user_id
             WHERE d.status = 'pending'
             ORDER BY d.created_at DESC`
        );
        console.log(rows);
        res.status(200).json({ success: true, data: rows, total: rows.length });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to fetch pending documents', error: e.message });
    }
});

// GET /admin/documents/driver/:driver_id - Get all documents for a specific driver
router.get('/documents/driver/:driver_id', protect, requireAdmin, async (req, res) => {
    try {
        const { driver_id } = req.params;
        const [rows] = await promisePool.query(
            `SELECT d.*, u.name as driver_name, u.email as driver_email
             FROM driver_documents d
             JOIN users u ON d.driver_id = u.user_id
             WHERE d.driver_id = ?
             ORDER BY d.created_at DESC`,
            [driver_id]
        );
        res.status(200).json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to fetch driver documents', error: e.message });
    }
});

// PUT /admin/documents/:document_id/approve
// Body: { status: 'approved' | 'rejected', rejection_reason: 'optional' }
router.put('/documents/:document_id/approve', protect, requireAdmin, async (req, res) => {
    const { document_id } = req.params;
    const { status, rejection_reason } = req.body || {};

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'status must be approved or rejected' });
    }

    try {
        const [result] = await promisePool.execute(
            'UPDATE driver_documents SET status = ?, rejection_reason = ?, updated_at = NOW() WHERE document_id = ?',
            [status, rejection_reason || null, document_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        return res.status(200).json({ success: true, message: `Document ${document_id} ${status}` });
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Database error', error: e.message });
    }
});

// GET /admin/drivers - Get all drivers with document verification status
router.get('/drivers', protect, requireAdmin, async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            `SELECT 
                u.user_id,
                u.name,
                u.email,
                u.phone,
                u.created_at,
                COUNT(d.document_id) as total_documents,
                SUM(CASE WHEN d.status = 'pending' THEN 1 ELSE 0 END) as pending_documents,
                SUM(CASE WHEN d.status = 'approved' THEN 1 ELSE 0 END) as approved_documents,
                SUM(CASE WHEN d.status = 'rejected' THEN 1 ELSE 0 END) as rejected_documents
             FROM users u
             LEFT JOIN driver_documents d ON u.user_id = d.driver_id
             WHERE u.user_type IN ('driver', 'both')
             GROUP BY u.user_id
             ORDER BY pending_documents DESC, u.created_at DESC`
        );
        res.status(200).json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to fetch drivers', error: e.message });
    }
});

export default router;

// Admin notifications API
router.get('/notifications', protect, requireAdmin, async (req, res) => {
    try {
        // Try lowercase table name first
        let rows;
        try {
            [rows] = await promisePool.query(
                `SELECT notification_id, user_id, message, is_read, created_at
                 FROM notifications
                 WHERE user_id = ? OR user_id IS NULL OR message LIKE '%SOS%' OR message LIKE '%🚨%' OR message LIKE '%EMERGENCY%'
                 ORDER BY created_at DESC
                 LIMIT 100`,
                [req.user.user_id]
            );
        } catch (tableError) {
            // Try capital N if lowercase doesn't work
            if (tableError?.code === 'ER_NO_SUCH_TABLE' || String(tableError?.message || '').toLowerCase().includes('table')) {
                try {
                    [rows] = await promisePool.query(
                        `SELECT notification_id, user_id, message, is_read, created_at
                         FROM Notifications
                         WHERE user_id = ? OR user_id IS NULL OR message LIKE '%SOS%' OR message LIKE '%🚨%' OR message LIKE '%EMERGENCY%'
                         ORDER BY created_at DESC
                         LIMIT 100`,
                        [req.user.user_id]
                    );
                } catch (e2) {
                    console.error('Failed to query notifications from both table names:', e2);
                    throw e2;
                }
            } else {
                throw tableError;
            }
        }
        res.status(200).json({ success: true, data: rows });
    } catch (e) {
        console.error('Admin notifications error:', e);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications', error: e.message });
    }
});

router.patch('/notifications/:id/read', protect, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await promisePool.execute(
            `UPDATE notifications SET is_read = 1 WHERE notification_id = ?`,
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        res.status(200).json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to update notification' });
    }
});


