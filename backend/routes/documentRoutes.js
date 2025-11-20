import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { uploadDriverDocument, getDriverDocuments, updateDriverDocumentStatus, listPendingDocuments } from '../controllers/documentController.js';

const router = express.Router();

router.get('/documents/pending', protect, authorize('admin'), listPendingDocuments);
router.post('/:id/documents', protect, authorize('driver', 'both'), uploadDriverDocument);
router.get('/:id/documents', protect, authorize('driver', 'both', 'admin'), getDriverDocuments);
router.patch('/:id/documents/:doc_id', protect, authorize('admin'), updateDriverDocumentStatus);

export default router;


