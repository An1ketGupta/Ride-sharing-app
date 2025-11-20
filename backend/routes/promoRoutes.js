import { Router } from 'express';
import { prisma } from '../config/db.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

// @desc    Get all active promo codes
// @route   GET /api/promo-codes
// @access  Public (users can see available promo codes)
router.get('/promo-codes', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const promoCodes = await prisma.promoCode.findMany({
            where: {
                OR: [
                    { expiryDate: null },
                    { expiryDate: { gte: today } }
                ]
            },
            select: {
                code: true,
                discountPercent: true,
                discountAmount: true,
                expiryDate: true,
                maxUses: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
        
        res.status(200).json({ 
            success: true, 
            data: promoCodes.map(p => ({
                code: p.code,
                discount_percent: p.discountPercent ? Number(p.discountPercent) : null,
                discount_amount: p.discountAmount ? Number(p.discountAmount) : null,
                expiry_date: p.expiryDate,
                max_uses: p.maxUses,
                created_at: p.createdAt
            }))
        });
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const promo = await prisma.promoCode.findFirst({
            where: {
                code: code,
                OR: [
                    { expiryDate: null },
                    { expiryDate: { gte: today } }
                ]
            }
        });

        if (!promo) {
            return res.status(404).json({ success: false, message: 'Invalid or expired promo code' });
        }

        // Check if user has already used this promo
        const usage = await prisma.userPromoCode.findFirst({
            where: {
                userId: parseInt(req.user.id),
                code: code,
                isUsed: true
            }
        });

        if (usage) {
            return res.status(400).json({ success: false, message: 'You have already used this promo code' });
        }

        res.status(200).json({ 
            success: true, 
            message: 'Promo code is valid',
            data: {
                code: promo.code,
                discount_percent: promo.discountPercent ? Number(promo.discountPercent) : null,
                discount_amount: promo.discountAmount ? Number(promo.discountAmount) : null
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

        await prisma.promoCode.create({
            data: {
                code: code,
                discountPercent: discount_percent ? parseFloat(discount_percent) : null,
                discountAmount: discount_amount ? parseFloat(discount_amount) : null,
                expiryDate: expiry_date ? new Date(expiry_date) : null,
                maxUses: max_uses ? parseInt(max_uses) : null
            }
        });

        res.status(201).json({ success: true, message: 'Promo code created successfully' });
    } catch (error) {
        if (error.code === 'P2002') {
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

        try {
            await prisma.promoCode.delete({
                where: { code: code }
            });
        } catch (error) {
            if (error.code === 'P2025') {
                return res.status(404).json({ success: false, message: 'Promo code not found' });
            }
            throw error;
        }

        res.status(200).json({ success: true, message: 'Promo code deleted successfully' });
    } catch (error) {
        console.error('Error deleting promo code:', error);
        res.status(500).json({ success: false, message: 'Failed to delete promo code' });
    }
});

export default router;
