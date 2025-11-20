import express from 'express';
import { register, login, getMe } from '../controllers/authController.js';
import { registerValidation, loginValidation, validate } from '../middleware/validator.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.get('/me', protect, getMe);

export default router;

