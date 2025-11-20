import api from '../config/api';

export const paymentService = {
    confirmPayment: async (paymentData) => {
        const response = await api.post('/payment/confirm', paymentData);
        return response.data;
    },

    getPaymentByBooking: async (bookingId) => {
        const response = await api.get(`/payment/booking/${bookingId}`);
        return response.data;
    },

    getMyPayments: async () => {
        const response = await api.get('/payment/my');
        return response.data;
    },

    cashInit: async (bookingId) => {
        const response = await api.post('/payment/cash-init', { booking_id: bookingId });
        return response.data;
    },

    completeCashPayment: async (paymentId) => {
        const response = await api.put(`/payment/${paymentId}/complete`);
        return response.data;
    },

    createRazorpayOrder: async (orderData) => {
        const response = await api.post('/payment/razorpay/order', orderData);
        return response.data;
    },

    verifyRazorpayPayment: async (paymentData) => {
        const response = await api.post('/payment/razorpay/verify', paymentData);
        return response.data;
    },

    walletTopup: async (amount) => {
        const response = await api.post('/payment/wallet/topup', { amount });
        return response.data;
    },

    verifyWalletTopup: async (paymentData) => {
        const response = await api.post('/payment/wallet/verify', paymentData);
        return response.data;
    },

    walletRefund: async (amount, bookingId) => {
        const response = await api.post('/payment/wallet/refund', { amount, booking_id: bookingId });
        return response.data;
    },
};