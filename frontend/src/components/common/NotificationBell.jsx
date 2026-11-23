import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './NotificationBell.css';

const storageKey = (userId) => `notif-read-${userId}`;

const readSet = (userId) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey(userId)) || '[]'));
  } catch (e) {
    return new Set();
  }
};

const saveSet = (userId, set) => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...set]));
  } catch (e) {
    // private mode: read state just won't persist
  }
};

/**
 * NotificationBell - 🔔 with an unread badge; the list comes from GET /api/notifications.
 * Notifications are computed server-side from live data; "read" is remembered per browser.
 */
const NotificationBell = ({ userId, onNavigate }) => {
  const [items, setItems] = useState([]);
  const [read, setRead] = useState(() => readSet(userId));
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(() => {
    axios.get(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    })
      .then((res) => {
        const list = res.data?.data?.items || [];
        setItems(list);
        // forget read marks of notifications that no longer exist
        setRead((prev) => {
          const ids = new Set(list.map((i) => i.id));
          const next = new Set([...prev].filter((id) => ids.has(id)));
          saveSet(userId, next);
          return next;
        });
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    setRead(readSet(userId));
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [userId, load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = (ids) => {
    setRead((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      saveSet(userId, next);
      return next;
    });
  };

  const unread = items.filter((i) => !read.has(i.id)).length;

  const openItem = (item) => {
    markRead([item.id]);
    setOpen(false);
    if (item.page && onNavigate) onNavigate(item.page);
  };

  return (
    <div className="nb" ref={wrapRef}>
      <button
        type="button"
        className="nb-bell"
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
        aria-expanded={open}
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="nb-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="nb-panel" role="dialog" aria-label="Thông báo">
          <div className="nb-head">
            <strong>Thông báo</strong>
            {unread > 0 && (
              <button type="button" className="nb-markall" onClick={() => markRead(items.map((i) => i.id))}>
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="nb-empty">Không có thông báo mới</div>
          ) : (
            <ul className="nb-list">
              {items.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className={`nb-item is-${i.level} ${read.has(i.id) ? 'is-read' : ''}`}
                    onClick={() => openItem(i)}
                  >
                    <span className="nb-icon" aria-hidden="true">{i.icon}</span>
                    <span className="nb-text">
                      <span className="nb-title">{i.title}</span>
                      <span className="nb-msg">{i.message}</span>
                    </span>
                    {!read.has(i.id) && <span className="nb-dot" aria-label="Chưa đọc" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
