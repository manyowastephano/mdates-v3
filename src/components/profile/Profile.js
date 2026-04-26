import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  FaUser,
  FaImages,
  FaSlidersH,
  FaEdit,
  FaCog,
  FaStar,
  FaTrash,
  FaPlus,
  FaInfoCircle,
  FaCamera,
  FaTimes,
  FaCheck,
  FaChevronLeft,
  FaChevronRight,
  FaEye,
} from 'react-icons/fa';
import UserAvatar from '../common/UserAvatar';
import Loading from '../common/Loading';
import { API_ENDPOINTS, fetchJSON, fetchFormData } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import './styles/Profile.css';

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

// ✅ Calculate real age from birthdate string
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

const Profile = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [stats, setStats] = useState({
    matches: 0,
    likes: 0,
    compatibility: 0,
    visitors: 0,
  });
  const [photos, setPhotos] = useState([]);
  const [interests, setInterests] = useState([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);
  const navigate = useNavigate();
  const { user: currentUser, isAuthenticated, updateUser } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    loadUserProfile();
    loadUserStats();
    loadUserPhotos();
  }, [isAuthenticated, navigate]);

  // Keyboard navigation for photo viewer
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

  const loadUserProfile = async () => {
    setLoading(true);
    try {
      const data = await fetchJSON(API_ENDPOINTS.PROFILE, { method: 'GET' });

      // ✅ Parse interests (stored as JSON string)
      const safeInterests = parseJsonField(data.interests);

      // ✅ Parse looking_for
      const parsedLookingFor = parseJsonField(data.looking_for);

      // ✅ Parse relationship_goals (could be JSON string array)
      const parsedGoals = parseJsonField(data.relationship_goals, []);
      const relationshipGoal = parsedGoals.length > 0
        ? parsedGoals[0]
        : data.relationship_goal || 'Not specified';

      // ✅ Real age: prefer explicit age, else compute from birthdate
      const realAge = (typeof data.age === 'number' && !isNaN(data.age))
        ? data.age
        : calcAgeFromBirthdate(data.birthdate) ?? 20;

      const mappedUser = {
        id: data.id,
        name: data.first_name || data.username || data.name || 'User',
        age: realAge,
        job: data.occupation || data.job || 'Not specified',
        education: data.education || '',
        location: data.location || 'Unknown',
        bio: data.bio || 'Looking for meaningful connections',
        image: data.profile_picture || null,
        avatarColor: data.avatar_color || 'linear-gradient(135deg, #003A8F, #3b82f6)',
        initials: getInitials(data.first_name || data.username || 'User'),
        gender: data.gender || 'Not specified',
        relationshipGoal: relationshipGoal,
        personality: data.personality || 'Ambivert',
        preferences: {
          ageRange: {
            min: data.age_min || 24,
            max: data.age_max || 35,
          },
          distance: data.max_distance || 30,
          lookingFor: parsedLookingFor,
          discoverable: data.discoverable || true,
          notifications: data.notifications || true,
        },
        verification: {
          email: data.email_verified || false,
          phone: data.phone_verified || false,
          photo: data.photo_verified || false,
          education: data.education_verified || false,
        },
        memberSince: new Date(data.date_joined || data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      };

      setUser(mappedUser);
      setInterests(safeInterests);
    } catch (error) {
      console.error('Error loading profile:', error);
      if (error.message === 'SESSION_EXPIRED') {
        navigate('/login');
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed to load profile',
          text: 'Please try again later.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const loadUserStats = async () => {
    try {
      const data = await fetchJSON(API_ENDPOINTS.USER_STATS, { method: 'GET' });
      setStats({
        matches: data.matches || 0,
        likes: data.likes || 0,
        compatibility: data.compatibility || 0,
        visitors: data.visitors || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadUserPhotos = async () => {
    try {
      const data = await fetchJSON(API_ENDPOINTS.USER_PHOTOS, { method: 'GET' });
      const mappedPhotos = data.map((photo) => ({
        id: photo.id,
        url: photo.image_url,
        color: getRandomColor(),
        isPrimary: photo.is_primary || false,
      }));
      setPhotos(mappedPhotos);
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getRandomColor = () => {
    const colors = [
      '#003A8F', '#a78bfa', '#10b981', '#3b82f6',
      '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const handleEditProfile = () => setEditMode(true);

  const handleSaveProfile = async (updatedData) => {
    try {
      const completePayload = {
        first_name: updatedData.name.split(' ')[0],
        last_name: updatedData.name.split(' ').slice(1).join(' ') || '',
        age: updatedData.age,
        occupation: updatedData.job,
        education: updatedData.education || '',
        location: updatedData.location || '',
        bio: updatedData.bio,
        gender: updatedData.gender,
        relationship_goals: JSON.stringify([updatedData.relationshipGoal]), // backend expects array
        personality: updatedData.personality,
        interests: JSON.stringify(interests),                 // array → string
        age_min: user.preferences.ageRange.min,
        age_max: user.preferences.ageRange.max,
        max_distance: user.preferences.distance,
        looking_for: JSON.stringify(user.preferences.lookingFor),
        notifications: user.preferences.notifications,
        discoverable: user.preferences.discoverable,
      };

      console.log('Saving profile with:', completePayload);

      const data = await fetchJSON(API_ENDPOINTS.PROFILE, {
        method: 'PUT',
        body: JSON.stringify(completePayload),
      });

      setUser(updatedData);
      setEditMode(false);
      updateUser(completePayload);

      Swal.fire({
        icon: 'success',
        title: 'Profile updated',
        text: 'Your changes have been saved.',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      Swal.fire({
        icon: 'error',
        title: 'Update failed',
        text: error.message || 'Please try again.',
      });
    }
  };

  const handleAddPhoto = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        Swal.fire({ icon: 'warning', title: 'File too large', text: 'Image must be less than 10MB.' });
        return;
      }
      const formData = new FormData();
      formData.append('image', file);
      formData.append('is_primary', false);
      try {
        const newPhoto = await fetchFormData(API_ENDPOINTS.UPLOAD_PHOTO, formData, { method: 'POST' });
        setPhotos((prev) => [
          ...prev,
          { id: newPhoto.id, url: newPhoto.image_url, color: getRandomColor(), isPrimary: false },
        ]);
        Swal.fire({ icon: 'success', title: 'Photo uploaded', timer: 2000, showConfirmButton: false });
      } catch (error) {
        console.error('Error uploading photo:', error);
        Swal.fire({ icon: 'error', title: 'Upload failed', text: 'Please try again.' });
      }
    };
    input.click();
  };

  const handleSetPrimaryPhoto = async (photoId) => {
    try {
      await fetchJSON(`${API_ENDPOINTS.USER_PHOTOS}${photoId}/set_primary/`, { method: 'PATCH' });
      setPhotos((prev) => prev.map((p) => ({ ...p, isPrimary: p.id === photoId })));
      Swal.fire({ icon: 'success', title: 'Primary photo updated', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error('Error setting primary photo:', error);
      Swal.fire({ icon: 'error', title: 'Failed to update', text: 'Please try again.' });
    }
  };

  const handleRemovePhoto = async (photoId) => {
    if (photos.length <= 1) {
      Swal.fire({ icon: 'warning', title: 'Cannot remove', text: 'You must keep at least one photo.' });
      return;
    }
    const result = await Swal.fire({
      title: 'Remove photo?',
      text: 'Are you sure?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, remove it',
    });
    if (!result.isConfirmed) return;
    try {
      await fetchJSON(`${API_ENDPOINTS.USER_PHOTOS}${photoId}/`, { method: 'DELETE' });
      setPhotos((prev) => {
        const updated = prev.filter((p) => p.id !== photoId);
        if (!updated.some((p) => p.isPrimary) && updated.length > 0) {
          updated[0].isPrimary = true;
        }
        return updated;
      });
      Swal.fire({ icon: 'success', title: 'Photo removed', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error('Error removing photo:', error);
      Swal.fire({ icon: 'error', title: 'Removal failed', text: 'Please try again.' });
    }
  };

  // ✅ Fixed: Add interest via profile endpoint (as string)
  const handleAddInterest = async () => {
    const { value: interest } = await Swal.fire({
      title: 'Add a new interest',
      input: 'text',
      inputPlaceholder: 'e.g., Hiking, Photography',
      showCancelButton: true,
      inputValidator: (value) => { if (!value) return 'You need to write something!'; },
    });
    if (interest && interest.trim()) {
      const trimmed = interest.trim();
      if (interests.includes(trimmed)) {
        Swal.fire({ icon: 'info', title: 'Already exists', text: 'This interest is already in your list.' });
        return;
      }
      const newInterests = [...interests, trimmed];
      setInterests(newInterests);
      try {
        await fetchJSON(API_ENDPOINTS.PROFILE, {
          method: 'PUT',
          body: JSON.stringify({ interests: JSON.stringify(newInterests) }),
        });
      } catch (error) {
        console.error('Error adding interest:', error);
        setInterests(interests); // revert
        Swal.fire({ icon: 'error', title: 'Failed to add interest', text: error.message || 'Please try again.' });
      }
    }
  };

  // ✅ Fixed: Remove interest via profile endpoint (as string)
  const handleRemoveInterest = async (interestToRemove) => {
    const result = await Swal.fire({
      title: 'Remove interest?',
      text: `Remove "${interestToRemove}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, remove it',
    });
    if (!result.isConfirmed) return;
    const newInterests = interests.filter((i) => i !== interestToRemove);
    setInterests(newInterests);
    try {
      await fetchJSON(API_ENDPOINTS.PROFILE, {
        method: 'PUT',
        body: JSON.stringify({ interests: JSON.stringify(newInterests) }),
      });
    } catch (error) {
      console.error('Error removing interest:', error);
      setInterests(interests); // revert
      Swal.fire({ icon: 'error', title: 'Failed to remove', text: error.message || 'Please try again.' });
    }
  };

  // Photo viewer handlers
  const openPhotoViewer = (index) => setSelectedPhotoIndex(index);
  const closePhotoViewer = () => setSelectedPhotoIndex(null);
  const goToNext = () => setSelectedPhotoIndex((prev) => (prev + 1) % photos.length);
  const goToPrev = () => setSelectedPhotoIndex((prev) => (prev - 1 < 0 ? photos.length - 1 : prev - 1));

  // Tab renderers (unchanged except they now use the already fixed state)
  const renderProfileTab = () => (
    <div className="profile-tab-content">
      <div className="profile-bio-section">
        <h3>About Me</h3>
        {editMode ? (
          <textarea
            className="form-textarea"
            value={user.bio}
            onChange={(e) => setUser({ ...user, bio: e.target.value })}
            rows={4}
          />
        ) : (
          <p className="bio-text">{user.bio}</p>
        )}
      </div>

      <div className="profile-details-section">
        <h3>Details</h3>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Age</span>
            {editMode ? (
              <input
                type="number"
                className="form-input"
                value={user.age}
                onChange={(e) => setUser({ ...user, age: parseInt(e.target.value) || user.age })}
              />
            ) : (
              <span className="detail-value">{user.age}</span>
            )}
          </div>
          <div className="detail-item">
            <span className="detail-label">Gender</span>
            {editMode ? (
              <select
                className="form-input"
                value={user.gender}
                onChange={(e) => setUser({ ...user, gender: e.target.value })}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            ) : (
              <span className="detail-value">{user.gender}</span>
            )}
          </div>
          <div className="detail-item">
            <span className="detail-label">Location</span>
            {editMode ? (
              <input
                type="text"
                className="form-input"
                value={user.location}
                onChange={(e) => setUser({ ...user, location: e.target.value })}
              />
            ) : (
              <span className="detail-value">{user.location}</span>
            )}
          </div>
          <div className="detail-item">
            <span className="detail-label">Occupation</span>
            {editMode ? (
              <input
                type="text"
                className="form-input"
                value={user.job}
                onChange={(e) => setUser({ ...user, job: e.target.value })}
              />
            ) : (
              <span className="detail-value">{user.job}</span>
            )}
          </div>
          <div className="detail-item">
            <span className="detail-label">Relationship Goal</span>
            {editMode ? (
              <select
                className="form-input"
                value={user.relationshipGoal}
                onChange={(e) => setUser({ ...user, relationshipGoal: e.target.value })}
              >
                <option value="Long-term relationship">Long-term relationship</option>
                <option value="Casual dating">Casual dating</option>
                <option value="New friends">New friends</option>
                <option value="Marriage">Marriage</option>
              </select>
            ) : (
              <span className="detail-value">{user.relationshipGoal}</span>
            )}
          </div>
          <div className="detail-item">
            <span className="detail-label">Personality</span>
            {editMode ? (
              <select
                className="form-input"
                value={user.personality}
                onChange={(e) => setUser({ ...user, personality: e.target.value })}
              >
                <option value="Introvert">Introvert</option>
                <option value="Extrovert">Extrovert</option>
                <option value="Ambivert">Ambivert</option>
              </select>
            ) : (
              <span className="detail-value">{user.personality}</span>
            )}
          </div>
          <div className="detail-item">
            <span className="detail-label">Member Since</span>
            <span className="detail-value">{user.memberSince}</span>
          </div>
        </div>
      </div>

      <div className="profile-interests-section">
        <h3>My Interests</h3>
        <div className="interests-grid">
          {interests.map((interest, index) => (
            <div key={index} className="interest-item">
              {interest}
              {editMode && (
                <button className="remove-interest" onClick={() => handleRemoveInterest(interest)}>
                  ×
                </button>
              )}
            </div>
          ))}
          {editMode && (
            <button className="add-interest-btn" onClick={handleAddInterest}>
              <FaPlus /> Add Interest
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderPhotosTab = () => (
    <div className="photos-tab-content">
      <div className="photos-header"><h3>My Photos</h3></div>
      <div className="photos-grid">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            className="photo-item clickable-photo"
            onClick={photo.url ? () => openPhotoViewer(index) : undefined}
          >
            <div
              className="photo-preview"
              style={{ background: photo.url ? `url(${photo.url}) center/cover no-repeat` : photo.color }}
            >
              {photo.isPrimary && <div className="primary-badge"><FaStar /> Primary</div>}
              {photo.url && <div className="photo-view-icon"><FaEye /></div>}
              <div className="photo-actions" onClick={(e) => e.stopPropagation()}>
                <button className="photo-action-btn" onClick={() => handleSetPrimaryPhoto(photo.id)} disabled={photo.isPrimary} title="Set as primary"><FaStar /></button>
                <button className="photo-action-btn" onClick={() => handleRemovePhoto(photo.id)} title="Remove photo"><FaTrash /></button>
              </div>
            </div>
          </div>
        ))}
        {photos.length < 6 && (
          <div className="photo-item add-photo" onClick={handleAddPhoto}>
            <div className="add-photo-content"><FaPlus /><span>Add Photo</span></div>
          </div>
        )}
      </div>
      <div className="photos-info">
        <p><FaInfoCircle /> You can upload up to 6 photos. <strong>Click any photo to view larger.</strong></p>
      </div>
    </div>
  );

  const renderPreferencesTab = () => (
    <div className="preferences-tab-content">
      <div className="preferences-section">
        <h3>Discovery Preferences</h3>
        <div className="preference-item">
          <label>Age Range</label>
          <div className="age-range-display"><span>{user.preferences.ageRange.min} - {user.preferences.ageRange.max} years</span></div>
        </div>
        <div className="preference-item">
          <label>Maximum Distance</label>
          <div className="distance-display"><span>Within {user.preferences.distance} km</span></div>
        </div>
        <div className="preference-item">
          <label>Looking For</label>
          <div className="looking-for-display">
            {user.preferences.lookingFor.map((gender, index) => (
              <span key={index} className="gender-tag">{gender}</span>
            ))}
          </div>
        </div>
        <div className="preference-item">
          <label>
            <input type="checkbox" checked={user.preferences.discoverable} onChange={(e) => setUser({ ...user, preferences: { ...user.preferences, discoverable: e.target.checked } })} />
            Make my profile discoverable
          </label>
        </div>
        <div className="preference-item">
          <label>
            <input type="checkbox" checked={user.preferences.notifications} onChange={(e) => setUser({ ...user, preferences: { ...user.preferences, notifications: e.target.checked } })} />
            Receive match notifications
          </label>
        </div>
      </div>
      <div className="privacy-section">
        <h3>Privacy Settings</h3>
        <p className="privacy-note">Privacy settings are managed in the Settings page.</p>
        <button className="btn btn-secondary" onClick={() => navigate('/settings')}><FaCog /> Go to Settings</button>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile': return renderProfileTab();
      case 'photos': return renderPhotosTab();
      case 'preferences': return renderPreferencesTab();
      default: return renderProfileTab();
    }
  };

  if (loading || !user) {
    return <Loading message="Loading your profile..." />;
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="header-left">
          <div className="profile-avatar-large">
            <UserAvatar user={user} size={80} />
            <button className="avatar-edit-btn" onClick={handleAddPhoto} title="Change photo"><FaCamera /></button>
          </div>
          <div className="profile-info">
            <h1>{user.name}, {user.age}</h1>
            <p>{user.job} · {user.location}</p>
            <div className="profile-stats">
              <div className="stat"><div className="stat-value">{stats.matches}</div><div className="stat-label">Matches</div></div>
              <div className="stat"><div className="stat-value">{stats.likes}</div><div className="stat-label">Likes</div></div>
              <div className="stat"><div className="stat-value">{stats.compatibility}%</div><div className="stat-label">Compatibility</div></div>
              <div className="stat"><div className="stat-value">{stats.visitors}</div><div className="stat-label">Visitors</div></div>
            </div>
          </div>
        </div>
        <div className="header-actions">
          {editMode ? (
            <div className="edit-actions">
              <button className="btn btn-secondary icon-only" onClick={() => setEditMode(false)} aria-label="Cancel editing"><FaTimes /></button>
              <button className="btn btn-primary icon-only" onClick={() => handleSaveProfile(user)} aria-label="Save changes"><FaCheck /></button>
            </div>
          ) : (
            <button className="btn btn-primary icon-only" onClick={handleEditProfile} aria-label="Edit profile"><FaEdit /></button>
          )}
          <button className="btn btn-secondary icon-only" onClick={() => navigate('/settings')} aria-label="Settings"><FaCog /></button>
        </div>
      </div>

      <div className="profile-tabs">
        <div className="tabs-navigation">
          <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}><FaUser /> Details</button>
          <button className={`tab-btn ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}><FaImages /> Photos ({photos.length}/6)</button>
          <button className={`tab-btn ${activeTab === 'preferences' ? 'active' : ''}`} onClick={() => setActiveTab('preferences')}><FaSlidersH /> Preferences</button>
        </div>
        <div className="tabs-content">{renderTabContent()}</div>
      </div>

      {/* PHOTO VIEWER MODAL */}
      {selectedPhotoIndex !== null && photos[selectedPhotoIndex]?.url && (
        <div className="photo-viewer-overlay" onClick={closePhotoViewer}>
          <div className="photo-viewer-content" onClick={(e) => e.stopPropagation()}>
            <button className="photo-viewer-close" onClick={closePhotoViewer} aria-label="Close viewer"><FaTimes /></button>
            <button className="photo-viewer-nav prev" onClick={goToPrev} aria-label="Previous photo"><FaChevronLeft /></button>
            <img src={photos[selectedPhotoIndex].url} alt={`User photo ${selectedPhotoIndex + 1}`} />
            <button className="photo-viewer-nav next" onClick={goToNext} aria-label="Next photo"><FaChevronRight /></button>
            <div className="photo-counter">{selectedPhotoIndex + 1} / {photos.length}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;