import api from '../config/api';

export const receiptService = {
    getReceipt: async (bookingId) => {
        const response = await api.get(`/receipts/${bookingId}`);
        return response.data;
    },

    emailReceipt: async (bookingId) => {
        const response = await api.post(`/receipts/${bookingId}/email`);
        return response.data;
    }
};

