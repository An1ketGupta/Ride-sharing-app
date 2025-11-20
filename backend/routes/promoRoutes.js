import { Router } from 'express';
import { promisePool } from '../config/db.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

// @desc    Get all active promo codes
// @route   GET /api/promo-codes
// @access  Public (users can see available promo codes)
router.get('/promo-codes', async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            `SELECT code, discount_percent, discount_amount, expiry_date, max_uses 
             FROM promo_codes 
             WHERE (expiry_date IS NULL OR expiry_date >= CURDATE())
             ORDER BY created_at DESC`
        );
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching promo codes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch promo codes' });
    }
});

// @desc    Validate a promo code
// @route   POST /api/promo-codes/validate
// @access  Private
router.post('/promo-codes/validate', protect, async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ success: false, message: 'Promo code is required' });
        }

        // Check if code exists and is valid
        const [rows] = await promisePool.query(
            `SELECT * FROM promo_codes 
             WHERE code = ? AND (expiry_date IS NULL OR expiry_date >= CURDATE())`,
            [code]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invalid or expired promo code' });
        }

        const promo = rows[0];

        // Check if user has already used this promo
        const [usageRows] = await promisePool.query(
            `SELECT * FROM user_promo_codes WHERE user_id = ? AND code = ? AND is_used = 1`,
            [req.user.id, code]
        );

        if (usageRows.length > 0) {
            return res.status(400).json({ success: false, message: 'You have already used this promo code' });
        }

        res.status(200).json({ 
            success: true, 
            message: 'Promo code is valid',
            data: {
                code: promo.code,
                discount_percent: promo.discount_percent,
                discount_amount: promo.discount_amount
            }
        });
    } catch (error) {
        console.error('Error validating promo code:', error);
        res.status(500).json({ success: false, message: 'Failed to validate promo code' });
    }
});

// @desc    Create a new promo code (Admin only)
// @route   POST /api/promo-codes
// @access  Private/Admin
router.post('/promo-codes', protect, authorize('admin'), async (req, res) => {
    try {
        const { code, discount_percent, discount_amount, expiry_date, max_uses } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: 'Promo code is required' });
        }

        if (!discount_percent && !discount_amount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Either discount_percent or discount_amount is required' 
            });
        }

        await promisePool.query(
            `INSERT INTO promo_codes (code, discount_percent, discount_amount, expiry_date, max_uses) 
             VALUES (?, ?, ?, ?, ?)`,
            [code, discount_percent || null, discount_amount || null, expiry_date || null, max_uses || null]
        );

        res.status(201).json({ success: true, message: 'Promo code created successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Promo code already exists' });
        }
        console.error('Error creating promo code:', error);
        res.status(500).json({ success: false, message: 'Failed to create promo code' });
    }
});

// @desc    Delete a promo code (Admin only)
// @route   DELETE /api/promo-codes/:code
// @access  Private/Admin
router.delete('/promo-codes/:code', protect, authorize('admin'), async (req, res) => {
    try {
        const { code } = req.params;

        const [result] = await promisePool.query(
            `DELETE FROM promo_codes WHERE code = ?`,
            [code]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Promo code not found' });
        }

        res.status(200).json({ success: true, message: 'Promo code deleted successfully' });
    } catch (error) {
        console.error('Error deleting promo code:', error);
        res.status(500).json({ success: false, message: 'Failed to delete promo code' });
    }
});

export default router;
