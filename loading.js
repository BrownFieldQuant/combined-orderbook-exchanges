/* loading.js
   Simple ~10s splash/landing screen shown before the dashboard appears.
   Cycles through status messages and fills a progress bar, then fades out
   and reveals #app-content.
*/

(function () {
    const TOTAL_DURATION_MS = 10000;
    const messages = [
        'Initializing Lowcost Research...',
        'Loading asset data...',
        'Connecting to exchanges...',
        'Fetching order book depth...',
        'Calibrating price feeds...',
        'Building dashboard modules...',
        'Warming up charts...',
        'Almost ready...'
    ];

    document.addEventListener('DOMContentLoaded', function () {
        const screen = document.getElementById('loading-screen');
        const statusEl = document.getElementById('loading-status');
        const barFill = document.getElementById('loading-bar-fill');
        const appContent = document.getElementById('app-content');
        if (!screen || !statusEl || !barFill || !appContent) return;

        const stepDuration = TOTAL_DURATION_MS / messages.length;
        let index = 0;
        statusEl.textContent = messages[0];

        const messageInterval = setInterval(function () {
            index++;
            if (index < messages.length) {
                statusEl.textContent = messages[index];
            }
        }, stepDuration);

        // Smooth progress bar fill over the full duration.
        const startTime = Date.now();
        const progressInterval = setInterval(function () {
            const elapsed = Date.now() - startTime;
            const pct = Math.min(100, (elapsed / TOTAL_DURATION_MS) * 100);
            barFill.style.width = pct + '%';
            if (pct >= 100) clearInterval(progressInterval);
        }, 100);

        setTimeout(function () {
            clearInterval(messageInterval);
            clearInterval(progressInterval);
            statusEl.textContent = 'Ready.';
            barFill.style.width = '100%';

            screen.classList.add('fade-out');
            appContent.classList.add('revealed');

            setTimeout(function () {
                screen.remove();
            }, 700);
        }, TOTAL_DURATION_MS);
    });
})();
