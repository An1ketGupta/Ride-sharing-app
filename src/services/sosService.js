import api from '../config/api';

export const sosService = {
  raise: async (rideId, { user_id, details, passenger_lat, passenger_lon }) => {
    const { data } = await api.post(`/rides/${rideId}/sos`, { user_id, details, passenger_lat, passenger_lon });
    return data;
  }
};