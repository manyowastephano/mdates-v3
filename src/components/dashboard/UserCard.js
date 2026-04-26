import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaHeart,
  FaRegHeart,
  FaRegComment,
  FaBriefcase,
  FaCheckCircle,
  FaArrowRight,
} from 'react-icons/fa';
import './styles/UserCard.css';

/* ─────────────────────────────────────────────────
   UserCard — single card
───────────────────────────────────────────────── */
const UserCard = ({
  user = {},
  onClick,
  onLike,
  onMessage,
  onViewProfile,
  showDistance = true,
  isLiked = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [liked, setLiked] = useState(isLiked);
  const navigate = useNavigate();

  const merged = {
    id: 0,
    name: 'User',
    age: 25,
    job: 'Not specified',
    distance: null,
    initials: 'U',
    compatibility: null,
    interests: [],
    image: null,
    verified: false,
    ...user,
  };

  // Normalize interests — handles undefined, null, or comma-separated string
  const userData = {
    ...merged,
    interests: Array.isArray(merged.interests)
      ? merged.interests
      : typeof merged.interests === 'string' && merged.interests.trim()
        ? merged.interests.split(',').map((s) => s.trim())
        : [],
  };

  const handleViewProfile = (e) => {
    e.stopPropagation();
    if (onViewProfile) onViewProfile(userData);
    else navigate(`/user/${userData.id}`);
  };

  const handleLike = (e) => {
    e.stopPropagation();
    setLiked((p) => !p);
    if (onLike) onLike(userData.id);
  };

  const handleChat = (e) => {
    e.stopPropagation();
    if (onMessage) onMessage(userData);
  };

  const formatDistance = (d) => {
    if (!d) return '';
    if (typeof d === 'number')
      return d < 1
        ? `${Math.round(d * 1000)} m away`
        : `${d.toFixed(1)} km away`;
    return d;
  };

  return (
    <div
      className={`user-card${isHovered ? ' hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick ? () => onClick(userData) : undefined}
    >
      {/* ── Image ── */}
      <div className="user-image">
        {userData.image ? (
          <img src={userData.image} alt={userData.name} />
        ) : (
          <div className="avatar-placeholder">{userData.initials}</div>
        )}

        {/* Match % */}
        {userData.compatibility && (
          <div className="user-meta">
            <span className="math-badge">
              <FaHeart /> {userData.compatibility}%
            </span>
          </div>
        )}

        {/* Like / chat hover buttons */}
        <div className="quick-actions">
          <button
            className={`quick-action-btn${liked ? ' liked' : ''}`}
            onClick={handleLike}
            title={liked ? 'Unlike' : 'Like'}
          >
            {liked ? <FaHeart /> : <FaRegHeart />}
          </button>
          <button className="quick-action-btn" onClick={handleChat} title="Message">
            <FaRegComment />
          </button>
        </div>

        {/* Name + age + distance */}
        <div className="image-identity">
          <div className="image-identity-left">
            <h5>
              {userData.name}
              <span className="user-age">{userData.age}</span>
              {userData.verified && (
                <span className="verified-badge" title="Verified">
                  <FaCheckCircle />
                </span>
              )}
            </h5>
          </div>
          {showDistance && userData.distance && (
            <span className="distance-pill">{formatDistance(userData.distance)}</span>
          )}
        </div>
      </div>

      {/* ── Info (flex:1 fills remaining card height) ── */}
      <div className="user-info">
        <p className="user-job">
          <FaBriefcase /> {userData.job}
        </p>

        {userData.interests && userData.interests.length > 0 && (
          <>
            <hr className="card-divider" />
            <div className="user-interests">
              {userData.interests.slice(0, 3).map((tag, i) => (
                <span key={i} className="interest-tag">{tag}</span>
              ))}
            </div>
          </>
        )}

        {/* margin-top:auto pins button to bottom of info section */}
        <button className="view-profile-btn" onClick={handleViewProfile}>
          View Profile <FaArrowRight className="btn-icon" />
        </button>
      </div>
    </div>
  );
};

export default UserCard;

/* ─────────────────────────────────────────────────
   UserCardsGrid
   • > 1024px  → 3 columns
   • ≤ 1024px  → 2 columns
   • ≤  640px  → 2 compact columns
   • ≤  360px  → 1 column

   Usage:
     import { UserCardsGrid } from './UserCard';
     <UserCardsGrid users={myUsers} onLike={fn} onMessage={fn} onViewProfile={fn} />

   Or manually:
     <div className="user-cards-grid">
       {users.map(u => <UserCard key={u.id} user={u} />)}
     </div>
───────────────────────────────────────────────── */
export const UserCardsGrid = ({
  users = [],
  onLike,
  onMessage,
  onViewProfile,
  onClick,
}) => (
  <div className="user-cards-grid">
    {users.map((user) => (
      <UserCard
        key={user.id}
        user={user}
        onClick={onClick}
        onLike={onLike}
        onMessage={onMessage}
        onViewProfile={onViewProfile}
      />
    ))}
  </div>
);