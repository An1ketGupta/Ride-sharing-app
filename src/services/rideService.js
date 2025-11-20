import api from '../config/api';

export const rideService = {
    createRide: async (rideData) => {
        const response = await api.post('/rides/create', rideData);
        return response.data;
    },

    searchRides: async (searchParams) => {
        const response = await api.get('/rides/search', { params: searchParams });
        return response.data;
    },

    getRideById: async (rideId) => {
        const response = await api.get(`/rides/${rideId}`);
        return response.data;
    },

    getMyRides: async () => {
        const response = await api.get('/rides/my-rides');
        return response.data;
    },

    updateRideStatus: async (rideId, status) => {
        const response = await api.put(`/rides/${rideId}/status`, { status });
        return response.data;
    },

    updateRide: async (rideId, updates) => {
        const response = await api.put(`/rides/${rideId}`, updates);
        return response.data;
    },

    estimateFare: async (params) => {
        const response = await api.get('/rides/estimate', { params });
        return response.data;
    },

    estimateETA: async (params) => {
        const response = await api.get('/rides/eta', { params });
        return response.data;
    },

    scheduleRide: async (scheduleData) => {
        const response = await api.post('/rides/schedule', scheduleData);
        return response.data;
    },

    getMySchedules: async () => {
        const response = await api.get('/rides/schedule/my');
        return response.data;
    },

    addWaypoint: async (rideId, waypointData) => {
        const response = await api.post(`/rides/${rideId}/waypoints`, waypointData);
        return response.data;
    },

    listWaypoints: async (rideId) => {
        const response = await api.get(`/rides/${rideId}/waypoints`);
        return response.data;
    },

    deleteWaypoint: async (rideId, waypointId) => {
        const response = await api.delete(`/rides/${rideId}/waypoints/${waypointId}`);
        return response.data;
    }
};




