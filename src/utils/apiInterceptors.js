import axios from 'axios';

// Store toast function reference
let toastFunction = null;

// Throttle connection error toasts to avoid spamming
let lastConnectionErrorToast = 0;
const CONNECTION_ERROR_THROTTLE_MS = 10000; // Show connection error toast max once per 10 seconds

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
        return response;
    },
    (error) => {
        // Handle different error scenarios
        const errorMessage = getErrorMessage(error);
        const isConnectionError = !error.response && (error.code === 'ERR_NETWORK' || error.code === 'ERR_CONNECTION_REFUSED');

        // Throttle connection error toasts to avoid spamming
        const now = Date.now();
        const shouldShowToast = !isConnectionError || (now - lastConnectionErrorToast > CONNECTION_ERROR_THROTTLE_MS);
        
        if (shouldShowToast && toastFunction) {
            toastFunction.error(errorMessage);
            if (isConnectionError) {
                lastConnectionErrorToast = now;
            }
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

        return Promise.reject(error);
    }
);

// Helper function to extract error message
const getErrorMessage = (error) => {
    if (!error.response) {
        // Network error - check if it's connection refused
        if (error.code === 'ERR_NETWORK' || error.code === 'ERR_CONNECTION_REFUSED') {
            return 'Backend server is not running. Please start the server on port 5000.';
        }
        // Other network errors
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

