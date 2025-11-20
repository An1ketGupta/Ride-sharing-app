import api from '../config/api';

export const safetyService = {
    confirmSafety: async (bookingId) => {
        const response = await api.post(`/safety/confirm/${bookingId}`);
        return response.data;
    },

    reportUnsafe: async (bookingId, message = '') => {
        const response = await api.post(`/safety/report-unsafe/${bookingId}`, { message });
        return response.data;
    },

    getPendingSafetyChecks: async () => {
        const response = await api.get('/safety/pending');
        return response.data;
    }
};




