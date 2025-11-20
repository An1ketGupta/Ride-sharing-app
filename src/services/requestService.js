import api from '../config/api';

export const requestService = {
  requestRide: async ({ passenger_id, source_lat, source_lon, destination, destination_lat, destination_lon, date, time, number_of_people }) => {
    const { data } = await api.post('/request-ride', { 
      passenger_id, 
      source_lat, 
      source_lon, 
      destination, 
      destination_lat, 
      destination_lon, 
      date, 
      time,
      number_of_people: number_of_people || 1
    });
    return data;
  },
};


