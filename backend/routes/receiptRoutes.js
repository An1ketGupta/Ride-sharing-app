import express from 'express';
import { getReceipt, emailReceiptEndpoint } from '../controllers/receiptController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/:bookingId', protect, getReceipt);
router.post('/:bookingId/email', protect, emailReceiptEndpoint);

export default router;


