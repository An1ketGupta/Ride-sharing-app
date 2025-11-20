import api from '../config/api';

export const documentService = {
  upload: async (driverId, { doc_type, file_url }) => {
    const { data } = await api.post(`/drivers/${driverId}/documents`, { doc_type, file_url });
    return data;
  },
  list: async (driverId) => {
    const { data } = await api.get(`/drivers/${driverId}/documents`);
    return data;
  },
  approve: async (driverId, docId) => {
    const { data } = await api.patch(`/drivers/${driverId}/documents/${docId}`, { status: 'approved' });
    return data;
  },
  reject: async (driverId, docId) => {
    const { data } = await api.patch(`/drivers/${driverId}/documents/${docId}`, { status: 'rejected' });
    return data;
  },
  listPending: async () => {
    const { data } = await api.get(`/drivers/documents/pending`);
    return data;
  }
};


