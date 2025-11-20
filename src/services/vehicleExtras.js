import api from '../config/api';

export const vehicleExtras = {
  updateVehicleImage: async (vehicleId, vehicle_image_url) => {
    const { data } = await api.post(`/vehicles/${vehicleId}/image`, { vehicle_image_url });
    return data;
  },
  deleteVehicle: async (vehicleId) => {
    const { data } = await api.delete(`/vehicles/${vehicleId}`);
    return data;
  }
};


