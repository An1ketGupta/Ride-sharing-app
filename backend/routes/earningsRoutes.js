import { Router } from 'express';
import { getEarningsSummary, getEarningsHistory } from '../controllers/earningsController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(protect);

// GET /api/earnings/summary - Get driver earnings summary
router.get('/summary', getEarningsSummary);

// GET /api/earnings/history - Get detailed earnings history
router.get('/history', getEarningsHistory);

export default router;


