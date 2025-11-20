import api from '../config/api';

export const authService = {
    register: async (userData) => {
        const response = await api.post('/auth/register', userData);
        if (response.data.success) {
            localStorage.setItem('token', response.data.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.data.user));
        }
        return response.data;
    },

    login: async (credentials) => {
        const response = await api.post('/auth/login', credentials);
        if (response.data.success) {
            localStorage.setItem('token', response.data.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.data.user));
        }
        return response.data;
    },

    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },

    getCurrentUser: () => {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    getMe: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    },

    isAuthenticated: () => {
        return !!localStorage.getItem('token');
    }
};




