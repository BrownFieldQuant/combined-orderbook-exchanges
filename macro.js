/* macro.js
   Macro Liquidity tab. Real data only:

   - Fed liquidity series (balance sheet, M2, reverse repo, SOFR, Fed funds,
     10Y yield): FRED (Federal Reserve Bank of St. Louis).

     IMPORTANT: FRED's own API (api.stlouisfed.org) does NOT set CORS
     headers for third-party origins, so a direct browser fetch fails no
     matter how correct the API key/auth is — this isn't a v1-vs-v2 issue,
     it's a hard CORS block on their side. There's no free way around that
     from a pure static site without our own backend proxying the request
     (the "backend" question from earlier in this project). As a practical
     stopgap, this uses a free, unofficial community CORS proxy
     (fred.libhack.so) that re-exposes FRED's /observations endpoint with
     permissive CORS. It's a third party we don't control — it may
     rate-limit, change, or go down. If it stops working, the honest fix
     is a small self-hosted proxy, not another client-side workaround.

   - "Events" reuse the SAME curated list from the TradFi tab's "Chart
     Events" panel (BUILTIN_EVENTS + localStorage custom events defined in
     tradfi.js) — not FRED's release-dates endpoint, which is blocked by
     the same CORS issue. Reusing real, dated historical events (or ones
     the person adds themselves) is more honest than pretending a live
     news feed exists here.
*/

const FRED_PROXY_BASE = 'https://fred.libhack.so/v0';
const FRED_KEY_STORAGE = 'macro_fred_api_key';

let fredChart = null;
let eventStudyChart = null;

/* ------------------------ TERMINAL / DESK STYLING ------------------------
   Shared look for every Highcharts instance on the desk: monospace axis
   labels (Bloomberg/desk terminals are mono, not sans), thin hairline
   grid, crosshair on hover, gold accent line. Attached to `window` and
   guarded so multiple tab scripts (macro.js, news.js, ...) can each
   define this block without a duplicate-declaration error — whichever
   script loads first wins, the rest just reuse it.
*/
if (typeof window.CHART_MONO === 'undefined') {
    window.CHART_MONO = "'IBM Plex Mono','Consolas','SFMono-Regular',monospace";
    window.CHART_THEME = {
        chart: { animation: false, backgroundColor: 'transparent', style: { fontFamily: window.CHART_MONO } },
        credits: { enabled: false },
        xAxis: {
            type: 'datetime',
            labels: { style: { fontSize: '9px', color: '#8a93a6', fontFamily: window.CHART_MONO } },
            lineColor: 'rgba(201,151,90,0.25)',
            tickColor: 'rgba(201,151,90,0.25)',
            crosshair: { color: 'rgba(201,151,90,0.35)', dashStyle: 'Solid', width: 1 }
        },
        yAxis: {
            labels: { style: { fontSize: '9px', color: '#d7dde5', fontFamily: window.CHART_MONO } },
            gridLineColor: 'rgba(255,255,255,0.05)',
            gridLineDashStyle: 'Dot'
        },
        tooltip: {
            backgroundColor: '#0f2036',
            borderColor: 'rgba(201,151,90,0.4)',
            borderRadius: 2,
            style: { fontFamily: window.CHART_MONO, fontSize: '11px', color: '#e7ebf1' }
        }
    };

    /* Terminal-style status line: colored dot + uppercase state + mono
       message, e.g.  "● LIVE  14:32:07 · 620 pts (direct)" */
    window.paintStatus = function (el, state, message) {
        if (!el) return;
        const colors = { live: '#3ecf8e', error: '#ef5350', busy: '#c9975a' };
        const labels = { live: 'LIVE', error: 'ERROR', busy: 'LOADING' };
        const dot = `<span style="color:${colors[state] || '#8a93a6'}">●</span>`;
        const tag = `<span style="font-weight:700;letter-spacing:0.5px;">${labels[state] || ''}</span>`;
        el.innerHTML = `${dot} ${tag}  <span style="opacity:0.7;">${message}</span>`;
        el.style.fontFamily = window.CHART_MONO;
        el.style.fontSize = '11px';
    };
}

function getFredApiKey() {
    return localStorage.getItem(FRED_KEY_STORAGE) || '';
}

function setFredStatus(text, isError) {
    const el = document.getElementById('fred-status');
    const state = isError ? 'error' : (/loading|…$/i.test(text) ? 'busy' : 'live');
    window.paintStatus(el, state, text);
}

// Tries FRED's own API directly first (v1-style ?api_key=, using your real
// key — most reliable/accurate if it works), then falls back to the free
// community CORS proxy if the direct call is blocked (FRED doesn't set
// CORS headers for third-party origins, so this often fails regardless of
// key/version — that's the actual blocker, not v1 vs v2).
async function fetchFredObservations(seriesId) {
    const apiKey = getFredApiKey();
    if (apiKey) {
        try {
            const directUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=asc&limit=100000`;
            const res = await fetch(directUrl);
            if (res.ok) {
                const json = await res.json();
                if (json.observations) {
                    return { source: 'direct (your key)', data: json.observations.map(o => ({ date: o.date, value: o.value })) };
                }
            }
        } catch (e) {
            // CORS or network failure — fall through to the proxy below.
        }
    }

    const proxyUrl = `${FRED_PROXY_BASE}/observations?series_id=${seriesId}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`proxy returned ${res.status} — it may be down or rate-limited`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error('unexpected proxy response shape');
    return { source: 'community proxy', data: json };
}

async function loadFredSeries() {
    const customId = document.getElementById('fred-custom-series')?.value.trim();
    const seriesId = customId || document.getElementById('fred-series-select')?.value || 'WALCL';
    setFredStatus('loading…');
    try {
        const { source, data: raw } = await fetchFredObservations(seriesId);

        const data = raw
            .filter(o => o.value !== '.' && o.value !== null && o.value !== undefined)
            .map(o => [new Date(o.date + 'T00:00:00Z').getTime(), parseFloat(o.value)])
            .filter(p => isFinite(p[1]));

        if (data.length === 0) throw new Error('no observations returned — check the series ID');

        const options = {
            ...window.CHART_THEME,
            chart: { ...window.CHART_THEME.chart },
            title: { text: null },
            legend: { enabled: false },
            xAxis: { ...window.CHART_THEME.xAxis },
            yAxis: { ...window.CHART_THEME.yAxis, title: { text: null }, labels: { ...window.CHART_THEME.yAxis.labels, formatter: function () { return Highcharts.numberFormat(this.value, 0, '.', ','); } } },
            tooltip: { ...window.CHART_THEME.tooltip, valueDecimals: 2 },
            series: [{ name: seriesId, type: 'line', data, color: '#c9975a', lineWidth: 1.4, marker: { enabled: false } }]
        };

        if (!fredChart) {
            fredChart = Highcharts.chart('fred-chart', options);
            if (typeof attachChartWatermark === 'function') attachChartWatermark(fredChart, 'FRED (Federal Reserve Bank of St. Louis)');
        } else {
            fredChart.update(options, true, true);
        }

        setFredStatus('updated ' + new Date().toLocaleTimeString() + ` · ${data.length} points (${source})`);
    } catch (e) {
        setFredStatus('failed — ' + e.message, true);
    }
}

/* ------------------------------ EVENT STUDY ------------------------------ */

function setEventStudyStatus(text, isError) {
    const el = document.getElementById('event-study-status');
    const state = isError ? 'error' : (/loading|…$/i.test(text) ? 'busy' : 'live');
    window.paintStatus(el, state, text);
}

function getAllEvents() {
    // Reuses BUILTIN_EVENTS / loadCustomEvents() / getEnabledBuiltinIds()
    // already defined in tradfi.js (shared global scope).
    const enabledIds = (typeof getEnabledBuiltinIds === 'function') ? getEnabledBuiltinIds() : [];
    const builtin = (typeof BUILTIN_EVENTS !== 'undefined')
        ? BUILTIN_EVENTS.filter(ev => enabledIds.includes(ev.id))
        : [];
    const custom = (typeof loadCustomEvents === 'function') ? loadCustomEvents() : [];
    return [...builtin, ...custom];
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

async function fetchDailyCloses(symbol, startDate, endDate) {
    try {
        const startMs = new Date(startDate + 'T00:00:00Z').getTime();
        const endMs = new Date(endDate + 'T23:59:59Z').getTime();
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1d&startTime=${startMs}&endTime=${endMs}&limit=1000`);
        if (!res.ok) return null;
        const rows = await res.json();
        return rows.map(r => [r[6], parseFloat(r[4])]);
    } catch (e) {
        return null;
    }
}

function pctFromSeries(series) {
    if (!series || series.length < 2) return null;
    const first = series[0][1];
    const last = series[series.length - 1][1];
    if (!first) return null;
    return (last - first) / first * 100;
}

function fmtPct(v) {
    if (v === null || v === undefined || !isFinite(v)) return '-';
    const arrow = v >= 0 ? '▲' : '▼';
    return arrow + ' ' + Math.abs(v).toFixed(2) + '%';
}
function pctClass(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    return v >= 0 ? 'quant-positive' : 'quant-negative';
}

async function loadEventStudy() {
    const events = getAllEvents();
    if (events.length === 0) {
        setEventStudyStatus('no events enabled — go to the TradFi tab → "Chart Events" and tick some, or add your own', true);
        document.querySelector('#event-study-table tbody').innerHTML = '';
        return;
    }

    setEventStudyStatus('loading asset reactions…');
    const windowDays = parseInt(document.getElementById('event-study-window')?.value || '3');

    try {
        const rows = await Promise.all(events.map(async ev => {
            const from = addDays(ev.from, -windowDays);
            const to = addDays(ev.to, windowDays);
            const [gold, oil, gas, btc] = await Promise.all([
                fetchDailyCloses('XAUUSDT', from, to),
                fetchDailyCloses('CLUSDT', from, to),
                fetchDailyCloses('NATGASUSDT', from, to),
                fetchDailyCloses('BTCUSDT', from, to)
            ]);
            return { ev, from, to, gold: pctFromSeries(gold), oil: pctFromSeries(oil), gas: pctFromSeries(gas), btc: pctFromSeries(btc) };
        }));

        rows.sort((a, b) => a.from.localeCompare(b.from));

        const tbody = document.querySelector('#event-study-table tbody');
        tbody.innerHTML = rows.map((r, i) => `
            <tr data-idx="${i}">
                <td>${r.ev.label}</td>
                <td>${r.from} → ${r.to}</td>
                <td class="${pctClass(r.gold)}">${fmtPct(r.gold)}</td>
                <td class="${pctClass(r.oil)}">${fmtPct(r.oil)}</td>
                <td class="${pctClass(r.gas)}">${fmtPct(r.gas)}</td>
                <td class="${pctClass(r.btc)}">${fmtPct(r.btc)}</td>
            </tr>
        `).join('');

        tbody.querySelectorAll('tr').forEach(tr => {
            tr.addEventListener('click', () => {
                tbody.querySelectorAll('tr').forEach(r => r.classList.remove('rd-row-active'));
                tr.classList.add('rd-row-active');
                renderEventChart(rows[parseInt(tr.dataset.idx)]);
            });
        });

        setEventStudyStatus('updated ' + new Date().toLocaleTimeString() + ` · ${rows.length} events`);
        if (rows.length > 0) {
            renderEventChart(rows[0]);
            tbody.querySelector('tr')?.classList.add('rd-row-active');
        }
    } catch (e) {
        setEventStudyStatus('failed — ' + e.message, true);
    }
}

async function renderEventChart(row) {
    const asset = document.getElementById('event-study-asset')?.value || 'XAUUSDT';
    const series = await fetchDailyCloses(asset, row.from, row.to);
    if (!series) return;

    const eventStartMs = new Date(row.ev.from + 'T00:00:00Z').getTime();
    const eventEndMs = new Date(row.ev.to + 'T23:59:59Z').getTime();

    const options = {
        ...window.CHART_THEME,
        chart: { ...window.CHART_THEME.chart },
        title: { text: `${asset} AROUND: ${row.ev.label.toUpperCase()}`, style: { fontSize: '11px', color: '#d7dde5', fontFamily: window.CHART_MONO, fontWeight: '700', letterSpacing: '0.4px' } },
        legend: { enabled: false },
        xAxis: {
            ...window.CHART_THEME.xAxis,
            plotBands: [{ from: eventStartMs, to: eventEndMs, color: 'rgba(201, 151, 90, 0.08)' }],
            plotLines: [
                { value: eventStartMs, color: '#c9975a', width: 1, dashStyle: 'Dash', label: { text: row.ev.label, style: { color: '#8a93a6', fontSize: '9px', fontFamily: window.CHART_MONO }, rotation: 0, y: 14 } },
                { value: eventEndMs, color: '#c9975a', width: 1, dashStyle: 'Dash' }
            ]
        },
        yAxis: { ...window.CHART_THEME.yAxis, title: { text: null } },
        tooltip: { ...window.CHART_THEME.tooltip, valueDecimals: 4 },
        series: [{ name: asset, type: 'line', data: series, color: '#c9975a', lineWidth: 1.4, marker: { enabled: false } }]
    };

    if (!eventStudyChart) {
        eventStudyChart = Highcharts.chart('event-study-chart', options);
        if (typeof attachChartWatermark === 'function') attachChartWatermark(eventStudyChart, 'Binance Futures API');
    } else {
        eventStudyChart.update(options, true, true);
    }
}

/* ------------------------- LONG-TERM INFLATION EXP ------------------------- */

let inflationExpChart = null;

function setInflationExpStatus(text, isError) {
    const el = document.getElementById('inflation-exp-status');
    const state = isError ? 'error' : (/loading|…$/i.test(text) ? 'busy' : 'live');
    window.paintStatus(el, state, text);
}

async function loadInflationExpectations() {
    setInflationExpStatus('loading…');
    try {
        const [t5yifr, mich] = await Promise.all([
            fetchFredObservations('T5YIFR'),
            fetchFredObservations('MICH')
        ]);

        const toSeries = (raw) => raw
            .filter(o => o.value !== '.' && o.value !== null && o.value !== undefined)
            .map(o => [new Date(o.date + 'T00:00:00Z').getTime(), parseFloat(o.value)])
            .filter(p => isFinite(p[1]));

        const t5yifrData = toSeries(t5yifr.data);
        const michData = toSeries(mich.data);
        if (t5yifrData.length === 0 && michData.length === 0) throw new Error('no data returned for either series');

        const options = {
            ...window.CHART_THEME,
            chart: { ...window.CHART_THEME.chart },
            title: { text: null },
            legend: { itemStyle: { color: '#d7dde5', fontSize: '9px', fontFamily: window.CHART_MONO } },
            xAxis: { ...window.CHART_THEME.xAxis },
            yAxis: { ...window.CHART_THEME.yAxis, title: { text: 'PERCENT', style: { color: '#8a93a6', fontSize: '9px', fontFamily: window.CHART_MONO, letterSpacing: '0.5px' } } },
            tooltip: { ...window.CHART_THEME.tooltip, shared: true, valueDecimals: 2 },
            series: [
                { name: '5Y5Y Breakeven Inflation (T5YIFR)', type: 'line', data: t5yifrData, color: '#c9975a', lineWidth: 1.4, marker: { enabled: false } },
                { name: 'UMich Inflation Expectations (MICH)', type: 'line', data: michData, color: '#5aa9e6', lineWidth: 1.4, marker: { enabled: false } }
            ]
        };

        if (!inflationExpChart) {
            inflationExpChart = Highcharts.chart('inflation-exp-chart', options);
            attachChartWatermark(inflationExpChart, 'FRED (Federal Reserve Bank of St. Louis)');
        } else {
            inflationExpChart.update(options, true, true);
        }

        setInflationExpStatus('updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        setInflationExpStatus('failed — ' + e.message, true);
    }
}

/* --------------------------------- INIT ---------------------------------- */

window.initMacroTab = function () {
    loadFredSeries();
    loadEventStudy();
    loadInflationExpectations();
    if (fredChart) fredChart.reflow();
    if (eventStudyChart) eventStudyChart.reflow();
    if (inflationExpChart) inflationExpChart.reflow();
};

document.addEventListener('DOMContentLoaded', function () {
    const savedKey = getFredApiKey();
    if (savedKey) {
        const input = document.getElementById('fred-api-key-input');
        if (input) input.value = savedKey;
    }
    document.getElementById('fred-key-save-btn')?.addEventListener('click', () => {
        const input = document.getElementById('fred-api-key-input');
        if (!input) return;
        localStorage.setItem(FRED_KEY_STORAGE, input.value.trim());
        loadFredSeries();
    });
    document.getElementById('fred-refresh-btn')?.addEventListener('click', loadFredSeries);
    document.getElementById('fred-series-select')?.addEventListener('change', () => {
        document.getElementById('fred-custom-series').value = '';
        loadFredSeries();
    });
    document.getElementById('fred-custom-series')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadFredSeries();
    });
    document.getElementById('event-study-refresh-btn')?.addEventListener('click', loadEventStudy);
    document.getElementById('event-study-window')?.addEventListener('change', loadEventStudy);
    document.getElementById('event-study-asset')?.addEventListener('change', () => {
        const firstRow = document.querySelector('#event-study-table tbody tr');
        if (firstRow) firstRow.click();
    });
    document.getElementById('inflation-exp-refresh-btn')?.addEventListener('click', loadInflationExpectations);
});
