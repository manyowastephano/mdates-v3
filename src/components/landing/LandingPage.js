import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  FaHeart,
  FaRegHeart,
  FaCheckCircle,
  FaBookOpen,
  FaCalendarCheck,
  FaShieldAlt,
  FaInstagram,
  FaArrowRight,
  FaTimes,
  FaArrowUp,     
  FaWhatsapp,
  FaFacebook       
} from 'react-icons/fa';
import './styles/LandingPage.css';
import couple1 from '../../assets/hero-couple.jpg';
import couple2 from '../../assets/couple2.jpg';
import couple3 from '../../assets/couple3.jpg';
import couple4 from '../../assets/couple4.jpg';

const LandingPage = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [activeNav, setActiveNav] = useState('Home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTopBtn, setShowTopBtn] = useState(false);       
  const sliderWrapperRef = useRef(null);
  const heartContainerRef = useRef(null);
  const totalSlides = 4;
  const navLinks = [
    { name: 'Home', to: '/', id: 'Home' },
    { name: 'How it works', to: '#how-it-works', id: 'HowItWorks' },
    { name: 'Pricing', to: '#pricing', id: 'Pricing' },
    { name: 'Login', to: '/login', id: 'Login' },
    
  ];
  const mobileVisibleLinks = [
    { name: 'How it works', to: '#how-it-works', id: 'HowItWorks' },
    { name: 'Login', to: '/login', id: 'Login' },
    { name: 'Contact', to: '/contact', id: 'Contact' },
  ];
  const extraSidebarLinks = [
    { name: 'About', to: '/about', id: 'About' },
  ];
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setActiveNav(sectionId);
    setMenuOpen(false);
  };
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const goToSlide = (index) => {
    if (index < 0) index = 0;
    if (index >= totalSlides) index = totalSlides - 1;
    setCurrentIndex(index);
    if (sliderWrapperRef.current) {
      sliderWrapperRef.current.style.transform = `translateX(-${index * 100}%)`;
    }
  };

  const nextSlide = () => {
    const next = (currentIndex + 1) % totalSlides;
    goToSlide(next);
  };
  useEffect(() => {
    const checkScrollTop = () => {
      if (!showTopBtn && window.pageYOffset > 400) {
        setShowTopBtn(true);
      } else if (showTopBtn && window.pageYOffset <= 400) {
        setShowTopBtn(false);
      }
    };

    window.addEventListener('scroll', checkScrollTop);
    return () => window.removeEventListener('scroll', checkScrollTop);
  }, [showTopBtn]);

  useEffect(() => {
    if (!heartContainerRef.current) return;

    const handleMouseEnter = () => setIsPaused(true);
    const handleMouseLeave = () => setIsPaused(false);

    const element = heartContainerRef.current;
    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPaused) {
        nextSlide();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isPaused, currentIndex]);

  return (
    <div className="landing-page">
      <header className="header">
        
        <div className="logo">MDates</div>
        <div className="mobile-visible-links">
          {mobileVisibleLinks.map((link) => (
            <Link
              key={link.id}
              to={link.to}
              className={`mobile-visible-link ${activeNav === link.id ? 'active' : ''}`}
              onClick={(e) => {
                if (link.to.startsWith('#')) {
                  e.preventDefault();
                  scrollToSection(link.to.substring(1));
                } else {
                  setActiveNav(link.id);
                  setMenuOpen(false);
                }
              }}
            >
              {link.name}
            </Link>
          ))}
        </div>
        <nav className="nav-links desktop-nav">
          {navLinks.map((link) => (
            <Link
              key={link.id}
              to={link.to}
              className={`nav-link ${activeNav === link.id ? 'active' : ''}`}
              onClick={(e) => {
                if (link.to.startsWith('#')) {
                  e.preventDefault();
                  scrollToSection(link.to.substring(1));
                } else {
                  setActiveNav(link.id);
                  setMenuOpen(false);
                }
              }}
            >
              {link.name}
            </Link>
          ))}
        </nav>
        <button
          className="hamburger-icon"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <div className="hamburger-bars">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </header>
      {menuOpen && (
        <div className="sidebar-overlay" onClick={() => setMenuOpen(false)}>
          <div className="sidebar sidebar-right" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-header">
              <button
                className="close-icon"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <FaTimes />
              </button>
            </div>
            <nav className="sidebar-nav">
              {navLinks.map((link) => (
                <Link
                  key={link.id}
                  to={link.to}
                  className={`sidebar-link ${activeNav === link.id ? 'active' : ''}`}
                  onClick={(e) => {
                    if (link.to.startsWith('#')) {
                      e.preventDefault();
                      scrollToSection(link.to.substring(1));
                    } else {
                      setActiveNav(link.id);
                      setMenuOpen(false);
                    }
                  }}
                >
                  {link.name}
                </Link>
              ))}
              {extraSidebarLinks.map((link) => (
                <Link
                  key={link.id}
                  to={link.to}
                  className="sidebar-link"
                  onClick={(e) => {
                    if (link.to.startsWith('#')) {
                      e.preventDefault();
                      scrollToSection(link.to.substring(1));
                    } else {
                      setActiveNav(link.id);
                      setMenuOpen(false);
                    }
                  }}
                >
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
      {showTopBtn && (
        <button className="scroll-to-top" onClick={scrollToTop} aria-label="Back to top">
          <FaArrowUp />
        </button>
      )}
      <main>
        <section className="hero">
          <div className="hero-content">
            <h1>The search is over!</h1>
            <div className="subhead">Meet your Perfect Match</div>
            <div className="attract-line">
              <FaHeart className="icon-heart" style={{ fontSize: '0.9rem' }} />
              <span>find your missing piece</span>
              <FaHeart className="icon-heart" style={{ fontSize: '0.9rem' }} />
            </div>
            <div className="button-group">
              <Link to="/signup" className="btn btn-primary">
                Get started
              </Link>
              <Link to="#more" className="btn btn-outline">
                View More
              </Link>
            </div>
            <div className="badge-trust">
              <FaCheckCircle className="icon-check-circle" />
              <span>thousands of happy couples</span>
              <FaRegHeart className="icon-regular-heart" style={{ marginLeft: '0.5rem' }} />
            </div>
          </div>
          <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
    <defs>
      <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F4C430" />
        <stop offset="50%" stopColor="#003A8F" />
        <stop offset="100%" stopColor="#2c364b" />
      </linearGradient>
    </defs>
  </svg>
          <div className="hero-visual">
            <div className="heart-illustration" ref={heartContainerRef}>
              <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
                <svg>
                  <defs>
                    <clipPath id="smoothHeart" clipPathUnits="objectBoundingBox">
                      <path d="M0.5,0.15 C0.35,0.05,0.1,0.15,0.1,0.35 C0.1,0.6,0.5,0.9,0.5,0.9 C0.5,0.9,0.9,0.6,0.9,0.35 C0.9,0.15,0.65,0.05,0.5,0.15 Z" />
                    </clipPath>
                  </defs>
                </svg>
              </div>
              <div className="heart-icon-slider">
                <div className="slider-container">
                  <div className="slider-wrapper" ref={sliderWrapperRef}>
                    <img src={couple1} alt="couple sunset" loading="lazy" />
                    <img src={couple2} alt="couple hugging" loading="lazy" />
                    <img src={couple3} alt="romantic outdoors" loading="lazy" />
                    <img src={couple4} alt="happy couple" loading="lazy" />
                  </div>
                </div>
              </div>
            </div>
            <div className="beating-heart">
              <FaHeart />
            </div>
          </div>
        </section>
        <section id="features" className="features-section">
          <div className="section-header">
            <h2>Built for every kind of connection</h2>
            <p>Whether you're looking for dating, friendship, or something in between.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <FaHeart />
              </div>
              <h3>Smart matching</h3>
              <p>Our algorithm connects you with compatible people based on your interests.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <FaBookOpen />
              </div>
              <h3>Dating & friendship</h3>
              <p>Set your preference — from new friends to meaningful relationships.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <FaCalendarCheck />
              </div>
              <h3>Events & activities</h3>
              <p>Join local events and meet people with similar hobbies.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <FaShieldAlt />
              </div>
              <h3>Verified profiles</h3>
              <p>All profiles are manually reviewed to ensure a safe community.</p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="how-it-works">
          <div className="section-header">
            <h2>How it works</h2>
            <p>Three simple steps to start your journey</p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h4>Sign up</h4>
              <p>Create your profile in under 2 minutes – it's free!</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h4>Find your match</h4>
              <p>Browse profiles and connect with people who share your interests.</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h4>Start dating</h4>
              <p>Chat, meet, and build meaningful relationships.</p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section">
          <h2>Ready to find your perfect match?</h2>
          <p>Join thousands of happy couples who started their story on MDates.</p>
          <Link to="/signup" className="btn btn-primary cta-button">
            Create your profile <FaArrowRight style={{ marginLeft: '0.5rem' }} />
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="main-footer">
        <div className="footer-grid">
          <div className="footer-col">
            <div className="logo" style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>
              MDates
            </div>
            <p>Where hearts connect and stories begin.</p>
            <div className="social-icons">
              <Link to="#" aria-label="Instagram">
                <FaInstagram />
              </Link>
              <Link to="#" aria-label="TikTok">
                <FaFacebook />
              </Link>
              <Link to="#" aria-label="LinkedIn">
                <FaWhatsapp />
              </Link>
            </div>
          </div>
          <div className="footer-col">
            <h4>Discover</h4>
            <ul>
              <li>
                <Link
                  to="#how-it-works"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('how-it-works');
                  }}
                >
                  How it works
                </Link>
              </li>
              <li>
                <Link
                  to="#success"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('success');
                  }}
                >
                  Success stories
                </Link>
              </li>
              <li>
                <Link
                  to="#pricing"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('pricing');
                  }}
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/blog">Blog</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Safety</h4>
            <ul>
              <li>
                <Link to="/guidelines">Guidelines</Link>
              </li>
              <li>
                <Link to="/verification">Verification</Link>
              </li>
              <li>
                <Link to="/privacy">Privacy</Link>
              </li>
              <li>
                <Link to="/report">Report</Link>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>MDates</h4>
            <ul>
              <li>
                <Link to="/about">About</Link>
              </li>
              <li>
                <Link to="/careers">Careers</Link>
              </li>
              <li>
                <Link to="/contact">Contact</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="copyright">
          © 2026 MDates – heart‑shaped memories ·{' '}
          <FaHeart style={{ color: 'var(--mubas-gold)', margin: '0 0.2rem' }} /> for everyone
        </div>
      </footer>
    </div>
  );
};
export default LandingPage;