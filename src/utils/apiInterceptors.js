import axios from 'axios';

// Store toast function reference
let toastFunction = null;

export const setToastFunction = (toast) => {
    toastFunction = toast;
};

// Create axios instance with base configuration
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request Interceptor
api.interceptors.request.use(
    (config) => {
        // Add auth token to requests
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Log request in development
        if (import.meta.env.DEV) {
            console.log(`🚀 ${config.method.toUpperCase()} ${config.url}`, config.data);
        }

        return config;
    },
    (error) => {
        console.error('Request error:', error);
        return Promise.reject(error);
    }
);

// Response Interceptor
api.interceptors.response.use(
    (response) => {
        // Log response in development
        if (import.meta.env.DEV) {
            console.log(`✅ ${response.config.method.toUpperCase()} ${response.config.url}`, response.data);
        }

        return response;
    },
    (error) => {
        // Handle different error scenarios
        const errorMessage = getErrorMessage(error);

        // Show toast notification if available
        if (toastFunction) {
            toastFunction.error(errorMessage);
        }

        // Handle unauthorized (401) - redirect to login
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            
            // Only redirect if not already on login page
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }

        // Handle forbidden (403)
        if (error.response?.status === 403) {
            if (toastFunction) {
                toastFunction.error('You do not have permission to perform this action');
            }
        }

        // Handle not found (404)
        if (error.response?.status === 404) {
            if (toastFunction) {
                toastFunction.error('The requested resource was not found');
            }
        }

        // Handle server errors (500+)
        if (error.response?.status >= 500) {
            if (toastFunction) {
                toastFunction.error('Server error. Please try again later');
            }
        }

        // Log error in development
        if (import.meta.env.DEV) {
            console.error('❌ API Error:', error);
        }

        return Promise.reject(error);
    }
);

// Helper function to extract error message
const getErrorMessage = (error) => {
    if (!error.response) {
        // Network error
        return 'Network error. Please check your internet connection';
    }

    if (error.response.data?.message) {
        return error.response.data.message;
    }

    if (error.response.data?.error) {
        return error.response.data.error;
    }

    if (error.message) {
        return error.message;
    }

    return 'An unexpected error occurred';
};

export default api;

