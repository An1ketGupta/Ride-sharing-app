import { Router } from 'express';
import { requestRide } from '../controllers/requestController.js';

const router = Router();

// POST /api/request-ride
router.post('/request-ride', requestRide);

export default router;


