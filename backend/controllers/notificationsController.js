import { promisePool } from '../config/db.js';

export const listMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';
    const offset = (page - 1) * limit;

    const where = ['user_id = ?'];
    const params = [userId];
    if (unreadOnly) { where.push('is_read = 0'); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await promisePool.query(
      `SELECT notification_id, user_id, message, is_read, created_at
       FROM notifications
       ${whereSql}
       ORDER BY created_at DESC, notification_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await promisePool.query(
      `SELECT COUNT(*) AS cnt FROM notifications ${whereSql}`,
      params
    );
    const total = Number(countRows?.[0]?.cnt || 0);
    const hasMore = offset + rows.length < total;
    res.json({ success: true, data: rows, page, limit, total, hasMore });
  } catch (e) {
    // If table doesn't exist, return empty results
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ success: true, data: [], page: 1, limit: 20, total: 0, hasMore: false });
    }
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

export const markRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const [own] = await promisePool.query(
      'SELECT 1 FROM notifications WHERE notification_id = ? AND user_id = ? LIMIT 1',
      [id, userId]
    );
    if (!own.length) return res.status(404).json({ success: false, message: 'Notification not found' });

    await promisePool.query('UPDATE notifications SET is_read = 1 WHERE notification_id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
};

export const markAllRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await promisePool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
};

export const ackSafety = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const [own] = await promisePool.query(
      'SELECT message FROM notifications WHERE notification_id = ? AND user_id = ? LIMIT 1',
      [id, userId]
    );
    if (!own.length) return res.status(404).json({ success: false, message: 'Notification not found' });

    // Mark read; could also persist to a dedicated table if needed
    await promisePool.query('UPDATE notifications SET is_read = 1 WHERE notification_id = ?', [id]);

    res.json({ success: true, message: "We're glad you're safe!" });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to acknowledge safety' });
  }
};
