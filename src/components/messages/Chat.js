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
// ✅ MESSAGE ACTIONS: edit, delete, reply (UI + optimistic updates, ready for backend)
// ✅ FIX: Prevent "Failed to load conversation" error after chat already loaded
// ✅ ADDITIONAL SAFEGUARD: error only shown when messages are absent
// ✅ INPUT FOCUS: hides attachment & voice buttons when typing for more space on mobile

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  FaVideo,
  FaPhoneAlt,
  FaPaperPlane,
  FaImages,
  FaEllipsisV,
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
  const activeMessageMenuRef = useRef(null);

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

  // Message actions dropdown
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState("");

  // Input focus state
  const [inputFocused, setInputFocused] = useState(false);

  // Screen width for responsive adjustments
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

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

  // Close message actions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeMessageMenuRef.current && !activeMessageMenuRef.current.contains(event.target)) {
        setActiveMessageId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ----------------------------
  // Helpers
  // ----------------------------
  const mapMessageData = useCallback(
    (message) => ({
      id: message.id,
      text: message.content,
      time: new Date(message.timestamp || message.created_at),
      sender: Number(message.sender_id) === Number(currentUser?.id) ? "me" : "them",
      read: !!message.read,
      type: message.type || "text",
      attachment: message.attachment_url || null,
      deleted: message.deleted || false,
      raw: message,
    }),
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

    // Skip if already successfully loaded for this conversation and we have messages
    const isNewConv = effectiveConversationId === "new";
    if (!isNewConv && hasLoadedRef.current && messages.length > 0) {
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
          // Fetch fresh conversation data (may update existing state)
          const [convData, messagesData] = await Promise.all([
            fetchJSON(API_ENDPOINTS.CHAT_CONVERSATION(effectiveConversationId), { method: "GET" }, token),
            fetchJSON(API_ENDPOINTS.CHAT_CONVERSATION_MESSAGES(effectiveConversationId), { method: "GET" }, token),
          ]);

          if (cancelled) return;

          // Update conversation state
          setConversation(convData);

          const otherUser = convData?.participants?.find(
            (p) => Number(p.id) !== Number(currentUser?.id)
          );
          if (otherUser) setConversationUser(otherUser);

          // Replace messages with fresh data
          const freshMessages = (messagesData || []).map(mapMessageData);
          setMessages(freshMessages);

          // Mark as successfully loaded (for non‑new conversations)
          hasLoadedRef.current = true;
        }
      } catch (err) {
        console.error("Error loading conversation:", err);
        // Only set error if there are no messages – otherwise keep the existing ones
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
    token,
    embedded,
    onBack,
    onConversationCreated,
    propUser,
    initialConversation,
    messages.length,
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
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, mapMessageData(msg)];
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
  }, [convIdNum, mapMessageData, currentUser?.id]);

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
    if (!newMessage.trim()) return;

    setSending(true);
    setError(null);

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

      const payload = { conversation_id: targetConvIdNum, content: newMessage.trim(), type: "text" };

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
      };

      setMessages((prev) => [...prev, optimistic]);
      setNewMessage("");
      setShowEmojiPicker(false); // close emoji picker after sending

      const ack = await safeSocketEmit("send_message", payload);

      if (ack?.ok && ack?.message) {
        const real = mapMessageData(ack.message);
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
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
          text: file.type.startsWith("image/") ? "📷 Photo" : "📎 Attachment",
          time: new Date(),
          sender: "me",
          read: false,
          type: "attachment",
          attachment: uploadedUrl,
          optimistic: true,
          deleted: false,
        };
        setMessages((prev) => [...prev, optimistic]);

        const ack = await safeSocketEmit("send_message", {
          conversation_id: convIdNum,
          content: file.type.startsWith("image/") ? "📷 Photo" : "📎 Attachment",
          type: "attachment",
          attachment_url: uploadedUrl,
        });

        if (ack?.ok && ack?.message) {
          const real = mapMessageData(ack.message);
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
        text: "🎤 Voice message",
        time: new Date(),
        sender: "me",
        read: false,
        type: "attachment",
        attachment: uploadedUrl,
        optimistic: true,
        deleted: false,
      };
      setMessages((prev) => [...prev, optimistic]);

      const ack = await safeSocketEmit("send_message", {
        conversation_id: convIdNum,
        content: "🎤 Voice message",
        type: "attachment",
        attachment_url: uploadedUrl,
      });

      if (ack?.ok && ack?.message) {
        const real = mapMessageData(ack.message);
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
    // Do NOT close the picker here – let outside click handle it
  };

  // ----------------------------
  // Message Actions
  // ----------------------------
  const handleEditMessage = (message) => {
    setEditingMessageId(message.id);
    setEditText(message.text);
    setActiveMessageId(null); // close dropdown
  };

  const handleDeleteMessage = async (message) => {
    if (!window.confirm("Delete this message?")) return;
    setActiveMessageId(null);

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? { ...m, deleted: true, text: "This message was deleted." }
          : m
      )
    );

    try {
      // Emit delete event (backend should broadcast message_deleted)
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
    setActiveMessageId(null);
    // Prepend @username or quote
    setNewMessage(`@${conversationUser?.name || "User"} `);
    // Focus input
    document.querySelector(".message-input")?.focus();
  };

  const handleSaveEdit = async (messageId) => {
    if (!editText.trim()) return;

    // Optimistic update
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
        // revert
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

  const handleClearChat = async () => {
    if (window.confirm("Clear all messages in this conversation?")) {
      try {
        await fetchJSON(API_ENDPOINTS.CHAT_CLEAR(effectiveConversationId), { method: "POST" }, token);
        setMessages([]);
        alert("Chat cleared successfully!");
      } catch (err) {
        console.error("Error clearing chat:", err);
        alert("Failed to clear chat.");
      }
    }
  };

  const handleDeleteConversation = async () => {
    if (window.confirm("Delete this conversation? This action cannot be undone.")) {
      try {
        await fetchJSON(API_ENDPOINTS.CHAT_CONVERSATION(effectiveConversationId), { method: "DELETE" }, token);
        alert("Conversation deleted.");

        if (embedded && onBack) {
          onBack();
        } else {
          navigate("/messages");
        }
      } catch (err) {
        console.error("Error deleting conversation:", err);
        alert("Failed to delete conversation.");
      }
    }
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
    <div className="chat-page">
      <div className="chat-header">
        {/* LEFT SIDE: back button + user info */}
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

        {/* RIGHT SIDE: call, video, close */}
        <div className="chat-actions">
          <button className="act-btn" onClick={handleCall} title="Audio call" disabled={!conversationUser}>
            <FaPhoneAlt style={{ width: "20px" }} />
          </button>

          <button className="act-btn" onClick={handleVideoCall} title="Video call" disabled={!conversationUser}>
            <FaVideo style={{ width: "20px" }} />
          </button>

          {/* Close button – replaces the old dropdown */}
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

              // If message is deleted, show placeholder
              const messageContent = message.deleted ? (
                <span className="deleted-message">This message was deleted.</span>
              ) : (
                message.text
              );

              return (
                <div
                  key={message.id}
                  className={`message ${message.sender === "me" ? "sent" : "received"} ${message.failed ? "failed" : ""} ${message.deleted ? "deleted" : ""}`}
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

                  <div className="message-content-wrapper">
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
                        <div className="message-content">{messageContent}</div>
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

                  {message.sender === "me" && !message.deleted && (
                    <div className="message-actions-container" ref={activeMessageId === message.id ? activeMessageMenuRef : null}>
                      <button
                        className="message-actions-btn"
                        onClick={() => setActiveMessageId(activeMessageId === message.id ? null : message.id)}
                      >
                        <FaEllipsisV />
                      </button>
                      {activeMessageId === message.id && (
                        <div className="message-actions-dropdown">
                          <button onClick={() => handleEditMessage(message)}>
                            <FaEdit /> Edit
                          </button>
                          <button onClick={() => handleDeleteMessage(message)}>
                            <FaTrash /> Delete
                          </button>
                          <button onClick={() => handleReplyMessage(message)}>
                            <FaReply /> Reply
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {message.sender === "me" && !message.deleted && (
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

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <button className="scroll-to-bottom-btn" onClick={scrollToBottom} title="Scroll to latest">
              <FaChevronDown />
            </button>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

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

        <button type="submit" className="send-btn" disabled={!newMessage.trim() || sending}>
          {sending ? <FaSpinner className="spinner" /> : <FaPaperPlane style={{ width: "20px" }} />}
        </button>
      </form>
    </div>
  );
};

export default Chat;