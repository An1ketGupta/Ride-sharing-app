import { Router } from 'express';
import { prisma } from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /admin/vehicles/pending - List vehicles pending verification
router.get('/vehicles/pending', protect, requireAdmin, async (req, res) => {
    try {
        const vehicles = await prisma.vehicle.findMany({
            where: {
                OR: [
                    { verificationStatus: 'pending' },
                    { verificationStatus: null }
                ]
            },
            include: {
                user: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        
        res.status(200).json({ 
            success: true, 
            data: vehicles.map(v => ({
                vehicle_id: v.vehicleId,
                user_id: v.userId,
                model: v.model,
                license_plate: v.licensePlate,
                capacity: v.capacity,
                color: v.color,
                vehicle_image_url: v.vehicleImageUrl,
                verification_status: v.verificationStatus,
                created_at: v.createdAt,
                driver_name: v.user.name
            }))
        });
    } catch (e) {
        console.error('Get pending vehicles error:', e);
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
        const vehicle = await prisma.vehicle.update({
            where: { vehicleId: parseInt(vehicle_id) },
            data: { verificationStatus: verification_status }
        });

        return res.status(200).json({ success: true, message: `Vehicle ${vehicle_id} ${verification_status}` });
    } catch (e) {
        if (e.code === 'P2025') {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        console.error('Update vehicle verification error:', e);
        return res.status(500).json({ success: false, message: 'Database error', error: e.message });
    }
});

// GET /admin/documents/pending - List driver documents pending verification
router.get('/documents/pending', protect, requireAdmin, async (req, res) => {
    try {
        const documents = await prisma.driverDocument.findMany({
            where: { status: 'pending' },
            include: {
                driver: {
                    select: {
                        name: true,
                        email: true,
                        phone: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        
        res.status(200).json({ 
            success: true, 
            data: documents.map(d => ({
                document_id: d.documentId,
                driver_id: d.driverId,
                doc_type: d.docType,
                file_url: d.fileUrl,
                status: d.status,
                created_at: d.createdAt,
                driver_name: d.driver.name,
                driver_email: d.driver.email,
                driver_phone: d.driver.phone
            })),
            total: documents.length
        });
    } catch (e) {
        console.error('Get pending documents error:', e);
        res.status(500).json({ success: false, message: 'Failed to fetch pending documents', error: e.message });
    }
});

// GET /admin/documents/driver/:driver_id - Get all documents for a specific driver
router.get('/documents/driver/:driver_id', protect, requireAdmin, async (req, res) => {
    try {
        const { driver_id } = req.params;
        const documents = await prisma.driverDocument.findMany({
            where: { driverId: parseInt(driver_id) },
            include: {
                driver: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        
        res.status(200).json({ 
            success: true, 
            data: documents.map(d => ({
                document_id: d.documentId,
                driver_id: d.driverId,
                doc_type: d.docType,
                file_url: d.fileUrl,
                status: d.status,
                created_at: d.createdAt,
                driver_name: d.driver.name,
                driver_email: d.driver.email
            }))
        });
    } catch (e) {
        console.error('Get driver documents error:', e);
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
        const document = await prisma.driverDocument.update({
            where: { documentId: parseInt(document_id) },
            data: {
                status: status,
                rejectionReason: rejection_reason || null,
                updatedAt: new Date()
            }
        });

        return res.status(200).json({ success: true, message: `Document ${document_id} ${status}` });
    } catch (e) {
        if (e.code === 'P2025') {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        console.error('Update document status error:', e);
        return res.status(500).json({ success: false, message: 'Database error', error: e.message });
    }
});

// GET /admin/drivers - Get all drivers with document verification status
router.get('/drivers', protect, requireAdmin, async (req, res) => {
    try {
        const drivers = await prisma.user.findMany({
            where: {
                userType: { in: ['driver', 'both'] }
            },
            include: {
                driverDocuments: {
                    select: {
                        status: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        
        const formattedDrivers = drivers.map(driver => {
            const docs = driver.driverDocuments;
            const totalDocuments = docs.length;
            const pendingDocuments = docs.filter(d => d.status === 'pending').length;
            const approvedDocuments = docs.filter(d => d.status === 'approved').length;
            const rejectedDocuments = docs.filter(d => d.status === 'rejected').length;
            
            return {
                user_id: driver.userId,
                name: driver.name,
                email: driver.email,
                phone: driver.phone,
                created_at: driver.createdAt,
                total_documents: totalDocuments,
                pending_documents: pendingDocuments,
                approved_documents: approvedDocuments,
                rejected_documents: rejectedDocuments
            };
        });
        
        // Sort by pending documents DESC, then by created_at DESC
        formattedDrivers.sort((a, b) => {
            if (b.pending_documents !== a.pending_documents) {
                return b.pending_documents - a.pending_documents;
            }
            return new Date(b.created_at) - new Date(a.created_at);
        });
        
        res.status(200).json({ success: true, data: formattedDrivers });
    } catch (e) {
        console.error('Get drivers error:', e);
        res.status(500).json({ success: false, message: 'Failed to fetch drivers', error: e.message });
    }
});

// Admin notifications API
router.get('/notifications', protect, requireAdmin, async (req, res) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: {
                OR: [
                    { userId: parseInt(req.user.id) },
                    { userId: null },
                    { message: { contains: 'SOS', mode: 'insensitive' } },
                    { message: { contains: '🚨' } },
                    { message: { contains: 'EMERGENCY', mode: 'insensitive' } }
                ]
            },
            select: {
                notificationId: true,
                userId: true,
                message: true,
                isRead: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        
        res.status(200).json({ 
            success: true, 
            data: notifications.map(n => ({
                notification_id: n.notificationId,
                user_id: n.userId,
                message: n.message,
                is_read: n.isRead ? 1 : 0,
                created_at: n.createdAt
            }))
        });
    } catch (e) {
        console.error('Admin notifications error:', e);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications', error: e.message });
    }
});

router.patch('/notifications/:id/read', protect, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        try {
            await prisma.notification.update({
                where: { notificationId: parseInt(id) },
                data: { isRead: true }
            });
        } catch (error) {
            if (error.code === 'P2025') {
                return res.status(404).json({ success: false, message: 'Notification not found' });
            }
            throw error;
        }
        res.status(200).json({ success: true });
    } catch (e) {
        console.error('Update notification error:', e);
        res.status(500).json({ success: false, message: 'Failed to update notification' });
    }
});

export default router;
