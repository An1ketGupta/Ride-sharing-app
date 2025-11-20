import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { listMyNotifications, markRead, markAllRead, ackSafety } from '../controllers/notificationsController.js';

const router = Router();

router.get('/notifications', protect, listMyNotifications);
router.put('/notifications/:id/read', protect, markRead);
router.put('/notifications/mark-all-read', protect, markAllRead);
router.post('/notifications/:id/ack-safety', protect, ackSafety);

export default router;
