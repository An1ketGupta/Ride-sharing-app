import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Home from './Home';

const LandingRedirect = () => {
    const { user, loading } = useAuth();
    if (loading) return null;
    // Only admins should be redirected away from home
    if (user && user.user_type === 'admin') {
        return <Navigate to="/admin/documents" replace />;
    }
    // Everyone else sees Home
    return <Home />;
};

export default LandingRedirect;


