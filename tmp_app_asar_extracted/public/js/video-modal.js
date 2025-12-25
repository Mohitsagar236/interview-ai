(function(){
    const trigger = document.querySelector('.video-placeholder');
    const modal = document.getElementById('video-modal');
    const overlay = modal && modal.querySelector('.video-modal-overlay');
    const closeButtons = modal && modal.querySelectorAll('[data-action="close"]');
    const iframe = modal && modal.querySelector('.video-iframe');
    let lastFocused = null;

    if (!trigger || !modal || !iframe) return;

    const openModal = () => {
        lastFocused = document.activeElement;
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('open');
        // set iframe src lazily from trigger
        const src = trigger.getAttribute('data-video-src');
        if (src && !iframe.src) {
            iframe.src = src;
        }
        // focus close button
        const closeBtn = modal.querySelector('.video-modal-close');
        if (closeBtn) closeBtn.focus();
        document.addEventListener('keydown', onKeyDown);
    };

    const closeModal = () => {
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('open');
        // stop playback by removing src
        iframe.src = '';
        document.removeEventListener('keydown', onKeyDown);
        if (lastFocused) lastFocused.focus();
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape') closeModal();
        // basic focus trap for modal
        if (e.key === 'Tab') {
            const focusable = modal.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });

    overlay && overlay.addEventListener('click', closeModal);
    closeButtons && closeButtons.forEach(btn => btn.addEventListener('click', closeModal));
})();