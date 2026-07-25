/* binance-ws.js
   Optional realtime feed: streams Binance's order book over WebSocket
   (~100ms updates) instead of REST polling, and merges it into the same
   render pipeline used by the rest of the dashboard (script.js's
   window.__orderbookInternals.renderData), so Order Book, Quant Analytics,
   and Asset Compare all reflect it without any extra wiring.

   Only Binance is streamed this way — every other exchange still uses the
   existing REST polling (Fetch Data / Auto Refresh) in script.js/exchanges.js.

   Render calls are throttled to at most once per RENDER_THROTTLE_MS even
   though Binance pushes updates every ~100ms, to avoid hammering
   localStorage (quant history / config autosave) and Highcharts redraws.
*/

(function () {
    const RENDER_THROTTLE_MS = 1000;
    const RECONNECT_DELAY_MS = 3000;

    let ws = null;
    let currentStreamSymbol = null;
    let pendingBinanceEntry = null;
    let throttleTimer = null;
    let reconnectTimer = null;
    let manuallyStopped = true;

    function setStatus(text, cls) {
        const el = document.getElementById('binance-ws-status');
        if (!el) return;
        el.textContent = text;
        el.classList.remove('live', 'off', 'error');
        if (cls) el.classList.add(cls);
    }

    function getSelectedSymbol() {
        return document.querySelector('.symbol:checked')?.value || null;
    }

    function getSliceSize() {
        return window.__orderbookInternals?.getSliceSize
            ? window.__orderbookInternals.getSliceSize()
            : parseInt(document.getElementById('slice-size')?.value || '10');
    }

    function parseLevels(rawLevels, sliceSize) {
        return rawLevels
            .slice(0, sliceSize)
            .map(([p, q]) => [parseFloat(p), parseFloat(q)])
            .filter(([p, q]) => q > 0);
    }

    function connect(symbol) {
        disconnect(false);
        currentStreamSymbol = symbol;
        const streamSymbol = symbol.toLowerCase();
        const url = `wss://stream.binance.com:9443/ws/${streamSymbol}@depth20@100ms`;

        try {
            ws = new WebSocket(url);
        } catch (e) {
            setStatus('WS unsupported', 'error');
            return;
        }

        setStatus('connecting…', 'off');

        ws.onopen = () => {
            setStatus('live', 'live');
        };

        ws.onmessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                return;
            }
            if (!msg || !Array.isArray(msg.bids) || !Array.isArray(msg.asks)) return;

            const sliceSize = getSliceSize();
            const asks = parseLevels(msg.asks, sliceSize).sort((a, b) => a[0] - b[0]);
            const bids = parseLevels(msg.bids, sliceSize).sort((a, b) => b[0] - a[0]);

            pendingBinanceEntry = { exchange: 'Binance', symbol: currentStreamSymbol, asks, bids };
            scheduleRender();
        };

        ws.onerror = () => {
            setStatus('error, retrying…', 'error');
        };

        ws.onclose = () => {
            if (manuallyStopped) {
                setStatus('off', 'off');
                return;
            }
            setStatus('reconnecting…', 'error');
            reconnectTimer = setTimeout(() => connect(currentStreamSymbol), RECONNECT_DELAY_MS);
        };
    }

    function scheduleRender() {
        if (throttleTimer) return;
        throttleTimer = setTimeout(() => {
            throttleTimer = null;
            flushRender();
        }, RENDER_THROTTLE_MS);
    }

    function flushRender() {
        if (!pendingBinanceEntry) return;
        const internals = window.__orderbookInternals;
        if (!internals || typeof internals.renderData !== 'function') return;

        const selectedExchanges = Array.from(document.querySelectorAll('.exchange:checked')).map(el => el.value);
        const selectedSymbol = getSelectedSymbol();
        if (!selectedSymbol || selectedSymbol !== pendingBinanceEntry.symbol) return;

        const baseData = (internals.lastData || []).filter(d => d.exchange !== 'Binance');
        const merged = selectedExchanges.includes('Binance')
            ? [...baseData, pendingBinanceEntry]
            : baseData;

        internals.renderData(merged, selectedExchanges, selectedSymbol);
    }

    function disconnect(updateUi) {
        manuallyStopped = true;
        clearTimeout(reconnectTimer);
        clearTimeout(throttleTimer);
        throttleTimer = null;
        pendingBinanceEntry = null;
        if (ws) {
            try { ws.close(); } catch (e) { /* ignore */ }
            ws = null;
        }
        if (updateUi !== false) setStatus('off', 'off');
    }

    function start() {
        const symbol = getSelectedSymbol();
        if (!symbol) {
            setStatus('select a symbol first', 'error');
            document.getElementById('binance-ws-toggle').checked = false;
            return;
        }
        const binanceChecked = document.querySelector('.exchange[value="Binance"]')?.checked;
        if (!binanceChecked) {
            setStatus('check "Binance" above first', 'error');
            document.getElementById('binance-ws-toggle').checked = false;
            return;
        }
        manuallyStopped = false;
        connect(symbol);
    }

    document.addEventListener('DOMContentLoaded', function () {
        const toggle = document.getElementById('binance-ws-toggle');
        if (!toggle) return;
        setStatus('off', 'off');

        toggle.addEventListener('change', function () {
            if (this.checked) start();
            else disconnect(true);
        });

        // If the symbol changes while streaming, reconnect to the new pair.
        // Delegated so symbols added later via "Add Symbol" are covered too.
        document.querySelector('.symbol-dropdown-content')?.addEventListener('change', (e) => {
            if (!e.target.classList.contains('symbol')) return;
            if (toggle.checked && !manuallyStopped) {
                const symbol = getSelectedSymbol();
                if (symbol) connect(symbol);
            }
        });

        window.addEventListener('beforeunload', () => disconnect(false));
    });
})();

/* ---------------------------------------------------------------------------
   Watchlist live feed: streams a combined Binance miniTicker WebSocket for
   every symbol currently in the Multi-Symbol Watchlist, so Asset Compare
   builds up continuous price history automatically — no need to manually
   click "Refresh Watchlist" over and over. Only symbols that are valid
   Binance pairs will actually receive ticks; others are silently skipped by
   Binance (their checkbox in Asset Compare will just stay flat).
--------------------------------------------------------------------------- */
(function () {
    const RECORD_MIN_INTERVAL_MS = 3000; // per-symbol throttle for localStorage writes
    const RECONNECT_DELAY_MS = 3000;
    const WATCHLIST_POLL_MS = 4000; // checks for added/removed symbols
    const RERENDER_INTERVAL_MS = 5000; // keep Asset Compare charts fresh while open

    let watchlistWs = null;
    let watchlistManuallyStopped = true;
    let watchlistReconnectTimer = null;
    let watchlistPollTimer = null;
    let watchlistRerenderTimer = null;
    let lastStreamedSet = '';
    let lastRecordedAt = {}; // symbol -> timestamp

    function setWatchlistStatus(text, cls) {
        const el = document.getElementById('watchlist-ws-status');
        if (!el) return;
        el.textContent = text;
        el.classList.remove('live', 'off', 'error');
        if (cls) el.classList.add(cls);
    }

    function currentWatchlistSymbols() {
        if (typeof loadWatchlist !== 'function') return [];
        return loadWatchlist().map(s => s.toUpperCase());
    }

    function connectWatchlistStream() {
        const symbols = currentWatchlistSymbols();
        const setKey = symbols.slice().sort().join(',');

        if (symbols.length === 0) {
            disconnectWatchlistStream(false);
            setWatchlistStatus('watchlist is empty', 'off');
            return;
        }
        if (watchlistWs && setKey === lastStreamedSet) return; // no change, keep existing connection

        if (watchlistWs) {
            try { watchlistWs.close(); } catch (e) { /* ignore */ }
            watchlistWs = null;
        }

        lastStreamedSet = setKey;
        const streams = symbols.map(s => `${s.toLowerCase()}@miniTicker`).join('/');
        const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

        try {
            watchlistWs = new WebSocket(url);
        } catch (e) {
            setWatchlistStatus('WS unsupported', 'error');
            return;
        }

        setWatchlistStatus('connecting…', 'off');

        watchlistWs.onopen = () => setWatchlistStatus(`live (${symbols.length} symbols)`, 'live');

        watchlistWs.onmessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) { return; }
            const payload = msg?.data;
            if (!payload || !payload.s || !payload.c) return;

            const symbol = payload.s; // already uppercase, e.g. "BTCUSDT"
            const price = parseFloat(payload.c);
            if (!isFinite(price)) return;

            const now = Date.now();
            if (lastRecordedAt[symbol] && now - lastRecordedAt[symbol] < RECORD_MIN_INTERVAL_MS) return;
            lastRecordedAt[symbol] = now;

            if (typeof recordSimpleQuantPoint === 'function') {
                recordSimpleQuantPoint(symbol, price);
            }
        };

        watchlistWs.onerror = () => setWatchlistStatus('error, retrying…', 'error');

        watchlistWs.onclose = () => {
            if (watchlistManuallyStopped) {
                setWatchlistStatus('off', 'off');
                return;
            }
            setWatchlistStatus('reconnecting…', 'error');
            watchlistReconnectTimer = setTimeout(connectWatchlistStream, RECONNECT_DELAY_MS);
        };
    }

    function disconnectWatchlistStream(updateUi) {
        watchlistManuallyStopped = true;
        clearTimeout(watchlistReconnectTimer);
        clearInterval(watchlistPollTimer);
        clearInterval(watchlistRerenderTimer);
        watchlistPollTimer = null;
        watchlistRerenderTimer = null;
        lastStreamedSet = '';
        if (watchlistWs) {
            try { watchlistWs.close(); } catch (e) { /* ignore */ }
            watchlistWs = null;
        }
        if (updateUi !== false) setWatchlistStatus('off', 'off');
    }

    function startWatchlistStream() {
        watchlistManuallyStopped = false;
        connectWatchlistStream();
        // Re-check periodically for symbols added/removed from the watchlist
        // and reconnect the combined stream if the set actually changed.
        clearInterval(watchlistPollTimer);
        watchlistPollTimer = setInterval(() => {
            if (!watchlistManuallyStopped) connectWatchlistStream();
        }, WATCHLIST_POLL_MS);

        // While the Asset Compare tab is open, keep its charts refreshed as
        // new live points arrive, instead of requiring a manual click.
        clearInterval(watchlistRerenderTimer);
        watchlistRerenderTimer = setInterval(() => {
            if (watchlistManuallyStopped) return;
            const view = document.getElementById('view-compare');
            if (view && view.classList.contains('active') && typeof renderAssetCompare === 'function') {
                renderAssetCompare();
            }
        }, RERENDER_INTERVAL_MS);
    }

    document.addEventListener('DOMContentLoaded', function () {
        const toggle = document.getElementById('watchlist-ws-toggle');
        if (!toggle) return;
        setWatchlistStatus('off', 'off');

        toggle.addEventListener('change', function () {
            if (this.checked) startWatchlistStream();
            else disconnectWatchlistStream(true);
        });

        window.addEventListener('beforeunload', () => disconnectWatchlistStream(false));
    });
})();
