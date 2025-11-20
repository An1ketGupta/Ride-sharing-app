import { prisma } from '../config/db.js';

export const listMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';
    const offset = (page - 1) * limit;

    const where = {
      userId: parseInt(userId)
    };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        select: {
          notificationId: true,
          userId: true,
          message: true,
          isRead: true,
          createdAt: true
        },
        orderBy: [
          { createdAt: 'desc' },
          { notificationId: 'desc' }
        ],
        take: limit,
        skip: offset
      }),
      prisma.notification.count({ where })
    ]);

    const hasMore = offset + rows.length < total;
    res.json({ 
      success: true, 
      data: rows.map(n => ({
        notification_id: n.notificationId,
        user_id: n.userId,
        message: n.message,
        is_read: n.isRead ? 1 : 0,
        created_at: n.createdAt
      })), 
      page, 
      limit, 
      total, 
      hasMore 
    });
  } catch (e) {
    console.error('List notifications error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

export const markRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const notification = await prisma.notification.findFirst({
      where: {
        notificationId: id,
        userId: parseInt(userId)
      }
    });
    
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });

    await prisma.notification.update({
      where: { notificationId: id },
      data: { isRead: true }
    });
    
    res.json({ success: true });
  } catch (e) {
    console.error('Mark read error:', e);
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
};

export const markAllRead = async (req, res) => {
  try {
    const userId = req.user.id;
    await prisma.notification.updateMany({
      where: { userId: parseInt(userId) },
      data: { isRead: true }
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Mark all read error:', e);
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
};

export const ackSafety = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const notification = await prisma.notification.findFirst({
      where: {
        notificationId: id,
        userId: parseInt(userId)
      },
      select: {
        message: true
      }
    });
    
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });

    // Mark read
    await prisma.notification.update({
      where: { notificationId: id },
      data: { isRead: true }
    });

    res.json({ success: true, message: "We're glad you're safe!" });
  } catch (e) {
    console.error('Ack safety error:', e);
    res.status(500).json({ success: false, message: 'Failed to acknowledge safety' });
  }
};
