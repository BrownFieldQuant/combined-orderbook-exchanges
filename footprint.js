/* footprint.js
   Simplified footprint chart. Real trades only — no mocked data.

   Source: Binance Futures aggTrade WebSocket
   (wss://fstream.binance.com/ws/{symbol}@aggTrade), same public feed
   Cryexc's own backend spec (jose-donato/cryexc-backend) documents using
   for its footprint/CVD views. Trade direction follows their documented
   rule: Binance's "m" field (isBuyerMaker) — m === true means the trade
   was seller-initiated (aggressive sell), m === false means
   buyer-initiated (aggressive buy).

   Candle bucketing also follows their documented approach:
   candle_time = floor(tradeTime / intervalMs) * intervalMs

   This is a from-scratch build against our own stack. Scope is intentionally
   smaller: one exchange, no DOM ladder, no options flow, no cross-venue
   correlation, session-only (resets on reload).
*/

(function () {
    const MAX_CANDLES = 20;
    const RENDER_THROTTLE_MS = 700;

    let ws = null;
    let manuallyStopped = true;
    let reconnectTimer = null;
    let renderTimer = null;

    // candles: Map<candleTime, { levels: Map<priceLevel, {buy, sell}>, open, close, high, low }>
    let candles = new Map();
    let cvdSeries = []; // [[time, cumulativeDelta], ...]
    let cumulativeDelta = 0;
    let tickSize = 10;
    let intervalMs = 60000;
    let currentSymbol = 'BTCUSDT';

    let cvdChart = null;
    let klineWs = null;
    let klineChart = null;
    let klineCandles = new Map(); // openTime -> {o,h,l,c}
    const KLINE_CHART_MAX = 100;

    function setStatus(text, cls) {
        const el = document.getElementById('footprint-status');
        if (!el) return;
        el.textContent = text;
        el.style.color = cls === 'error' ? '#ef5350' : (cls === 'live' ? '#3ecf8e' : '#6b7280');
    }

    function bucketPrice(price) {
        return Math.round(price / tickSize) * tickSize;
    }

    function bucketTime(tradeTime) {
        return Math.floor(tradeTime / intervalMs) * intervalMs;
    }

    function handleTrade(price, qty, isSellInitiated, tradeTime) {
        const candleTime = bucketTime(tradeTime);
        const priceLevel = bucketPrice(price);

        let candle = candles.get(candleTime);
        if (!candle) {
            candle = { levels: new Map(), open: price, close: price, high: price, low: price };
            candles.set(candleTime, candle);

            // Prune old candles beyond the visible window.
            if (candles.size > MAX_CANDLES) {
                const oldestKey = Math.min(...candles.keys());
                candles.delete(oldestKey);
            }
        }
        candle.close = price;
        candle.high = Math.max(candle.high, price);
        candle.low = Math.min(candle.low, price);

        let level = candle.levels.get(priceLevel);
        if (!level) {
            level = { buy: 0, sell: 0 };
            candle.levels.set(priceLevel, level);
        }
        if (isSellInitiated) {
            level.sell += qty;
            cumulativeDelta -= qty;
        } else {
            level.buy += qty;
            cumulativeDelta += qty;
        }

        cvdSeries.push([tradeTime, cumulativeDelta]);
        if (cvdSeries.length > 3000) cvdSeries = cvdSeries.slice(-3000);

        scheduleRender();
    }

    function scheduleRender() {
        if (renderTimer) return;
        renderTimer = setTimeout(() => {
            renderTimer = null;
            renderGrid();
            renderCvdChart();
            renderKlineChart();
        }, RENDER_THROTTLE_MS);
    }

    function fmtVol(v) {
        if (v === 0) return '';
        if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
        return v.toFixed(v >= 10 ? 1 : 3);
    }

    function renderGrid() {
        const thead = document.querySelector('#footprint-table thead');
        const tbody = document.querySelector('#footprint-table tbody');
        const tfoot = document.querySelector('#footprint-table tfoot');
        if (!thead || !tbody || !tfoot) return;

        const sortedCandleTimes = Array.from(candles.keys()).sort((a, b) => a - b);
        if (sortedCandleTimes.length === 0) return;

        // Collect the full set of price levels across visible candles.
        const allLevels = new Set();
        sortedCandleTimes.forEach(t => {
            candles.get(t).levels.forEach((_, level) => allLevels.add(level));
        });
        const sortedLevels = Array.from(allLevels).sort((a, b) => b - a); // high price at top

        // Header row: time labels
        let headHtml = '<tr><th class="price-col">Price</th>';
        sortedCandleTimes.forEach(t => {
            headHtml += `<th>${new Date(t).toLocaleTimeString([], { hour12: false })}</th>`;
        });
        headHtml += '</tr>';
        thead.innerHTML = headHtml;

        // Body rows: one per price level. Also track each candle's
        // Point-of-Control (highest-volume price level) — a standard
        // footprint/quant-desk convention — to highlight below.
        const pocByCandle = new Map();
        sortedCandleTimes.forEach(t => {
            let bestLevel = null, bestVol = -1;
            candles.get(t).levels.forEach((lvl, level) => {
                const total = lvl.buy + lvl.sell;
                if (total > bestVol) { bestVol = total; bestLevel = level; }
            });
            pocByCandle.set(t, bestLevel);
        });

        let bodyHtml = '';
        sortedLevels.forEach(level => {
            bodyHtml += `<tr><td class="price-col">${level.toLocaleString()}</td>`;
            sortedCandleTimes.forEach(t => {
                const lvl = candles.get(t).levels.get(level);
                const isPoc = pocByCandle.get(t) === level;
                if (!lvl) {
                    bodyHtml += `<td${isPoc ? ' class="fp-poc"' : ''}>-</td>`;
                } else {
                    const buyTxt = fmtVol(lvl.buy);
                    const sellTxt = fmtVol(lvl.sell);
                    bodyHtml += `<td${isPoc ? ' class="fp-poc"' : ''}><span class="footprint-cell-buy">${buyTxt}</span> / <span class="footprint-cell-sell">${sellTxt}</span></td>`;
                }
            });
            bodyHtml += '</tr>';
        });
        tbody.innerHTML = bodyHtml;

        // Footer row: per-candle delta (total buy - total sell)
        let footHtml = '<tr><td class="price-col">Delta</td>';
        sortedCandleTimes.forEach(t => {
            let buySum = 0, sellSum = 0;
            candles.get(t).levels.forEach(lvl => { buySum += lvl.buy; sellSum += lvl.sell; });
            const delta = buySum - sellSum;
            const cls = delta >= 0 ? 'fp-delta-pos' : 'fp-delta-neg';
            footHtml += `<td class="delta-row ${cls}">${delta >= 0 ? '+' : ''}${fmtVol(Math.abs(delta)) || '0'}</td>`;
        });
        footHtml += '</tr>';
        tfoot.innerHTML = footHtml;
    }

    function renderCvdChart() {
        if (typeof Highcharts === 'undefined') return;
        const container = document.getElementById('footprint-cvd-chart');
        if (!container) return;

        const options = {
            chart: { animation: false, backgroundColor: 'transparent' },
            title: { text: null },
            credits: { enabled: false },
            legend: { enabled: false },
            xAxis: { type: 'datetime', labels: { style: { fontSize: '9px', color: '#9aa4b5' } }, lineColor: '#232838' },
            yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130', plotLines: [{ value: 0, color: '#6b7280', width: 1 }] },
            tooltip: { valueDecimals: 4 },
            series: [{ name: 'CVD', type: 'line', data: cvdSeries, color: '#c9975a', marker: { enabled: false } }]
        };

        if (!cvdChart) {
            cvdChart = Highcharts.chart('footprint-cvd-chart', options);
            if (typeof attachChartWatermark === 'function') attachChartWatermark(cvdChart);
        } else {
            cvdChart.update(options, true, true);
        }
    }

    function binanceKlineInterval(ms) {
        // Binance has no 30s kline; use the closest supported interval.
        if (ms <= 30000) return '1m';
        if (ms <= 60000) return '1m';
        if (ms <= 300000) return '5m';
        return '15m';
    }

    function renderKlineChart() {
        if (typeof Highcharts === 'undefined') return;
        const container = document.getElementById('footprint-candle-chart');
        if (!container) return;

        const sorted = Array.from(klineCandles.entries()).sort((a, b) => a[0] - b[0]).slice(-KLINE_CHART_MAX);
        const data = sorted.map(([t, c]) => [t, c.o, c.h, c.l, c.c]);
        if (data.length === 0) return;

        const options = {
            chart: { animation: false, backgroundColor: 'transparent' },
            title: { text: null },
            credits: { enabled: false },
            legend: { enabled: false },
            xAxis: { type: 'datetime', labels: { style: { fontSize: '9px', color: '#9aa4b5' } }, lineColor: '#232838' },
            yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130' },
            tooltip: { valueDecimals: 4 },
            series: [{
                name: currentSymbol,
                type: 'candlestick',
                data,
                color: '#ef5350',
                upColor: '#3ecf8e',
                lineColor: '#ef5350',
                upLineColor: '#3ecf8e'
            }]
        };

        if (!klineChart) {
            klineChart = Highcharts.chart('footprint-candle-chart', options);
            if (typeof attachChartWatermark === 'function') attachChartWatermark(klineChart, 'Binance Futures Kline WebSocket');
        } else {
            klineChart.update(options, true, true);
        }
    }

    function connectKlineStream(symbol, intervalMs) {
        disconnectKlineStream();
        klineCandles = new Map();
        const klineInterval = binanceKlineInterval(intervalMs);
        const url = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${klineInterval}`;

        try {
            klineWs = new WebSocket(url);
        } catch (e) {
            return;
        }

        klineWs.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            const k = msg?.k;
            if (!k) return;
            klineCandles.set(k.t, { o: parseFloat(k.o), h: parseFloat(k.h), l: parseFloat(k.l), c: parseFloat(k.c) });
            if (klineCandles.size > KLINE_CHART_MAX) {
                const oldest = Math.min(...klineCandles.keys());
                klineCandles.delete(oldest);
            }
            scheduleRender();
        };

        klineWs.onclose = () => {
            if (!manuallyStopped) {
                setTimeout(() => connectKlineStream(symbol, intervalMs), 3000);
            }
        };
    }

    function disconnectKlineStream() {
        if (klineWs) {
            try { klineWs.close(); } catch (e) { /* ignore */ }
            klineWs = null;
        }
    }

    function connect() {
        disconnect(false);
        currentSymbol = (document.getElementById('footprint-symbol')?.value || 'BTCUSDT').trim().toUpperCase();
        intervalMs = parseInt(document.getElementById('footprint-interval')?.value || '60000');
        tickSize = parseFloat(document.getElementById('footprint-ticksize')?.value || '10') || 10;

        document.getElementById('footprint-symbol-label').textContent = currentSymbol;
        candles = new Map();
        cvdSeries = [];
        cumulativeDelta = 0;

        const url = `wss://fstream.binance.com/ws/${currentSymbol.toLowerCase()}@aggTrade`;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            setStatus('WS unsupported', 'error');
            return;
        }

        setStatus('connecting…');

        ws.onopen = () => setStatus('live', 'live');

        ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (!msg || msg.p === undefined) return;
            const price = parseFloat(msg.p);
            const qty = parseFloat(msg.q);
            const isSellInitiated = msg.m === true; // buyer is maker => seller was aggressor
            const tradeTime = msg.T || Date.now();
            handleTrade(price, qty, isSellInitiated, tradeTime);
        };

        ws.onerror = () => setStatus('error, retrying…', 'error');

        ws.onclose = () => {
            if (manuallyStopped) {
                setStatus('off');
                return;
            }
            setStatus('reconnecting…', 'error');
            reconnectTimer = setTimeout(connect, 3000);
        };

        manuallyStopped = false;
        connectKlineStream(currentSymbol, intervalMs);
    }

    function disconnect(updateUi) {
        manuallyStopped = true;
        clearTimeout(reconnectTimer);
        clearTimeout(renderTimer);
        renderTimer = null;
        if (ws) {
            try { ws.close(); } catch (e) { /* ignore */ }
            ws = null;
        }
        disconnectKlineStream();
        if (updateUi !== false) setStatus('off');
    }

    document.addEventListener('DOMContentLoaded', function () {
        const toggleBtn = document.getElementById('footprint-toggle-btn');
        if (!toggleBtn) return;
        setStatus('off');

        toggleBtn.addEventListener('click', function () {
            if (manuallyStopped) {
                connect();
                toggleBtn.textContent = 'Stop Stream';
            } else {
                disconnect(true);
                toggleBtn.textContent = 'Start Stream';
            }
        });

        window.addEventListener('beforeunload', () => disconnect(false));
    });

    window.initFootprintTab = function () {
        if (cvdChart) cvdChart.reflow();
        if (klineChart) klineChart.reflow();
    };
})();
