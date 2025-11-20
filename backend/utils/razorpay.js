import Razorpay from 'razorpay';
import dotenv from 'dotenv';

// Ensure env vars are loaded even if this module is imported before server config
dotenv.config();

let razorpayClient = null;

export function getRazorpay() {
    if (razorpayClient) return razorpayClient;
    const { RAZORPAY_ID_KEY, RAZORPAY_SECRET_KEY } = process.env;
    if (!RAZORPAY_ID_KEY || !RAZORPAY_SECRET_KEY) {
        throw new Error('Razorpay keys missing. Set RAZORPAY_ID_KEY and RAZORPAY_SECRET_KEY');
    }
    razorpayClient = new Razorpay({ key_id: RAZORPAY_ID_KEY, key_secret: RAZORPAY_SECRET_KEY });
    return razorpayClient;
}



