/* tradfi.js
   TradFi tab — traditional-finance assets (gold, silver, oil, natural gas,
   FX, equities) traded as crypto perpetuals. No Yahoo Finance involved:

   - Binance TradFi Perpetuals: fapi.binance.com (same Futures API already
     used for the crypto Derivatives tab). Binance launched USDT-margined
     perpetuals for gold (XAUUSDT), silver (XAGUSDT), WTI crude (CLUSDT),
     Brent crude (BZUSDT), and natural gas (NATGASUSDT).
   - trade[xyz]: a HIP-3 market deployed on Hyperliquid (api.hyperliquid.xyz)
     offering commodities, FX, and equity perpetuals (xyz:GOLD, xyz:CL,
     xyz:AAPL, etc). Queried via Hyperliquid's public info endpoint with
     dex="xyz".
*/

let btfChart = null;

/* ---------------------------- BINANCE TRADFI ---------------------------- */

function setBtfStatus(text, isError) {
    const el = document.getElementById('binance-tradfi-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

async function loadBinanceTradFi() {
    const symbol = document.getElementById('binance-tradfi-symbol')?.value || 'XAUUSDT';
    setBtfStatus('loading…');

    try {
        const [premiumRes, tickerRes, oiRes] = await Promise.all([
            fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
            fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`),
            fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`)
        ]);
        if (!premiumRes.ok) throw new Error('Binance Futures API unreachable (CORS or symbol not listed yet)');

        const premium = await premiumRes.json();
        const markPrice = parseFloat(premium.markPrice);
        const indexPrice = parseFloat(premium.indexPrice);
        document.getElementById('btf-mark').textContent = markPrice.toLocaleString(undefined, { maximumFractionDigits: 4 });
        document.getElementById('btf-index').textContent = isFinite(indexPrice) ? indexPrice.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '-';

        if (isFinite(indexPrice) && indexPrice > 0) {
            const basisPct = (markPrice - indexPrice) / indexPrice * 100;
            const basisEl = document.getElementById('btf-basis');
            basisEl.textContent = `${(markPrice - indexPrice >= 0 ? '+' : '')}${(markPrice - indexPrice).toFixed(4)} (${basisPct >= 0 ? '+' : ''}${basisPct.toFixed(4)}%)`;
            basisEl.style.color = basisPct >= 0 ? '#3ecf8e' : '#ef5350';
        }

        const fundingPct = parseFloat(premium.lastFundingRate) * 100;
        const fundingEl = document.getElementById('btf-funding');
        fundingEl.textContent = (fundingPct >= 0 ? '+' : '') + fundingPct.toFixed(4) + '%';
        fundingEl.style.color = fundingPct >= 0 ? '#3ecf8e' : '#ef5350';

        document.getElementById('btf-next-funding').textContent = new Date(premium.nextFundingTime).toLocaleTimeString();

        if (tickerRes.ok) {
            const ticker = await tickerRes.json();
            const changePct = parseFloat(ticker.priceChangePercent);
            const changeEl = document.getElementById('btf-change');
            changeEl.textContent = (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%';
            changeEl.style.color = changePct >= 0 ? '#3ecf8e' : '#ef5350';
        }

        if (oiRes.ok) {
            const oi = await oiRes.json();
            document.getElementById('btf-oi').textContent = parseFloat(oi.openInterest).toLocaleString(undefined, { maximumFractionDigits: 2 });
        }

        await loadBinanceTradFiChart(symbol);
        setBtfStatus('updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        setBtfStatus('failed — ' + e.message, true);
    }
}

// A few well-known past events, off by default so the chart isn't cluttered —
// toggle them on to shade the region, same idea as the "Iran war" shading in
// the research-report style charts. Dates are UTC.
const BUILTIN_EVENTS = [
    { id: 'covid', label: 'COVID Crash', from: '2020-02-20', to: '2020-04-07', color: 'rgba(239, 83, 80, 0.10)' },
    { id: 'ftx', label: 'FTX Collapse', from: '2022-11-06', to: '2022-11-14', color: 'rgba(239, 83, 80, 0.10)' },
    { id: 'svb', label: 'SVB / Regional Bank Crisis', from: '2023-03-08', to: '2023-03-15', color: 'rgba(239, 83, 80, 0.10)' },
    { id: 'yencarry', label: 'Yen Carry Unwind', from: '2024-08-02', to: '2024-08-06', color: 'rgba(239, 83, 80, 0.10)' }
];
const CUSTOM_EVENTS_KEY = 'tradfi_custom_events';

function loadCustomEvents() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_EVENTS_KEY)) || []; } catch (e) { return []; }
}
function saveCustomEvents(events) {
    localStorage.setItem(CUSTOM_EVENTS_KEY, JSON.stringify(events));
}
function getEnabledBuiltinIds() {
    try { return JSON.parse(localStorage.getItem('tradfi_builtin_events_enabled')) || []; } catch (e) { return []; }
}
function saveEnabledBuiltinIds(ids) {
    localStorage.setItem('tradfi_builtin_events_enabled', JSON.stringify(ids));
}

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

function renderEventChips() {
    const builtinContainer = document.getElementById('events-builtin-list');
    const customContainer = document.getElementById('events-custom-list');
    if (!builtinContainer || !customContainer) return;
    const enabledIds = getEnabledBuiltinIds();

    builtinContainer.innerHTML = BUILTIN_EVENTS.map(ev => `
        <label class="event-chip">
            <input type="checkbox" data-event-id="${ev.id}" ${enabledIds.includes(ev.id) ? 'checked' : ''}>
            ${ev.label} <span class="event-dates">${ev.from} → ${ev.to}</span>
        </label>
    `).join('');
    builtinContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            let ids = getEnabledBuiltinIds();
            if (cb.checked) ids.push(cb.dataset.eventId);
            else ids = ids.filter(id => id !== cb.dataset.eventId);
            saveEnabledBuiltinIds([...new Set(ids)]);
            loadBinanceTradFiChart(document.getElementById('binance-tradfi-symbol')?.value || 'XAUUSDT');
        });
    });

    const customEvents = loadCustomEvents();
    customContainer.innerHTML = customEvents.map((ev, i) => `
        <span class="event-chip">
            ${ev.label} <span class="event-dates">${ev.from} → ${ev.to}</span>
            <button data-idx="${i}">✕</button>
        </span>
    `).join('');
    customContainer.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const events = loadCustomEvents();
            events.splice(parseInt(btn.dataset.idx), 1);
            saveCustomEvents(events);
            renderEventChips();
            loadBinanceTradFiChart(document.getElementById('binance-tradfi-symbol')?.value || 'XAUUSDT');
        });
    });
}

function getActiveEventPlotBands() {
    const enabledIds = getEnabledBuiltinIds();
    const active = BUILTIN_EVENTS.filter(ev => enabledIds.includes(ev.id));
    const custom = loadCustomEvents().map(ev => ({ ...ev, color: ev.color || 'rgba(90, 169, 230, 0.10)' }));
    return [...active, ...custom].map(ev => ({
        from: new Date(ev.from + 'T00:00:00Z').getTime(),
        to: new Date(ev.to + 'T23:59:59Z').getTime(),
        color: ev.color,
        label: { text: ev.label, style: { color: '#9aa4b5', fontSize: '9px' }, rotation: 0, y: 14 }
    }));
}

async function loadBinanceTradFiChart(symbol) {
    try {
        // Daily candles over the last year — matches the "year high/low +
        // 200-day MA" style research charts, not a scalping-interval view.
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=365`);
        if (!res.ok) return;
        const rows = await res.json();
        const times = rows.map(r => r[6]);
        const closes = rows.map(r => parseFloat(r[4]));
        const data = times.map((t, i) => [t, closes[i]]);

        const showMA = document.getElementById('btf-show-ma')?.checked !== false;
        const showEvents = document.getElementById('btf-show-events')?.checked !== false;

        const series = [{ name: symbol, type: 'line', data, color: '#c9975a', marker: { enabled: false }, zIndex: 3 }];

        if (showMA) {
            const ma50 = computeSMA(closes, 50);
            const ma200 = computeSMA(closes, 200);
            if (ma50.some(v => v !== null)) {
                series.push({ name: 'MA(50)', type: 'line', data: times.map((t, i) => [t, ma50[i]]), color: 'rgba(90, 169, 230, 0.7)', marker: { enabled: false }, zIndex: 2 });
            }
            if (ma200.some(v => v !== null)) {
                series.push({ name: 'MA(200)', type: 'line', data: times.map((t, i) => [t, ma200[i]]), color: 'rgba(62, 207, 142, 0.7)', marker: { enabled: false }, zIndex: 2 });
            }
        }

        // --- Year high/low annotations ---
        let maxIdx = 0, minIdx = 0;
        closes.forEach((c, i) => { if (c > closes[maxIdx]) maxIdx = i; if (c < closes[minIdx]) minIdx = i; });
        const annotations = [{
            draggable: '',
            labelOptions: { backgroundColor: 'rgba(17, 21, 29, 0.9)', borderColor: '#232838', style: { color: '#d7dde5', fontSize: '9px' } },
            labels: [
                { point: { x: times[maxIdx], y: closes[maxIdx], xAxis: 0, yAxis: 0 }, text: `${closes[maxIdx].toLocaleString(undefined, { maximumFractionDigits: 2 })} (Year High)`, y: -20 },
                { point: { x: times[minIdx], y: closes[minIdx], xAxis: 0, yAxis: 0 }, text: `${closes[minIdx].toLocaleString(undefined, { maximumFractionDigits: 2 })} (Year Low)`, y: 24 }
            ]
        }];

        const options = {
            chart: { animation: false, backgroundColor: 'transparent' },
            title: { text: null },
            credits: { enabled: false },
            legend: { enabled: showMA, itemStyle: { color: '#d7dde5', fontSize: '9px' } },
            xAxis: {
                type: 'datetime',
                labels: { style: { fontSize: '9px', color: '#9aa4b5' } },
                lineColor: '#232838',
                plotBands: showEvents ? getActiveEventPlotBands() : []
            },
            yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130' },
            tooltip: { valueDecimals: 4 },
            annotations,
            series
        };

        if (!btfChart) {
            btfChart = Highcharts.chart('binance-tradfi-chart', options);
            if (typeof attachChartWatermark === 'function') attachChartWatermark(btfChart);
        } else {
            // Remove old annotations before re-adding to avoid stacking duplicates.
            while (btfChart.annotations && btfChart.annotations.length) {
                btfChart.removeAnnotation(btfChart.annotations[0]);
            }
            btfChart.update(options, true, true);
        }
    } catch (e) {
        // Non-fatal — the stat panel above still shows current values.
    }
}

/* -------------------------------- TRADE[XYZ] ------------------------------- */

function setXyzStatus(text, isError) {
    const el = document.getElementById('xyz-tradfi-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

async function loadXyzMarkets() {
    setXyzStatus('loading…');
    try {
        const res = await fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'metaAndAssetCtxs', dex: 'xyz' })
        });
        if (!res.ok) throw new Error('Hyperliquid API unreachable (CORS or endpoint changed)');
        const [meta, ctxs] = await res.json();
        if (!meta?.universe || !Array.isArray(ctxs)) throw new Error('unexpected response shape');

        xyzMarketsCache = meta.universe.map((asset, i) => ({ name: asset.name, ctx: ctxs[i] })).filter(m => m.ctx);

        const tbody = document.querySelector('#xyz-tradfi-table tbody');
        tbody.innerHTML = '';

        xyzMarketsCache.forEach(({ name, ctx }) => {
            const mark = parseFloat(ctx.markPx);
            const prevDay = parseFloat(ctx.prevDayPx);
            const changePct = (prevDay > 0) ? ((mark - prevDay) / prevDay * 100) : null;
            const funding = ctx.funding !== undefined ? parseFloat(ctx.funding) * 100 : null;
            const oi = ctx.openInterest !== undefined ? parseFloat(ctx.openInterest) : null;

            const tr = document.createElement('tr');
            const changeColor = changePct === null ? '' : (changePct >= 0 ? 'color:#3ecf8e' : 'color:#ef5350');
            const fundingColor = funding === null ? '' : (funding >= 0 ? 'color:#3ecf8e' : 'color:#ef5350');
            tr.innerHTML = `
                <td>${name}</td>
                <td>${isFinite(mark) ? mark.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '-'}</td>
                <td style="${changeColor}">${changePct === null ? '-' : (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%'}</td>
                <td style="${fundingColor}">${funding === null ? '-' : (funding >= 0 ? '+' : '') + funding.toFixed(4) + '%'}</td>
                <td>${oi === null ? '-' : oi.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            `;
            tbody.appendChild(tr);
        });

        setXyzStatus('updated ' + new Date().toLocaleTimeString() + ` · ${xyzMarketsCache.length} markets`);
    } catch (e) {
        setXyzStatus('failed — ' + e.message, true);
    }
}

let xyzMarketsCache = [];

/* ------------------------------ MACRO SIGNALS ------------------------------ */

const BINANCE_TRADFI_SYMBOLS = ['XAUUSDT', 'XAGUSDT', 'CLUSDT', 'BZUSDT', 'NATGASUSDT'];
const CORRELATION_SYMBOLS = ['XAUUSDT', 'XAGUSDT', 'CLUSDT', 'BZUSDT', 'NATGASUSDT', 'BTCUSDT'];

function setMacroStatus(text, isError) {
    const el = document.getElementById('tradfi-macro-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

async function fetchPremium(symbol) {
    try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function loadMacroSignals() {
    setMacroStatus('loading…');
    try {
        const premiums = {};
        await Promise.all(BINANCE_TRADFI_SYMBOLS.map(async sym => {
            premiums[sym] = await fetchPremium(sym);
        }));
        const btcPremium = await fetchPremium('BTCUSDT');

        // --- Gold/Silver Ratio ---
        const gsrEl = document.getElementById('macro-gsr');
        if (premiums.XAUUSDT && premiums.XAGUSDT) {
            const gsr = parseFloat(premiums.XAUUSDT.markPrice) / parseFloat(premiums.XAGUSDT.markPrice);
            gsrEl.textContent = gsr.toFixed(2);
        } else {
            gsrEl.textContent = 'n/a';
        }

        // --- WTI-Brent Spread ---
        const wtiBrentEl = document.getElementById('macro-wti-brent');
        if (premiums.CLUSDT && premiums.BZUSDT) {
            const spread = parseFloat(premiums.BZUSDT.markPrice) - parseFloat(premiums.CLUSDT.markPrice);
            wtiBrentEl.textContent = (spread >= 0 ? '+' : '') + spread.toFixed(3);
            wtiBrentEl.style.color = spread >= 0 ? '#3ecf8e' : '#ef5350';
        } else {
            wtiBrentEl.textContent = 'n/a';
        }

        // --- Gold/BTC Ratio (how many oz of gold one BTC buys) ---
        const goldBtcEl = document.getElementById('macro-gold-btc');
        if (premiums.XAUUSDT && btcPremium) {
            const ratio = parseFloat(btcPremium.markPrice) / parseFloat(premiums.XAUUSDT.markPrice);
            goldBtcEl.textContent = ratio.toFixed(2) + ' oz/BTC';
        } else {
            goldBtcEl.textContent = 'n/a';
        }

        await Promise.all([loadMacroCorrelation(), loadFundingLeaderboard(premiums)]);
        setMacroStatus('updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        setMacroStatus('failed — ' + e.message, true);
    }
}

async function loadMacroCorrelation() {
    const tbody = document.querySelector('#macro-corr-table tbody');
    if (!tbody) return;

    const results = await Promise.all(CORRELATION_SYMBOLS.map(async sym => {
        try {
            const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1h&limit=100`);
            if (!res.ok) return { sym, closes: null };
            const rows = await res.json();
            return { sym, closes: rows.map(r => parseFloat(r[4])) };
        } catch (e) {
            return { sym, closes: null };
        }
    }));

    const valid = results.filter(r => r.closes && r.closes.length > 5);
    const returnsMap = valid.map(r => ({ sym: r.sym, returns: logReturns(r.closes) }));

    let html = '<tr><th></th>' + returnsMap.map(r => `<th>${r.sym.replace('USDT', '')}</th>`).join('') + '</tr>';
    returnsMap.forEach(row => {
        html += `<tr><th>${row.sym.replace('USDT', '')}</th>`;
        returnsMap.forEach(col => {
            if (row.sym === col.sym) {
                html += '<td>1.00</td>';
            } else {
                const corr = pearsonCorrelation(row.returns, col.returns);
                const cls = corr === null ? '' : (corr > 0.3 ? 'quant-positive' : (corr < -0.3 ? 'quant-negative' : ''));
                html += `<td class="${cls}">${corr === null ? 'n/a' : corr.toFixed(2)}</td>`;
            }
        });
        html += '</tr>';
    });
    tbody.innerHTML = html;
}

async function loadFundingLeaderboard(premiums) {
    const tbody = document.querySelector('#macro-funding-table tbody');
    if (!tbody) return;

    const rows = [];
    BINANCE_TRADFI_SYMBOLS.forEach(sym => {
        const p = premiums[sym];
        if (p) rows.push({ name: sym, source: 'Binance', funding: parseFloat(p.lastFundingRate) * 100 });
    });
    xyzMarketsCache.forEach(({ name, ctx }) => {
        if (ctx.funding !== undefined) rows.push({ name: `xyz:${name}`, source: 'trade[xyz]', funding: parseFloat(ctx.funding) * 100 });
    });

    rows.sort((a, b) => b.funding - a.funding);

    tbody.innerHTML = rows.map(r => {
        const cls = r.funding >= 0 ? 'quant-positive' : 'quant-negative';
        return `<tr><td>${r.name}</td><td>${r.source}</td><td class="${cls}">${(r.funding >= 0 ? '+' : '') + r.funding.toFixed(4)}%</td></tr>`;
    }).join('');
}

/* --------------------------------- INIT ---------------------------------- */

window.initTradfiTab = function () {
    loadBinanceTradFi();
    loadXyzMarkets().then(loadMacroSignals);
    renderEventChips();
    if (btfChart) btfChart.reflow();
};

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('tradfi-macro-refresh-btn')?.addEventListener('click', loadMacroSignals);
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('binance-tradfi-refresh-btn')?.addEventListener('click', loadBinanceTradFi);
    document.getElementById('binance-tradfi-symbol')?.addEventListener('change', loadBinanceTradFi);
    document.getElementById('xyz-tradfi-refresh-btn')?.addEventListener('click', loadXyzMarkets);

    const rerenderChart = () => {
        const symbol = document.getElementById('binance-tradfi-symbol')?.value || 'XAUUSDT';
        loadBinanceTradFiChart(symbol);
    };
    document.getElementById('btf-show-ma')?.addEventListener('change', rerenderChart);
    document.getElementById('btf-show-events')?.addEventListener('change', rerenderChart);

    document.getElementById('event-add-btn')?.addEventListener('click', () => {
        const from = document.getElementById('event-from-input')?.value;
        const to = document.getElementById('event-to-input')?.value;
        const label = document.getElementById('event-label-input')?.value.trim();
        if (!from || !to || !label) {
            alert('Fill in start date, end date, and a label.');
            return;
        }
        const events = loadCustomEvents();
        events.push({ from, to, label, color: 'rgba(90, 169, 230, 0.10)' });
        saveCustomEvents(events);
        document.getElementById('event-label-input').value = '';
        renderEventChips();
        rerenderChart();
    });
});
