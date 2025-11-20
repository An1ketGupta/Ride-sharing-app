import api from '../config/api';

export const feedbackService = {
    addFeedback: async (feedbackData) => {
        const response = await api.post('/feedback/add', feedbackData);
        return response.data;
    },

    getFeedbackByRide: async (rideId) => {
        const response = await api.get(`/feedback/${rideId}`);
        return response.data;
    },

    getMyDriverFeedback: async () => {
        const response = await api.get('/feedback/driver/my');
        return response.data;
    },

    getFeedbackByUser: async (userId) => {
        const response = await api.get(`/feedback/user/${userId}`);
        return response.data;
    }
};




