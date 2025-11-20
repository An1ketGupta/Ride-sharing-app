import api from '../config/api';

export const bookingService = {
    createBooking: async (bookingData) => {
        const response = await api.post('/bookings/create', bookingData);
        return response.data;
    },

    getMyBookings: async () => {
        const response = await api.get('/bookings/my');
        return response.data;
    },

    getBookingById: async (bookingId) => {
        const response = await api.get(`/bookings/${bookingId}`);
        return response.data;
    },

    confirmBooking: async (bookingId) => {
        const response = await api.put(`/bookings/${bookingId}/confirm`);
        return response.data;
    },

    cancelBooking: async (bookingId) => {
        const response = await api.put(`/bookings/${bookingId}/cancel`);
        return response.data;
    },

    applyWaitTimeCharge: async (bookingId, waitMinutes) => {
        const response = await api.put(`/bookings/${bookingId}/wait-time`, { wait_minutes: waitMinutes });
        return response.data;
    },

    getDriverLocation: async (bookingId) => {
        const response = await api.get(`/bookings/${bookingId}/driver-location`);
        return response.data;
    },

    getBookingMessages: async (bookingId) => {
        const response = await api.get(`/bookings/${bookingId}/messages`);
        return response.data;
    }
};




