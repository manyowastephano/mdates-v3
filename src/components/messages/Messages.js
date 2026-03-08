
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Swal from 'sweetalert2'; 

import { useAuth } from '../../context/AuthContext';
import { API_ENDPOINTS, fetchJSON } from '../../config/api';
import Loading from '../common/Loading';
import { FaCheckDouble, FaPlus, FaEllipsisV, FaLock, FaLightbulb } from 'react-icons/fa';
import './styles/chat.css';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'https://mudates.tiguleni.com';

const Messages = ({ onSelectConversation }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState(null);
  const [showNewChatInput, setShowNewChatInput] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null); 
  const [isSearchingUser, setIsSearchingUser] = useState(false); 

  const navigate = useNavigate();
  const newChatInputRef = useRef(null);
  const menuRef = useRef(null); 
  const socketRef = useRef(null);
  const connectedOnceRef = useRef(false);

  const { isAuthenticated, token, user } = useAuth();
  const currentUser = user;

  const messagesCache = useRef({}); 

  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = useCallback((timestamp) => {
    if (!timestamp) return 'Just now';
    const now = new Date();
    const messageTime = new Date(timestamp);
    const diffHours = Math.floor((now - messageTime) / (1000 * 60 * 60));
    if (diffHours < 24) {
      return messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffHours < 48) {
      return 'Yesterday';
    } else {
      return messageTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }, []);

  const formatLastActive = useCallback((timestamp) => {
    if (!timestamp) return 'Recently';
    const now = new Date();
    const lastActive = new Date(timestamp);
    const diffMinutes = Math.floor((now - lastActive) / (1000 * 60));
    if (Number.isNaN(diffMinutes)) return 'Recently';
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  }, []);

  const normalizeBool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'True';

  const mapMessageData = useCallback(
    (message) => ({
      id: message.id,
      text: message.content,
      time: new Date(message.timestamp || message.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      sender: Number(message.sender_id) === Number(currentUser?.id) ? 'me' : 'them',
      read: !!message.read,
      type: message.type || 'text',
      attachment: message.attachment_url || null,
      raw: message,
    }),
    [currentUser?.id]
  );

  const mapConversation = useCallback(
    (conv) => ({
      id: conv.id,
      userId: conv.other_user_id,
      name: conv.other_user_name || 'User',
      lastMessage: conv.last_message || 'No messages yet',
      time: formatTime(conv.updated_at),
      unread: conv.unread_count || 0,
      is_online: normalizeBool(conv.is_online),
      is_match: normalizeBool(conv.is_match),
      last_seen: conv.last_seen,
      profile_picture: conv.profile_picture || null,
      conversation: conv,
    }),
    [formatTime]
  );

  const recomputeUnread = useCallback((list) => {
    const total = list.reduce((sum, c) => sum + (c.unread || 0), 0);
    setUnreadCount(total);
  }, []);

  const prefetchMessages = useCallback(
    async (convList) => {
      const promises = convList.slice(0, 5).map(async (conv) => {
        if (messagesCache.current[conv.id]) return;
        try {
          const messagesData = await fetchJSON(
            API_ENDPOINTS.CHAT_CONVERSATION_MESSAGES(conv.id),
            { method: 'GET' },
            token
          );
          if (messagesData && Array.isArray(messagesData)) {
            messagesCache.current[conv.id] = messagesData.map(mapMessageData);
          }
        } catch (err) {
          console.error(`Failed to prefetch messages for conversation ${conv.id}:`, err);
        }
      });
      await Promise.allSettled(promises);
    },
    [token, mapMessageData]
  );

  const loadConversations = useCallback(
    async (showLoading = true) => {
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }
      try {
        if (showLoading) setLoading(true);
        setError(null);
        const data = await fetchJSON(API_ENDPOINTS.CHAT_CONVERSATIONS, { method: 'GET' }, token);
        const mapped = (data || []).map(mapConversation);
        setConversations(mapped);
        recomputeUnread(mapped);
        prefetchMessages(mapped);
      } catch (err) {
        console.error('Error loading conversations:', err);
        setError(
          err?.message === 'SESSION_EXPIRED'
            ? 'Your session has expired. Please log in again.'
            : 'Failed to load conversations. Please try again.'
        );
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [isAuthenticated, mapConversation, recomputeUnread, token, prefetchMessages]
  );

  // Focus new chat input when opened
  useEffect(() => {
    if (showNewChatInput && newChatInputRef.current) {
      newChatInputRef.current.focus();
    }
  }, [showNewChatInput]);

  // Socket setup (unchanged)
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!token) return;

    loadConversations(true);

    if (socketRef.current) return;

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      auth: { token: `Bearer ${token}` },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[messages socket] ✅ connected', socket.id);
    });

    socket.on('connected', () => {
      console.log('[messages socket] ✅ server connected event');
      if (!connectedOnceRef.current) {
        connectedOnceRef.current = true;
        loadConversations(false);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('[messages socket] ❌ connect_error:', err?.message || err);
    });

    socket.on('disconnect', (reason) => {
      console.log('[messages socket] 🔌 disconnected:', reason);
      connectedOnceRef.current = false;
    });

    socket.on('presence_update', (p) => {
      const userId = Number(p?.user_id);
      if (!userId) return;
      const isOnline = normalizeBool(p.is_online);
      const lastSeen = p.last_seen || null;
      setConversations((prev) => {
        const next = prev.map((c) =>
          Number(c.userId) === userId
            ? {
                ...c,
                is_online: isOnline,
                last_seen: lastSeen,
                conversation: { ...c.conversation, is_online: isOnline, last_seen: lastSeen },
              }
            : c
        );
        return next;
      });
    });

    socket.on('conversation_updated', (summary) => {
      if (!summary?.id) return;
      setConversations((prev) => {
        const nextItem = mapConversation(summary);
        const idx = prev.findIndex((c) => c.id === nextItem.id);
        let next;
        if (idx >= 0) {
          next = [...prev];
          next[idx] = { ...prev[idx], ...nextItem };
        } else {
          next = [nextItem, ...prev];
        }
        next.sort((a, b) => {
          const ta = new Date(a.conversation?.updated_at || 0).getTime();
          const tb = new Date(b.conversation?.updated_at || 0).getTime();
          return tb - ta;
        });
        recomputeUnread(next);
        return next;
      });
    });

    return () => {
      // Leave socket connected if you want to reuse it across pages.
      // If you prefer to disconnect when leaving Messages, uncomment the lines below:
      // socket.disconnect();
      // socketRef.current = null;
    };
  }, [isAuthenticated, navigate, token, loadConversations, mapConversation, recomputeUnread]);

  // ----------------------------
  // Actions
  // ----------------------------
  const handleConversationClick = (conversation) => {
    const cachedMessages = messagesCache.current[conversation.id] || [];

    if (onSelectConversation) {
      onSelectConversation(conversation.id, {
        id: conversation.userId,
        name: conversation.name,
        profile_picture: conversation.profile_picture,
        is_online: conversation.is_online,
        last_seen: conversation.last_seen,
        _conversationData: conversation.conversation,
        _initialMessages: cachedMessages,
      });
    } else {
      navigate(`/messages/${conversation.id}`);
    }
  };

  // 👇 New: search user by name and start conversation
  const handleStartNewChat = async () => {
    if (!newChatName.trim()) return;

    setIsSearchingUser(true);
    try {
      // Search for user by name (adjust endpoint as needed)
      const users = await fetchJSON(
        API_ENDPOINTS.USER_SEARCH(newChatName.trim()),
        { method: 'GET' },
        token
      );

      if (!users || users.length === 0) {
        Swal.fire({
          icon: 'error',
          title: 'User not found',
          text: `No user named "${newChatName.trim()}" exists.`,
        });
        return;
      }

      // For simplicity, take the first matching user
      const targetUser = users[0];

      // Create or get existing conversation with this user
      const conversation = await fetchJSON(
        API_ENDPOINTS.CHAT_CREATE, // expects { user_id: targetUser.id }
        { method: 'POST', body: JSON.stringify({ user_id: targetUser.id }) },
        token
      );

      // Clear input and hide
      setNewChatName('');
      setShowNewChatInput(false);

      // Navigate or notify parent
      if (onSelectConversation) {
        onSelectConversation(conversation.id, {
          id: targetUser.id,
          name: targetUser.name,
          profile_picture: targetUser.profile_picture,
          is_online: targetUser.is_online,
          last_seen: targetUser.last_seen,
          _conversationData: conversation,
          _initialMessages: [],
        });
      } else {
        navigate(`/messages/${conversation.id}`);
      }
    } catch (err) {
      console.error('Error starting new chat:', err);
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: 'Failed to start conversation. Please try again.',
      });
    } finally {
      setIsSearchingUser(false);
    }
  };

  const handleSearch = (e) => setSearchQuery(e.target.value);

  const handleFilterChange = (newFilter) => setFilter(newFilter);

  const markAllAsRead = async () => {
    try {
      await fetchJSON(API_ENDPOINTS.CHAT_MARK_ALL_READ, { method: 'POST' }, token);
      setConversations((prev) =>
        prev.map((c) => ({ ...c, unread: 0, conversation: { ...c.conversation, unread_count: 0 } }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to mark all as read. Please try again.',
      });
    }
  };

  const handleConversationAction = async (conversation, action) => {
    // Close the menu after an action
    setActiveMenuId(null);

    switch (action) {
      case 'mark_read':
        try {
          socketRef.current?.emit('mark_read', { conversation_id: Number(conversation.id) });
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversation.id
                ? { ...c, unread: 0, conversation: { ...c.conversation, unread_count: 0 } }
                : c
            )
          );
          setUnreadCount((prev) => Math.max(0, prev - (conversation.unread || 0)));
        } catch (err) {
          console.error('Error marking as read:', err);
        }
        break;

      case 'delete': {
        const result = await Swal.fire({
          title: 'Delete conversation?',
          text: 'This action cannot be undone. The conversation will be removed only for you.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'Yes, delete it!',
        });

        if (result.isConfirmed) {
          try {
            // Use a soft-delete endpoint that removes only for current user
            await fetchJSON(API_ENDPOINTS.CHAT_HIDE_CONVERSATION(conversation.id), { method: 'POST' }, token);
            setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
            setUnreadCount((prev) => Math.max(0, prev - (conversation.unread || 0)));

            Swal.fire('Deleted!', 'The conversation has been removed.', 'success');
          } catch (err) {
            console.error('Error deleting conversation:', err);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: 'Failed to delete conversation.',
            });
          }
        }
        break;
      }

      case 'clear': {
        const result = await Swal.fire({
          title: 'Clear chat?',
          text: 'All messages in this conversation will be cleared. This action cannot be undone.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'Yes, clear it!',
        });

        if (result.isConfirmed) {
          try {
            await fetchJSON(API_ENDPOINTS.CHAT_CLEAR(conversation.id), { method: 'POST' }, token);
            setConversations((prev) =>
              prev.map((c) => (c.id === conversation.id ? { ...c, lastMessage: 'No messages yet' } : c))
            );
            Swal.fire('Cleared!', 'Chat history has been cleared.', 'success');
          } catch (err) {
            console.error('Error clearing chat:', err);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: 'Failed to clear chat.',
            });
          }
        }
        break;
      }

      default:
        break;
    }
  };

  const toggleMenu = (conversationId, e) => {
    e.stopPropagation();
    setActiveMenuId((prev) => (prev === conversationId ? null : conversationId));
  };

  // ----------------------------
  // Filtering & UI
  // ----------------------------
  const filteredConversations = conversations.filter((conv) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!conv.name.toLowerCase().includes(q) && !conv.lastMessage.toLowerCase().includes(q)) {
        return false;
      }
    }
    switch (filter) {
      case 'unread':
        return conv.unread > 0;
      case 'matches':
        return conv.is_match;
      case 'online':
        return conv.is_online;
      default:
        return true;
    }
  });

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // ----------------------------
  // Render
  // ----------------------------
  if (loading) {
    return (
      <div className="messages-page">
        <Loading message="Loading your conversations..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="messages-page">
        <div className="messages-error">
          <h2>Error</h2>
          <p>{error}</p>
          <button className="auth-button" onClick={() => loadConversations(true)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-page">
      <div className="messages-header">
        <div className="header-left">
          <h1>Messages</h1>
          {unreadCount > 0 && <span className="unread-count-badge">{unreadCount} new</span>}
        </div>

        <div className="header-actions">
          <button
            className="act-btn new-chat-btn"
            onClick={() => setShowNewChatInput(true)}
            title="Start new chat"
            disabled={isSearchingUser}
          >
            <FaPlus style={{ width: '20px' }} />
          </button>
          <button
            className="act-btn mark-read"
            onClick={markAllAsRead}
            title="Mark all as read"
            disabled={unreadCount === 0}
          >
            <FaCheckDouble style={{ width: '20px' }} />
          </button>
        </div>
      </div>

      {/* New Chat Input */}
      {showNewChatInput && (
        <div className="new-chat-container">
          <div className="input-with-icon">
            <input
              ref={newChatInputRef}
              type="text"
              placeholder="Enter person's name to start chat..."
              className="form-input"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleStartNewChat();
                if (e.key === 'Escape') setShowNewChatInput(false);
              }}
              disabled={isSearchingUser}
            />
            <button
              className="start-chat-btn"
              onClick={handleStartNewChat}
              disabled={isSearchingUser}
            >
              {isSearchingUser ? 'Searching...' : 'Start'}
            </button>
            <button className="cancel-btn" onClick={() => setShowNewChatInput(false)} disabled={isSearchingUser}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="messages-filters">
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => handleFilterChange('all')}
        >
          All
        </button>
        <button
          className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => handleFilterChange('unread')}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </button>
        <button
          className={`filter-btn ${filter === 'matches' ? 'active' : ''}`}
          onClick={() => handleFilterChange('matches')}
        >
          Matches
        </button>
        <button
          className={`filter-btn ${filter === 'online' ? 'active' : ''}`}
          onClick={() => handleFilterChange('online')}
        >
          Online
        </button>
      </div>

      {filteredConversations.length === 0 ? (
        <div className="empty-conversations">
          <div className="empty-icon">💬</div>
          <h3>No conversations found</h3>
          <p>
            {searchQuery
              ? 'Try a different search term'
              : filter !== 'all'
              ? 'No conversations match your filter'
              : conversations.length === 0
              ? "You don't have any conversations yet. Connect with people to start chatting!"
              : 'No conversations match your current search and filter'}
          </p>
          {!searchQuery && filter === 'all' && conversations.length === 0 && (
            <button className="auth-button" onClick={() => setShowNewChatInput(true)}>
              <FaPlus style={{ width: '20px', marginRight: '8px' }} /> Start New Conversation
            </button>
          )}
        </div>
      ) : (
        <div className="conversations-list">
          {filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-item ${conversation.unread > 0 ? 'unread' : ''}`}
              onClick={() => handleConversationClick(conversation)}
            >
              <div className="conversation-avatar-container">
                <div className="conversation-avatar">
                  {conversation.profile_picture ? (
                    <img src={conversation.profile_picture} alt={conversation.name} className="avatar-image" />
                  ) : (
                    getInitials(conversation.name)
                  )}
                  {conversation.is_online && <div className="online-status"></div>}
                </div>
                {conversation.is_match && (
                  <div className="match-badge" title="It's a match!">
                    ❤️
                  </div>
                )}
              </div>

              <div className="conversation-info">
                <div className="conversation-header">
                  <h4>{conversation.name}</h4>
                  <span className="conversation-time">{conversation.time}</span>
                </div>
                <div className="conversation-preview">
                  <p className="last-message">{conversation.lastMessage}</p>
                  {conversation.unread > 0 && <span className="unread-count">{conversation.unread}</span>}
                </div>
                <div className="conversation-meta">
                  <span className={`status-indicator ${conversation.is_online ? 'online' : 'offline'}`}>
                    {conversation.is_online ? 'Online' : `Last seen ${formatLastActive(conversation.last_seen)}`}
                  </span>
                </div>
              </div>

              <div className="conversation-actions" style={{ position: 'relative' }}>
                <button
                  className="conversation-menu"
                  onClick={(e) => toggleMenu(conversation.id, e)}
                >
                  <FaEllipsisV style={{ width: '20px' }} />
                </button>

                {activeMenuId === conversation.id && (
                  <div className="conversation-dropdown" ref={menuRef}>
                    <button
                      className="dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConversationAction(conversation, 'mark_read');
                      }}
                    >
                      Mark as read
                    </button>
                    <button
                      className="dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConversationAction(conversation, 'delete');
                      }}
                    >
                      Delete conversation
                    </button>
                    <button
                      className="dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConversationAction(conversation, 'clear');
                      }}
                    >
                      Clear chat
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="messages-footer">
        <div className="footer-info">
          <FaLock style={{ width: '20px' }}/>
          <span>Your messages are private and secure</span>
        </div>
        <div className="footer-tips">
          <FaLightbulb style={{ width: '20px' }}/>
          <span>Tip: Be respectful and genuine in your conversations</span>
        </div>
      </div>
    </div>
  );
};

export default Messages;