// ============================================================================
// WARRIORS AI ARENA - LANDING PAGE SCRIPTS
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
  // --------------------------------------------------------------------------
  // Animated Counter for Hero Stats
  // --------------------------------------------------------------------------
  function animateCounters() {
    const counters = document.querySelectorAll('.stat-value[data-count]');

    counters.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-count'));
      const duration = 2000; // 2 seconds
      const step = target / (duration / 16); // 60fps

      let current = 0;

      const updateCounter = () => {
        current += step;
        if (current < target) {
          counter.textContent = Math.floor(current).toLocaleString();
          requestAnimationFrame(updateCounter);
        } else {
          counter.textContent = target.toLocaleString();
        }
      };

      // Start animation when element is in view
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            updateCounter();
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });

      observer.observe(counter);
    });
  }

  animateCounters();

  // --------------------------------------------------------------------------
  // FAQ Accordion
  // --------------------------------------------------------------------------
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');

    question.addEventListener('click', () => {
      // Close other items
      faqItems.forEach(otherItem => {
        if (otherItem !== item && otherItem.classList.contains('active')) {
          otherItem.classList.remove('active');
        }
      });

      // Toggle current item
      item.classList.toggle('active');
    });
  });

  // --------------------------------------------------------------------------
  // Smooth Scroll for Navigation Links
  // --------------------------------------------------------------------------
  const navLinks = document.querySelectorAll('a[href^="#"]');

  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();

      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);

      if (targetElement) {
        const navHeight = document.querySelector('.navbar').offsetHeight;
        const targetPosition = targetElement.offsetTop - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // --------------------------------------------------------------------------
  // Navbar Background on Scroll
  // --------------------------------------------------------------------------
  const navbar = document.querySelector('.navbar');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.style.background = 'rgba(15, 15, 26, 0.98)';
    } else {
      navbar.style.background = 'rgba(15, 15, 26, 0.9)';
    }
  });

  // --------------------------------------------------------------------------
  // Mobile Menu Toggle
  // --------------------------------------------------------------------------
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const navLinksContainer = document.querySelector('.nav-links');
  const navActions = document.querySelector('.nav-actions');

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      // Create mobile menu if it doesn't exist
      let mobileMenu = document.querySelector('.mobile-menu');

      if (!mobileMenu) {
        mobileMenu = document.createElement('div');
        mobileMenu.className = 'mobile-menu';
        mobileMenu.innerHTML = `
          <div class="mobile-menu-content">
            ${navLinksContainer.innerHTML}
            <div class="mobile-menu-actions">
              ${navActions.innerHTML}
            </div>
          </div>
        `;

        // Add styles
        mobileMenu.style.cssText = `
          position: fixed;
          top: 60px;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 15, 26, 0.98);
          padding: 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          z-index: 999;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        `;

        const menuContent = mobileMenu.querySelector('.mobile-menu-content');
        menuContent.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        `;

        document.body.appendChild(mobileMenu);

        // Add click handlers to close menu when link is clicked
        mobileMenu.querySelectorAll('a').forEach(link => {
          link.addEventListener('click', () => {
            mobileMenu.style.opacity = '0';
            mobileMenu.style.visibility = 'hidden';
            mobileMenuBtn.textContent = '☰';
          });
        });
      }

      // Toggle menu
      const isOpen = mobileMenu.style.opacity === '1';
      mobileMenu.style.opacity = isOpen ? '0' : '1';
      mobileMenu.style.visibility = isOpen ? 'hidden' : 'visible';
      mobileMenuBtn.textContent = isOpen ? '☰' : '✕';
    });
  }

  // --------------------------------------------------------------------------
  // Animate Elements on Scroll
  // --------------------------------------------------------------------------
  const animateOnScroll = () => {
    const elements = document.querySelectorAll(
      '.problem-card, .step, .feature-card, .warrior-display, .utility-card, .roadmap-phase'
    );

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }, index * 100);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    elements.forEach(element => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(20px)';
      element.style.transition = 'all 0.6s ease';
      observer.observe(element);
    });
  };

  animateOnScroll();

  // --------------------------------------------------------------------------
  // Warrior Stat Bars Animation
  // --------------------------------------------------------------------------
  const animateStatBars = () => {
    const statBars = document.querySelectorAll('.bar-fill');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const width = entry.target.style.width;
          entry.target.style.width = '0';
          setTimeout(() => {
            entry.target.style.width = width;
          }, 100);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    statBars.forEach(bar => observer.observe(bar));
  };

  animateStatBars();

  // --------------------------------------------------------------------------
  // Parallax Effect for Hero
  // --------------------------------------------------------------------------
  const heroSection = document.querySelector('.hero');
  const particles = document.querySelector('.particles');

  if (heroSection && particles) {
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      if (scrolled < window.innerHeight) {
        particles.style.transform = `translateY(${scrolled * 0.3}px)`;
      }
    });
  }

  // --------------------------------------------------------------------------
  // Live Stats Update (Simulated)
  // --------------------------------------------------------------------------
  function simulateLiveStats() {
    const statValues = document.querySelectorAll('.stat-value');

    setInterval(() => {
      statValues.forEach(stat => {
        const currentValue = parseInt(stat.textContent.replace(/,/g, ''));
        const increment = Math.floor(Math.random() * 5);
        if (increment > 0) {
          stat.textContent = (currentValue + increment).toLocaleString();

          // Flash animation
          stat.style.color = '#fff';
          setTimeout(() => {
            stat.style.color = '#FFD700';
          }, 200);
        }
      });
    }, 5000); // Update every 5 seconds
  }

  // Uncomment to enable simulated live stats
  // simulateLiveStats();

  // --------------------------------------------------------------------------
  // Typing Effect for Hero Title (Optional)
  // --------------------------------------------------------------------------
  function typeWriter(element, text, speed = 50) {
    let i = 0;
    element.textContent = '';

    function type() {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        setTimeout(type, speed);
      }
    }

    type();
  }

  // Uncomment to enable typing effect
  // const titleSubtitle = document.querySelector('.title-subtitle');
  // if (titleSubtitle) {
  //   const text = titleSubtitle.textContent;
  //   typeWriter(titleSubtitle, text, 30);
  // }

  // --------------------------------------------------------------------------
  // Copy Contract Address (if added)
  // --------------------------------------------------------------------------
  const copyButtons = document.querySelectorAll('.copy-address');

  copyButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const address = button.getAttribute('data-address');

      try {
        await navigator.clipboard.writeText(address);
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Lazy Load Images (if any)
  // --------------------------------------------------------------------------
  const lazyImages = document.querySelectorAll('img[data-src]');

  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      });
    });

    lazyImages.forEach(img => imageObserver.observe(img));
  }

  // --------------------------------------------------------------------------
  // Console Easter Egg
  // --------------------------------------------------------------------------
  console.log(`
  ⚔️ Warriors AI Arena ⚔️

  The first AI-powered battle game on 0G Network.

  Train AI. Battle On-Chain. Win Glory.

  Join us: https://warriorsai.arena
  `);
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Debounce function for performance optimization
 */
function debounce(func, wait = 20, immediate = true) {
  let timeout;
  return function() {
    const context = this, args = arguments;
    const later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}

/**
 * Throttle function for scroll events
 */
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Format large numbers with K/M suffix
 */
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
