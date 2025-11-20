import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, requireAuth = true, allowedRoles = [] }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <p>Loading...</p>
            </div>
        );
    }

    if (requireAuth && !user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    if (allowedRoles.length > 0 && user) {
        const hasRequiredRole = allowedRoles.includes(user.user_type) || user.user_type === 'both';
        if (!hasRequiredRole) {
            return <Navigate to="/" replace />;
        }
    }

    return children;
};

export default ProtectedRoute;




