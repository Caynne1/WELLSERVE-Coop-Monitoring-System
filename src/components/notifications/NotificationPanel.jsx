import { useEffect, useRef } from 'react';
import {
  Bell, X, Check, CheckCheck, Trash2, RefreshCw,
  CreditCard, AlertTriangle, AlertCircle, ArrowDownCircle, ArrowUpCircle, Info
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function getCategoryIcon(category, type) {
  const size = 15;
  if (category === 'payment')        return <CreditCard size={size} />;
  if (category === 'due_date')       return <AlertTriangle size={size} />;
  if (category === 'missed_payment') return <AlertCircle size={size} />;
  if (category === 'cash_flow') {
    return type === 'success'
      ? <ArrowDownCircle size={size} />
      : <ArrowUpCircle size={size} />;
  }
  return <Info size={size} />;
}

function getCategoryColors(type) {
  const map = {
    success: { bg: '#DCFCE7', color: '#16A34A', border: '#BBF7D0' },
    warning: { bg: '#FEF9C3', color: '#CA8A04', border: '#FEF08A' },
    error:   { bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
    info:    { bg: '#DBEAFE', color: '#2563EB', border: '#BFDBFE' },
  };
  return map[type] || map.info;
}

const CATEGORY_LABELS = {
  payment:         'Payment',
  due_date:        'Due Date',
  missed_payment:  'Missed',
  cash_flow:       'Cash Flow',
  general:         'General',
  loan:            'Loan',
};

// ── Main Panel Component ──────────────────────────────────────────────────────

export default function NotificationPanel({ anchorRef }) {
  const {
    notifications,
    loading,
    panelOpen,
    setPanelOpen,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    deleteNotification,
    refresh,
    unreadCount,
  } = useNotifications();

  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    function handleClick(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) {
        setPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [panelOpen, setPanelOpen, anchorRef]);

  if (!panelOpen) return null;

  const unread = notifications.filter(n => !n.is_read);
  const read   = notifications.filter(n => n.is_read);

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: '72px',
        right: '16px',
        width: '380px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 88px)',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 9999,
        animation: 'notif-slide-in 0.18s ease-out',
      }}
    >
      <style>{`
        @keyframes notif-slide-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '16px 18px 12px',
        borderBottom: '1px solid #F1F5F9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} color="#0F3D91" />
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#0F172A' }}>
            Notifications
          </span>
          {unreadCount > 0 && (
            <span style={{
              background: '#EF4444',
              color: '#fff',
              fontSize: '11px',
              fontWeight: '700',
              padding: '1px 7px',
              borderRadius: '999px',
              minWidth: '20px',
              textAlign: 'center',
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              title="Mark all as read"
              style={btnStyle('#F8FAFC', '#64748B')}
              onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'}
              onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}
            >
              <CheckCheck size={14} />
            </button>
          )}
          <button
            onClick={refresh}
            title="Refresh"
            style={btnStyle('#F8FAFC', '#64748B')}
            onMouseEnter={e => e.currentTarget.style.background = '#E2E8F0'}
            onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setPanelOpen(false)}
            title="Close"
            style={btnStyle('#F8FAFC', '#64748B')}
            onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
            onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
            Loading notifications…
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {unread.length > 0 && (
              <Section label="New" count={unread.length}>
                {unread.map(n => (
                  <NotifItem
                    key={n.id}
                    notif={n}
                    onMarkRead={() => markAsRead(n.id)}
                    onMarkUnread={() => markAsUnread(n.id)}
                    onDelete={() => deleteNotification(n.id)}
                  />
                ))}
              </Section>
            )}
            {read.length > 0 && (
              <Section label="Earlier">
                {read.map(n => (
                  <NotifItem
                    key={n.id}
                    notif={n}
                    onMarkRead={() => markAsRead(n.id)}
                    onMarkUnread={() => markAsUnread(n.id)}
                    onDelete={() => deleteNotification(n.id)}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, count, children }) {
  return (
    <div>
      <div style={{
        padding: '8px 18px 4px',
        fontSize: '11px',
        fontWeight: '600',
        color: '#94A3B8',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        {label}
        {count != null && (
          <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: '999px', padding: '0 6px', fontWeight: '700' }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function NotifItem({ notif, onMarkRead, onMarkUnread, onDelete }) {
  const colors = getCategoryColors(notif.type);
  const isUnread = !notif.is_read;

  return (
    <div
      style={{
        padding: '10px 18px',
        borderBottom: '1px solid #F8FAFC',
        background: isUnread ? '#FAFCFF' : '#ffffff',
        transition: 'background 0.12s',
        cursor: 'default',
        position: 'relative',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
      onMouseLeave={e => e.currentTarget.style.background = isUnread ? '#FAFCFF' : '#ffffff'}
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        {/* Icon badge */}
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '10px',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '1px',
        }}>
          {getCategoryIcon(notif.category, notif.type)}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{
              fontSize: '13px',
              fontWeight: isUnread ? '700' : '600',
              color: '#0F172A',
              lineHeight: 1.3,
            }}>
              {notif.title}
            </span>
            <span style={{ fontSize: '11px', color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '1px' }}>
              {timeAgo(notif.created_at)}
            </span>
          </div>
          <p style={{
            fontSize: '12px',
            color: '#475569',
            margin: '3px 0 0',
            lineHeight: 1.5,
          }}>
            {notif.message}
          </p>

          {/* Category pill + unread dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
            <span style={{
              fontSize: '10px',
              fontWeight: '600',
              background: colors.bg,
              color: colors.color,
              borderRadius: '999px',
              padding: '1px 8px',
              border: `1px solid ${colors.border}`,
            }}>
              {CATEGORY_LABELS[notif.category] || notif.category}
            </span>
            {isUnread && (
              <span style={{
                width: '6px', height: '6px',
                borderRadius: '50%',
                background: '#3B82F6',
                display: 'inline-block',
              }} />
            )}
          </div>
        </div>
      </div>

      {/* Action buttons (appear on hover via CSS, simulated with inline) */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginTop: '8px',
        justifyContent: 'flex-end',
      }}>
        {isUnread ? (
          <ActionBtn onClick={onMarkRead} title="Mark as read" color="#16A34A">
            <Check size={12} /> <span>Read</span>
          </ActionBtn>
        ) : (
          <ActionBtn onClick={onMarkUnread} title="Mark as unread" color="#2563EB">
            <Bell size={12} /> <span>Unread</span>
          </ActionBtn>
        )}
        <ActionBtn onClick={onDelete} title="Delete" color="#DC2626">
          <Trash2 size={12} />
        </ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({ onClick, title, color, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '3px 8px',
        borderRadius: '6px',
        border: `1px solid ${color}22`,
        background: `${color}11`,
        color: color,
        fontSize: '11px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = `${color}22`}
      onMouseLeave={e => e.currentTarget.style.background = `${color}11`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{
        width: '48px', height: '48px',
        borderRadius: '50%',
        background: '#F1F5F9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 12px',
      }}>
        <Bell size={20} color="#94A3B8" />
      </div>
      <p style={{ fontSize: '14px', fontWeight: '600', color: '#334155', margin: '0 0 4px' }}>
        All caught up!
      </p>
      <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
        No notifications yet. New alerts for payments,<br />loans, and cash flow will appear here.
      </p>
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function btnStyle(bg, color) {
  return {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    background: bg,
    border: '1px solid #E2E8F0',
    color,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.12s',
  };
}
