import api from '../config/api';

export const notificationService = {
  list: async (opts = {}) => {
    const params = new URLSearchParams();
    if (opts.page) params.set('page', String(opts.page));
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.unreadOnly != null) params.set('unreadOnly', String(!!opts.unreadOnly));
    const qs = params.toString();
    const url = qs ? `/notifications?${qs}` : '/notifications';
    const { data } = await api.get(url);
    return data;
  },
  markRead: async (id) => {
    const { data } = await api.put(`/notifications/${id}/read`);
    return data;
  },
  markAllRead: async () => {
    const { data } = await api.put('/notifications/mark-all-read');
    return data;
  },
  ackSafety: async (id) => {
    const { data } = await api.post(`/notifications/${id}/ack-safety`);
    return data;
  },
};