import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  FaUser,
  FaImages,
  FaComment,
  FaHeart,
  FaStar,
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
} from 'react-icons/fa';
import UserAvatar from '../common/UserAvatar';
import Loading from '../common/Loading';
import { API_ENDPOINTS, fetchJSON } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import './styles/Profile.css';

// ✅ Safely parse a JSON string into an array
const parseJsonField = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const extractRelationshipGoal = (data) => {
  if (data.relationship_goals) {
    const goals = parseJsonField(data.relationship_goals);
    if (goals.length > 0) return goals[0];
  }
  // 2. Singular field (could be JSON string array like "[\"Goal\"]")
  if (data.relationship_goal) {
    const goal = data.relationship_goal;
    if (typeof goal === 'string' && goal.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(goal);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
      } catch { /* ignore */ }
    }
    return goal; // plain string
  }
  return null;      // not present at all
};

// ✅ Normalize a user object – parses all JSON strings
const normalizeUser = (raw) => {
  const interests = parseJsonField(raw.interests);
  const lookingFor = parseJsonField(raw.looking_for);
  const relationshipGoal = extractRelationshipGoal(raw);

  return {
    ...raw,
    interests,
    lookingFor,
    relationshipGoal,           // may be null if not found
    personality: raw.personality || raw.personality_type || 'Not specified',
    job: raw.occupation || raw.job || 'Not specified',
    location: raw.city || raw.location || raw.address || 'Not specified',
    gender: raw.gender || 'Not specified',
    education: raw.education || raw.education_level || 'Not specified',
  };
};

// ✅ Build image list (same as before)
const extractAllImages = (user) => {
  const urls = [];
  if (Array.isArray(user?.photos)) {
    urls.push(...user.photos.map((p) => p?.image_url).filter(Boolean));
  }
  if (Array.isArray(user?.images)) {
    urls.push(...user.images);
  }
  const single = user?.profile_image || user?.profile_picture || user?.image;
  if (single) urls.push(single);
  const unique = Array.from(new Set(urls.filter(Boolean)));

  if (unique.length === 0) {
    return [
      {
        id: 'fallback',
        color: 'linear-gradient(135deg, #003A8F, #60a5fa)',
        isGradient: true,
      },
    ];
  }
  return unique.map((url) => ({ url, id: url }));
};

const UserProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();

  // Start with the user from navigation state (if any)
  const stateUser = location.state?.user;
  const [user, setUser] = useState(stateUser ? normalizeUser(stateUser) : null);
  const [loading, setLoading] = useState(!stateUser);
  const [error, setError] = useState(null);
  const [images, setImages] = useState(stateUser ? extractAllImages(stateUser) : []);
  const [activeTab, setActiveTab] = useState('details');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);

  useEffect(() => {
    // If we have a complete user from state (and the goal is not missing), we don't need to fetch.
    const needsFetch = !stateUser || (stateUser && extractRelationshipGoal(stateUser) === null);

    if (!needsFetch) {
      setLoading(false);
      return;
    }

    // Fetch full profile from the API
    const loadFullProfile = async () => {
      if (!token) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      try {
        const data = await fetchJSON(
          API_ENDPOINTS.USER_PROFILE(userId),
          { method: 'GET' },
          token
        );
        const norm = normalizeUser(data);
        setUser(norm);
        setImages(extractAllImages(norm));
      } catch (err) {
        console.error('Error loading user profile:', err);
        // If the fetch fails, keep whatever we already have (state user or null)
        if (!stateUser) {
          setError('Profile not found');
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    loadFullProfile();
  }, [userId, token, stateUser]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedPhotoIndex === null) return;
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'Escape') closePhotoViewer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhotoIndex]);

  const handleStartConversation = () => {
    if (!user) return;
    navigate('/messages/new', { state: { user } });
  };

  const handleBackClick = () => navigate(-1);

  const openPhotoViewer = (index) => setSelectedPhotoIndex(index);
  const closePhotoViewer = () => setSelectedPhotoIndex(null);
  const goToNext = () => setSelectedPhotoIndex((prev) => (prev + 1) % images.length);
  const goToPrev = () => setSelectedPhotoIndex((prev) => (prev - 1 < 0 ? images.length - 1 : prev - 1));

  // ---------- RENDER ----------
  const renderDetailsTab = () => (
    <div className="profile-tab-content">
      <div className="profile-bio-section">
        <h3>About Me</h3>
        <p className="bio-text">{user.bio || "This user hasn't added a bio yet."}</p>
      </div>

      <div className="profile-details-section">
        <h3>Details</h3>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Age</span>
            <span className="detail-value">{user.age || '—'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Gender</span>
            <span className="detail-value">{user.gender || '—'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Location</span>
            <span className="detail-value">{user.location || '—'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Occupation</span>
            <span className="detail-value">{user.job || '—'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Relationship Goal</span>
            <span className="detail-value">
              {user.relationshipGoal || 'Not specified'}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Personality</span>
            <span className="detail-value">{user.personality || '—'}</span>
          </div>
        </div>
      </div>

      {user.interests && user.interests.length > 0 && (
        <div className="profile-interests-section">
          <h3>Interests</h3>
          <div className="interests-grid">
            {user.interests.map((interest, index) => (
              <div key={index} className="interest-item">{interest}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderPhotosTab = () => (
    <div className="photos-tab-content">
      <div className="photos-grid">
        {images.map((img, index) => (
          <div
            key={img.id || index}
            className={`photo-item ${img.url ? 'clickable' : ''}`}
            onClick={img.url ? () => openPhotoViewer(index) : undefined}
          >
            <div
              className="photo-preview"
              style={
                img.isGradient
                  ? { background: img.color }
                  : {
                      backgroundImage: `url(${img.url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
              }
            >
              {index === 0 && (
                <div className="primary-badge"><FaStar /> Primary</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {images.length === 0 && (
        <div className="photos-info"><p>No photos available.</p></div>
      )}
    </div>
  );

  if (loading) {
    return <div className="profile-page"><Loading message="Loading profile..." /></div>;
  }

  if (error || !user) {
    return (
      <div className="profile-page">
        <div className="profile-error">
          <h2>Profile not found</h2>
          <p>{error || 'The user profile could not be loaded.'}</p>
          <button className="back-btn" onClick={handleBackClick}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page user-profile">
      <div className="profile-header">
        <div className="header-left">
          <div className="profile-avatar-large">
            <UserAvatar user={user} size={80} />
          </div>
          <div className="profile-info">
            <h1>{user.name}{user.age ? `, ${user.age}` : ''}</h1>
            <p>{user.job || '—'} · {user.location || '—'}</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary icon-only" onClick={handleStartConversation} aria-label="Start chat">
            <FaComment />
          </button>
          <button className="btn btn-secondary icon-only" onClick={() => alert('Like functionality goes here')} aria-label="Like this user">
            <FaHeart />
          </button>
        </div>
      </div>

      <div className="profile-tabs">
        <div className="tabs-navigation">
          <button className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
            <FaUser /> Details
          </button>
          <button className={`tab-btn ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}>
            <FaImages /> Photos ({images.length})
          </button>
        </div>
        <div className="tabs-content">
          {activeTab === 'details' ? renderDetailsTab() : renderPhotosTab()}
        </div>
      </div>

      {selectedPhotoIndex !== null && images[selectedPhotoIndex]?.url && (
        <div className="photo-viewer-overlay" onClick={closePhotoViewer}>
          <div className="photo-viewer-content" onClick={(e) => e.stopPropagation()}>
            <button className="photo-viewer-close" onClick={closePhotoViewer} aria-label="Close viewer"><FaTimes /></button>
            <button className="photo-viewer-nav prev" onClick={goToPrev} aria-label="Previous photo"><FaChevronLeft /></button>
            <img src={images[selectedPhotoIndex].url} alt={`User photo ${selectedPhotoIndex + 1}`} />
            <button className="photo-viewer-nav next" onClick={goToNext} aria-label="Next photo"><FaChevronRight /></button>
            <div className="photo-counter">{selectedPhotoIndex + 1} / {images.length}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;