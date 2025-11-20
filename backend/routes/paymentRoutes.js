import express from 'express';
import {
    confirmPayment,
    getPaymentByBooking,
    getMyPayments,
    cashInit,
    completeCashPayment,
    createRazorpayOrder,
    verifyRazorpayPayment,
    walletTopup,
    verifyWalletTopup,
    walletRefund
} from '../controllers/paymentController.js';
import { paymentValidation, validate } from '../middleware/validator.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/confirm', protect, paymentValidation, validate, confirmPayment);
router.post('/cash-init', protect, cashInit);
router.put('/:paymentId/complete', protect, completeCashPayment);
router.get('/booking/:bookingId', protect, getPaymentByBooking);
router.get('/my', protect, getMyPayments);

// Razorpay
router.post('/razorpay/order', protect, createRazorpayOrder);
router.post('/razorpay/verify', protect, verifyRazorpayPayment);

// Wallet - Razorpay Integration
router.post('/wallet/topup', protect, walletTopup);
router.post('/wallet/verify', protect, verifyWalletTopup);
router.post('/wallet/refund', protect, walletRefund);

export default router;

