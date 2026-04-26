// Chat.jsx
// ✅ Works with ACKs
// ✅ connect -> wait "connected" -> join_conversation (ACK) -> listen new_message
// ✅ send_message uses ACK to replace optimistic message
// ✅ re-joins after reconnect
// ✅ avoids join race conditions
// ✅ attachments upload via REST -> send socket message with attachment_url
// ✅ voice messages: record, upload, send as audio attachment
// ✅ FULL POPUP SUPPORT: embedded mode, onBack, onConversationCreated
// ✅ INSTANT POPUP: accepts initialMessages & initialConversation, skips loading
// ✅ NO "Conversation not found" flash – only shows error when truly missing
// ✅ EMOJI PICKER, DAY DIVIDERS, RELATIVE TIMESTAMPS, SCROLL TO BOTTOM BUTTON
// ✅ MESSAGE ACTIONS: edit, delete, reply (UI + optimistic updates)
// ✅ ADDITIONAL SAFEGUARD: error only shown when messages are absent
// ✅ INPUT FOCUS: hides attachment & voice buttons when typing for more space on mobile
// ✅ NEW: Hover actions (edit/delete/reply) for sent messages (desktop)
// ✅ NEW: Click actions for sent messages on small screens (mobile)
// ✅ NEW: Reply with quoted message preview
// ✅ FIX: Reply preview works after page refresh (enriches from loaded messages, logs missing originals)

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  FaVideo,
  FaPhoneAlt,
  FaPaperPlane,
  FaImages,
  FaCheckDouble,
  FaCheck,
  FaChevronLeft,
  FaSpinner,
  FaMicrophone,
  FaSmile,
  FaChevronDown,
  FaEdit,
  FaTrash,
  FaReply,
  FaTimes,
} from "react-icons/fa";
import { io } from "socket.io-client";
import EmojiPicker from "emoji-picker-react";
import './styles/chat.css';
import { useAuth } from "../../context/AuthContext";
import { API_ENDPOINTS, fetchJSON, fetchFormData } from "../../config/api";
import Loading from "../common/Loading";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "https://mudates.tiguleni.com";

// helpers for attachments
const isVideoUrl = (url = "") => /\.(mp4|webm|mov|mkv)$/i.test(url);
const isAudioUrl = (url = "") => /\.(mp3|wav|ogg|m4a)$/i.test(url);

// Helper for relative time
const getRelativeTime = (date) => {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);
  const diffWk = Math.round(diffDay / 7);

  if (diffSec < 60) return `${diffSec}s`;
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return `${diffWk}wk`;
};

// Helper for day divider text
const getDayLabel = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const messageDate = new Date(date);
  messageDate.setHours(0, 0, 0, 0);

  if (messageDate.getTime() === today.getTime()) return "Today";
  if (messageDate.getTime() === yesterday.getTime()) return "Yesterday";
  return messageDate.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const Chat = ({
  conversationId: propConversationId,
  user: propUser,
  onBack,
  embedded = false,
  onConversationCreated,
  initialMessages = [],
  initialConversation = null,
}) => {
  const params = useParams();
  const effectiveConversationId = propConversationId || params.conversationId;

  const navigate = useNavigate();
  const location = useLocation();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const emojiPickerRef = useRef(null);

  const { user: currentUser, isAuthenticated, token } = useAuth();

  const socketRef = useRef(null);
  const joinedConvRef = useRef(null);
  const connectedOnceRef = useRef(false);

  const hasLoadedRef = useRef(false);
  const prevConvIdRef = useRef();

  const [messages, setMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(
    !initialConversation && effectiveConversationId !== "new"
  );
  const [sending, setSending] = useState(false);
  const [conversationUser, setConversationUser] = useState(() => {
    if (initialConversation?.participants) {
      return initialConversation.participants.find(
        (p) => Number(p.id) !== Number(currentUser?.id)
      ) || null;
    }

    if (effectiveConversationId === "new" && propUser) {
      return propUser;
    }
    return null;
  });
  const [conversation, setConversation] = useState(initialConversation);
  const [error, setError] = useState(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Emoji picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Scroll to bottom button
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Message editing state
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState("");

  // Input focus state
  const [inputFocused, setInputFocused] = useState(false);

  // Screen width for responsive adjustments
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  // Swipe state (for mobile reply)
  const [swipeStartX, setSwipeStartX] = useState(null);
  const [swipingMessageId, setSwipingMessageId] = useState(null);

  // Active message for mobile click-to-show actions
  const [activeMessageId, setActiveMessageId] = useState(null);

  // --- NEW for reply feature ---
  const [replyToMessage, setReplyToMessage] = useState(null);

  const convIdNum = useMemo(() => {
    if (!effectiveConversationId || effectiveConversationId === "new") return null;
    const n = Number(effectiveConversationId);
    return Number.isFinite(n) ? n : null;
  }, [effectiveConversationId]);

  // Track screen width
  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Check scroll position to show/hide scroll button
  const checkScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!nearBottom);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", checkScroll);
    checkScroll(); // initial check
    return () => container.removeEventListener("scroll", checkScroll);
  }, [checkScroll]);

  useEffect(() => {
    checkScroll(); // when messages change, re-check
  }, [messages, checkScroll]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close message actions when clicking outside on mobile
  useEffect(() => {
    const handleClickOutsideMessages = (e) => {
      // Only on small screens
      if (window.innerWidth > 768) return;

      const container = messagesContainerRef.current;
      if (container && !container.contains(e.target)) {
        setActiveMessageId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutsideMessages);
    return () => document.removeEventListener('mousedown', handleClickOutsideMessages);
  }, []);

  // ----------------------------
  // Helpers
  // ----------------------------
  const mapMessageData = useCallback(
    (message, fallbackReplyTo = null) => {
      // reply_to can come from the server as a full nested object, a bare id,
      // or be absent entirely. Normalise into a consistent shape so the
      // reply preview always has the data it needs.
      let replyTo = fallbackReplyTo; // use caller-supplied fallback first
      if (!replyTo) {
        // Check all common server field names for reply data.
        // The object form (reply_to) takes priority; bare-id forms are fallbacks.
        const rtObject =
          (typeof message.reply_to === "object" && message.reply_to) ||
          (typeof message.reply_message === "object" && message.reply_message) ||
          null;

        // Use || (not ??) so that 0 / null / undefined are all treated as "no reply".
        // Servers commonly use reply_to_id: 0 to mean "no reply".
        const rtId =
          message.reply_to_id ||
          message.replyToId ||
          message.reply_message_id ||
          (typeof message.reply_to === "number" ? message.reply_to : null) ||
          null;

        // ── DIAGNOSTIC LOG ─────────────────────────────────────────────────────
        console.log('[Chat][mapMessageData] msg id:', message.id,
          '| reply_to:', message.reply_to,
          '| reply_to_id:', message.reply_to_id,
          '| replyToId:', message.replyToId,
          '| reply_message_id:', message.reply_message_id,
          '| → rtObject:', rtObject,
          '| → rtId:', rtId,
          '| FULL RAW MSG:', message
        );
        // ───────────────────────────────────────────────────────────────────────

        if (rtObject && rtObject.id) {
          // full nested object from server
          replyTo = {
            id: rtObject.id,
            content: rtObject.content || rtObject.text || rtObject.message || rtObject.body || "",
            sender_id: rtObject.sender_id || null,
            sender_name: rtObject.sender_name || rtObject.sender?.name || null,
            attachment_url: rtObject.attachment_url || rtObject.attachment || null,
          };
        } else if (rtId) {
          // bare id — content will be filled in by enrichReplyPreview
          replyTo = { id: rtId, content: "", sender_id: null, sender_name: null, attachment_url: null };
        }
      }

      // For attachment messages the server may echo back a placeholder label
      // like "📷 Photo", "📎 Attachment", "🎤 Voice message".
      // Strip it so only the actual media renders.
      const attachmentUrl = message.attachment_url || null;
      const PLACEHOLDER_LABELS = ["📷 Photo", "📎 Attachment", "🎤 Voice message"];
      const rawText = message.content || "";
      const text = attachmentUrl && PLACEHOLDER_LABELS.includes(rawText.trim())
        ? ""
        : rawText;

      return {
        id: message.id,
        text,
        time: new Date(message.timestamp || message.created_at),
        sender: Number(message.sender_id) === Number(currentUser?.id) ? "me" : "them",
        read: !!message.read,
        type: message.type || "text",
        attachment: attachmentUrl,
        deleted: message.deleted || false,
        replyTo,
        raw: message,
      };
    },
    [currentUser?.id]
  );

  const safeSocketEmit = useCallback((event, payload, ackTimeoutMs = 8000) => {
    const socket = socketRef.current;
    if (!socket) return Promise.reject(new Error("Socket not initialized"));

    const waitForConnect = () =>
      new Promise((resolve, reject) => {
        if (socket.connected) return resolve();

        const t = setTimeout(() => {
          socket.off("connect", onConnect);
          reject(new Error("Socket connect timeout"));
        }, 6000);

        function onConnect() {
          clearTimeout(t);
          socket.off("connect", onConnect);
          resolve();
        }

        socket.on("connect", onConnect);
      });

    return waitForConnect().then(
      () =>
        new Promise((resolve, reject) => {
          let done = false;

          const t = setTimeout(() => {
            if (done) return;
            done = true;
            reject(new Error(`ACK timeout for ${event}`));
          }, ackTimeoutMs);

          socket.emit(event, payload, (ack) => {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve(ack);
          });
        })
    );
  }, []);

  const waitForServerReady = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (connectedOnceRef.current) return resolve();

      const t = setTimeout(() => {
        socketRef.current?.off("connected", onReady);
        reject(new Error("Server ready timeout"));
      }, 5000);

      function onReady() {
        clearTimeout(t);
        socketRef.current?.off("connected", onReady);
        connectedOnceRef.current = true;
        resolve();
      }

      socketRef.current?.on("connected", onReady);
    });
  }, []);

  // Helper to enrich reply preview when only ID is known
  const enrichReplyPreview = useCallback((msg, allMessages, otherUserId, otherUserName) => {
    if (!msg.replyTo || !msg.replyTo.id) return msg;
    if (msg.replyTo.content || msg.replyTo.attachment_url) return msg; // already populated

    const original = allMessages.find(m => String(m.id) === String(msg.replyTo.id));

    // ── DIAGNOSTIC LOG ─────────────────────────────────────────────────────
    console.log('[Chat][enrichReplyPreview] msg id:', msg.id,
      '| looking for replyTo.id:', msg.replyTo.id,
      '| found original?', !!original,
      '| original.text:', original?.text,
      '| allMessage ids:', allMessages.map(m => m.id)
    );
    // ───────────────────────────────────────────────────────────────────────

    if (!original) {
      // Original message not in the current batch (probably older than page size)
      // We return the message as-is; the UI will show a fallback placeholder.
      console.warn(`[Chat] Original message ${msg.replyTo.id} not found in loaded messages. Reply preview will show placeholder.`);
      return msg;
    }

    const senderId = original.sender === "me" ? currentUser?.id : otherUserId;
    const senderName = original.sender === "me" ? "You" : otherUserName;

    // Try mapped text first, then fall back to raw server fields
    const resolvedContent =
      original.text ||
      original.raw?.content ||
      original.raw?.text ||
      original.raw?.message ||
      original.raw?.body ||
      "";

    return {
      ...msg,
      replyTo: {
        ...msg.replyTo,
        content: resolvedContent,
        attachment_url: original.attachment || original.raw?.attachment_url || null,
        sender_id: senderId,
        sender_name: senderName,
      },
    };
  }, [currentUser?.id]);

  // ----------------------------
  // Socket setup (connect once)
  // ----------------------------
  useEffect(() => {
    if (!isAuthenticated || !token || socketRef.current) return;

    const socket = io(SOCKET_URL, {
      auth: { token: `Bearer ${token}` },
      reconnection: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[socket] ✅ connected", socket.id);
    });

    socket.on("connected", (data) => {
      console.log("[socket] ✅ server connected event", data);
      connectedOnceRef.current = true;
    });

    socket.on("disconnect", (reason) => {
      console.log("[socket] 🔌 disconnected:", reason);
      joinedConvRef.current = null;
      connectedOnceRef.current = false;
    });

    socket.on("connect_error", (err) => {
      console.error("[socket] ❌ connect_error:", err.message);
    });

    socket.on("presence_update", (p) => {
      setConversationUser((prev) => {
        if (!prev) return prev;
        if (Number(prev.id) !== Number(p?.user_id)) return prev;
        return {
          ...prev,
          is_online: !!p.is_online,
          last_seen: p.last_seen || prev.last_seen,
        };
      });
    });

    // Listen for message edits/deletions from other users
    socket.on("message_edited", (editedMsg) => {
      if (convIdNum && Number(editedMsg.conversation_id) !== convIdNum) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editedMsg.id ? { ...m, text: editedMsg.content, edited: true } : m
        )
      );
    });

    socket.on("message_deleted", (deletedMsg) => {
      if (convIdNum && Number(deletedMsg.conversation_id) !== convIdNum) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === deletedMsg.id ? { ...m, deleted: true, text: "This message was deleted." } : m
        )
      );
    });

    return () => {
      socket.off("presence_update");
      socket.off("message_edited");
      socket.off("message_deleted");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, token, convIdNum]);

  // ----------------------------
  // Load conversation + history (REST) – background refresh
  // ----------------------------
  useEffect(() => {
    if (!isAuthenticated) {
      if (embedded && onBack) {
        onBack();
      } else {
        navigate("/login", { state: { from: location.pathname } });
      }
      return;
    }

    if (!effectiveConversationId) return;

    // Reset loaded flag when conversation changes
    const convChanged = prevConvIdRef.current !== effectiveConversationId;
    if (convChanged) {
      hasLoadedRef.current = false;
      prevConvIdRef.current = effectiveConversationId;
    }

    // Skip if already successfully loaded for this conversation and we have messages.
    const isNewConv = effectiveConversationId === "new";
    if (!isNewConv && hasLoadedRef.current) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      // Only set loading if we have no initial data at all
      if (!initialConversation && effectiveConversationId !== "new") {
        setLoading(true);
      }
      setError(null);

      try {
        if (effectiveConversationId === "new") {
          const userData = propUser || location.state?.user;
          if (!userData) {
            if (embedded && onBack) onBack();
            else navigate("/messages");
            return;
          }

          // check existing conversation
          const exists = await fetchJSON(
            API_ENDPOINTS.CHAT_EXISTS(userData.id),
            { method: "GET" },
            token
          );
          if (exists?.conversation_id) {
            if (embedded && onConversationCreated) {
              onConversationCreated(exists.conversation_id);
            } else {
              navigate(`/messages/${exists.conversation_id}`, { replace: true });
            }
            return;
          }

          if (!cancelled) {
            setConversationUser(userData);
            setMessages([]);
            setConversation(null);
          }
        } else {
          // Fetch fresh conversation data
          const [convData, messagesData] = await Promise.all([
            fetchJSON(API_ENDPOINTS.CHAT_CONVERSATION(effectiveConversationId), { method: "GET" }, token),
            fetchJSON(API_ENDPOINTS.CHAT_CONVERSATION_MESSAGES(effectiveConversationId), { method: "GET" }, token),
          ]);

          // ── DIAGNOSTIC LOG ─────────────────────────────────────────────────────
          console.log('[Chat][load] Raw messagesData from API:', messagesData);
          // ───────────────────────────────────────────────────────────────────────

          if (cancelled) return;

          setConversation(convData);

          const otherUser = convData?.participants?.find(
            (p) => Number(p.id) !== Number(currentUser?.id)
          );
          if (otherUser) setConversationUser(otherUser);

          // Map raw messages
          const freshMessages = (messagesData || []).map(mapMessageData);

          // Enrich reply previews for messages that have only an ID
          const enrichedMessages = freshMessages.map(msg =>
            enrichReplyPreview(msg, freshMessages, otherUser?.id, otherUser?.name)
          );

          setMessages(enrichedMessages);
          hasLoadedRef.current = true;
        }
      } catch (err) {
        console.error("Error loading conversation:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;

      if (convIdNum) {
        try {
          socketRef.current?.emit("mark_read", { conversation_id: convIdNum });
          socketRef.current?.emit("leave_conversation", { conversation_id: convIdNum });
        } catch {}
        joinedConvRef.current = null;
      }
    };
  }, [
    effectiveConversationId,
    convIdNum,
    isAuthenticated,
    navigate,
    location.pathname,
    location.state,
    currentUser?.id,
    mapMessageData,
    enrichReplyPreview,
    token,
    embedded,
    onBack,
    onConversationCreated,
    propUser,
    initialConversation,
  ]);

  // ----------------------------
  // Subscribe to events (new messages, read receipts)
  // ----------------------------
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onNewMessage = (msg) => {
      if (convIdNum && Number(msg?.conversation_id) !== Number(convIdNum)) return;

      setMessages((prev) => {
        if (!msg?.id) return prev;

        // Already present with real ID — skip
        if (prev.some((m) => m.id === msg.id)) return prev;

        // Check if there is an optimistic (tmp-*) message for this sender
        const optimisticIndex = prev.findIndex(
          (m) => String(m.id).startsWith("tmp-") && m.sender === "me"
        );
        const fallbackReplyTo = optimisticIndex !== -1 ? prev[optimisticIndex].replyTo : null;
        let mapped = mapMessageData(msg, fallbackReplyTo);

        // Enrich reply preview if needed
        mapped = enrichReplyPreview(
          mapped,
          prev,
          conversationUser?.id,
          conversationUser?.name
        );

        if (optimisticIndex !== -1) {
          // Replace the optimistic entry in-place
          const next = [...prev];
          next[optimisticIndex] = mapped;
          return next;
        }

        return [...prev, mapped];
      });
    };

    const onConversationRead = ({ conversation_id, reader_id }) => {
      if (!convIdNum) return;
      if (Number(conversation_id) !== Number(convIdNum)) return;

      if (reader_id && Number(reader_id) !== Number(currentUser?.id)) {
        setMessages((prev) => prev.map((m) => (m.sender === "me" ? { ...m, read: true } : m)));
      }
    };

    socket.on("new_message", onNewMessage);
    socket.on("conversation_read", onConversationRead);

    return () => {
      socket.off("new_message", onNewMessage);
      socket.off("conversation_read", onConversationRead);
    };
  }, [convIdNum, mapMessageData, enrichReplyPreview, currentUser?.id, conversationUser]);

  // ----------------------------
  // Join room + mark_read
  // ----------------------------
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !isAuthenticated || !convIdNum) return;

    let cancelled = false;

    const join = async () => {
      try {
        await waitForServerReady();
        if (cancelled) return;

        if (joinedConvRef.current !== String(convIdNum)) {
          const ack = await safeSocketEmit("join_conversation", { conversation_id: convIdNum });
          if (!ack?.ok) {
            console.error("join_conversation failed:", ack);
            return;
          }
          joinedConvRef.current = String(convIdNum);
        }

        socket.emit("mark_read", { conversation_id: convIdNum });
      } catch (e) {
        console.error("Join room error:", e?.message || e);
      }
    };

    join();

    const onReconnect = () => {
      joinedConvRef.current = null;
      join();
    };

    socket.on("connect", onReconnect);

    return () => {
      cancelled = true;
      socket.off("connect", onReconnect);
    };
  }, [convIdNum, isAuthenticated, safeSocketEmit, waitForServerReady]);

  // ----------------------------
  // Send text message
  // ----------------------------
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !replyToMessage) return;

    setSending(true);
    setError(null);

    // Capture reply data before clearing
    const replyData = replyToMessage;
    setReplyToMessage(null); // clear immediately for UI

    try {
      let targetConversationId = effectiveConversationId;

      // create conversation via REST if "new"
      if (effectiveConversationId === "new" && conversationUser) {
        const newConversation = await fetchJSON(
          API_ENDPOINTS.CHAT_CONVERSATIONS,
          { method: "POST", body: JSON.stringify({ participant_id: conversationUser.id }) },
          token
        );

        targetConversationId = String(newConversation.id);

        if (embedded && onConversationCreated) {
          onConversationCreated(newConversation.id);
        } else {
          navigate(`/messages/${newConversation.id}`, { replace: true });
        }

        setConversation(newConversation);
      }

      const targetConvIdNum = Number(targetConversationId);
      if (!Number.isFinite(targetConvIdNum)) throw new Error("Invalid conversation id");

      // ensure joined
      if (joinedConvRef.current !== String(targetConvIdNum)) {
        const ackJoin = await safeSocketEmit("join_conversation", { conversation_id: targetConvIdNum });
        if (!ackJoin?.ok) throw new Error("Failed to join conversation room");
        joinedConvRef.current = String(targetConvIdNum);
      }

      const socket = socketRef.current;
      if (!socket || !socket.connected) throw new Error("Socket not connected");

      const payload = {
        conversation_id: targetConvIdNum,
        content: newMessage.trim(),
        type: "text",
        ...(replyData && { reply_to_id: replyData.id })
      };

      const tempId = `tmp-${Date.now()}`;
      const optimistic = {
        id: tempId,
        text: payload.content,
        time: new Date(),
        sender: "me",
        read: false,
        type: "text",
        attachment: null,
        optimistic: true,
        deleted: false,
        replyTo: replyData ? {
          id: replyData.id,
          content: replyData.text,
          sender_id: replyData.sender === "me" ? currentUser?.id : conversationUser?.id,
          sender_name: replyData.sender === "me" ? "You" : conversationUser?.name,
          attachment_url: replyData.attachment,
        } : null,
      };

      setMessages((prev) => [...prev, optimistic]);
      setNewMessage("");
      setShowEmojiPicker(false);

      const ack = await safeSocketEmit("send_message", payload);

      if (ack?.ok && ack?.message) {
        const real = mapMessageData(ack.message, optimistic.replyTo);
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          const existingIdx = withoutTemp.findIndex((m) => m.id === real.id);
          if (existingIdx !== -1) {
            if (!withoutTemp[existingIdx].replyTo && real.replyTo) {
              const patched = [...withoutTemp];
              patched[existingIdx] = { ...patched[existingIdx], replyTo: real.replyTo };
              return patched;
            }
            return withoutTemp;
          }
          return [...withoutTemp, real];
        });
      } else {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, failed: true } : m)));
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setError(err?.message || "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const handleBackClick = () => {
    if (embedded && onBack) {
      onBack();
    } else {
      navigate("/messages");
    }
  };

  const handleCall = async () => {
    if (conversationUser && window.confirm(`Call ${conversationUser.name}?`)) {
      try {
        await fetchJSON(
          API_ENDPOINTS.CALLS_START,
          {
            method: "POST",
            body: JSON.stringify({
              user_id: conversationUser.id,
              type: "audio",
              conversation_id: effectiveConversationId,
            }),
          },
          token
        );
        alert(`Calling ${conversationUser.name}...`);
      } catch (err) {
        console.error("Error starting call:", err);
        alert("Failed to start call. Please try again.");
      }
    }
  };

  const handleVideoCall = async () => {
    if (conversationUser && window.confirm(`Start video call with ${conversationUser.name}?`)) {
      try {
        await fetchJSON(
          API_ENDPOINTS.CALLS_START,
          {
            method: "POST",
            body: JSON.stringify({
              user_id: conversationUser.id,
              type: "video",
              conversation_id: effectiveConversationId,
            }),
          },
          token
        );
        alert(`Starting video call with ${conversationUser.name}...`);
      } catch (err) {
        console.error("Error starting video call:", err);
        alert("Failed to start video call. Please try again.");
      }
    }
  };

  const handleProfileClick = () => {
    if (conversationUser) {
      if (embedded) {
        window.open(`/profile/${conversationUser.id}`, '_blank');
      } else {
        navigate(`/profile/${conversationUser.id}`);
      }
    }
  };

  // ----------------------------
  // Attachments: upload via REST, then send message via socket
  // ----------------------------
  const handleAttachmentClick = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*,audio/*";

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        alert("File size must be less than 10MB");
        return;
      }

      setSending(true);
      setError(null);

      try {
        if (!convIdNum) {
          alert("Open an existing conversation first, then upload attachments.");
          return;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("conversation_id", String(convIdNum));

        const attachment = await fetchFormData(API_ENDPOINTS.CHAT_UPLOAD, formData, { method: "POST" }, token);

        const uploadedUrl =
          attachment?.url ||
          attachment?.attachment_url ||
          attachment?.file_url ||
          attachment?.image_url;

        if (!uploadedUrl) {
          console.error("Upload response missing url:", attachment);
          throw new Error("Upload succeeded but no URL returned");
        }

        // ensure joined
        if (joinedConvRef.current !== String(convIdNum)) {
          const ackJoin = await safeSocketEmit("join_conversation", { conversation_id: convIdNum });
          if (!ackJoin?.ok) throw new Error("Failed to join conversation room");
          joinedConvRef.current = String(convIdNum);
        }

        const tempId = `tmp-att-${Date.now()}`;
        const optimistic = {
          id: tempId,
          text: "",
          time: new Date(),
          sender: "me",
          read: false,
          type: "attachment",
          attachment: uploadedUrl,
          optimistic: true,
          deleted: false,
          replyTo: replyToMessage ? { id: replyToMessage.id, content: replyToMessage.text, sender_id: replyToMessage.sender === "me" ? currentUser?.id : conversationUser?.id, sender_name: replyToMessage.sender === "me" ? "You" : conversationUser?.name, attachment_url: replyToMessage.attachment } : null,
        };
        setMessages((prev) => [...prev, optimistic]);

        const ack = await safeSocketEmit("send_message", {
          conversation_id: convIdNum,
          content: "",
          type: "attachment",
          attachment_url: uploadedUrl,
          ...(replyToMessage && { reply_to_id: replyToMessage.id }),
        });

        setReplyToMessage(null);

        if (ack?.ok && ack?.message) {
          const real = mapMessageData(ack.message, optimistic.replyTo);
          setMessages((prev) => {
            const withoutTemp = prev.filter((m) => m.id !== tempId);
            if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
            return [...withoutTemp, real];
          });
        } else {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, failed: true } : m)));
          throw new Error(ack?.error || "Attachment message failed");
        }
      } catch (err) {
        console.error("Error uploading attachment:", err);
        setError(err?.message || "Failed to upload attachment.");
        alert(err?.message || "Failed to upload attachment.");
      } finally {
        setSending(false);
      }
    };

    input.click();
  };

  // ----------------------------
  // Voice message recording + sending
  // ----------------------------
  const handleVoiceMessage = async () => {
    if (!convIdNum || effectiveConversationId === "new") {
      alert("Please start the conversation first before sending voice messages.");
      return;
    }

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await uploadAndSendAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access error:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const uploadAndSendAudio = async (audioBlob) => {
    setSending(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, `voice-${Date.now()}.webm`);
      formData.append("conversation_id", String(convIdNum));

      const attachment = await fetchFormData(
        API_ENDPOINTS.CHAT_UPLOAD,
        formData,
        { method: "POST" },
        token
      );

      const uploadedUrl =
        attachment?.url ||
        attachment?.attachment_url ||
        attachment?.file_url ||
        attachment?.image_url;

      if (!uploadedUrl) throw new Error("Upload succeeded but no URL returned");

      if (joinedConvRef.current !== String(convIdNum)) {
        const ackJoin = await safeSocketEmit("join_conversation", { conversation_id: convIdNum });
        if (!ackJoin?.ok) throw new Error("Failed to join conversation room");
        joinedConvRef.current = String(convIdNum);
      }

      const tempId = `tmp-voice-${Date.now()}`;
      const optimistic = {
        id: tempId,
        text: "",
        time: new Date(),
        sender: "me",
        read: false,
        type: "attachment",
        attachment: uploadedUrl,
        optimistic: true,
        deleted: false,
        replyTo: null,
      };
      setMessages((prev) => [...prev, optimistic]);

      const ack = await safeSocketEmit("send_message", {
        conversation_id: convIdNum,
        content: "",
        type: "attachment",
        attachment_url: uploadedUrl,
        ...(replyToMessage && { reply_to_id: replyToMessage.id }),
      });

      setReplyToMessage(null);

      if (ack?.ok && ack?.message) {
        const real = mapMessageData(ack.message, optimistic.replyTo);
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
          return [...withoutTemp, real];
        });
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, failed: true } : m))
        );
        throw new Error(ack?.error || "Voice message failed");
      }
    } catch (err) {
      console.error("Error uploading voice message:", err);
      setError(err?.message || "Failed to send voice message.");
      alert(err?.message || "Failed to send voice message.");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isRecording]);

  // Emoji picker handler
  const onEmojiClick = (emojiObject) => {
    setNewMessage((prev) => prev + emojiObject.emoji);
  };

  // ----------------------------
  // Message Actions (Edit, Delete, Reply)
  // ----------------------------
  const handleEditMessage = (message) => {
    setEditingMessageId(message.id);
    setEditText(message.text);
    setActiveMessageId(null);
  };

  const handleDeleteMessage = async (message) => {
    if (!window.confirm("Delete this message?")) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? { ...m, deleted: true, text: "This message was deleted." }
          : m
      )
    );
    setActiveMessageId(null);

    try {
      const ack = await safeSocketEmit("delete_message", {
        conversation_id: convIdNum,
        message_id: message.id,
      });
      if (!ack?.ok) {
        console.error("Delete failed", ack);
        alert("Failed to delete message.");

        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id ? { ...m, deleted: false, text: message.text } : m
          )
        );
      }
    } catch (err) {
      console.error("Error deleting message:", err);
      alert("Error deleting message.");
    }
  };

  const handleReplyMessage = (message) => {
    setReplyToMessage(message);
    setActiveMessageId(null);
    document.querySelector(".message-input")?.focus();
  };

  const handleSaveEdit = async (messageId) => {
    if (!editText.trim()) return;

    const originalText = messages.find((m) => m.id === messageId)?.text;
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, text: editText, edited: true } : m))
    );
    setEditingMessageId(null);
    setEditText("");

    try {
      const ack = await safeSocketEmit("edit_message", {
        conversation_id: convIdNum,
        message_id: messageId,
        content: editText.trim(),
      });
      if (!ack?.ok) {
        console.error("Edit failed", ack);
        alert("Failed to edit message.");
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, text: originalText, edited: false } : m))
        );
      }
    } catch (err) {
      console.error("Error editing message:", err);
      alert("Error editing message.");
    }
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText("");
  };

  const cancelReply = () => {
    setReplyToMessage(null);
  };

  // ----------------------------
  // Swipe handlers (mobile reply)
  // ----------------------------
  const handleTouchStart = (e, messageId) => {
    setSwipeStartX(e.touches[0].clientX);
    setSwipingMessageId(messageId);
  };

  const handleTouchMove = (e, messageId) => {
    if (!swipeStartX || swipingMessageId !== messageId) return;
    const deltaX = e.touches[0].clientX - swipeStartX;
    if (deltaX > 0) {
      e.currentTarget.style.transform = `translateX(${Math.min(deltaX, 80)}px)`;
    }
  };

  const handleTouchEnd = (e, messageId) => {
    if (!swipeStartX || swipingMessageId !== messageId) {
      setSwipeStartX(null);
      setSwipingMessageId(null);
      e.currentTarget.style.transform = '';
      return;
    }
    const deltaX = e.changedTouches[0].clientX - swipeStartX;
    e.currentTarget.style.transform = '';
    if (deltaX > 60) {
      const message = messages.find(m => String(m.id) === messageId);
      if (message) {
        handleReplyMessage(message);
      }
    }
    setSwipeStartX(null);
    setSwipingMessageId(null);
  };

  // Click handler for messages on mobile to toggle actions
  const handleMessageClick = useCallback((messageId, e) => {
    if (window.innerWidth > 768) return;

    const target = e.target;
    if (
      target.closest('button') ||
      target.closest('a') ||
      target.closest('video') ||
      target.closest('audio') ||
      target.closest('img') ||
      target.closest('.message-actions')
    ) {
      return;
    }

    setActiveMessageId(prev => prev === messageId ? null : messageId);
  }, []);

  // ----------------------------
  // Utility functions
  // ----------------------------
  const getInitials = (name) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  // Determine if we should hide the left buttons (attachment & voice)
  const hideLeftButtons = screenWidth <= 400 && inputFocused;

  if (!token) return <Loading message="Checking authentication..." />;

  if (loading && messages.length === 0) {
    return (
      <div className="chat-page">
        <Loading message="Loading conversation..." />
      </div>
    );
  }

  if (error && !messages.length) {
    return (
      <div className="chat-page">
        <div className="chat-error">
          <h2>Error</h2>
          <p>{error}</p>
          <button className="back-btn" onClick={handleBackClick}>
            <FaChevronLeft style={{ width: "20px" }} /> Back to Messages
          </button>
        </div>
      </div>
    );
  }

  if (!conversationUser && effectiveConversationId !== "new" && messages.length === 0 && !loading) {
    return (
      <div className="chat-page">
        <div className="chat-error">
          <h2>Conversation not found</h2>
          <p>The conversation you're looking for doesn't exist or you don't have permission to view it.</p>
          <button className="back-btn" onClick={handleBackClick}>
            <FaChevronLeft style={{ width: "20px" }} /> Back to Messages
          </button>
        </div>
      </div>
    );
  }

  const messagesWithDividers = [];
  let lastDate = null;
  messages.forEach((message) => {
    const messageDate = new Date(message.time);
    const dateKey = messageDate.toDateString();
    if (dateKey !== lastDate) {
      messagesWithDividers.push({
        type: "divider",
        date: messageDate,
        label: getDayLabel(messageDate),
      });
      lastDate = dateKey;
    }
    messagesWithDividers.push({ type: "message", data: message });
  });

  return (
    <div className={`chat-page ${embedded ? 'embedded' : ''}`}>
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-user-info" onClick={handleProfileClick} style={{ cursor: "pointer" }}>
            <div className="chat-avatar">
              {conversationUser?.profile_picture ? (
                <img src={conversationUser.profile_picture} alt={conversationUser.name} className="avatar-image" />
              ) : (
                getInitials(conversationUser?.name || "User")
              )}
              {conversationUser?.is_online && <div className="online-indicator"></div>}
            </div>

            <div className="chat-user-details">
              <h3>
                {conversationUser?.name || "User"}
                {conversationUser?.age ? `, ${conversationUser.age}` : ""}
              </h3>
              <div className="user-status">
                <span className={`status ${conversationUser?.is_online ? "online" : "offline"}`}>
                  {conversationUser?.is_online ? "Online" : `Last seen ${conversationUser?.last_seen || "recently"}`}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="chat-actions">
          <button className="act-btn" onClick={handleCall} title="Audio call" disabled={!conversationUser}>
            <FaPhoneAlt style={{ width: "20px" }} />
          </button>

          <button className="act-btn" onClick={handleVideoCall} title="Video call" disabled={!conversationUser}>
            <FaVideo style={{ width: "20px" }} />
          </button>

          <button className="act-btn" onClick={handleBackClick} title="Close chat">
            <FaTimes style={{ width: "20px" }} />
          </button>
        </div>
      </div>

      <div className="chat-container">
        {conversation?.is_match && (
          <div className="match-banner">
            <div className="match-icon">❤</div>
            <div className="match-text">
              <strong>It's a match!</strong>
              <span>You both liked each other</span>
            </div>
          </div>
        )}

        <div className="chat-messages" ref={messagesContainerRef}>
          {messagesWithDividers.length === 0 ? (
            <div className="no-messages">
              <div className="no-messages-icon">💬</div>
              <h3>No messages yet</h3>
              <p>Start the conversation by sending a message!</p>
            </div>
          ) : (
            messagesWithDividers.map((item, index) => {
              if (item.type === "divider") {
                return (
                  <div key={`divider-${index}`} className="message-day-divider">
                    <span>{item.label}</span>
                  </div>
                );
              }
              const message = item.data;
              const relativeTime = getRelativeTime(new Date(message.time));
              const exactTime = new Date(message.time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              const messageContent = message.deleted ? (
                <span className="deleted-message">This message was deleted.</span>
              ) : (
                message.text
              );

              // Render the quoted original message at the top of a reply bubble
              const renderReplyPreview = () => {
                if (!message.replyTo) return null;
                const reply = message.replyTo;
                let previewText;
                if (reply.attachment_url) {
                  previewText = "📎 Attachment";
                } else if (reply.content) {
                  previewText = reply.content.length > 80
                    ? `${reply.content.substring(0, 80)}…`
                    : reply.content;
                } else {
                  // Content not yet loaded or original was deleted
                  previewText = "Original message not loaded";
                }
                return (
                  <div className="reply-preview">
                    {reply.sender_name && (
                      <div className="reply-sender-name">{reply.sender_name}</div>
                    )}
                    <div className="reply-quoted-text">
                      <span>{previewText}</span>
                    </div>
                  </div>
                );
              };

              return (
                <div
                  key={message.id}
                  className={`message ${message.sender === "me" ? "sent" : "received"} ${message.failed ? "failed" : ""} ${message.deleted ? "deleted" : ""} ${activeMessageId === message.id ? "mobile-actions-visible" : ""} ${message.replyTo ? "has-reply" : ""}`}
                  data-message-id={message.id}
                  onTouchStart={(e) => handleTouchStart(e, String(message.id))}
                  onTouchMove={(e) => handleTouchMove(e, String(message.id))}
                  onTouchEnd={(e) => handleTouchEnd(e, String(message.id))}
                  title={message.failed ? "Failed to send" : undefined}
                >
                  {message.sender === "them" && (
                    <div className="message-avatar" onClick={handleProfileClick}>
                      {conversationUser?.profile_picture ? (
                        <img src={conversationUser.profile_picture} alt={conversationUser.name} className="avatar-image" />
                      ) : (
                        getInitials(conversationUser?.name || "User")
                      )}
                    </div>
                  )}

                  <div
                    className="message-bubble-wrapper"
                    onClick={(e) => handleMessageClick(message.id, e)}
                  >
                    <div className="message-bubble">
                      {/* Render reply preview at top of bubble */}
                      {renderReplyPreview()}

                      {message.attachment && !message.deleted && (
                        <div className="message-attachment">
                          {isVideoUrl(message.attachment) ? (
                            <video controls className="attachment-video" src={message.attachment} />
                          ) : isAudioUrl(message.attachment) ? (
                            <audio controls className="attachment-audio" src={message.attachment} />
                          ) : (
                            <img
                              src={message.attachment}
                              alt="Attachment"
                              className="attachment-image"
                              onClick={() => window.open(message.attachment, "_blank")}
                            />
                          )}
                        </div>
                      )}

                      {editingMessageId === message.id ? (
                        <div className="message-edit">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="edit-input"
                            autoFocus
                          />
                          <div className="edit-actions">
                            <button onClick={() => handleSaveEdit(message.id)}>Save</button>
                            <button onClick={cancelEdit}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {(message.text || message.deleted) && (
                            <div className="message-content">{messageContent}</div>
                          )}
                          {message.edited && !message.deleted && (
                            <span className="edited-indicator">(edited)</span>
                          )}
                        </>
                      )}

                      <div className="message-meta">
                        <span className="message-time" title={exactTime}>{relativeTime}</span>
                        {message.sender === "me" && !message.deleted && (
                          <span className="message-status">
                            {message.read ? (
                              <FaCheckDouble style={{ width: "20px" }} />
                            ) : (
                              <FaCheck style={{ width: "20px" }} />
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {!message.deleted && (
                      <div className="message-actions">
                        {message.sender === "me" && (
                          <>
                            <button
                              className="action-btn edit"
                              onClick={() => handleEditMessage(message)}
                              title="Edit"
                            >
                              <FaEdit />
                            </button>
                            <button
                              className="action-btn delete"
                              onClick={() => handleDeleteMessage(message)}
                              title="Delete"
                            >
                              <FaTrash />
                            </button>
                          </>
                        )}
                        <button
                          className="action-btn reply"
                          onClick={() => handleReplyMessage(message)}
                          title="Reply"
                        >
                          <FaReply />
                        </button>
                      </div>
                    )}
                  </div>

                  {message.sender === "me" && (
                    <div className="message-avatar">
                      {currentUser?.profile_picture ? (
                        <img src={currentUser.profile_picture} alt={currentUser.name} className="avatar-image" />
                      ) : (
                        getInitials(currentUser?.name || "You")
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {showScrollButton && (
            <button className="scroll-to-bottom-btn" onClick={scrollToBottom} title="Scroll to latest">
              <FaChevronDown />
            </button>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="chat-bottom">
        {/* WhatsApp-style reply preview bar */}
        {replyToMessage && (
          <div className="reply-preview-bar">
            <div className="reply-bar-accent" />
            <div className="reply-bar-body">
              <span className="reply-bar-sender">
                {replyToMessage.sender === "me" ? "You" : conversationUser?.name}
              </span>
              <span className="reply-bar-text">
                {replyToMessage.attachment ? "📎 Attachment" : replyToMessage.text}
              </span>
            </div>
            <button className="cancel-reply-btn" onClick={cancelReply} title="Cancel reply" type="button">
              <FaTimes size={14} />
            </button>
          </div>
        )}

        <form className="chat-input-area" onSubmit={handleSendMessage}>
        <div className="input-actions">
          {!hideLeftButtons && (
            <button
              type="button"
              className="act-btn"
              onClick={handleAttachmentClick}
              title="Send photo or video"
              disabled={sending || !effectiveConversationId || effectiveConversationId === "new"}
            >
              <FaImages style={{ width: "20px" }} />
            </button>
          )}

          {!hideLeftButtons && (
            <button
              type="button"
              className={`act-btn ${isRecording ? "recording" : ""}`}
              onClick={handleVoiceMessage}
              title={isRecording ? "Stop recording" : "Record voice message"}
              disabled={sending || !effectiveConversationId || effectiveConversationId === "new"}
            >
              <FaMicrophone style={{ width: "20px" }} />
            </button>
          )}
        </div>

        <div className="message-input-container">
          <textarea
            className="message-input"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            rows="1"
            disabled={sending}
          />
        </div>
        <div className="emoji-picker-container" ref={emojiPickerRef}>
          <button
            type="button"
            className="act-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Add emoji"
            disabled={sending}
          >
            <FaSmile style={{ width: "20px" }} />
          </button>
          {showEmojiPicker && (
            <div className="emoji-picker-wrapper">
              <EmojiPicker onEmojiClick={onEmojiClick} />
            </div>
          )}
        </div>

        <button type="submit" className="send-btn" disabled={(!newMessage.trim() && !replyToMessage) || sending}>
          {sending ? <FaSpinner className="spinner" /> : <FaPaperPlane style={{ width: "20px" }} />}
        </button>
        </form>
      </div>
    </div>
  );
};

export default Chat;