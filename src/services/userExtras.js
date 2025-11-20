import api from '../config/api';

export const userExtras = {
  addSavedLocation: async (userId, { name, lat, lon }) => {
    const { data } = await api.post(`/users/${userId}/locations`, { name, lat, lon });
    return data;
  },
  getSavedLocations: async (userId) => {
    const { data } = await api.get(`/users/${userId}/locations`);
    return data;
  },
  deleteSavedLocation: async (userId, locationId) => {
    const { data } = await api.delete(`/users/${userId}/locations/${locationId}`);
    return data;
  },
  updateProfilePic: async (userId, profile_pic_url) => {
    const { data } = await api.post(`/users/${userId}/profile-pic`, { profile_pic_url });
    return data;
  },
  getEmergencyContact: async (userId) => {
    const { data } = await api.get(`/users/${userId}/emergency-contact`);
    return data;
  },
  updateEmergencyContact: async (userId, payload) => {
    const { data } = await api.put(`/users/${userId}/emergency-contact`, payload);
    return data;
  }
};