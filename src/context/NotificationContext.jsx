import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification,
  subscribeToNotifications,
  generateDailyAlerts,
} from '../services/notificationService';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const channelRef = useRef(null);
  const dailyAlertRunRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [notifs, count] = await Promise.all([
        getNotifications(60),
        getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (err) {
      console.error('[NotificationContext] refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + daily alerts
  useEffect(() => {
    refresh();

    if (!dailyAlertRunRef.current) {
      dailyAlertRunRef.current = true;
      generateDailyAlerts().then(refresh).catch(console.error);
    }
  }, [refresh]);

  // Realtime subscription
  useEffect(() => {
    channelRef.current = subscribeToNotifications(() => {
      refresh();
    });

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [refresh]);

  const handleMarkAsRead = useCallback(async (id) => {
    await markAsRead(id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const handleMarkAsUnread = useCallback(async (id) => {
    await markAsUnread(id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: false } : n)
    );
    setUnreadCount(prev => prev + 1);
  }, []);

  const handleMarkAllAsRead = useCallback(async () => {
    await markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const handleDelete = useCallback(async (id) => {
    const notif = notifications.find(n => n.id === id);
    await deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (notif && !notif.is_read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, [notifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        panelOpen,
        setPanelOpen,
        refresh,
        markAsRead: handleMarkAsRead,
        markAsUnread: handleMarkAsUnread,
        markAllAsRead: handleMarkAllAsRead,
        deleteNotification: handleDelete,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}
