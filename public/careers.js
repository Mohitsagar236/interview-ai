(function initCareersPage() {
    const MAX_RESUME_BYTES = 6 * 1024 * 1024;

    document.addEventListener('DOMContentLoaded', () => {
        createLucideIcons();
        initTheme();
        initMobileMenu();
        initScrollProgress();
        initSmoothAnchors();
        initMotion();
        initRoleApplyButtons();
        initApplicationForm();
    });

    function createLucideIcons() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({
                attrs: {
                    'aria-hidden': 'true',
                    focusable: 'false'
                }
            });
        }
    }

    function initTheme() {
        const toggles = document.querySelectorAll('[data-careers-theme]');
        const applyThemeLabel = () => {
            const isDark = document.documentElement.classList.contains('dark');
            toggles.forEach((toggle) => {
                toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            });
        };

        applyThemeLabel();

        toggles.forEach((toggle) => {
            toggle.addEventListener('click', () => {
                const isDark = document.documentElement.classList.toggle('dark');
                sessionStorage.setItem('theme', isDark ? 'dark' : 'light');
                applyThemeLabel();
            });
        });
    }

    function initMobileMenu() {
        const button = document.querySelector('[data-mobile-menu-button]');
        const overlay = document.querySelector('[data-mobile-menu-overlay]');
        const closeButton = document.querySelector('[data-mobile-menu-close]');

        if (!button || !overlay) {
            return;
        }

        const openMenu = () => {
            overlay.classList.add('active');
            button.classList.add('active');
            button.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
            closeButton?.focus();
        };

        const closeMenu = () => {
            overlay.classList.remove('active');
            button.classList.remove('active');
            button.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        };

        button.addEventListener('click', () => {
            if (overlay.classList.contains('active')) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        closeButton?.addEventListener('click', closeMenu);

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                closeMenu();
            }
        });

        overlay.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMenu);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && overlay.classList.contains('active')) {
                closeMenu();
                button.focus();
            }
        });
    }

    function initScrollProgress() {
        const progress = document.querySelector('.scroll-progress');
        const header = document.querySelector('header');

        const update = () => {
            if (header) {
                header.classList.toggle('scrolled', window.scrollY > 30);
            }

            if (!progress) {
                return;
            }

            const max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            progress.style.width = max > 0 ? `${(window.scrollY / max) * 100}%` : '0%';
        };

        update();
        window.addEventListener('scroll', update, { passive: true });
    }

    function initSmoothAnchors() {
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener('click', (event) => {
                const selector = anchor.getAttribute('href');
                if (!selector || selector === '#') {
                    return;
                }

                const target = document.querySelector(selector);
                if (!target) {
                    return;
                }

                event.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.pushState(null, '', selector);
            });
        });
    }

    function initMotion() {
        const animatedItems = document.querySelectorAll('[data-animate]');
        if (!animatedItems.length) {
            return;
        }

        if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            animatedItems.forEach((item) => item.classList.add('is-visible'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.12,
            rootMargin: '0px 0px -40px 0px'
        });

        animatedItems.forEach((item) => observer.observe(item));
    }

    function initRoleApplyButtons() {
        const roleSelect = document.querySelector('select[name="role"]');
        const form = document.getElementById('careersApplicationForm');

        document.querySelectorAll('[data-apply-role]').forEach((button) => {
            button.addEventListener('click', () => {
                const role = button.getAttribute('data-apply-role') || '';
                if (roleSelect) {
                    roleSelect.value = role;
                }
                form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(() => roleSelect?.focus(), 450);
            });
        });
    }

    function initApplicationForm() {
        const form = document.getElementById('careersApplicationForm');
        const status = document.getElementById('careersFormStatus');
        const submitButton = form?.querySelector('button[type="submit"]');
        const submitLabel = submitButton?.querySelector('.submit-label');

        if (!form || !submitButton || !submitLabel) {
            return;
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!form.checkValidity()) {
                setStatus(status, 'Please complete all required fields before submitting.', 'error');
                form.reportValidity();
                return;
            }

            const formData = new FormData(form);
            const resume = formData.get('resume');

            if (!(resume instanceof File) || !resume.name) {
                setStatus(status, 'Please upload your resume as a PDF.', 'error');
                return;
            }

            if (!isPdf(resume)) {
                setStatus(status, 'Resume upload must be a PDF file.', 'error');
                return;
            }

            if (resume.size > MAX_RESUME_BYTES) {
                setStatus(status, 'Resume PDF must be 6 MB or smaller.', 'error');
                return;
            }

            setLoading(submitButton, submitLabel, true);
            setStatus(status, 'Submitting your application...', 'info');

            try {
                const payload = await buildApplicationPayload(formData, resume);
                const response = await fetch('/api/careers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(result.error || 'Application submission failed');
                }

                form.reset();
                setStatus(status, 'Application submitted. We will review your work and reply if there is a strong match.', 'success');
            } catch (error) {
                const message = String(error?.message || '');
                const fallback = message.includes('configured')
                    ? 'Application storage is being configured. Please email support@interview-ai.app with your resume and role.'
                    : 'Could not submit right now. Please try again or email support@interview-ai.app.';
                setStatus(status, fallback, 'error');
            } finally {
                setLoading(submitButton, submitLabel, false);
            }
        });
    }

    async function buildApplicationPayload(formData, resume) {
        const value = (name) => String(formData.get(name) || '').trim();
        const applicationData = {
            fullName: value('fullName'),
            email: value('email'),
            phoneNumber: value('phone'),
            currentLocation: value('location'),
            role: value('role'),
            linkedIn: value('linkedIn'),
            github: value('github'),
            portfolioWebsite: value('portfolio'),
            yearsOfExperience: value('experience'),
            highestQualification: value('qualification'),
            currentCompanyOrCollege: value('currentOrg'),
            expectedJoiningDate: value('joiningDate'),
            availability: value('availability'),
            techSkills: value('skills'),
            whyJoin: value('whyJoin'),
            proudProject: value('proudProject'),
            improveArea: value('improveArea'),
            whyHire: value('whyHire'),
            anythingElse: value('anythingElse'),
            confirmAccuracy: formData.get('confirmAccuracy') === 'on',
            resume: {
                name: resume.name,
                type: resume.type || 'application/pdf',
                size: resume.size
            },
            metadata: {
                sourcePage: 'careers.html',
                submittedAt: new Date().toISOString(),
                userAgent: navigator.userAgent,
                language: navigator.language,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
            }
        };
        const portfolioLinks = [
            applicationData.portfolioWebsite && `Portfolio: ${applicationData.portfolioWebsite}`,
            applicationData.github && `GitHub: ${applicationData.github}`,
            applicationData.linkedIn && `LinkedIn: ${applicationData.linkedIn}`
        ].filter(Boolean);

        const feedback = [
            `Phone: ${applicationData.phoneNumber}`,
            `Current Location: ${applicationData.currentLocation}`,
            `Years of Experience: ${applicationData.yearsOfExperience}`,
            `Highest Qualification: ${applicationData.highestQualification}`,
            `Current Company / College: ${applicationData.currentCompanyOrCollege}`,
            `Expected Joining Date: ${applicationData.expectedJoiningDate}`,
            `Availability: ${applicationData.availability}`,
            `Tech Skills: ${applicationData.techSkills}`,
            `Why Interview AI: ${applicationData.whyJoin}`,
            `Proud Project: ${applicationData.proudProject}`,
            `Area to Improve: ${applicationData.improveArea}`,
            `Why Hire: ${applicationData.whyHire}`,
            `Anything Else: ${applicationData.anythingElse}`,
            `Links: ${portfolioLinks.join(' | ')}`
        ].join('\n');

        return {
            ...applicationData,
            fullName: applicationData.fullName,
            email: applicationData.email,
            role: applicationData.role,
            portfolio: portfolioLinks.join(' | '),
            feedback,
            resumeName: resume.name,
            resumeType: resume.type || 'application/pdf',
            resumeSize: resume.size,
            applicationData,
            resumeBase64: await fileToBase64(resume)
        };
    }

    function isPdf(file) {
        return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                resolve(result.includes(',') ? result.split(',')[1] : result);
            };
            reader.onerror = () => reject(new Error('Could not read resume file'));
            reader.readAsDataURL(file);
        });
    }

    function setLoading(button, label, isLoading) {
        button.disabled = isLoading;
        button.classList.toggle('is-loading', isLoading);
        label.textContent = isLoading ? 'Submitting...' : 'Submit Application';
    }

    function setStatus(status, message, type) {
        if (!status) {
            return;
        }

        status.textContent = message;
        status.className = `careers-form-status ${type || ''}`.trim();
    }
})();
