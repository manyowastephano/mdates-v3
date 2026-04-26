import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, fetchJSON } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import './styles/Settings.css';

const Settings = () => {
  const [activeSection, setActiveSection] = useState('privacy');
  const [settings, setSettings] = useState({
    privacy: {
      profileVisibility: 'everyone',
      showOnlineStatus: true,
      showDistance: true,
      showLastActive: true,
      allowScreenshots: false,
      dataSharing: false
    },
    security: {
      twoFactorAuth: false,
      loginAlerts: true,
      sessionTimeout: 30
    },
    subscription: {
  currentPlan: 'Free',
  status: 'Active',
  nextBilling: 'N/A',
  plans: []
}

    
  });
  const [loading, setLoading] = useState(true);
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchSettings();
  }, [isAuthenticated, navigate]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      // Fetch privacy settings
      const privacyData = await fetchJSON(API_ENDPOINTS.PRIVACY_SETTINGS, {
        method: 'GET',
      });
      
      setSettings(prev => ({
        ...prev,
        privacy: {
          ...prev.privacy,
          ...privacyData
        }
      }));

      // Fetch security settings
      const securityData = await fetchJSON(API_ENDPOINTS.SECURITY_SETTINGS, {
        method: 'GET',
      });
      
      setSettings(prev => ({
        ...prev,
        security: {
          ...prev.security,
          ...securityData
        }
      }));

      // Fetch subscription info
      const subscriptionData = await fetchJSON(API_ENDPOINTS.SUBSCRIPTION_INFO, {
        method: 'GET',
      });
      
      setSettings(prev => ({
  ...prev,
  subscription: {
    currentPlan: subscriptionData.currentPlan,
    status: subscriptionData.status,
    nextBilling: subscriptionData.nextBilling,
    plans: subscriptionData.plans || []
  }
}));


    } catch (error) {
      console.error('Error fetching settings:', error);
      if (error.message === 'SESSION_EXPIRED') {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await logout();
    }
  };

  const handleDeleteAccount = async () => {
    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      const reason = prompt('Please tell us why you\'re leaving (optional):');
      
      try {
        await fetchJSON(API_ENDPOINTS.DELETE_ACCOUNT, {
          method: 'DELETE',
          body: JSON.stringify({ reason: reason || '' })
        });

        alert('Account deleted successfully.');
        await logout();
      } catch (error) {
        console.error('Error deleting account:', error);
        alert('Failed to delete account. Please try again.');
      }
    }
  };

  const handleClearData = async () => {
    if (window.confirm('This will clear all your chat history and match data. This action cannot be undone.')) {
      try {
        await fetchJSON(API_ENDPOINTS.CLEAR_DATA, {
          method: 'POST',
        });

        alert('Data cleared successfully.');
      } catch (error) {
        console.error('Error clearing data:', error);
        alert('Failed to clear data. Please try again.');
      }
    }
  };

  const handleToggleSetting = async (section, key) => {
    const newValue = !settings[section][key];
    
    // Optimistically update UI
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: newValue
      }
    }));

    try {
      // Update on backend
      const endpoint = section === 'privacy' ? API_ENDPOINTS.PRIVACY_SETTINGS : API_ENDPOINTS.SECURITY_SETTINGS;
      await fetchJSON(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: newValue })
      });
    } catch (error) {
      console.error('Error updating setting:', error);
      // Revert if failed
      setSettings(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          [key]: !newValue
        }
      }));
      alert('Failed to update setting. Please try again.');
    }
  };

  const handleUpdateSetting = async (section, key, value) => {
    
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));

    try {
      
      const endpoint = section === 'privacy' ? API_ENDPOINTS.PRIVACY_SETTINGS : API_ENDPOINTS.SECURITY_SETTINGS;
      await fetchJSON(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value })
      });
    } catch (error) {
      console.error('Error updating setting:', error);
      alert('Failed to update setting. Please try again.');
    }
  };

  const handleChangePassword = async () => {
    const currentPassword = prompt('Enter current password:');
    const newPassword = prompt('Enter new password:');
    const confirmPassword = prompt('Confirm new password:');

    if (!currentPassword || !newPassword || !confirmPassword) {
      alert('All fields are required.');
      return;
    }

    if (newPassword.length < 8) {
      alert('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('New passwords do not match.');
      return;
    }

    try {
      const response = await fetchJSON(API_ENDPOINTS.CHANGE_PASSWORD, {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword
        })
      });

      if (response.success) {
        alert('Password changed successfully.');
      } else {
        alert(response.error || 'Failed to change password.');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      alert('Failed to change password. Please try again.');
    }
  };

  // Section titles for navigation
  const sections = [
    { id: 'privacy', title: 'Privacy & Safety', icon: 'fas fa-lock' },
    { id: 'security', title: 'Security', icon: 'fas fa-shield-alt' },
    { id: 'subscription', title: 'Subscription', icon: 'fas fa-crown' },
    { id: 'about', title: 'About & Support', icon: 'fas fa-info-circle' },
  ];

  const getSectionIcon = (sectionId) => {
    const section = sections.find(s => s.id === sectionId);
    return section ? section.icon : 'fas fa-cog';
  };

  const getSectionTitle = (sectionId) => {
    const section = sections.find(s => s.id === sectionId);
    return section ? section.title : 'Settings';
  };

  const renderPrivacySection = () => (
    <div className="settings-section-content">
      <div className="settings-group">
        <div className="settings-group-header">
          <h4><i className="fas fa-eye"></i> Profile Visibility</h4>
          <p>Control who can see your profile information</p>
        </div>
        
        <div className="settings-card">
          <div className="settings-item">
            <div className="settings-item-info">
              <i className="fas fa-user-friends"></i>
              <div>
                <h5>Profile Visibility</h5>
                <p>Who can see your profile</p>
              </div>
            </div>
            <select 
              className="settings-select"
              value={settings.privacy.profileVisibility}
              onChange={(e) => handleUpdateSetting('privacy', 'profileVisibility', e.target.value)}
            >
              <option value="everyone">Everyone</option>
              <option value="liked">Only people I've liked</option>
              <option value="matches">Only my matches</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">
          <h4><i className="fas fa-shield-alt"></i> Privacy Settings</h4>
        </div>
        
        <div className="settings-card">
          {Object.entries(settings.privacy).map(([key, value]) => {
            if (key === 'profileVisibility') return null;
            
            const labels = {
              showOnlineStatus: 'Show Online Status',
              showDistance: 'Show Distance',
              showLastActive: 'Show Last Active',
              allowScreenshots: 'Allow Screenshots',
              dataSharing: 'Data Sharing'
            };
            
            const descriptions = {
              showOnlineStatus: 'Let others see when you\'re online',
              showDistance: 'Let others see your approximate distance',
              showLastActive: 'Let others see when you were last active',
              allowScreenshots: 'Allow others to take screenshots of your profile',
              dataSharing: 'Allow anonymous data sharing for improvements'
            };
            
            return (
              <div key={key} className="settings-toggle-item">
                <div className="toggle-info">
                  <h5>{labels[key]}</h5>
                  <p>{descriptions[key]}</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={() => handleToggleSetting('privacy', key)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">
          <h4><i className="fas fa-trash-alt"></i> Data Management</h4>
        </div>
        
        <div className="settings-card danger-zone">
          <div className="settings-action-item">
            <div className="settings-item-info">
              <i className="fas fa-trash" style={{color: '#dc2626'}}></i>
              <div>
                <h5>Clear Chat History</h5>
                <p>Delete all your message history</p>
              </div>
            </div>
            <button className="settings-action-btn danger" onClick={handleClearData}>
              Clear
            </button>
          </div>
          
          <div className="settings-action-item">
            <div className="settings-item-info">
              <i className="fas fa-user-slash" style={{color: '#dc2626'}}></i>
              <div>
                <h5>Delete Account</h5>
                <p>Permanently delete your account</p>
              </div>
            </div>
            <button className="settings-action-btn danger" onClick={handleDeleteAccount}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSecuritySection = () => (
    <div className="settings-section-content">
      <div className="settings-group">
        <div className="settings-group-header">
          <h4><i className="fas fa-shield-alt"></i> Account Security</h4>
          <p>Keep your account secure</p>
        </div>
        
        <div className="settings-card">
          <div className="settings-toggle-item">
            <div className="toggle-info">
              <h5>Two-Factor Authentication</h5>
              <p>Add an extra layer of security to your account</p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.security.twoFactorAuth}
                onChange={() => handleToggleSetting('security', 'twoFactorAuth')}
              />
              <span className="slider"></span>
            </label>
          </div>
          
          <div className="settings-toggle-item">
            <div className="toggle-info">
              <h5>Login Alerts</h5>
              <p>Get notified about new device logins</p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.security.loginAlerts}
                onChange={() => handleToggleSetting('security', 'loginAlerts')}
              />
              <span className="slider"></span>
            </label>
          </div>
          
          <div className="settings-item">
            <div className="settings-item-info">
              <i className="fas fa-clock"></i>
              <div>
                <h5>Session Timeout</h5>
                <p>Automatically log out after inactivity</p>
              </div>
            </div>
            <select 
              className="settings-select"
              value={settings.security.sessionTimeout}
              onChange={(e) => handleUpdateSetting('security', 'sessionTimeout', parseInt(e.target.value))}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={0}>Never</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">
          <h4><i className="fas fa-key"></i> Password & Access</h4>
        </div>
        
        <div className="settings-card">
          <div className="settings-action-item">
            <div className="settings-item-info">
              <i className="fas fa-key"></i>
              <div>
                <h5>Change Password</h5>
                <p>Update your account password</p>
              </div>
            </div>
            <button className="settings-action-btn" onClick={handleChangePassword}>
              Change
            </button>
          </div>
        </div>
      </div>
    </div>
  );

 const renderSubscriptionSection = () => {
  const { currentPlan, status, nextBilling, plans } = settings.subscription;

  return (
    <div className="settings-section-content">
      <div className="settings-group">
        <div className="settings-group-header">
          <h4><i className="fas fa-crown"></i> Subscription Plans</h4>
          <p>Choose a plan that fits your needs</p>
        </div>

        <div className="plans-grid">
          {plans.map(plan => {
            const isActive = plan.name === currentPlan;

            return (
              <div key={plan.id} className={`plan-card ${isActive ? 'active-plan' : ''}`}>
                
                {/* Header */}
                <div className="plan-header">
                  <h4>{plan.name}</h4>
                  <div className="plan-price">
                    {plan.price === 0 ? (
                      <span className="free-price">Free</span>
                    ) : (
                      <>
                        <span className="currency">MWK</span>
                        <span className="amount">{plan.price.toLocaleString()}</span>
                        <span className="duration"> / {plan.duration}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Features */}
                <ul className="plan-features">
                  {plan.features.map((f, i) => (
                    <li key={i}>
                      <i className="fas fa-check-circle"></i> {f}
                    </li>
                  ))}
                </ul>

                {/* Actions */}
                <div className="plan-actions">
                  {isActive ? (
                    <button className="btn active-btn" disabled>
                      <i className="fas fa-check"></i> Current Plan
                    </button>
                  ) : (
                    <button
                      className="btn upgrade-btn"
                      onClick={() => navigate(`/subscription/checkout?plan=${plan.id}`)}
                    >
                      <i className="fas fa-arrow-up"></i> Upgrade
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>

        {/* Current status */}
        <div className="current-plan-info">
          <p><strong>Status:</strong> {status}</p>
          <p><strong>Next Billing:</strong> {nextBilling}</p>
        </div>
      </div>
    </div>
  );
};

  const renderAboutSection = () => (
    <div className="settings-section-content">
      <div className="settings-group">
        <div className="settings-group-header">
          <h4><i className="fas fa-info-circle"></i> About & Support</h4>
          <p>Get help and learn more about the app</p>
        </div>
        
        <div className="settings-card">
          <div className="settings-action-item">
            <div className="settings-item-info">
              <i className="fas fa-question-circle"></i>
              <div>
                <h5>Help Center</h5>
                <p>Get help with common questions</p>
              </div>
            </div>
            <button className="settings-action-btn" onClick={() => window.open('https://help.example.com', '_blank')}>
              Open
            </button>
          </div>
          
          <div className="settings-action-item">
            <div className="settings-item-info">
              <i className="fas fa-file-alt"></i>
              <div>
                <h5>Terms of Service</h5>
                <p>Read our terms and conditions</p>
              </div>
            </div>
            <button className="settings-action-btn" onClick={() => window.open('https://example.com/terms', '_blank')}>
              View
            </button>
          </div>
          
          <div className="settings-action-item">
            <div className="settings-item-info">
              <i className="fas fa-shield-alt"></i>
              <div>
                <h5>Privacy Policy</h5>
                <p>Learn how we protect your data</p>
              </div>
            </div>
            <button className="settings-action-btn" onClick={() => window.open('https://example.com/privacy', '_blank')}>
              View
            </button>
          </div>
          
          <div className="settings-action-item">
            <div className="settings-item-info">
              <i className="fas fa-flag"></i>
              <div>
                <h5>Community Guidelines</h5>
                <p>Our community standards</p>
              </div>
            </div>
            <button className="settings-action-btn" onClick={() => window.open('https://example.com/guidelines', '_blank')}>
              View
            </button>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">
          <h4><i className="fas fa-cog"></i> App Information</h4>
        </div>
        
        <div className="settings-card">
          <div className="settings-action-item">
            <div className="settings-item-info">
              <i className="fas fa-bug"></i>
              <div>
                <h5>Report a Problem</h5>
                <p>Found a bug or issue? Let us know</p>
              </div>
            </div>
            <button className="settings-action-btn" onClick={() => window.open('mailto:support@example.com')}>
              Report
            </button>
          </div>
        
        </div>
      </div>
    </div>
  );

  const renderSectionContent = () => {
    if (loading) {
      return <div className="loading-message">Loading settings...</div>;
    }

    switch (activeSection) {
      case 'privacy':
        return renderPrivacySection();
      case 'security':
        return renderSecuritySection();
      case 'subscription':
        return renderSubscriptionSection();
      case 'about':
        return renderAboutSection();
      default:
        return renderPrivacySection();
    }
  };

  return (
    <div className="settings-page">
      {/* Navigation Tabs (Horizontal Scroll) */}
      <div className="settings-nav">
        <div className="settings-nav-scroll">
          {sections.map((section) => (
            <button
              key={section.id}
              className={`settings-nav-btn ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <i className={section.icon}></i>
              <span>{section.title}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Content Section */}
      <div className="settings-content">
        
        
        <div className="settings-content-scroll">
          {renderSectionContent()}
        </div>
      </div>
      
      {/* Logout Button */}
      <div className="settings-footer">
        <button className="logout-btn" onClick={handleLogout}>
          <i className="fas fa-sign-out-alt"></i> Log Out
        </button>
      </div>
    </div>
  );
};

export default Settings;