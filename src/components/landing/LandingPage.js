import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaRegHeart, FaCheckCircle } from 'react-icons/fa';
import './styles/LandingPage.css';
import couple1 from '../../assets/couple1.jpg';
import couple2 from '../../assets/couple2.jpg';
import couple3 from '../../assets/couple3.jpg';
import couple4 from '../../assets/couple4.jpg';

const LandingPage = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [activeNav, setActiveNav] = useState('Home'); // active nav link
  const sliderWrapperRef = useRef(null);
  const heartContainerRef = useRef(null);
  const totalSlides = 4;

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

  const handleNavClick = (navName) => {
    setActiveNav(navName);
  };

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
        <nav className="nav-links">
          <Link 
            to="/" 
            className={`nav-link ${activeNav === 'Home' ? 'active' : ''}`}
            onClick={() => handleNavClick('Home')}
          >
            Home
          </Link>
          <Link 
            to="#features" 
            className={`nav-link ${activeNav === 'Features' ? 'active' : ''}`}
            onClick={() => handleNavClick('Features')}
          >
            How it works
          </Link>
          <Link 
            to="#pricing" 
            className={`nav-link ${activeNav === 'Pricing' ? 'active' : ''}`}
            onClick={() => handleNavClick('Pricing')}
          >
            Pricing
          </Link>
          <Link 
            to="/login" 
            className={`nav-link ${activeNav === 'Login' ? 'active' : ''}`}
            onClick={() => handleNavClick('Login')}
          >
            Login
          </Link>
          <Link 
            to="/signup" 
            className={`nav-link ${activeNav === 'Register' ? 'active' : ''}`}
            onClick={() => handleNavClick('Register')}
          >
            Register
          </Link>
        </nav>
      </header>

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
              <Link to="/signup" className="btn btn-primary">Get started</Link>
              <Link to="#more" className="btn btn-outline">View More</Link>
            </div>
            <div className="badge-trust">
              <FaCheckCircle className="icon-check-circle" />
              <span>thousands of happy couples</span>
              <FaRegHeart className="icon-regular-heart" style={{ marginLeft: '0.5rem' }} />
            </div>
          </div>

          <div className="hero-visual">
            <div className="heart-illustration" ref={heartContainerRef}>
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

            <div className="slider-dots">
              {[0, 1, 2, 3].map((index) => (
                <button
                  key={index}
                  className={`dot ${currentIndex === index ? 'active' : ''}`}
                  data-index={index}
                  onClick={() => goToSlide(index)}
                  aria-label={`slide ${index + 1}`}
                ></button>
              ))}
            </div>
          </div>
        </section>
      </main>

      <div className="footer-note">
        <span>MDates</span> — heart‑shaped memories· © 2026
      </div>
    </div>
  );
};

export default LandingPage;