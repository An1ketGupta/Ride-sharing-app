import { useEffect, useState } from 'react';
import { notificationService } from '../services/notificationService';
import { safetyService } from '../services/safetyService';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { Bell, CheckCircle, Trash2 } from 'lucide-react';
import SafetyCheck from '../components/SafetyCheck';

const Notifications = () => {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = async (opts = { reset: false, nextPage: 1 }) => {
    try {
      setLoading(true);
      const resp = await notificationService.list({ page: opts.nextPage, limit: 20, unreadOnly });
      const list = Array.isArray(resp.data) ? resp.data : [];
      if (opts.reset) {
        setItems(list);
      } else {
        setItems((prev) => [...prev, ...list]);
      }
      setPage(opts.nextPage);
      setHasMore(!!resp.hasMore);
    } catch (e) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load({ reset: true, nextPage: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  const markAll = async () => {
    try {
      await notificationService.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const markOne = async (id) => {
    try {
      await notificationService.markRead(id);
      setItems((prev) => prev.filter((n) => n.notification_id !== id));
      toast.success('Notification dismissed');
    } catch {
      toast.error('Failed to dismiss notification');
    }
  };

  const ackSafety = async (id) => {
    try {
      await notificationService.ackSafety(id);
      setItems((prev) => prev.map((n) => (n.notification_id === id ? { ...n, is_read: 1 } : n)));
      toast.success("We're glad you're safe!");
    } catch {
      toast.error('Failed to acknowledge');
    }
  };

  return (
    <div className="min-h-screen px-4 py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold">Notifications</h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
          <button
            onClick={markAll}
            className="px-3 py-2 rounded-xl border border-border hover:bg-white/20 text-sm font-semibold"
          >
            Mark all read
          </button>
        </div>
      </div>

      {/* Safety Check Alert */}
      <SafetyCheck />

      {/* List */}
      {items.length === 0 && !loading ? (
        <div className="text-center py-20 rounded-xl border border-white/20 bg-white/70 dark:bg-neutral-900/70">
          <Bell className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <div className="font-semibold">No notifications</div>
          <div className="text-sm text-muted-foreground">You're all caught up</div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const id = n.notification_id;
            const msg = String(n.message || '');
            const isSafety = /reached\s+safe|reached\s+safely|hope you reached/i.test(msg);
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-xl border ${n.is_read ? 'border-white/10 bg-white/30 dark:bg-white/5' : 'border-primary/30 bg-primary/5'}`}
              >
                <div className="text-xs text-muted-foreground mb-1">{new Date(n.created_at).toLocaleString?.() || ''}</div>
                <div className="font-medium mb-3">{msg}</div>
                <div className="flex items-center gap-2">
                  {isSafety && (
                    <button
                      onClick={() => ackSafety(id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1"
                    >
                      <CheckCircle className="w-4 h-4" /> I'm Safe
                    </button>
                  )}
                  <button
                    onClick={() => markOne(id)}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-white/20 flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" /> Dismiss
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            disabled={loading}
            onClick={() => load({ reset: false, nextPage: page + 1 })}
            className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-white/20"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
};

export default Notifications;
