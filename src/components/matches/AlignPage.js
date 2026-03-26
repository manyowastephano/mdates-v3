import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Loading from '../common/Loading';
import { API_ENDPOINTS, fetchJSON } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { 
  FaChevronCircleLeft, 
  FaChevronCircleRight, 
  FaMapMarkedAlt, 
  FaRedo, 
  FaSpinner, 
  FaSync,
  FaBriefcase,
  FaGraduationCap,
  FaUserFriends,
  FaCheckCircle,
  FaHeart,
  FaTimes,
  FaComment
} from 'react-icons/fa';
import './styles/matches.css';
const getProfileAge = (profile) => {
  // If age is directly provided
  if (profile.age) return profile.age;

  // Try various possible birth date fields
  const dob = profile.date_of_birth || profile.birth_date || profile.dob || profile.birthday;
  if (dob) {
    const birthDate = new Date(dob);
    // Check if the date is valid
    if (!isNaN(birthDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    }
  }
  return null; // Age unknown
};
const AlignPage = () => {
  const [profiles, setProfiles] = useState([]);
  const [currentProfileIndex, setCurrentProfileIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMoreProfiles, setHasMoreProfiles] = useState(true);
  const [matchNotification, setMatchNotification] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { user, userId, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadProfiles();
  }, [isAuthenticated, navigate]);

  const loadProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJSON(API_ENDPOINTS.USERS, {
        method: 'GET',
      });
      
      const filteredProfiles = Array.isArray(data) 
        ? data.filter(profile => {
            const profileId = profile.id || profile.user_id || profile._id;
            const currentUserId = userId || user?.id || user?.user_id || user?._id;
            return profileId?.toString() !== currentUserId?.toString();
          })
        : [];
      
      setProfiles(filteredProfiles);
      setHasMoreProfiles(false); 
      setCurrentProfileIndex(0);
      
      if (filteredProfiles.length === 0) {
        setError('No profiles found. Try adjusting your preferences or check back later.');
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
      if (error.message === 'SESSION_EXPIRED') {
        navigate('/login');
      } else {
        setError('Failed to load profiles. Please check your connection and try again.');
      }
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreProfiles = async () => {
    if (!hasMoreProfiles || loading) return;
    
    setLoading(true);
    try {
      const data = await fetchJSON(`${API_ENDPOINTS.USERS}?page=${currentPage + 1}`, {
        method: 'GET',
      });
      
      if (Array.isArray(data)) {
        const currentUserId = userId || user?.id || user?.user_id || user?._id;
        const moreProfiles = data.filter(profile => {
          const profileId = profile.id || profile.user_id || profile._id;
          return profileId?.toString() !== currentUserId?.toString();
        });
        
        setProfiles(prev => [...prev, ...moreProfiles]);
        setCurrentPage(prev => prev + 1);
        
        if (moreProfiles.length === 0) {
          setHasMoreProfiles(false);
        }
      }
    } catch (error) {
      console.error('Error loading more profiles:', error);
      setError('Failed to load more profiles.');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (e) => {
    e.stopPropagation(); // Prevent parent card click
    const currentProfile = profiles[currentProfileIndex];
    if (!currentProfile) return;
    
    try {
      const result = await fetchJSON(API_ENDPOINTS.LIKES, {
        method: 'POST',
        body: JSON.stringify({
          target_user_id: currentProfile.id || currentProfile.user_id || currentProfile._id,
          action: 'like'
        })
      });
      
      if (result.is_match || result.match_created) {
        setMatchNotification({
          user1: { 
            name: "You", 
            color: "linear-gradient(135deg, #003A8F, #3b82f6)", 
            initials: "Y" 
          },
          user2: { 
           name: currentProfile.first_name || (currentProfile.name && currentProfile.name.split(' ')[0]) || 'User', 
            color: currentProfile.profile_picture ? 'transparent' : "linear-gradient(135deg, #8b5cf6, #ec4899)", 
            initials: (currentProfile.first_name || currentProfile.name || 'U').charAt(0) 
          },
          message: `You and ${currentProfile.first_name || currentProfile.name} have matched!`
        });
        
        setTimeout(() => {
          setMatchNotification(null);
        }, 3000);
      }
    } catch (error) {
      console.error('Error sending like:', error);
      alert('Failed to send like. Please try again.');
    }
    nextProfile();
  };

  const handlePass = async (e) => {
    e.stopPropagation(); // Prevent parent card click
    const currentProfile = profiles[currentProfileIndex];
    if (!currentProfile) return;
    
    try {
      await fetchJSON(API_ENDPOINTS.DISLIKES, {
        method: 'POST',
        body: JSON.stringify({
          target_user_id: currentProfile.id || currentProfile.user_id || currentProfile._id,
          action: 'dislike'
        })
      });
    } catch (error) {
      console.error('Error sending pass:', error);
    }
    
    nextProfile();
  };

  const handleMessage = async (e) => {
    e.stopPropagation(); // Prevent parent card click
    const currentProfile = profiles[currentProfileIndex];
    if (!currentProfile) return;
    
    const profileId = currentProfile.id || currentProfile.user_id || currentProfile._id;
    
    if (!profileId) {
      alert('Cannot message this user at the moment.');
      return;
    }
    
    try {
      const data = await fetchJSON(API_ENDPOINTS.CHAT_EXISTS(profileId), {
        method: 'GET',
      });
      
      if (data.conversation_id) {
        navigate(`/messages/${data.conversation_id}`);
      } else {
        navigate(`/messages/new`, { state: { user: currentProfile } });
      }
    } catch (error) {
      console.error('Error checking chat existence:', error);
      navigate('/messages');
    }
  };

  const nextProfile = () => {
    if (currentProfileIndex < profiles.length - 1) {
      setCurrentProfileIndex(prev => prev + 1);
    } else if (hasMoreProfiles) {
      loadMoreProfiles();
    } else {
      setCurrentProfileIndex(profiles.length);
    }
  };

  const previousProfile = () => {
    if (currentProfileIndex > 0) {
      setCurrentProfileIndex(prev => prev - 1);
    }
  };

  const resetProfiles = () => {
    setCurrentPage(1);
    loadProfiles();
  };

  const goToProfile = (profile) => {
    const profileId = profile.id || profile.user_id || profile._id;
    if (profileId) {
      navigate(`/profile/${profileId}`);
    } else {
      alert('Cannot view profile details at the moment.');
    }
  };

  const getDistanceText = (profile) => {
    if (!profile.distance) return 'Nearby';
    if (profile.distance < 1) return '< 1 km away';
    return `${Math.round(profile.distance)} km away`;
  };

  // Enhanced profile card component with safe data handling
  const EnhancedProfileCard = ({ profile, onLike, onPass, onMessage, onProfileClick }) => {
    const firstName = profile.first_name || (profile.name && profile.name.split(' ')[0]) || 'User';
    const age = getProfileAge(profile);
    const distanceText = getDistanceText(profile);
    const profilePicture = profile.profile_picture;
    
    // Safely handle fields that might not exist or be the wrong type
    const job = (profile.occupation || profile.job_title || '').toString();
    const education = (profile.education || '').toString();
    const bio = (profile.bio || '').toString();
    
    // Ensure interests is an array
    let interests = [];
    if (profile.interests) {
      if (Array.isArray(profile.interests)) {
        interests = profile.interests;
      } else if (typeof profile.interests === 'string') {
        // If it's a comma-separated string, split it
        interests = profile.interests.split(',').map(i => i.trim()).filter(i => i);
      }
    }

    return (
      <div className="enhanced-profile-card">
        <div className="card-image" onClick={() => onProfileClick(profile)}>
          {profilePicture ? (
            <img src={profilePicture} alt={firstName} />
          ) : (
            <div className="image-placeholder" />
          )}
          <div className="image-overlay">
            <div className="name-age">
              <h2>{firstName} {age ? `, ${age}` : '23'},</h2>
              <div className="distance-info">
                <FaMapMarkedAlt /> <h3>{distanceText}</h3>
              </div>
            </div>
            
            {job && (
              <div className="info-item">
                <FaGraduationCap />
                <span>{job}</span>
              </div>
            )}
            <div className="card-actions">
              <button className="action-btn pass" onClick={onPass}>
                <FaTimes /> <span>Pass</span>
              </button>
              <button className="action-btn like" onClick={onLike}>
                <FaHeart /> <span>Like</span>
              </button>
              <button className="action-btn message" onClick={onMessage}>
                <FaComment /> <span>Message</span>
              </button>
            </div>
          </div>
        </div> 
      </div>
    );
  };

  const currentProfile = profiles[currentProfileIndex];

  if (loading && profiles.length === 0) {
    return (
      <div className="align-page">
        <Loading message="Finding your perfect matches..." />
      </div>
    );
  }

  return (
    <div className="align-page">
      <div className="page-header">
        <div className="header-content">
          <h3>Find Your Match</h3>
          <p>Intent-based matching · Quality over quantity</p>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={loadProfiles} className="retry-btn">
            <FaSync /> Retry
          </button>
        </div>
      )}

      {matchNotification && (
        <div className="match-notification">
          <div className="match-avatars">
            <div 
              className="avatar"
              style={{ background: matchNotification.user1.color }}
            >
              {matchNotification.user1.initials}
            </div>
            <div 
              className="avatar"
              style={{ background: matchNotification.user2.color }}
            >
              {matchNotification.user2.initials}
            </div>
          </div>
          <div className="match-text">
            <h4>It's a match!</h4>
            <p>{matchNotification.message}</p>
          </div>
          <button 
            className="close-notification"
            onClick={() => setMatchNotification(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className="swipe-container">
        {currentProfile ? (
          <EnhancedProfileCard
            key={currentProfile.id || currentProfile.user_id || currentProfile._id}
            profile={currentProfile}
            onLike={handleLike}
            onPass={handlePass}
            onMessage={handleMessage}
            onProfileClick={goToProfile}
          />
        ) : (
          <div className="no-more-profiles">
            <div className="empty-state">
              <div className="empty-icon">💝</div>
              <h2>You've seen everyone!</h2>
              <p>Check back later for new matches in your area.</p>
              <div className="empty-actions">
                <button
                  className="auth-button secondary"
                  onClick={resetProfiles}
                >
                  <FaRedo /> Reset & Review
                </button>
                <button
                  className="auth-button"
                  onClick={loadMoreProfiles}
                  disabled={!hasMoreProfiles || loading}
                >
                  {loading ? (
                    <>
                      <FaSpinner /> Loading...
                    </>
                  ) : (
                    <>
                      <FaSync /> Load More
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlignPage;