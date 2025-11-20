import express from 'express';
import { protect } from '../middleware/auth.js';
import { addSavedLocation, getSavedLocations, deleteSavedLocation, updateProfilePic, getEmergencyContact, updateEmergencyContact, updateDriverAvailability } from '../controllers/userController.js';
import { getWallet, getWalletTransactions } from '../controllers/paymentController.js';

const router = express.Router();

router.post('/:id/locations', protect, addSavedLocation);
router.get('/:id/locations', protect, getSavedLocations);
router.delete('/:id/locations/:location_id', protect, deleteSavedLocation);
router.post('/:id/profile-pic', protect, updateProfilePic);

// Emergency contact endpoints
router.get('/:id/emergency-contact', protect, getEmergencyContact);
router.put('/:id/emergency-contact', protect, updateEmergencyContact);

// Driver availability endpoint
router.put('/:id/availability', protect, updateDriverAvailability);

// Wallet endpoints
router.get('/wallet', protect, getWallet);
router.get('/wallet/transactions', protect, getWalletTransactions);

export default router;


