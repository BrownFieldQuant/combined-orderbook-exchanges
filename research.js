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

    return { bestBid, bestAsk, bestBidQty, bestAskQty, totalBidQty, totalAskQty };
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

    // --- Order Flow Imbalance delta vs previous fetch ---
    if (prevBookState) {
        const bidChange = book.totalBidQty - prevBookState.totalBidQty;
        const askChange = book.totalAskQty - prevBookState.totalAskQty;
        const ofi = bidChange - askChange;
        prevOfiValue = ofi;
        const sign = ofi > 0 ? '+' : '';
        setQuantValue('quant-ofi', sign + ofi.toFixed(4), ofi > 0 ? 'quant-positive' : (ofi < 0 ? 'quant-negative' : null));
    } else {
        prevOfiValue = 0;
        setQuantValue('quant-ofi', 'first fetch');
    }
    prevBookState = book;

    // --- Track history for the Quant Analytics tab chart ---
    const cumulativeOFI = quantHistory.length
        ? quantHistory[quantHistory.length - 1].cofi + (prevOfiValue || 0)
        : (prevOfiValue || 0);
    quantHistory.push({
        time: Date.now(),
        mid: midPrice,
        cofi: cumulativeOFI,
        zscore: spreadPctBuffer.length >= 5
            ? (spreadPct - (spreadPctBuffer.reduce((s, v) => s + v, 0) / spreadPctBuffer.length))
            : 0
    });
    if (quantHistory.length > QUANT_HISTORY_MAX) quantHistory.shift();

    updateQuantAnalyticsStats(symbol, midPrice, microprice);
    renderQuantAnalyticsChart(symbol);
}

/* --------------------------- QUANT ANALYTICS TAB --------------------------- */

const QUANT_HISTORY_MAX = 500;
let quantHistory = [];
let quantAnalyticsChart = null;
let prevOfiValue = 0;

function updateQuantAnalyticsStats(symbol, midPrice, microprice) {
    const symLabel = document.getElementById('quant-analytics-symbol');
    if (symLabel) symLabel.textContent = symbol;

    const setStat = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setStat('qa-mid', midPrice.toFixed(6));
    setStat('qa-microprice', microprice.toFixed(6));
    setStat('qa-zscore', document.getElementById('quant-zscore')?.textContent || '-');
    setStat('qa-vol', document.getElementById('quant-vol')?.textContent || '-');
    const lastPoint = quantHistory[quantHistory.length - 1];
    setStat('qa-cofi', lastPoint ? lastPoint.cofi.toFixed(4) : '-');
    setStat('qa-points', String(quantHistory.length));
}

function renderQuantAnalyticsChart(symbol) {
    const container = document.getElementById('quant-analytics-chart');
    if (!container || typeof Highcharts === 'undefined' || quantHistory.length === 0) return;

    const midSeries = quantHistory.map(p => [p.time, p.mid]);
    const ofiSeries = quantHistory.map(p => [p.time, p.cofi]);

    const options = {
        chart: { animation: false, backgroundColor: 'transparent' },
        title: { text: `${symbol} — Mid Price vs Cumulative Order Flow Imbalance`, style: { fontSize: '12px', color: '#d7dde5' } },
        xAxis: { type: 'datetime', labels: { style: { fontSize: '9px', color: '#9aa4b5' } }, lineColor: '#232838', tickColor: '#232838' },
        yAxis: [
            {
                title: { text: 'Mid Price', style: { color: '#d7dde5' } },
                labels: { style: { color: '#d7dde5' } },
                gridLineColor: '#1c2130'
            },
            {
                title: { text: 'Cumulative OFI', style: { color: '#9aa4b5' } },
                labels: { style: { color: '#9aa4b5' } },
                opposite: true,
                gridLineWidth: 0
            }
        ],
        tooltip: { shared: true, valueDecimals: 4 },
        credits: { enabled: false },
        legend: { itemStyle: { color: '#d7dde5' } },
        plotOptions: {
            area: {
                marker: { enabled: false },
                fillOpacity: 0.25,
                negativeFillColor: 'rgba(239, 83, 80, 0.25)',
                zones: [
                    { value: 0, color: '#ef5350', fillColor: 'rgba(239, 83, 80, 0.25)' },
                    { color: '#3ecf8e', fillColor: 'rgba(62, 207, 142, 0.25)' }
                ]
            },
            line: { marker: { enabled: false } }
        },
        series: [
            { name: 'Mid Price', type: 'line', data: midSeries, yAxis: 0, color: '#c9975a', zIndex: 2 },
            { name: 'Cumulative OFI', type: 'area', data: ofiSeries, yAxis: 1, zIndex: 1, threshold: 0 }
        ]
    };

    if (!quantAnalyticsChart) {
        quantAnalyticsChart = Highcharts.chart('quant-analytics-chart', options);
    } else {
        quantAnalyticsChart.update(options, true, true);
    }
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
            if (btn.dataset.tab === 'quant' && quantAnalyticsChart) {
                quantAnalyticsChart.reflow();
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
});
