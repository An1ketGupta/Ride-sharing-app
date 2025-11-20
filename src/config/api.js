// Unify Axios client: re-export the interceptors-enabled instance
// This preserves existing import paths used by services while centralizing logic
import api from '../utils/apiInterceptors';

export default api;