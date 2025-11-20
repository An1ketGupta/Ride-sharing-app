import api from '../config/api';
import { paymentService } from './paymentService';

export const walletService = {
    getWalletBalance: async () => {
        try {
            const response = await api.get('/users/wallet');
            return response.data?.data || { balance: 0 };
        } catch (err) {
            console.error('Failed to get wallet balance:', err);
            return { balance: 0 };
        }
    },

    topup: async (amount) => {
        return await paymentService.walletTopup(amount);
    },

    verifyTopup: async (paymentData) => {
        return await paymentService.verifyWalletTopup(paymentData);
    },

    getTransactions: async () => {
        try {
            const response = await api.get('/users/wallet/transactions');
            return { transactions: response.data?.data || [] };
        } catch (err) {
            console.error('Failed to get wallet transactions:', err);
            return { transactions: [] };
        }
    }
};