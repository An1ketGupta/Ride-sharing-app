import api from '../config/api';

export const promoService = {
    list: async () => {
        const response = await api.get('/promo-codes');
        return response.data;
    },

    apply: async (code) => {
        const response = await api.post('/promo-codes/apply', { code });
        return response.data;
    },

    validate: async (code, rideAmount) => {
        const response = await api.post('/promo-codes/validate', { code, ride_amount: rideAmount });
        return response.data;
    },

    // Admin functions
    create: async (promoData) => {
        const response = await api.post('/promo-codes/create', promoData);
        return response.data;
    },

    update: async (promoId, updates) => {
        const response = await api.put(`/promo-codes/${promoId}`, updates);
        return response.data;
    },

    delete: async (promoId) => {
        const response = await api.delete(`/promo-codes/${promoId}`);
        return response.data;
    }
};
