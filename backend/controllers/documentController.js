import { prisma } from '../config/db.js';
import { errorResponse, successResponse } from '../utils/helpers.js';

export const uploadDriverDocument = async (req, res) => {
    try {
        const { id } = req.params; // driver user_id
        const { doc_type, file_url } = req.body || {};
        const document = await prisma.driverDocument.create({
            data: {
                driverId: parseInt(id),
                docType: doc_type,
                fileUrl: file_url,
                status: 'pending'
            }
        });
        return successResponse(res, 201, 'Document uploaded', {
            document_id: document.documentId,
            driver_id: document.driverId,
            doc_type: document.docType,
            file_url: document.fileUrl,
            status: document.status,
            created_at: document.createdAt
        });
    } catch (error) {
        console.error('Upload document error:', error);
        return errorResponse(res, 500, 'Failed to upload document');
    }
};

export const getDriverDocuments = async (req, res) => {
    try {
        const { id } = req.params;
        const documents = await prisma.driverDocument.findMany({
            where: { driverId: parseInt(id) },
            orderBy: { createdAt: 'desc' }
        });
        return successResponse(res, 200, 'Documents', documents.map(d => ({
            document_id: d.documentId,
            driver_id: d.driverId,
            doc_type: d.docType,
            file_url: d.fileUrl,
            status: d.status,
            created_at: d.createdAt
        })));
    } catch (error) {
        console.error('Get documents error:', error);
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
        
        await prisma.driverDocument.update({
            where: {
                documentId: parseInt(doc_id),
                driverId: parseInt(id)
            },
            data: { status: status }
        });

        // If all approved, set driver is_available = 1
        const docs = await prisma.driverDocument.findMany({
            where: { driverId: parseInt(id) }
        });
        
        if (docs.length > 0 && docs.every(d => d.status === 'approved')) {
            await prisma.user.update({
                where: { userId: parseInt(id) },
                data: { isAvailable: true }
            });
        }
        
        return successResponse(res, 200, 'Updated');
    } catch (error) {
        console.error('Update document error:', error);
        return errorResponse(res, 500, 'Failed to update document');
    }
};

export const listPendingDocuments = async (req, res) => {
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
        
        return successResponse(res, 200, 'Pending documents', documents.map(d => ({
            document_id: d.documentId,
            driver_id: d.driverId,
            doc_type: d.docType,
            file_url: d.fileUrl,
            status: d.status,
            created_at: d.createdAt,
            driver_name: d.driver.name,
            driver_email: d.driver.email,
            driver_phone: d.driver.phone
        })));
    } catch (error) {
        console.error('List pending documents error:', error);
        return errorResponse(res, 500, 'Failed to fetch pending documents');
    }
};
