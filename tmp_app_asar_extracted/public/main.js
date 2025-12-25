// Defensive wrapper: avoid uncaught TypeError when MutationObserver.observe is called with a non-Node
(function(){
  if (typeof MutationObserver !== 'undefined' && MutationObserver.prototype && !MutationObserver.prototype.__safeObserve) {
    const orig = MutationObserver.prototype.observe;
    MutationObserver.prototype.observe = function(target, options) {
      if (!target || (typeof target.nodeType !== 'number')) {
        console.warn('Skipped MutationObserver.observe: target is not a Node', target);
        return; // noop instead of throwing
      }
      return orig.call(this, target, options);
    };
    MutationObserver.prototype.__safeObserve = true;
  }
})();

// Wait for DOM to be ready before initializing
document.addEventListener('DOMContentLoaded', () => {
    // Header scroll effect
    const header = document.querySelector('header');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
    });

    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-fade-up');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Animate feature cards
    document.querySelectorAll('.feature-card').forEach(card => {
        observer.observe(card);
    });

    // Animate pricing cards
    document.querySelectorAll('.pricing-card').forEach(card => {
        observer.observe(card);
    });

    // Animate sections
    document.querySelectorAll('section').forEach(section => {
        observer.observe(section);
    });

    // Mobile Menu Toggle
    const mobileMenuButton = document.querySelector('.mobile-menu-button');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
    
    function openMobileMenu() {
        if (mobileMenuOverlay && mobileMenuButton) {
            mobileMenuOverlay.classList.add('active');
            mobileMenuButton.classList.add('active');
            document.body.style.overflow = 'hidden';
            if (mobileMenuClose) mobileMenuClose.focus();
        }
    }
    
    function closeMobileMenu() {
        if (mobileMenuOverlay && mobileMenuButton) {
            mobileMenuOverlay.classList.remove('active');
            mobileMenuButton.classList.remove('active');
            document.body.style.overflow = '';
            mobileMenuButton.focus();
        }
    }
    
    function toggleMobileMenu() {
        const isActive = mobileMenuOverlay?.classList.contains('active');
        if (isActive) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }
    
    // Open mobile menu
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', toggleMobileMenu);
    }
    
    // Close mobile menu
    if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
    }
    
    // Close menu when clicking overlay background
    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', (e) => {
            if (e.target === mobileMenuOverlay) {
                closeMobileMenu();
            }
        });
    }
    
    // Close menu when clicking a link
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });
    
    // Close mobile menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileMenuOverlay?.classList.contains('active')) {
            closeMobileMenu();
        }
    });
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href !== '#!') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // Scroll Progress Bar
    window.addEventListener('scroll', () => {
        const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrollProgress = document.querySelector('.scroll-progress');
        if (scrollProgress) {
            const progress = (window.scrollY / docHeight) * 100;
            scrollProgress.style.width = progress + '%';
        }
    });
});

// Toast notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger reflow for animation
    toast.offsetHeight;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Form handling
document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = form.querySelector('[type="submit"]');
        const originalText = submitButton.textContent;

        // Show loading state
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="loading-spinner"></span>';

        try {
            // Simulate form submission
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast('Thank you! We\'ll be in touch soon.');
            form.reset();
        } catch (error) {
            showToast('Something went wrong. Please try again.', 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    });
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            // Close mobile menu if open
            navLinks?.classList.remove('active');
            document.body.classList.remove('menu-open');
        }
    });
});

// Pricing toggle (monthly/yearly)
const pricingToggle = document.querySelector('.pricing-toggle');
const monthlyPrices = document.querySelectorAll('.price-monthly');
const yearlyPrices = document.querySelectorAll('.price-yearly');

pricingToggle?.addEventListener('change', () => {
    const isYearly = pricingToggle.checked;
    monthlyPrices.forEach(price => price.classList.toggle('hidden'));
    yearlyPrices.forEach(price => price.classList.toggle('hidden'));
});

// Theme toggle functionality
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Default to dark mode unless user has explicitly chosen light mode
    if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
        updateThemeIcons(false);
    } else {
        document.documentElement.classList.add('dark');
        updateThemeIcons(true);
    }
}

function updateThemeIcons(isDark) {
    const themeToggles = document.querySelectorAll('.theme-toggle, .theme-toggle-mobile');
    themeToggles.forEach(toggle => {
        if (isDark) {
            toggle.classList.add('dark');
        } else {
            toggle.classList.remove('dark');
        }
    });
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcons(isDark);
    
    // Show toast notification
    showToast(`Switched to ${isDark ? 'dark' : 'light'} theme`, 'info');
}

// Theme toggle event listeners
const themeToggle = document.querySelector('.theme-toggle');
const themeToggleMobile = document.querySelector('.theme-toggle-mobile');

themeToggle?.addEventListener('click', toggleTheme);
themeToggleMobile?.addEventListener('click', toggleTheme);

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', initializeTheme);

// Header scroll behavior
window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    const scrolled = window.scrollY > 50;
    
    if (scrolled) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

// Active navigation link highlighting
function updateActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');
    
    let currentSection = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        const sectionHeight = section.offsetHeight;
        
        if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
            currentSection = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentSection}`) {
            link.classList.add('active');
        }
    });
}

window.addEventListener('scroll', updateActiveNavLink);
window.addEventListener('load', updateActiveNavLink);

// ===================================
// STUDENT Promo Banner Modal Logic
// ===================================
(function() {
    const modal = document.getElementById('student-promo-modal');
    const closeBtn = document.querySelector('.promo-modal-close');
    const modalContent = document.querySelector('.promo-modal-content');
    
    // Check if modal should be shown (once per session)
    const hasSeenPromo = sessionStorage.getItem('student-promo-seen');
    
    if (!hasSeenPromo && modal) {
        // Show modal after 1 second delay
        setTimeout(() => {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        }, 1000);
    }
    
    // Close modal function
    function closeModal() {
        modal.classList.remove('show');
        document.body.style.overflow = ''; // Re-enable scrolling
        sessionStorage.setItem('student-promo-seen', 'true');
    }
    
    // Close on X button click
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    // Close on outside click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    // Prevent closing when clicking inside modal content
    if (modalContent) {
        modalContent.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            closeModal();
        }
    });
})();

// ===================================
// Keyboard Shortcuts Modal Logic
// ===================================
(function() {
    const shortcutsBtn = document.getElementById('shortcutsBtn');
    const shortcutsModal = document.getElementById('shortcutsModal');
    const shortcutsClose = document.getElementById('shortcutsClose');
    
    // Open shortcuts modal
    function openShortcutsModal() {
        if (shortcutsModal) {
            shortcutsModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }
    
    // Close shortcuts modal
    function closeShortcutsModal() {
        if (shortcutsModal) {
            shortcutsModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    // Open on button click
    if (shortcutsBtn) {
        shortcutsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openShortcutsModal();
        });
    }
    
    // Close on X button click
    if (shortcutsClose) {
        shortcutsClose.addEventListener('click', closeShortcutsModal);
    }
    
    // Close on outside click
    if (shortcutsModal) {
        shortcutsModal.addEventListener('click', (e) => {
            if (e.target === shortcutsModal) {
                closeShortcutsModal();
            }
        });
    }
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && shortcutsModal?.classList.contains('active')) {
            closeShortcutsModal();
        }
    });
    
    // Open shortcuts modal on '?' key press
    document.addEventListener('keydown', (e) => {
        if (e.key === '?' && !shortcutsModal?.classList.contains('active')) {
            e.preventDefault();
            openShortcutsModal();
        }
    });
})();