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

let fredChart = null;
let eventStudyChart = null;

function setFredStatus(text, isError) {
    const el = document.getElementById('fred-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

async function loadFredSeries() {
    const seriesId = document.getElementById('fred-series-select')?.value || 'WALCL';
    setFredStatus('loading via community proxy…');
    try {
        const url = `${FRED_PROXY_BASE}/observations?series_id=${seriesId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`proxy returned ${res.status} — it may be down or rate-limited`);
        const json = await res.json();
        if (!Array.isArray(json)) throw new Error('unexpected proxy response shape');

        const data = json
            .filter(o => o.value !== '.' && o.value !== null && o.value !== undefined)
            .map(o => [new Date(o.date + 'T00:00:00Z').getTime(), parseFloat(o.value)])
            .filter(p => isFinite(p[1]));

        if (data.length === 0) throw new Error('no observations returned for this series');

        const options = {
            chart: { animation: false, backgroundColor: 'transparent' },
            title: { text: null },
            credits: { enabled: false },
            legend: { enabled: false },
            xAxis: { type: 'datetime', labels: { style: { fontSize: '9px', color: '#9aa4b5' } }, lineColor: '#232838' },
            yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130' },
            tooltip: { valueDecimals: 2 },
            series: [{ name: seriesId, type: 'line', data, color: '#c9975a', marker: { enabled: false } }]
        };

        if (!fredChart) {
            fredChart = Highcharts.chart('fred-chart', options);
            if (typeof attachChartWatermark === 'function') attachChartWatermark(fredChart);
        } else {
            fredChart.update(options, true, true);
        }

        setFredStatus('updated ' + new Date().toLocaleTimeString() + ` · ${data.length} points (via community proxy)`);
    } catch (e) {
        setFredStatus('failed — ' + e.message, true);
    }
}

/* ------------------------------ EVENT STUDY ------------------------------ */

function setEventStudyStatus(text, isError) {
    const el = document.getElementById('event-study-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
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
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
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
            tr.addEventListener('click', () => renderEventChart(rows[parseInt(tr.dataset.idx)]));
        });

        setEventStudyStatus('updated ' + new Date().toLocaleTimeString() + ` · ${rows.length} events`);
        if (rows.length > 0) renderEventChart(rows[0]);
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
        chart: { animation: false, backgroundColor: 'transparent' },
        title: { text: `${asset} around: ${row.ev.label}`, style: { fontSize: '11px', color: '#d7dde5' } },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: {
            type: 'datetime',
            labels: { style: { fontSize: '9px', color: '#9aa4b5' } },
            lineColor: '#232838',
            plotBands: [{ from: eventStartMs, to: eventEndMs, color: 'rgba(239, 83, 80, 0.12)', label: { text: row.ev.label, style: { color: '#9aa4b5', fontSize: '9px' } } }]
        },
        yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130' },
        tooltip: { valueDecimals: 4 },
        series: [{ name: asset, type: 'line', data: series, color: '#c9975a', marker: { enabled: false } }]
    };

    if (!eventStudyChart) {
        eventStudyChart = Highcharts.chart('event-study-chart', options);
        if (typeof attachChartWatermark === 'function') attachChartWatermark(eventStudyChart);
    } else {
        eventStudyChart.update(options, true, true);
    }
}

/* --------------------------------- INIT ---------------------------------- */

window.initMacroTab = function () {
    loadFredSeries();
    loadEventStudy();
    if (fredChart) fredChart.reflow();
    if (eventStudyChart) eventStudyChart.reflow();
};

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('fred-refresh-btn')?.addEventListener('click', loadFredSeries);
    document.getElementById('fred-series-select')?.addEventListener('change', loadFredSeries);
    document.getElementById('event-study-refresh-btn')?.addEventListener('click', loadEventStudy);
    document.getElementById('event-study-window')?.addEventListener('change', loadEventStudy);
    document.getElementById('event-study-asset')?.addEventListener('change', () => {
        const firstRow = document.querySelector('#event-study-table tbody tr');
        if (firstRow) firstRow.click();
    });
});
