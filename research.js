/* research.js
   Deeper research tools built on top of features.js / script.js:
   1. Cumulative depth chart (Highcharts area chart)
   2. Slippage calculator against the currently fetched combined order book
   3. Spread history chart (records a point on every fetch, kept in localStorage)
   4. Multi-symbol watchlist (best bid/ask across the selected exchanges)
   5. Export current snapshot to CSV/JSON, and an optional running fetch log
   All hooks run through window.onOrderbookFetched(data, symbol), which
   script.js calls at the end of every successful fetchData().
*/

const SPREAD_HISTORY_KEY = 'orderbook_spread_history';
const WATCHLIST_KEY = 'orderbook_watchlist_symbols';
const MAX_HISTORY_POINTS = 200;

let depthChart = null;
let spreadChart = null;
let fetchLog = [];

// Draws "Lowcost Research" INSIDE the chart's own SVG (not an HTML overlay),
// so it's preserved when the person uses Highcharts' built-in "View in full
// screen" or "Download PNG/JPEG/SVG" export — those only capture the chart's
// own rendered output, not surrounding page HTML.
function attachChartWatermark(chart) {
    if (!chart || chart.__watermarkAttached) return;
    chart.__watermarkAttached = true;
    const draw = () => {
        if (chart.customWatermark) {
            chart.customWatermark.destroy();
            chart.customWatermark = null;
        }
        if (!chart.plotWidth || !chart.plotHeight) return;
        const cx = chart.plotLeft + chart.plotWidth / 2;
        const cy = chart.plotTop + chart.plotHeight / 2;
        const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '201, 151, 90';
        chart.customWatermark = chart.renderer.text('Lowcost Research', cx, cy)
            .attr({ align: 'center', rotation: -18, zIndex: 5 })
            .css({
                color: `rgba(${accentRgb}, 0.14)`,
                fontSize: Math.max(14, Math.min(chart.plotWidth / 10, 30)) + 'px',
                fontWeight: '800',
                letterSpacing: '2px',
                fontFamily: 'Arial, sans-serif'
            })
            .add();
    };
    Highcharts.addEvent(chart, 'render', draw);
    draw();
    if (typeof window.registerThemedChart === 'function') {
        window.registerThemedChart(chart);
    }
}

/* ------------------------------ DEPTH CHART ------------------------------ */

function buildDepthChart(data, symbol) {
    const container = document.getElementById('depthchart');
    if (!container || typeof Highcharts === 'undefined') return;

    // Merge all exchanges' levels into one combined book, then build
    // cumulative step series for bids (descending price) and asks (ascending).
    let allBids = [];
    let allAsks = [];
    data.forEach(({ bids, asks }) => {
        allBids.push(...bids);
        allAsks.push(...asks);
    });
    allBids.sort((a, b) => b[0] - a[0]);
    allAsks.sort((a, b) => a[0] - b[0]);

    let cum = 0;
    const bidSeries = allBids.map(([price, qty]) => { cum += qty; return [price, cum]; });
    cum = 0;
    const askSeries = allAsks.map(([price, qty]) => { cum += qty; return [price, cum]; });

    const options = {
        chart: { type: 'area', animation: false },
        title: { text: `Combined Depth — ${symbol}`, style: { fontSize: '11px' } },
        xAxis: { title: { text: 'Price', style: { fontSize: '10px' } }, labels: { style: { fontSize: '9px' } } },
        yAxis: { title: { text: 'Cumulative Qty', style: { fontSize: '10px' } }, labels: { style: { fontSize: '9px' } } },
        tooltip: { valueDecimals: 6, shared: false },
        credits: { enabled: false },
        legend: { itemStyle: { fontSize: '9px' } },
        plotOptions: { area: { marker: { enabled: false }, step: 'left' } },
        series: [
            { name: 'Bids (cumulative)', data: bidSeries, color: '#2e7d32' },
            { name: 'Asks (cumulative)', data: askSeries, color: '#c62828' }
        ]
    };

    if (!depthChart) {
        depthChart = Highcharts.chart('depthchart', options);
        attachChartWatermark(depthChart);
    } else {
        depthChart.update(options, true, true);
    }
}

/* --------------------------- SLIPPAGE CALCULATOR --------------------------- */

function calculateSlippage() {
    const internals = window.__orderbookInternals;
    if (!internals || !internals.lastData || internals.lastData.length === 0) {
        document.getElementById('slippage-result').textContent = 'Fetch data first.';
        return;
    }
    const side = document.getElementById('slippage-side').value;
    const qty = parseFloat(document.getElementById('slippage-qty').value);
    if (isNaN(qty) || qty <= 0) {
        document.getElementById('slippage-result').textContent = 'Enter a valid quantity.';
        return;
    }

    let levels = [];
    internals.lastData.forEach(({ bids, asks }) => {
        levels.push(...(side === 'buy' ? asks : bids));
    });
    levels.sort((a, b) => side === 'buy' ? a[0] - b[0] : b[0] - a[0]);

    let remaining = qty;
    let notional = 0;
    let filled = 0;
    for (const [price, availQty] of levels) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, availQty);
        notional += take * price;
        filled += take;
        remaining -= take;
    }

    const resultEl = document.getElementById('slippage-result');
    if (filled === 0) {
        resultEl.textContent = 'No liquidity available at current book depth.';
        return;
    }
    const avgPrice = notional / filled;
    const bestPrice = levels[0][0];
    const slippagePct = Math.abs((avgPrice - bestPrice) / bestPrice * 100);
    const unfilledNote = remaining > 0 ? ` (only ${filled.toFixed(6)} of ${qty} fillable within fetched depth)` : '';

    resultEl.textContent = `Avg execution price: ${avgPrice.toFixed(6)} | Slippage vs best price: ${slippagePct.toFixed(3)}%${unfilledNote}`;
}

/* ---------------------------- SPREAD HISTORY ---------------------------- */

function loadSpreadHistory() {
    try {
        return JSON.parse(localStorage.getItem(SPREAD_HISTORY_KEY)) || {};
    } catch (e) {
        return {};
    }
}

function saveSpreadHistory(history) {
    localStorage.setItem(SPREAD_HISTORY_KEY, JSON.stringify(history));
}

function recordSpreadPoint(data, symbol) {
    let bestBid = -Infinity, bestAsk = Infinity;
    data.forEach(({ bids, asks }) => {
        bids.forEach(([p]) => { if (p > bestBid) bestBid = p; });
        asks.forEach(([p]) => { if (p < bestAsk) bestAsk = p; });
    });
    if (!isFinite(bestBid) || !isFinite(bestAsk)) return;
    const spreadPct = (bestAsk - bestBid) / bestBid * 100;

    const history = loadSpreadHistory();
    if (!history[symbol]) history[symbol] = [];
    history[symbol].push([Date.now(), spreadPct]);
    if (history[symbol].length > MAX_HISTORY_POINTS) {
        history[symbol] = history[symbol].slice(-MAX_HISTORY_POINTS);
    }
    saveSpreadHistory(history);
    renderSpreadChart(symbol);
}

function renderSpreadChart(symbol) {
    const container = document.getElementById('spreadhistorychart');
    if (!container || typeof Highcharts === 'undefined') return;
    const history = loadSpreadHistory();
    const points = history[symbol] || [];

    const options = {
        chart: { type: 'line', animation: false },
        title: { text: `Spread % History — ${symbol}`, style: { fontSize: '11px' } },
        xAxis: { type: 'datetime', labels: { style: { fontSize: '9px' } } },
        yAxis: { title: { text: 'Spread %', style: { fontSize: '10px' } }, labels: { style: { fontSize: '9px' } } },
        tooltip: { valueDecimals: 4 },
        credits: { enabled: false },
        legend: { enabled: false },
        series: [{ name: 'Spread %', data: points, color: '#1565c0' }]
    };

    if (!spreadChart) {
        spreadChart = Highcharts.chart('spreadhistorychart', options);
        attachChartWatermark(spreadChart);
    } else {
        spreadChart.update(options, true, true);
    }
}

/* ------------------------------ WATCHLIST ------------------------------ */

function loadWatchlist() {
    try {
        return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function saveWatchlist(list) {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}

function addToWatchlist() {
    const input = document.getElementById('watch-symbol-input');
    const symbol = input.value.trim().toUpperCase();
    if (!symbol) return;
    const list = loadWatchlist();
    if (!list.includes(symbol)) {
        list.push(symbol);
        saveWatchlist(list);
    }
    input.value = '';
    refreshWatchlist();
}

function removeFromWatchlist(symbol) {
    const list = loadWatchlist().filter(s => s !== symbol);
    saveWatchlist(list);
    refreshWatchlist();
}

async function refreshWatchlist() {
    const tbody = document.querySelector('#watchlist-table tbody');
    if (!tbody) return;
    const internals = window.__orderbookInternals;
    const list = loadWatchlist();
    const selectedExchanges = internals?.lastExchanges?.length
        ? internals.lastExchanges
        : Array.from(document.querySelectorAll('.exchange:checked')).map(el => el.value);

    tbody.innerHTML = '';
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No symbols in watchlist yet.</td></tr>';
        return;
    }
    if (!internals || !internals.fetchExchangeData || selectedExchanges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Select exchanges and fetch data at least once first.</td></tr>';
        return;
    }

    const sliceSize = internals.getSliceSize ? internals.getSliceSize() : 10;

    for (const symbol of list) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${symbol}</td><td colspan="3">Loading...</td><td></td>`;
        tbody.appendChild(tr);

        const results = await Promise.all(
            selectedExchanges.map(ex => internals.fetchExchangeData(ex, symbol, sliceSize).catch(() => null))
        );
        const valid = results.filter(Boolean);
        let bestBid = -Infinity, bestAsk = Infinity;
        valid.forEach(({ bids, asks }) => {
            bids.forEach(([p]) => { if (p > bestBid) bestBid = p; });
            asks.forEach(([p]) => { if (p < bestAsk) bestAsk = p; });
        });

        const removeBtn = `<button onclick="window.__research_removeFromWatchlist('${symbol}')">Remove</button>`;
        if (!isFinite(bestBid) || !isFinite(bestAsk)) {
            tr.innerHTML = `<td>${symbol}</td><td>-</td><td>-</td><td>-</td><td>${removeBtn}</td>`;
        } else {
            const spreadPct = ((bestAsk - bestBid) / bestBid * 100).toFixed(3);
            tr.innerHTML = `<td>${symbol}</td><td>${bestBid}</td><td>${bestAsk}</td><td>${spreadPct}%</td><td>${removeBtn}</td>`;
            recordSimpleQuantPoint(symbol, (bestBid + bestAsk) / 2);
        }
    }
}
window.__research_removeFromWatchlist = removeFromWatchlist;

/* ------------------------------ EXPORT / LOG ------------------------------ */

function snapshotToCSV(data, symbol) {
    const rows = [['exchange', 'symbol', 'side', 'price', 'quantity']];
    data.forEach(({ exchange, bids, asks }) => {
        bids.forEach(([p, q]) => rows.push([exchange, symbol, 'bid', p, q]));
        asks.forEach(([p, q]) => rows.push([exchange, symbol, 'ask', p, q]));
    });
    return rows.map(r => r.join(',')).join('\n');
}

function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportSnapshotCSV() {
    const internals = window.__orderbookInternals;
    if (!internals || !internals.lastData) { alert('Fetch data first.'); return; }
    const csv = snapshotToCSV(internals.lastData, internals.lastSymbol);
    downloadBlob(csv, `orderbook-${internals.lastSymbol}-${Date.now()}.csv`, 'text/csv');
}

function exportSnapshotJSON() {
    const internals = window.__orderbookInternals;
    if (!internals || !internals.lastData) { alert('Fetch data first.'); return; }
    const payload = { symbol: internals.lastSymbol, timestamp: Date.now(), data: internals.lastData };
    downloadBlob(JSON.stringify(payload, null, 2), `orderbook-${internals.lastSymbol}-${Date.now()}.json`, 'application/json');
}

function exportLogJSON() {
    if (fetchLog.length === 0) { alert('No log entries yet — enable "Log every fetch" first.'); return; }
    downloadBlob(JSON.stringify(fetchLog, null, 2), `orderbook-fetch-log-${Date.now()}.json`, 'application/json');
}

const LADDER_DEPTH = 15;

function buildPriceLadder(data, symbol) {
    const container = document.getElementById('ladder-container');
    if (!container) return;

    const askMap = new Map();
    const bidMap = new Map();
    data.forEach(({ asks, bids }) => {
        asks.forEach(([p, q]) => askMap.set(p, (askMap.get(p) || 0) + q));
        bids.forEach(([p, q]) => bidMap.set(p, (bidMap.get(p) || 0) + q));
    });

    const askLevels = Array.from(askMap.entries()).sort((a, b) => a[0] - b[0]).slice(0, LADDER_DEPTH);
    const bidLevels = Array.from(bidMap.entries()).sort((a, b) => b[0] - a[0]).slice(0, LADDER_DEPTH);

    if (askLevels.length === 0 && bidLevels.length === 0) {
        container.innerHTML = '<div class="ladder-mid">No data</div>';
        return;
    }

    const maxQty = Math.max(0.000001, ...askLevels.map(l => l[1]), ...bidLevels.map(l => l[1]));
    const bestAsk = askLevels.length ? askLevels[0][0] : null;
    const bestBid = bidLevels.length ? bidLevels[0][0] : null;
    const spreadLabel = (bestAsk !== null && bestBid !== null)
        ? `Spread: ${(bestAsk - bestBid).toFixed(6)} (${((bestAsk - bestBid) / bestBid * 100).toFixed(3)}%)`
        : symbol;

    let html = '<div class="ladder-header"><span>Price</span><span>Qty</span></div>';

    askLevels.slice().reverse().forEach(([p, q]) => {
        const pct = Math.min(100, (q / maxQty * 100)).toFixed(1);
        html += `<div class="ladder-row ask-row"><div class="ladder-bar" style="width:${pct}%"></div><span class="ladder-price">${p}</span><span class="ladder-qty">${q.toFixed(4)}</span></div>`;
    });

    html += `<div class="ladder-mid">${spreadLabel}</div>`;

    bidLevels.forEach(([p, q]) => {
        const pct = Math.min(100, (q / maxQty * 100)).toFixed(1);
        html += `<div class="ladder-row bid-row"><div class="ladder-bar" style="width:${pct}%"></div><span class="ladder-price">${p}</span><span class="ladder-qty">${q.toFixed(4)}</span></div>`;
    });

    container.innerHTML = html;
}

/* ------------------------------ QUANT SIGNALS ------------------------------ */

const QUANT_BUFFER_SIZE = 30;
let midPriceBuffer = [];   // recent mid prices, in-memory only (resets on reload)
let spreadPctBuffer = [];  // recent spread %, for z-score
let prevBookState = null;  // { bidQty, askQty } from the previous fetch, for OFI

function computeAggregateBook(data) {
    let bestBid = -Infinity, bestAsk = Infinity;
    let bestBidQty = 0, bestAskQty = 0;
    let totalBidQty = 0, totalAskQty = 0;

    data.forEach(({ bids, asks }) => {
        bids.forEach(([p, q]) => {
            totalBidQty += q;
            if (p > bestBid) { bestBid = p; bestBidQty = q; }
            else if (p === bestBid) { bestBidQty += q; }
        });
        asks.forEach(([p, q]) => {
            totalAskQty += q;
            if (p < bestAsk) { bestAsk = p; bestAskQty = q; }
            else if (p === bestAsk) { bestAskQty += q; }
        });
    });

    // Signature of which exchanges contributed, so OFI comparisons only run
    // against a fetch built from the SAME set of exchanges — mixing in/out an
    // exchange (e.g. a REST call failing, or the Binance WS feed toggling)
    // otherwise causes a fake jump that isn't real order flow.
    const signature = data.map(d => d.exchange).sort().join(',');

    return { bestBid, bestAsk, bestBidQty, bestAskQty, totalBidQty, totalAskQty, signature };
}

function setQuantValue(id, text, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove('quant-positive', 'quant-negative');
    if (cls) el.classList.add(cls);
}

function updateQuantSignals(data, symbol) {
    const labelEl = document.getElementById('quant-symbol-label');
    if (labelEl) labelEl.textContent = symbol;

    const book = computeAggregateBook(data);
    if (!isFinite(book.bestBid) || !isFinite(book.bestAsk)) return;

    const midPrice = (book.bestBid + book.bestAsk) / 2;
    // Microprice: weighted toward the side with less resting size (i.e. weighted
    // by the OPPOSITE side's quantity), a standard short-term fair-value estimate.
    const microprice = (book.bestBid * book.bestAskQty + book.bestAsk * book.bestBidQty)
        / (book.bestBidQty + book.bestAskQty || 1);
    const spreadPct = (book.bestAsk - book.bestBid) / book.bestBid * 100;

    setQuantValue('quant-mid', midPrice.toFixed(6));
    const microDelta = microprice - midPrice;
    setQuantValue('quant-microprice', microprice.toFixed(6), microDelta > 0 ? 'quant-positive' : (microDelta < 0 ? 'quant-negative' : null));

    // --- Spread Z-score (mean reversion signal) ---
    spreadPctBuffer.push(spreadPct);
    if (spreadPctBuffer.length > QUANT_BUFFER_SIZE) spreadPctBuffer.shift();
    if (spreadPctBuffer.length >= 5) {
        const mean = spreadPctBuffer.reduce((s, v) => s + v, 0) / spreadPctBuffer.length;
        const variance = spreadPctBuffer.reduce((s, v) => s + (v - mean) ** 2, 0) / spreadPctBuffer.length;
        const stdDev = Math.sqrt(variance);
        const z = stdDev > 0 ? (spreadPct - mean) / stdDev : 0;
        setQuantValue('quant-zscore', z.toFixed(2) + 'σ', z > 1 ? 'quant-negative' : (z < -1 ? 'quant-positive' : null));
    } else {
        setQuantValue('quant-zscore', 'warming up...');
    }

    // --- Realized volatility (annualized %, from log returns of mid price) ---
    midPriceBuffer.push(midPrice);
    if (midPriceBuffer.length > QUANT_BUFFER_SIZE) midPriceBuffer.shift();
    if (midPriceBuffer.length >= 5) {
        const returns = [];
        for (let i = 1; i < midPriceBuffer.length; i++) {
            returns.push(Math.log(midPriceBuffer[i] / midPriceBuffer[i - 1]));
        }
        const meanRet = returns.reduce((s, v) => s + v, 0) / returns.length;
        const variance = returns.reduce((s, v) => s + (v - meanRet) ** 2, 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        // Rough annualization assuming ~1 fetch per refresh cycle; treated as a
        // relative/comparative volatility gauge rather than a precise figure.
        const annualizedPct = stdDev * Math.sqrt(365 * 24 * 12) * 100;
        setQuantValue('quant-vol', annualizedPct.toFixed(2) + '%');
    } else {
        setQuantValue('quant-vol', 'warming up...');
    }

    // --- Order Flow Imbalance delta vs previous fetch (only if the same set
    //     of exchanges contributed both times — otherwise it's not a real
    //     flow change, just a different sample, so we quietly recalibrate) ---
    if (prevBookState && prevBookState.signature === book.signature) {
        const bidChange = book.totalBidQty - prevBookState.totalBidQty;
        const askChange = book.totalAskQty - prevBookState.totalAskQty;
        const ofi = bidChange - askChange;
        prevOfiValue = ofi;
        const sign = ofi > 0 ? '+' : '';
        setQuantValue('quant-ofi', sign + ofi.toFixed(4), ofi > 0 ? 'quant-positive' : (ofi < 0 ? 'quant-negative' : null));
    } else {
        prevOfiValue = 0;
        setQuantValue('quant-ofi', prevBookState ? 'recalibrating…' : 'first fetch');
    }
    prevBookState = book;

    // --- Track history for the Quant Analytics tab chart (persisted per symbol) ---
    const history = loadQuantHistory(symbol);
    const cumulativeOFI = history.length
        ? history[history.length - 1].cofi + (prevOfiValue || 0)
        : (prevOfiValue || 0);
    history.push({
        time: Date.now(),
        mid: midPrice,
        cofi: cumulativeOFI,
        zscore: spreadPctBuffer.length >= 5
            ? (spreadPct - (spreadPctBuffer.reduce((s, v) => s + v, 0) / spreadPctBuffer.length))
            : 0
    });
    if (history.length > QUANT_HISTORY_MAX) history.splice(0, history.length - QUANT_HISTORY_MAX);
    saveQuantHistory(symbol, history);

    updateQuantAnalyticsStats(symbol, midPrice, microprice, history);
    renderQuantAnalyticsChart(symbol);
}

/* --------------------------- QUANT ANALYTICS TAB --------------------------- */

const QUANT_HISTORY_MAX = 5000; // persisted points per symbol (~ many hours/days of research data)
const QUANT_HISTORY_KEY_PREFIX = 'orderbook_quant_history_';
const QUANT_RANGES = { '15m': 15 * 60 * 1000, '1h': 60 * 60 * 1000, '4h': 4 * 60 * 60 * 1000, '1d': 24 * 60 * 60 * 1000, all: Infinity };
let selectedQuantRange = '1h';
let prevOfiValue = 0;
let lastRenderedSymbol = null;

function loadQuantHistory(symbol) {
    try {
        return JSON.parse(localStorage.getItem(QUANT_HISTORY_KEY_PREFIX + symbol)) || [];
    } catch (e) {
        return [];
    }
}

function saveQuantHistory(symbol, history) {
    try {
        localStorage.setItem(QUANT_HISTORY_KEY_PREFIX + symbol, JSON.stringify(history));
    } catch (e) {
        // Storage full/unavailable — trim harder and retry once.
        const trimmed = history.slice(-500);
        try { localStorage.setItem(QUANT_HISTORY_KEY_PREFIX + symbol, JSON.stringify(trimmed)); } catch (e2) { /* give up silently */ }
    }
}

// Lightweight recorder used by the watchlist (mid price only, no OFI/z-score),
// so any symbol in the watchlist also builds up history for Asset Compare.
function recordSimpleQuantPoint(symbol, midPrice) {
    const history = loadQuantHistory(symbol);
    const lastCofi = history.length ? history[history.length - 1].cofi : 0;
    history.push({ time: Date.now(), mid: midPrice, cofi: lastCofi, zscore: 0 });
    if (history.length > QUANT_HISTORY_MAX) history.splice(0, history.length - QUANT_HISTORY_MAX);
    saveQuantHistory(symbol, history);
}

function updateQuantAnalyticsStats(symbol, midPrice, microprice, history) {
    const symLabel = document.getElementById('quant-analytics-symbol');
    if (symLabel) symLabel.textContent = symbol;

    const setStat = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setStat('qa-mid', midPrice.toFixed(6));
    setStat('qa-microprice', microprice.toFixed(6));
    setStat('qa-zscore', document.getElementById('quant-zscore')?.textContent || '-');
    setStat('qa-vol', document.getElementById('quant-vol')?.textContent || '-');
    const lastPoint = history[history.length - 1];
    setStat('qa-cofi', lastPoint ? lastPoint.cofi.toFixed(4) : '-');
    setStat('qa-points', String(history.length));
}

let quantChartMid = null;
let quantChartOfi = null;
let quantChartZscore = null;

function baseQuantChartOptions() {
    return {
        chart: { animation: false, backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { type: 'datetime', labels: { style: { fontSize: '8px', color: '#9aa4b5' } }, lineColor: '#232838', tickColor: '#232838' },
        tooltip: { valueDecimals: 4 }
    };
}

function renderQuantAnalyticsChart(symbol) {
    if (typeof Highcharts === 'undefined') return;

    lastRenderedSymbol = symbol;
    const fullHistory = loadQuantHistory(symbol);
    if (fullHistory.length === 0) return;

    const rangeMs = QUANT_RANGES[selectedQuantRange];
    const cutoff = rangeMs === Infinity ? 0 : Date.now() - rangeMs;
    const visible = fullHistory.filter(p => p.time >= cutoff);
    const points = visible.length > 0 ? visible : fullHistory.slice(-1);

    const midSeries = points.map(p => [p.time, p.mid]);
    const ofiSeries = points.map(p => [p.time, p.cofi]);
    const zSeries = points.map(p => [p.time, p.zscore]);

    const subtitleText = `${symbol} · ${selectedQuantRange.toUpperCase()} · ${points.length} pts`;

    // --- Mid Price ---
    const midOptions = Object.assign(baseQuantChartOptions(), {
        subtitle: { text: subtitleText, style: { fontSize: '9px', color: '#6b7280' } },
        yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130' },
        series: [{ name: 'Mid Price', type: 'line', data: midSeries, color: '#c9975a', marker: { enabled: false } }]
    });
    if (!quantChartMid) { quantChartMid = Highcharts.chart('qa-chart-mid', midOptions); attachChartWatermark(quantChartMid); }
    else quantChartMid.update(midOptions, true, true);

    // --- Cumulative OFI ---
    const ofiOptions = Object.assign(baseQuantChartOptions(), {
        subtitle: { text: subtitleText, style: { fontSize: '9px', color: '#6b7280' } },
        yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#9aa4b5' } }, gridLineColor: '#1c2130' },
        plotOptions: {
            area: {
                marker: { enabled: false },
                fillOpacity: 0.25,
                threshold: 0,
                zones: [
                    { value: 0, color: '#ef5350', fillColor: 'rgba(239, 83, 80, 0.25)' },
                    { color: '#3ecf8e', fillColor: 'rgba(62, 207, 142, 0.25)' }
                ]
            }
        },
        series: [{ name: 'Cumulative OFI', type: 'area', data: ofiSeries }]
    });
    if (!quantChartOfi) { quantChartOfi = Highcharts.chart('qa-chart-ofi', ofiOptions); attachChartWatermark(quantChartOfi); }
    else quantChartOfi.update(ofiOptions, true, true);

    // --- Spread Z-score ---
    const zOptions = Object.assign(baseQuantChartOptions(), {
        subtitle: { text: subtitleText, style: { fontSize: '9px', color: '#6b7280' } },
        yAxis: {
            title: { text: null },
            labels: { style: { fontSize: '9px', color: '#9aa4b5' } },
            gridLineColor: '#1c2130',
            plotLines: [
                { value: 1, color: 'rgba(239, 83, 80, 0.5)', dashStyle: 'Dash', width: 1 },
                { value: -1, color: 'rgba(62, 207, 142, 0.5)', dashStyle: 'Dash', width: 1 }
            ]
        },
        series: [{ name: 'Spread Z-score', type: 'line', data: zSeries, color: '#5aa9e6', marker: { enabled: false } }]
    });
    if (!quantChartZscore) { quantChartZscore = Highcharts.chart('qa-chart-zscore', zOptions); attachChartWatermark(quantChartZscore); }
    else quantChartZscore.update(zOptions, true, true);
}

function initQuantRangeButtons() {
    const container = document.getElementById('quant-range-buttons');
    if (!container) return;
    container.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedQuantRange = btn.dataset.range;
            const symbol = lastRenderedSymbol || document.querySelector('.symbol:checked')?.value;
            if (symbol) {
                renderQuantAnalyticsChart(symbol);
                renderTechnicalIndicators(symbol, selectedQuantRange);
            }
        });
    });
}

/* --------------------------- ASSET COMPARE TAB --------------------------- */

const COMPARE_COLORS = ['#c9975a', '#5aa9e6', '#3ecf8e', '#ef5350', '#b48ead', '#e5c07b', '#56b6c2', '#e06c75'];
let selectedCompareRange = '1h';
let selectedCompareSymbols = new Set();
let compareChartPerf = null;
let compareChartVol = null;

function getComparableSymbols() {
    const watch = loadWatchlist();
    const mainSymbol = document.querySelector('.symbol:checked')?.value;
    const all = new Set(watch);
    if (mainSymbol) all.add(mainSymbol);
    return Array.from(all);
}

function populateCompareSymbolList() {
    const container = document.getElementById('compare-symbol-list');
    if (!container) return;
    const symbols = getComparableSymbols();

    if (selectedCompareSymbols.size === 0) {
        symbols.forEach(s => selectedCompareSymbols.add(s));
    }

    if (symbols.length === 0) {
        container.innerHTML = '<span style="color:#6b7280;font-size:10px;">Add symbols to your Watchlist on the Order Book tab first.</span>';
        return;
    }

    container.innerHTML = '';
    symbols.forEach(sym => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedCompareSymbols.has(sym);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) selectedCompareSymbols.add(sym);
            else selectedCompareSymbols.delete(sym);
            renderAssetCompare();
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(sym));
        container.appendChild(label);
    });
}

function logReturns(values) {
    const returns = [];
    for (let i = 1; i < values.length; i++) {
        if (values[i - 1] > 0 && values[i] > 0) returns.push(Math.log(values[i] / values[i - 1]));
    }
    return returns;
}

function pearsonCorrelation(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 3) return null;
    const x = a.slice(-n), y = b.slice(-n);
    const meanX = x.reduce((s, v) => s + v, 0) / n;
    const meanY = y.reduce((s, v) => s + v, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX, dy = y[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den === 0 ? null : num / den;
}

// Maps a range button to a Binance kline interval + candle count, so each
// range pulls real historical candles directly — no need to wait around
// accumulating live ticks first.
const COMPARE_KLINE_PARAMS = {
    '15m': { interval: '1m', limit: 15 },
    '1h': { interval: '1m', limit: 60 },
    '4h': { interval: '5m', limit: 48 },
    '1d': { interval: '15m', limit: 96 },
    all: { interval: '1h', limit: 500 }
};

async function fetchBinanceKlines(symbol, range, overrideParams) {
    const params = overrideParams || COMPARE_KLINE_PARAMS[range] || COMPARE_KLINE_PARAMS['1h'];
    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${params.interval}&limit=${params.limit}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const raw = await res.json();
        if (!Array.isArray(raw)) return null;
        // kline row: [openTime, open, high, low, close, volume, closeTime, ...]
        return raw.map(row => ({ time: row[6], close: parseFloat(row[4]) })).filter(p => isFinite(p.close));
    } catch (e) {
        return null;
    }
}

/* --------------------------- TECHNICAL INDICATORS -------------------------- */

// Indicators need more warm-up history than the plain range view (MACD's
// slow EMA alone needs 26 points), so these pull more candles regardless of
// the selected range, at a coarser-but-consistent interval per range.
const INDICATOR_KLINE_PARAMS = {
    '15m': { interval: '1m', limit: 100 },
    '1h': { interval: '5m', limit: 100 },
    '4h': { interval: '15m', limit: 100 },
    '1d': { interval: '1h', limit: 100 },
    all: { interval: '4h', limit: 200 }
};

let indBbChart = null;
let indRsiChart = null;
let indMacdChart = null;

function computeSMA(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) out[i] = sum / period;
    }
    return out;
}

function computeStdDev(values, period, sma) {
    const out = new Array(values.length).fill(null);
    for (let i = period - 1; i < values.length; i++) {
        const slice = values.slice(i - period + 1, i + 1);
        const mean = sma[i];
        const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
        out[i] = Math.sqrt(variance);
    }
    return out;
}

function computeEMA(values, period) {
    const out = new Array(values.length).fill(null);
    const k = 2 / (period + 1);
    let emaPrev = null;
    for (let i = 0; i < values.length; i++) {
        if (values[i] === null) continue;
        if (emaPrev === null) {
            emaPrev = values[i];
        } else {
            emaPrev = values[i] * k + emaPrev * (1 - k);
        }
        out[i] = emaPrev;
    }
    return out;
}

function computeRSI(closes, period) {
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;
    let gainSum = 0, lossSum = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gainSum += diff; else lossSum -= diff;
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        out[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }
    return out;
}

function computeMACD(closes, fast, slow, signalPeriod) {
    const emaFast = computeEMA(closes, fast);
    const emaSlow = computeEMA(closes, slow);
    const macdLine = closes.map((_, i) => (emaFast[i] !== null && emaSlow[i] !== null) ? emaFast[i] - emaSlow[i] : null);
    const macdValuesOnly = macdLine.map(v => v === null ? null : v);
    const signalLine = computeEMA(macdValuesOnly, signalPeriod);
    const histogram = macdLine.map((v, i) => (v !== null && signalLine[i] !== null) ? v - signalLine[i] : null);
    return { macdLine, signalLine, histogram };
}

function setIndicatorsStatus(text, isError) {
    const el = document.getElementById('indicators-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

async function renderTechnicalIndicators(symbol, range) {
    if (typeof Highcharts === 'undefined') return;
    const label = document.getElementById('indicators-symbol-label');
    if (label) label.textContent = symbol;

    setIndicatorsStatus('loading…');
    const params = INDICATOR_KLINE_PARAMS[range] || INDICATOR_KLINE_PARAMS['1h'];
    const klines = await fetchBinanceKlines(symbol, range, params);
    if (!klines || klines.length < 30) {
        setIndicatorsStatus(klines ? 'not enough candles yet' : 'unavailable on Binance for this symbol', true);
        return;
    }
    setIndicatorsStatus(`updated ${new Date().toLocaleTimeString()} · ${klines.length} candles`);

    const times = klines.map(k => k.time);
    const closes = klines.map(k => k.close);

    // --- Bollinger Bands ---
    const sma20 = computeSMA(closes, 20);
    const std20 = computeStdDev(closes, 20, sma20);
    const upper = closes.map((_, i) => sma20[i] !== null ? sma20[i] + 2 * std20[i] : null);
    const lower = closes.map((_, i) => sma20[i] !== null ? sma20[i] - 2 * std20[i] : null);

    const bbOptions = {
        chart: { animation: false, backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { type: 'datetime', labels: { style: { fontSize: '8px', color: '#9aa4b5' } }, lineColor: '#232838' },
        yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130' },
        tooltip: { shared: true, valueDecimals: 4 },
        plotOptions: { line: { marker: { enabled: false } } },
        series: [
            { name: 'Upper Band', data: times.map((t, i) => [t, upper[i]]), color: 'rgba(239, 83, 80, 0.5)', dashStyle: 'Dash' },
            { name: 'Close', data: times.map((t, i) => [t, closes[i]]), color: '#c9975a', lineWidth: 2 },
            { name: 'Lower Band', data: times.map((t, i) => [t, lower[i]]), color: 'rgba(62, 207, 142, 0.5)', dashStyle: 'Dash' },
            { name: 'SMA 20', data: times.map((t, i) => [t, sma20[i]]), color: '#5aa9e6', dashStyle: 'Dot' }
        ]
    };
    const bbEl = document.getElementById('ind-bb-chart');
    if (bbEl) {
        if (!indBbChart) { indBbChart = Highcharts.chart('ind-bb-chart', bbOptions); attachChartWatermark(indBbChart); }
        else indBbChart.update(bbOptions, true, true);
    }

    // --- RSI ---
    const rsi = computeRSI(closes, 14);
    const rsiOptions = {
        chart: { animation: false, backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { type: 'datetime', labels: { style: { fontSize: '8px', color: '#9aa4b5' } }, lineColor: '#232838' },
        yAxis: {
            title: { text: null }, min: 0, max: 100,
            labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130',
            plotLines: [
                { value: 70, color: 'rgba(239, 83, 80, 0.5)', dashStyle: 'Dash', width: 1 },
                { value: 30, color: 'rgba(62, 207, 142, 0.5)', dashStyle: 'Dash', width: 1 }
            ]
        },
        tooltip: { valueDecimals: 2 },
        series: [{ name: 'RSI', type: 'line', data: times.map((t, i) => [t, rsi[i]]), color: '#5aa9e6', marker: { enabled: false } }]
    };
    const rsiEl = document.getElementById('ind-rsi-chart');
    if (rsiEl) {
        if (!indRsiChart) { indRsiChart = Highcharts.chart('ind-rsi-chart', rsiOptions); attachChartWatermark(indRsiChart); }
        else indRsiChart.update(rsiOptions, true, true);
    }

    // --- MACD ---
    const { macdLine, signalLine, histogram } = computeMACD(closes, 12, 26, 9);
    const macdOptions = {
        chart: { animation: false, backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        legend: { itemStyle: { color: '#d7dde5', fontSize: '9px' } },
        xAxis: { type: 'datetime', labels: { style: { fontSize: '8px', color: '#9aa4b5' } }, lineColor: '#232838' },
        yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130', plotLines: [{ value: 0, color: '#6b7280', width: 1 }] },
        tooltip: { shared: true, valueDecimals: 6 },
        plotOptions: { column: { negativeColor: '#ef5350', color: '#3ecf8e' }, line: { marker: { enabled: false } } },
        series: [
            { name: 'Histogram', type: 'column', data: times.map((t, i) => [t, histogram[i]]) },
            { name: 'MACD', type: 'line', data: times.map((t, i) => [t, macdLine[i]]), color: '#c9975a' },
            { name: 'Signal', type: 'line', data: times.map((t, i) => [t, signalLine[i]]), color: '#5aa9e6' }
        ]
    };
    const macdEl = document.getElementById('ind-macd-chart');
    if (macdEl) {
        if (!indMacdChart) { indMacdChart = Highcharts.chart('ind-macd-chart', macdOptions); attachChartWatermark(indMacdChart); }
        else indMacdChart.update(macdOptions, true, true);
    }
}

async function renderAssetCompare() {
    if (typeof Highcharts === 'undefined') return;
    populateCompareSymbolList();

    const symbols = Array.from(selectedCompareSymbols).filter(s => getComparableSymbols().includes(s));
    if (symbols.length === 0) return;

    const noteEl = document.getElementById('compare-note');
    const originalNote = noteEl ? noteEl.textContent : '';
    if (noteEl) noteEl.textContent = 'Loading historical candles from Binance…';

    const requestRange = selectedCompareRange;
    const results = await Promise.all(
        symbols.map(async (sym, idx) => ({
            symbol: sym,
            color: COMPARE_COLORS[idx % COMPARE_COLORS.length],
            points: await fetchBinanceKlines(sym, requestRange)
        }))
    );

    if (noteEl) {
        noteEl.textContent = originalNote || 'Symbols come from your Multi-Symbol Watchlist plus the currently selected main symbol.';
    }

    // If the range/selection changed again while this fetch was in flight,
    // drop this stale result instead of overwriting the newer one.
    if (requestRange !== selectedCompareRange) return;

    const failed = results.filter(r => !r.points || r.points.length < 2).map(r => r.symbol);
    const seriesData = results.filter(r => r.points && r.points.length >= 2);

    if (noteEl && failed.length > 0) {
        noteEl.textContent = `Not available on Binance (skipped): ${failed.join(', ')}`;
    }

    // --- Relative performance (rebased to 100) ---
    const perfSeries = seriesData.map(s => {
        const base = s.points[0].close;
        return {
            name: s.symbol,
            type: 'line',
            color: s.color,
            marker: { enabled: false },
            data: s.points.map(p => [p.time, base > 0 ? (p.close / base * 100) : null])
        };
    });
    const perfOptions = {
        chart: { animation: false, backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        legend: { itemStyle: { color: '#d7dde5', fontSize: '9px' } },
        xAxis: { type: 'datetime', labels: { style: { fontSize: '8px', color: '#9aa4b5' } }, lineColor: '#232838', tickColor: '#232838' },
        yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130', plotLines: [{ value: 100, color: '#6b7280', dashStyle: 'Dash', width: 1 }] },
        tooltip: { shared: true, valueDecimals: 2 },
        series: perfSeries
    };
    const perfEl = document.getElementById('compare-perf-chart');
    if (perfEl) {
        if (!compareChartPerf) { compareChartPerf = Highcharts.chart('compare-perf-chart', perfOptions); attachChartWatermark(compareChartPerf); }
        else compareChartPerf.update(perfOptions, true, true);
    }

    // --- Volatility comparison (annualized %, from log returns) ---
    const volData = seriesData.map(s => {
        const returns = logReturns(s.points.map(p => p.close));
        if (returns.length < 3) return { symbol: s.symbol, vol: 0, color: s.color };
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
        const vol = Math.sqrt(variance) * Math.sqrt(365 * 24 * 12) * 100;
        return { symbol: s.symbol, vol, color: s.color };
    });
    const volOptions = {
        chart: { type: 'column', animation: false, backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { categories: volData.map(v => v.symbol), labels: { style: { fontSize: '9px', color: '#d7dde5' } }, lineColor: '#232838' },
        yAxis: { title: { text: 'Annualized Vol %', style: { color: '#9aa4b5', fontSize: '9px' } }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130' },
        tooltip: { valueDecimals: 2 },
        plotOptions: { column: { colorByPoint: true } },
        series: [{ name: 'Volatility', data: volData.map(v => ({ y: v.vol, color: v.color })) }]
    };
    const volEl = document.getElementById('compare-vol-chart');
    if (volEl) {
        if (!compareChartVol) { compareChartVol = Highcharts.chart('compare-vol-chart', volOptions); attachChartWatermark(compareChartVol); }
        else compareChartVol.update(volOptions, true, true);
    }

    // --- Correlation matrix ---
    const corrTbody = document.querySelector('#compare-corr-table tbody');
    if (corrTbody) {
        const returnsMap = seriesData.map(s => ({ symbol: s.symbol, returns: logReturns(s.points.map(p => p.close)) }));
        let html = '<tr><th></th>' + returnsMap.map(r => `<th>${r.symbol}</th>`).join('') + '</tr>';
        returnsMap.forEach(rowSym => {
            html += `<tr><th>${rowSym.symbol}</th>`;
            returnsMap.forEach(colSym => {
                if (rowSym.symbol === colSym.symbol) {
                    html += '<td>1.00</td>';
                } else {
                    const corr = pearsonCorrelation(rowSym.returns, colSym.returns);
                    const cls = corr === null ? '' : (corr > 0.3 ? 'quant-positive' : (corr < -0.3 ? 'quant-negative' : ''));
                    html += `<td class="${cls}">${corr === null ? 'n/a' : corr.toFixed(2)}</td>`;
                }
            });
            html += '</tr>';
        });
        corrTbody.innerHTML = returnsMap.length > 0 ? html : '<tr><td>Not enough data yet — keep fetching to build history.</td></tr>';
    }
}

function initCompareControls() {
    document.getElementById('compare-refresh-btn')?.addEventListener('click', renderAssetCompare);
    const rangeContainer = document.getElementById('compare-range-buttons');
    rangeContainer?.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            rangeContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedCompareRange = btn.dataset.range;
            renderAssetCompare();
        });
    });
}

/* --------------------------------- TABS ---------------------------------- */

function initTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById('view-' + btn.dataset.tab);
            if (target) target.classList.add('active');
            if (btn.dataset.tab === 'quant') {
                const symbol = document.querySelector('.symbol:checked')?.value;
                if (symbol) {
                    renderQuantAnalyticsChart(symbol);
                    renderTechnicalIndicators(symbol, selectedQuantRange);
                }
                if (quantChartMid) quantChartMid.reflow();
                if (quantChartOfi) quantChartOfi.reflow();
                if (quantChartZscore) quantChartZscore.reflow();
                if (indBbChart) indBbChart.reflow();
                if (indRsiChart) indRsiChart.reflow();
                if (indMacdChart) indMacdChart.reflow();
            }
            if (btn.dataset.tab === 'compare') {
                renderAssetCompare();
                if (compareChartPerf) compareChartPerf.reflow();
                if (compareChartVol) compareChartVol.reflow();
            }
            if (btn.dataset.tab === 'onchain' && typeof window.initOnchainTab === 'function') {
                window.initOnchainTab();
            }
            if (btn.dataset.tab === 'news' && typeof window.initNewsTab === 'function') {
                window.initNewsTab();
            }
            if (btn.dataset.tab === 'tradfi' && typeof window.initTradfiTab === 'function') {
                window.initTradfiTab();
            }
            if (btn.dataset.tab === 'footprint' && typeof window.initFootprintTab === 'function') {
                window.initFootprintTab();
            }
            if (btn.dataset.tab === 'macro' && typeof window.initMacroTab === 'function') {
                window.initMacroTab();
            }
        });
    });
}

/* --------------------------------- INIT ---------------------------------- */

// Central hook: script.js calls this after every successful fetchData().
window.onOrderbookFetched = function (data, symbol) {
    buildDepthChart(data, symbol);
    buildPriceLadder(data, symbol);
    updateQuantSignals(data, symbol);

    if (document.getElementById('history-record-toggle')?.checked) {
        recordSpreadPoint(data, symbol);
    } else {
        renderSpreadChart(symbol);
    }

    if (document.getElementById('log-record-toggle')?.checked) {
        fetchLog.push({ timestamp: Date.now(), symbol, data });
        const countEl = document.getElementById('log-count');
        if (countEl) countEl.textContent = `${fetchLog.length} entries logged`;
    }
};

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('slippage-calc-btn')?.addEventListener('click', calculateSlippage);
    document.getElementById('watch-add-btn')?.addEventListener('click', addToWatchlist);
    document.getElementById('watch-refresh-btn')?.addEventListener('click', refreshWatchlist);
    document.getElementById('export-csv-btn')?.addEventListener('click', exportSnapshotCSV);
    document.getElementById('export-json-btn')?.addEventListener('click', exportSnapshotJSON);
    document.getElementById('export-log-btn')?.addEventListener('click', exportLogJSON);

    refreshWatchlist();
    initTabs();
    initQuantRangeButtons();
    initCompareControls();
});
