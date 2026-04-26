// BottomNav.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FaHome, FaHeart, FaComment } from 'react-icons/fa'; // ✅ New icon imports
import { API_ENDPOINTS, fetchJSON } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import './styles/BottomNav.css';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'https://mudates.tiguleni.com';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { token, user, isAuthenticated } = useAuth();

  const [activePage, setActivePage] = useState('dashboard');
  const [visible, setVisible] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingMatches, setPendingMatches] = useState(0);

  const [clickBusy, setClickBusy] = useState(false);

  const bottomNavRef = useRef(null);
  const intervalRef = useRef(null);
  const socketRef = useRef(null);

  const lastScrollYRef = useRef(0);
  const touchStartYRef = useRef(0);
  const mountedRef = useRef(false);

  // ✅ Updated navItems with React Icons
  const navItems = useMemo(
    () => [
      {
        id: 'dashboard',
        label: 'Discover',
        icon: <FaHome />,
        path: '/',
        showBadge: false,
      },
      {
        id: 'matches',
        label: 'Matches',
        icon: <FaHeart />,
        path: '/matches',
        showBadge: pendingMatches > 0,
        badgeCount: pendingMatches,
      },
      {
        id: 'messages',
        label: 'Messages',
        icon: <FaComment />,
        path: '/messages',
        showBadge: unreadMessages > 0,
        badgeCount: unreadMessages,
      },
    ],
    [unreadMessages, pendingMatches]
  );

  // ----------------------------
  // REST fallback fetchers
  // ----------------------------
  const fetchUnreadMessages = useCallback(async () => {
    if (!token || !mountedRef.current) return;

    try {
      const data = await fetchJSON(API_ENDPOINTS.CHAT_CONVERSATIONS, { method: 'GET' }, token);
      const totalUnread = Array.isArray(data)
        ? data.reduce((sum, conv) => sum + (conv.unread_count || 0), 0)
        : 0;

      if (mountedRef.current) setUnreadMessages(totalUnread);
    } catch (error) {
      console.error('Error fetching unread messages:', error);
    }
  }, [token]);

  const fetchPendingMatches = useCallback(async () => {
    if (!token || !mountedRef.current) return;

    try {
      const data = await fetchJSON(API_ENDPOINTS.MATCHES, { method: 'GET' }, token);
      const pending = Array.isArray(data)
        ? data.filter((match) => !match.viewed || match.is_new).length
        : 0;

      if (mountedRef.current) setPendingMatches(pending);
    } catch (error) {
      console.error('Error fetching pending matches:', error);
    }
  }, [token]);

  const fetchCounts = useCallback(async () => {
    if (!token || !user || !mountedRef.current) return;
    await Promise.all([fetchUnreadMessages(), fetchPendingMatches()]);
  }, [token, user, fetchUnreadMessages, fetchPendingMatches]);

  // ----------------------------
  // Mount/unmount
  // ----------------------------
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // ----------------------------
  // Active tab based on route
  // ----------------------------
  useEffect(() => {
    const currentPath = location.pathname;

    const activeNav = navItems.find(
      (item) => item.path === currentPath || (item.path !== '/' && currentPath.startsWith(item.path))
    );

    if (activeNav && mountedRef.current) setActivePage(activeNav.id);
    else setActivePage('dashboard');
  }, [location.pathname, navItems]);

  // ----------------------------
  // Initial load + fallback polling
  // ----------------------------
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    fetchCounts();

    intervalRef.current = setInterval(() => {
      fetchCounts();
    }, 60000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, token, fetchCounts]);

  // ----------------------------
  // Socket for instant badge updates
  // ----------------------------
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    if (socketRef.current) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      auth: { token: `Bearer ${token}` },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[bottomnav socket] ✅ connected', socket.id);
    });

    socket.on('connected', () => {
      fetchCounts();
    });

    socket.on('connect_error', (err) => {
      console.error('[bottomnav socket] ❌ connect_error:', err?.message || err);
    });

    socket.on('conversation_updated', () => {
      fetchUnreadMessages();
    });

    socket.on('presence_update', () => {
      // ignore for badges
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, token, fetchCounts, fetchUnreadMessages]);

  // ----------------------------
  // Scroll/touch/mouse handlers
  // ----------------------------
  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    const last = lastScrollYRef.current;

    if (currentScrollY < last && currentScrollY > 50) {
      setVisible(true);
    } else if (currentScrollY > last + 50 && currentScrollY > 200) {
      setVisible(false);
    }

    lastScrollYRef.current = currentScrollY;
  }, []);

  const handleTouchStart = useCallback((e) => {
    touchStartYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e) => {
    const startY = touchStartYRef.current;
    if (!startY) return;

    const touchEndY = e.touches[0].clientY;
    const diff = startY - touchEndY;

    if (diff < -30) {
      setVisible(true);
    } else if (diff > 30 && window.scrollY > 100) {
      setVisible(false);
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (window.innerHeight - e.clientY < 80) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (!mountedRef.current) return;
      requestAnimationFrame(handleScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleScroll, handleTouchStart, handleTouchMove, handleMouseMove]);

  // ----------------------------
  // Nav click
  // ----------------------------
  const handleNavClick = useCallback(
    async (item) => {
      if (clickBusy) return;

      setClickBusy(true);
      try {
        navigate(item.path);
        setActivePage(item.id);

        if (item.id === 'messages') await fetchUnreadMessages();
        if (item.id === 'matches') await fetchPendingMatches();
      } finally {
        if (mountedRef.current) setClickBusy(false);
      }
    },
    [navigate, clickBusy, fetchUnreadMessages, fetchPendingMatches]
  );

  return (
    <div
      ref={bottomNavRef}
      className={`bottom-nav ${visible ? 'visible' : 'hidden'}`}
      role="navigation"
      aria-label="Bottom navigation"
    >
      {navItems.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${activePage === item.id ? 'active' : ''}`}
          onClick={() => handleNavClick(item)}
          data-page={item.id}
          aria-label={item.label}
          aria-current={activePage === item.id ? 'page' : undefined}
          type="button"
          disabled={clickBusy}
        >
          <div className="nav-icon-container">
            <span className="nav-icon">
              {item.icon} {/* ✅ Renders SVG icon */}
            </span>

            {item.showBadge && item.badgeCount > 0 && (
              <div className="nav-badge" aria-label={`${item.badgeCount} notifications`}>
                {item.badgeCount > 9 ? '9+' : item.badgeCount}
              </div>
            )}
          </div>

          <span className="nav-label">{item.label}</span>

          {activePage === item.id && <div className="active-indicator" aria-hidden="true" />}

          {clickBusy && activePage === item.id && (
            <div className="nav-loading-indicator" aria-label="Loading" />
          )}
        </button>
      ))}
    </div>
  );
};

export default BottomNav;