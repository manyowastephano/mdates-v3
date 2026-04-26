// Dashboard.jsx
// ✅ No “page refreshing”: polling does NOT toggle the main loader
// ✅ Real age: prefer backend age, fallback to birthdate calc
// ✅ Real online: normalize boolean types
// ✅ BEST: listen to socket presence_update (instant online/offline) and stop polling if you want
// ✅ Fix: don’t recompute random compatibility/colors on every refresh (keeps UI stable)

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

import { BASE_URL, API_ENDPOINTS, fetchJSON } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import UserCard from './UserCard';
import Filters from './Filters';

import Loading from '../common/Loading';
import './styles/Dashboard.css';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'https://mudates.tiguleni.com';

// ✅ Helper to parse JSON-string fields from backend
const parseJsonField = (value, fallback = []) => {
  if (Array.isArray(value)) return value;               // already an array
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;                                   // invalid JSON → fallback
    }
  }
  return fallback;                                      // anything else
};

const Dashboard = () => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [likedUsers, setLikedUsers] = useState(new Set());
  const [matches, setMatches] = useState(new Set());

  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useAuth();

  const socketRef = useRef(null);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlSearchQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(urlSearchQuery);

  const normalizeBool = (v) =>
    v === true || v === 1 || v === '1' || v === 'true' || v === 'True';

  const calcAgeFromBirthdate = (birthdate) => {
    if (!birthdate) return null;
    const d = new Date(birthdate);
    if (Number.isNaN(d.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  };

  const formatLastActive = (timestamp, isOnline) => {
    if (isOnline) return 'Online now';
    if (!timestamp) return 'Recently';

    const diffMinutes = Math.floor((Date.now() - new Date(timestamp)) / 60000);
    if (Number.isNaN(diffMinutes)) return 'Recently';
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
    return `${Math.floor(diffMinutes / 1440)} days ago`;
  };
  const toAbsoluteUrl = (value) => {
    if (!value || typeof value !== 'string') return '';
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    if (value.startsWith('/')) return `${BASE_URL}${value}`;
    return `${BASE_URL}/${value}`;
  };

  const extractSingleImage = (u) => {
    const candidate = u.profile_image || u.profile_picture || u.profile_pic || u.avatar || u.image || '';
    return toAbsoluteUrl(candidate);
  };

  const extractAllImages = (u) => {
    const fromPhotos = Array.isArray(u?.photos)
      ? u.photos.map((p) => toAbsoluteUrl(p?.image_url)).filter(Boolean)
      : [];

    if (fromPhotos.length > 0) return Array.from(new Set(fromPhotos));

    const single = extractSingleImage(u);
    return single ? [single] : [];
  };
  const stableColor = (id) => {
    const colors = [
      ['#003A8F', '#60a5fa'],
      ['#8b5cf6', '#a78bfa'],
      ['#10b981', '#34d399'],
      ['#f59e0b', '#fbbf24'],
      ['#ef4444', '#fb7185'],
      ['#06b6d4', '#22d3ee'],
    ];
    const idx = Math.abs(Number(id) || 0) % colors.length;
    return `linear-gradient(135deg, ${colors[idx][0]}, ${colors[idx][1]})`;
  };

  const stableCompatibility = (id) => {
    const base = 70;
    const span = 25;
    const n = Math.abs(Number(id) || 0) % span;
    return base + n;
  };

  const getInitials = (name = '') =>
    name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  const fetchUsers = useCallback(
    async (showLoader = true) => {
      if (!token) return;
      if (showLoader) setLoading(true);

      try {
        const data = await fetchJSON(API_ENDPOINTS.USERS, {}, token);

        const mappedUsers = (data || []).map((u) => {
          const displayName = u.name || u.full_name || 'User';
          const images = extractAllImages(u);
          const mainImage = images[0] || '';
          const realAge =
            (typeof u.age === 'number' ? u.age : null) ??
            calcAgeFromBirthdate(u.birthdate);
          const isOnline = normalizeBool(u.is_online);
          const location = u.city || u.location || u.address || 'Not specified';
          const gender = u.gender || 'Not specified';
          const education = u.education || u.education_level || 'Not specified';
          const relationshipGoal = u.relationship_goal || u.relationshipGoal || 'Not specified';
          const personality = u.personality || u.personality_type || 'Not specified';
          let memberSince = 'Recently';
          if (u.created_at || u.member_since) {
            const date = new Date(u.created_at || u.member_since);
            if (!isNaN(date.getTime())) {
              memberSince = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }
          }

          // ✅ PARSE stringified JSON fields
          const interests = parseJsonField(u.interests);
          const lookingFor = parseJsonField(u.looking_for);
          const relationshipGoals = parseJsonField(u.relationship_goals, []);

          return {
            id: u.id,
            name: displayName,
            age: realAge,
            job: u.occupation || u.job || 'Not specified',
            bio: u.bio || 'Looking for meaningful connections',
            distance: typeof u.distance === 'number' ? u.distance : Math.random() * 30,

            status: isOnline ? 'online' : 'offline',
            is_online: isOnline,
            last_seen: u.last_seen || null,

            verified: normalizeBool(u.is_verified),
            interests,                                // ✅ now an array

            // ✅ stable (no shuffle on refresh)
            color: stableColor(u.id),
            compatibility: stableCompatibility(u.id),
            initials: getInitials(displayName),

            // Card + popup fields
            image: mainImage,
            profile_image: mainImage,
            images,
            photos: u.photos || [],

            lastActive: formatLastActive(u.last_seen, isOnline),
            isMatch: false,
            location,
            gender,
            education,
            relationshipGoal: relationshipGoals.length > 0 ? relationshipGoals[0] : relationshipGoal,
            personality,
            memberSince,
            lookingFor,
          };
        });

        setUsers(mappedUsers);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [token] // BASE_URL is constant import
  );

  const fetchLikes = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchJSON(API_ENDPOINTS.LIKES, {}, token);
      setLikedUsers(new Set((data || []).map((like) => like.liked_user_id)));
    } catch (error) {
      console.error('Error fetching likes:', error);
    }
  }, [token]);

  const fetchMatches = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchJSON(API_ENDPOINTS.MATCHES, {}, token);
      const matchIds = new Set((data || []).map((match) => match.matched_user_id));
      setMatches(matchIds);
      setUsers((prev) => prev.map((u) => ({ ...u, isMatch: matchIds.has(u.id) })));
    } catch (error) {
      console.error('Error fetching matches:', error);
    }
  }, [token]);

  // ------------------ SOCKET presence (BEST, no polling) ------------------
  useEffect(() => {
    if (!token || socketRef.current) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token: `Bearer ${token}` },
      reconnection: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => console.log('[presence] ✅ connected', socket.id));
    socket.on('connect_error', (err) => console.error('[presence] ❌ connect_error:', err.message));

    // ✅ must match your Flask broadcast payload
    socket.on('presence_update', (payload) => {
      const userId = Number(payload?.user_id);
      if (!userId) return;

      const isOnline = !!payload?.is_online;
      const lastSeen = payload?.last_seen || null;

      setUsers((prev) =>
        prev.map((u) => {
          if (Number(u.id) !== userId) return u;
          const next = { ...u, is_online: isOnline, status: isOnline ? 'online' : 'offline' };
          if (!isOnline) next.last_seen = lastSeen || u.last_seen;
          next.lastActive = formatLastActive(next.last_seen, isOnline);
          return next;
        })
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  // ------------------ EFFECTS ------------------
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    // ✅ first load: show loader
    fetchUsers(true);
    fetchLikes();
    fetchMatches();
  }, [token, fetchUsers, fetchLikes, fetchMatches, navigate]);

  // ✅ OPTIONAL polling fallback:
  // If you enable presence_update sockets, you can REMOVE this effect.
  // If you keep it, it will NOT show loader (so it won’t “refresh the page” feeling).
  useEffect(() => {
    if (!token) return;

    // If socket is connected and presence updates are working, polling is not needed.
    // Keep this only as a fallback for when sockets fail.
    const t = setInterval(() => {
      fetchUsers(false);
    }, 20000); // 20s (less aggressive)
    return () => clearInterval(t);
  }, [token, fetchUsers]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchQuery(params.get('q') || '');
  }, [location.search]);

  const filterUsers = useCallback(() => {
    let filtered = [...users];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.job.toLowerCase().includes(q) ||
          u.bio.toLowerCase().includes(q) ||
          (u.interests || []).some((i) => String(i).toLowerCase().includes(q))
      );
    }

    switch (activeFilter) {
      case 'online':
        filtered = filtered.filter((u) => u.status === 'online');
        break;
      case 'near':
        filtered = filtered.filter((u) => u.distance < 5);
        break;
      case 'new':
        filtered = filtered.slice(0, 3);
        break;
      case 'recommended':
        filtered = filtered.filter((u) => u.compatibility >= 85);
        break;
      default:
        break;
    }

    setFilteredUsers(filtered);
  }, [users, activeFilter, searchQuery]);

  useEffect(() => {
    filterUsers();
  }, [filterUsers]);

  // ------------------ ACTIONS ------------------
  const handleUserClick = (user) => {
    setSelectedUser(user);
    setShowProfilePopup(true);
  };

  const handleFilterChange = (filter) => setActiveFilter(filter);

  const clearSearch = () => {
    setSearchQuery('');
    const params = new URLSearchParams(location.search);
    params.delete('q');
    navigate(`?${params.toString()}`, { replace: true });
  };

  const handleMessageClick = async (user) => {
    try {
      const res = await fetchJSON(
        `${BASE_URL}/api/chat/with/${user.id}/`,
        { method: 'POST' },
        token
      );
      navigate(`/messages/${res.conversation_id}`);
    } catch (e) {
      console.error('Failed to open chat', e);
    }
  };

  const handleLikeUser = async (userId) => {
    if (!token) return navigate('/login');

    try {
      const data = await fetchJSON(
        API_ENDPOINTS.LIKES,
        { method: 'POST', body: JSON.stringify({ liked_user_id: userId }) },
        token
      );

      setLikedUsers((prev) => new Set(prev).add(userId));

      if (data?.is_match) {
        setMatches((prev) => new Set(prev).add(userId));
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isMatch: true } : u)));
      }
    } catch (error) {
      console.error('Error liking user:', error);
    }
  };

  const handlePassUser = async (userId) => {
    try {
      await fetchJSON(
        `${BASE_URL}/api/dislikes/`,
        { method: 'POST', body: JSON.stringify({ disliked_user_id: userId }) },
        token
      );
    } finally {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  };

  const handleViewProfile = (user) => navigate(`/user/${user.id}`, { state: { user } });
  if (!token) return <Loading message="Loading..." />;

  if (loading) {
    return (
      <div className="dashboard-page">
        <Loading message="Finding people near you..." />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <Filters activeFilter={activeFilter} onFilterChange={handleFilterChange} />

      {filteredUsers.length === 0 ? (
        <div className="empty-state">
          <h3>{searchQuery ? 'No users found' : 'No users available'}</h3>
          {searchQuery && (
            <button className="auth-button secondary" onClick={clearSearch}>
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="user-list">
          {filteredUsers.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onClick={() => handleUserClick(user)}
              onMessage={() => handleMessageClick(user)}
              onLike={() => handleLikeUser(user.id)}
              onPass={() => handlePassUser(user.id)}
              onViewProfile={() => handleViewProfile(user)}
              isLiked={likedUsers.has(user.id)}
              isMatch={matches.has(user.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;