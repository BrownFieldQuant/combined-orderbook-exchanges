/* news.js
   News & Sentiment tab. Sources:
   - Fear & Greed Index: alternative.me (free, no key).
   - Latest Crypto News: CryptoCompare public news API (free, no key).
   - Finnhub (needs a free API key, entered/saved in #finnhub-key-panel):
       /news              -> Market News (category: general/forex/crypto/merger)
       /calendar/economic -> Economic Calendar
       /calendar/earnings -> Earnings Calendar
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

let fngHistoryChart = null;

const FINNHUB_KEY_STORAGE = 'news_finnhub_api_key';
const FINNHUB_DEFAULT_KEY = 'd5ftvrhr01qie3lf7f8gd5ftvrhr01qie3lf7f90';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

function getFinnhubKey() {
    return (localStorage.getItem(FINNHUB_KEY_STORAGE) || FINNHUB_DEFAULT_KEY || '').trim();
}

async function finnhubGet(path, params) {
    const key = getFinnhubKey();
    if (!key) throw new Error('no Finnhub API key saved — enter one above');
    const qs = new URLSearchParams({ ...params, token: key }).toString();
    const res = await fetch(`${FINNHUB_BASE}${path}?${qs}`);
    if (!res.ok) throw new Error(`Finnhub ${path} returned ${res.status}`);
    return res.json();
}

function genericStatusSetter(elId) {
    return function (text, isError) {
        const el = document.getElementById(elId);
        const state = isError ? 'error' : (/loading|…$/i.test(text) ? 'busy' : 'live');
        window.paintStatus(el, state, text);
    };
}

/* --------------------------------- FNG ----------------------------------- */

function classificationColor(classification) {
    const c = (classification || '').toLowerCase();
    if (c.includes('extreme fear')) return '#ef5350';
    if (c.includes('fear')) return '#e5893f';
    if (c.includes('greed') && !c.includes('extreme')) return '#8bc48a';
    if (c.includes('extreme greed')) return '#3ecf8e';
    return '#e5c07b';
}

const setFngStatus = genericStatusSetter('fng-status');

async function loadFearGreed() {
    setFngStatus('loading…');
    try {
        const res = await fetch('https://api.alternative.me/fng/?limit=90&format=json');
        if (!res.ok) throw new Error('alternative.me unreachable');
        const json = await res.json();
        const points = json.data || [];
        if (points.length === 0) throw new Error('no data returned');

        const latest = points[0];
        const value = parseInt(latest.value);
        document.getElementById('fng-gauge-value').textContent = value;
        const labelEl = document.getElementById('fng-gauge-label');
        labelEl.textContent = latest.value_classification;
        labelEl.style.color = classificationColor(latest.value_classification);

        const pointer = document.getElementById('fng-bar-pointer');
        if (pointer) pointer.style.left = `calc(${value}% - 2px)`;

        const chronological = points.slice().reverse();
        const seriesData = chronological.map(p => [parseInt(p.timestamp) * 1000, parseInt(p.value)]);

        const options = {
            ...window.CHART_THEME,
            chart: { ...window.CHART_THEME.chart },
            title: { text: null },
            legend: { enabled: false },
            xAxis: { ...window.CHART_THEME.xAxis },
            yAxis: {
                ...window.CHART_THEME.yAxis,
                title: { text: null }, min: 0, max: 100,
                plotBands: [
                    { from: 0, to: 25, color: 'rgba(239, 83, 80, 0.08)' },
                    { from: 25, to: 45, color: 'rgba(229, 137, 63, 0.08)' },
                    { from: 45, to: 55, color: 'rgba(229, 192, 123, 0.08)' },
                    { from: 55, to: 75, color: 'rgba(139, 196, 138, 0.08)' },
                    { from: 75, to: 100, color: 'rgba(62, 207, 142, 0.08)' }
                ]
            },
            tooltip: { ...window.CHART_THEME.tooltip, valueDecimals: 0 },
            series: [{ name: 'Fear & Greed', type: 'line', data: seriesData, color: '#c9975a', lineWidth: 1.4, marker: { enabled: false } }]
        };

        if (!fngHistoryChart) {
            fngHistoryChart = Highcharts.chart('fng-history-chart', options);
            if (typeof attachChartWatermark === 'function') attachChartWatermark(fngHistoryChart, 'alternative.me Fear & Greed Index');
        } else {
            fngHistoryChart.update(options, true, true);
        }

        setFngStatus('updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        setFngStatus('failed — ' + e.message, true);
    }
}

/* ------------------------------ LATEST NEWS -------------------------------
   #news-panel: was CryptoCompare, but CryptoCompare's /news endpoint now
   requires a paid API key (started returning "you need a valid auth key"
   with no key), so this panel is fed by Finnhub's crypto category instead
   — same key already used elsewhere on this tab, no extra setup needed. */

const setNewsStatus = genericStatusSetter('news-status');

function timeAgo(unixSeconds) {
    const diffMs = Date.now() - unixSeconds * 1000;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

async function loadNews() {
    setNewsStatus('loading…');
    try {
        const json = await finnhubGet('/news', { category: 'crypto' });
        if (!Array.isArray(json) || json.length === 0) throw new Error('no articles returned');

        const items = json.slice(0, 30).sort((a, b) => b.datetime - a.datetime);

        const list = document.getElementById('news-list');
        list.innerHTML = '';
        items.forEach(item => {
            const a = document.createElement('a');
            a.className = 'news-item';
            a.href = item.url; a.target = '_blank'; a.rel = 'noopener';

            const img = document.createElement('img');
            img.src = item.image || ''; img.alt = '';
            img.onerror = () => { img.style.display = 'none'; };

            const textWrap = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'news-item-title';
            title.textContent = item.headline;
            const meta = document.createElement('div');
            meta.className = 'news-item-meta';
            meta.textContent = `${item.source || 'Finnhub'} · ${timeAgo(item.datetime)}`;
            textWrap.appendChild(title); textWrap.appendChild(meta);

            a.appendChild(img); a.appendChild(textWrap);
            list.appendChild(a);
        });

        setNewsStatus('updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        setNewsStatus('failed — ' + e.message, true);
    }
}

/* ------------------------------ FINNHUB KEY -------------------------------- */

document.addEventListener('DOMContentLoaded', function () {
    const savedKey = getFinnhubKey();
    const input = document.getElementById('finnhub-api-key-input');
    if (input && savedKey) input.value = savedKey;

    document.getElementById('finnhub-key-save-btn')?.addEventListener('click', () => {
        if (!input) return;
        localStorage.setItem(FINNHUB_KEY_STORAGE, input.value.trim());
        loadFinnhubNews();
        loadEconomicCalendar();
        loadEarningsCalendar();
    });
});

/* ------------------------------ FINNHUB NEWS ------------------------------- */

const setFinnhubNewsStatus = genericStatusSetter('finnhub-news-status');

async function loadFinnhubNews() {
    const category = document.getElementById('finnhub-news-category')?.value || 'general';
    setFinnhubNewsStatus('loading…');
    try {
        const json = await finnhubGet('/news', { category });
        if (!Array.isArray(json) || json.length === 0) throw new Error('no articles returned');

        const items = json.slice(0, 40).sort((a, b) => b.datetime - a.datetime);
        const tbody = document.querySelector('#finnhub-news-table tbody');
        tbody.innerHTML = items.map(item => `
            <tr>
                <td>${new Date(item.datetime * 1000).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td><a href="${item.url}" target="_blank" rel="noopener">${(item.headline || '').replace(/</g, '&lt;')}</a></td>
                <td>${item.source || '-'}</td>
                <td>${item.category || category}</td>
            </tr>
        `).join('');

        setFinnhubNewsStatus('updated ' + new Date().toLocaleTimeString() + ` · ${items.length} articles (${category})`);
    } catch (e) {
        setFinnhubNewsStatus('failed — ' + e.message, true);
        document.querySelector('#finnhub-news-table tbody').innerHTML = '';
    }
}

/* ---------------------------- ECONOMIC CALENDAR --------------------------- */

const setEconCalStatus = genericStatusSetter('econ-calendar-status');

function impactBadge(impact) {
    const s = String(impact ?? '').toLowerCase();
    if (s === '3' || s.includes('high')) return '<span class="econ-impact econ-impact-high">HIGH</span>';
    if (s === '2' || s.includes('medium')) return '<span class="econ-impact econ-impact-med">MED</span>';
    return '<span class="econ-impact econ-impact-low">LOW</span>';
}

async function loadEconomicCalendar() {
    setEconCalStatus('loading…');
    try {
        const today = new Date();
        const from = new Date(today); from.setUTCDate(from.getUTCDate() - 7);
        const to = new Date(today); to.setUTCDate(to.getUTCDate() + 7);
        const fmt = d => d.toISOString().slice(0, 10);

        const json = await finnhubGet('/calendar/economic', { from: fmt(from), to: fmt(to) });
        const events = (json.economicCalendar || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        const tbody = document.querySelector('#econ-calendar-table tbody');
        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="opacity:0.6;">no events in range</td></tr>';
        } else {
            tbody.innerHTML = events.slice(0, 80).map(ev => `
                <tr>
                    <td>${(ev.time || '').replace('T', ' ').slice(0, 16)}</td>
                    <td>${ev.country || '-'}</td>
                    <td>${ev.event || '-'}</td>
                    <td>${impactBadge(ev.impact)}</td>
                    <td>${ev.actual ?? '-'}</td>
                    <td>${ev.estimate ?? '-'}</td>
                    <td>${ev.prev ?? '-'}</td>
                </tr>
            `).join('');
        }
        setEconCalStatus('updated ' + new Date().toLocaleTimeString() + ` · ${events.length} events`);
    } catch (e) {
        setEconCalStatus('failed — ' + e.message, true);
        document.querySelector('#econ-calendar-table tbody').innerHTML = '';
    }
}

/* ----------------------------- EARNINGS CALENDAR --------------------------- */

const setEarningsCalStatus = genericStatusSetter('earnings-calendar-status');

function sessionLabel(hour) {
    const h = (hour || '').toLowerCase();
    if (h === 'bmo') return 'Before Open';
    if (h === 'amc') return 'After Close';
    if (h === 'dmh') return 'During Hours';
    return h || '-';
}

async function loadEarningsCalendar() {
    setEarningsCalStatus('loading…');
    try {
        const today = new Date();
        const from = new Date(today); from.setUTCDate(from.getUTCDate() - 7);
        const to = new Date(today); to.setUTCDate(to.getUTCDate() + 7);
        const fmt = d => d.toISOString().slice(0, 10);

        const json = await finnhubGet('/calendar/earnings', { from: fmt(from), to: fmt(to) });
        const rows = (json.earningsCalendar || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        const tbody = document.querySelector('#earnings-calendar-table tbody');
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="opacity:0.6;">no earnings in range</td></tr>';
        } else {
            tbody.innerHTML = rows.slice(0, 80).map(r => `
                <tr>
                    <td>${r.date || '-'}</td>
                    <td>${r.symbol || '-'}</td>
                    <td>${sessionLabel(r.hour)}</td>
                    <td>${r.epsEstimate ?? '-'}</td>
                    <td>${r.epsActual ?? '-'}</td>
                    <td>${r.revenueEstimate ?? '-'}</td>
                    <td>${r.revenueActual ?? '-'}</td>
                </tr>
            `).join('');
        }
        setEarningsCalStatus('updated ' + new Date().toLocaleTimeString() + ` · ${rows.length} reports`);
    } catch (e) {
        setEarningsCalStatus('failed — ' + e.message, true);
        document.querySelector('#earnings-calendar-table tbody').innerHTML = '';
    }
}

/* --------------------------- INSTITUTIONAL ACTIVITY ------------------------
   Symbol-driven panel pulling several "alternative data" Finnhub endpoints
   in parallel. Each sub-block fails independently — one endpoint being
   gated behind a paid plan (common on Finnhub's free tier for some of
   these) doesn't blank the whole panel, it just shows "unavailable" for
   that block while the rest render normally.
*/

const setInstitutionalStatus = genericStatusSetter('institutional-status');

function fmtCompact(n) {
    if (n === null || n === undefined || !isFinite(n)) return '-';
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

function unavailableRow(colspan, label) {
    return `<tr><td colspan="${colspan}" style="opacity:0.5;">${label || 'unavailable — may require a paid Finnhub plan'}</td></tr>`;
}

async function loadInstitutionalActivity() {
    const symbol = (document.getElementById('institutional-symbol-input')?.value || 'COIN').trim().toUpperCase();
    if (!symbol) return;
    setInstitutionalStatus(`loading ${symbol}…`);

    const today = new Date();
    const from1y = new Date(today); from1y.setUTCFullYear(from1y.getUTCFullYear() - 1);
    const fmtDate = d => d.toISOString().slice(0, 10);

    const [sentiment, insiderSent, insiderTx, ownership, congress, lobbying, press] = await Promise.allSettled([
        finnhubGet('/news-sentiment', { symbol }),
        finnhubGet('/stock/insider-sentiment', { symbol, from: fmtDate(from1y), to: fmtDate(today) }),
        finnhubGet('/stock/insider-transactions', { symbol }),
        finnhubGet('/institutional/ownership', { symbol, from: fmtDate(from1y), to: fmtDate(today) }),
        finnhubGet('/stock/congressional-trading', { symbol, from: fmtDate(from1y), to: fmtDate(today) }),
        finnhubGet('/stock/lobbying', { symbol, from: fmtDate(from1y), to: fmtDate(today) }),
        finnhubGet('/press-releases', { symbol, from: fmtDate(from1y), to: fmtDate(today) })
    ]);

    const setCell = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    // News sentiment
    if (sentiment.status === 'fulfilled' && sentiment.value?.sentiment) {
        const s = sentiment.value;
        const bullish = (s.sentiment.bullishPercent * 100).toFixed(0);
        const bearish = (s.sentiment.bearishPercent * 100).toFixed(0);
        setCell('inst-news-sentiment', `<span class="quant-positive">Bullish ${bullish}%</span> / <span class="quant-negative">Bearish ${bearish}%</span> &nbsp;·&nbsp; Buzz ${(s.buzz?.buzz ?? 0).toFixed(2)}`);
    } else {
        setCell('inst-news-sentiment', '<span style="opacity:0.5;">unavailable</span>');
    }

    // Insider sentiment (MSPR — Monthly Share Purchase Ratio)
    if (insiderSent.status === 'fulfilled' && Array.isArray(insiderSent.value?.data) && insiderSent.value.data.length > 0) {
        const latest = insiderSent.value.data[insiderSent.value.data.length - 1];
        const cls = latest.mspr >= 0 ? 'quant-positive' : 'quant-negative';
        setCell('inst-insider-sentiment', `<span class="${cls}">MSPR ${latest.mspr?.toFixed(2)}</span> &nbsp;·&nbsp; net change ${fmtCompact(latest.change)} shares (${latest.year}-${String(latest.month).padStart(2, '0')})`);
    } else {
        setCell('inst-insider-sentiment', '<span style="opacity:0.5;">unavailable</span>');
    }

    // Insider transactions table
    const insiderBody = document.querySelector('#inst-insider-table tbody');
    if (insiderTx.status === 'fulfilled' && Array.isArray(insiderTx.value?.data) && insiderTx.value.data.length > 0) {
        const rows = insiderTx.value.data.slice(0, 15);
        insiderBody.innerHTML = rows.map(r => {
            const cls = (r.change || 0) >= 0 ? 'quant-positive' : 'quant-negative';
            return `<tr>
                <td>${r.filingDate || '-'}</td>
                <td>${r.name || '-'}</td>
                <td class="${cls}">${(r.change || 0) >= 0 ? '+' : ''}${fmtCompact(r.change)}</td>
                <td>${fmtCompact(r.share)}</td>
                <td>${r.transactionPrice ? '$' + r.transactionPrice.toFixed(2) : '-'}</td>
            </tr>`;
        }).join('');
    } else {
        insiderBody.innerHTML = unavailableRow(5);
    }

    // Institutional ownership (13-F) table
    const ownershipBody = document.querySelector('#inst-ownership-table tbody');
    if (ownership.status === 'fulfilled' && Array.isArray(ownership.value?.ownership) && ownership.value.ownership.length > 0) {
        const rows = ownership.value.ownership.slice(0, 15);
        ownershipBody.innerHTML = rows.map(r => {
            const cls = (r.change || 0) >= 0 ? 'quant-positive' : 'quant-negative';
            return `<tr>
                <td>${r.name || '-'}</td>
                <td>${fmtCompact(r.share)}</td>
                <td class="${cls}">${(r.change || 0) >= 0 ? '+' : ''}${fmtCompact(r.change)}</td>
                <td>${r.portfolioPercent ? r.portfolioPercent.toFixed(2) + '%' : '-'}</td>
            </tr>`;
        }).join('');
    } else {
        ownershipBody.innerHTML = unavailableRow(4, 'unavailable — 13-F ownership is a paid-plan endpoint on Finnhub');
    }

    // Congressional trading
    const congressBody = document.querySelector('#inst-congress-table tbody');
    if (congress.status === 'fulfilled' && Array.isArray(congress.value?.data) && congress.value.data.length > 0) {
        const rows = congress.value.data.slice(0, 15);
        congressBody.innerHTML = rows.map(r => {
            const cls = /purchase|buy/i.test(r.transactionType || '') ? 'quant-positive' : /sale|sell/i.test(r.transactionType || '') ? 'quant-negative' : '';
            return `<tr>
                <td>${r.filingDate || '-'}</td>
                <td>${r.name || '-'}</td>
                <td class="${cls}">${r.transactionType || '-'}</td>
                <td>$${fmtCompact(r.amountFrom)} – $${fmtCompact(r.amountTo)}</td>
            </tr>`;
        }).join('');
    } else {
        congressBody.innerHTML = unavailableRow(4);
    }

    // Lobbying
    const lobbyingBody = document.querySelector('#inst-lobbying-table tbody');
    if (lobbying.status === 'fulfilled' && Array.isArray(lobbying.value?.data) && lobbying.value.data.length > 0) {
        const rows = lobbying.value.data.slice(0, 15);
        lobbyingBody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.year || '-'}${r.quarter ? ' Q' + r.quarter : ''}</td>
                <td>${r.client || '-'}</td>
                <td>${r.specificIssue || r.genericIssue || '-'}</td>
                <td>$${fmtCompact(r.amount)}</td>
            </tr>
        `).join('');
    } else {
        lobbyingBody.innerHTML = unavailableRow(4);
    }

    // Press releases
    const pressList = document.getElementById('inst-press-list');
    if (press.status === 'fulfilled' && Array.isArray(press.value?.majorDevelopment) && press.value.majorDevelopment.length > 0) {
        const items = press.value.majorDevelopment.slice(0, 12);
        pressList.innerHTML = items.map(item => `
            <a class="news-item" href="${item.url || '#'}" target="_blank" rel="noopener">
                <div>
                    <div class="news-item-title">${(item.headline || '').replace(/</g, '&lt;')}</div>
                    <div class="news-item-meta">${item.datetime ? new Date(item.datetime).toLocaleDateString() : ''}</div>
                </div>
            </a>
        `).join('');
    } else {
        pressList.innerHTML = '<div style="opacity:0.5; font-size:11px; padding:6px 0;">unavailable</div>';
    }

    const failedCount = [sentiment, insiderSent, insiderTx, ownership, congress, lobbying, press].filter(r => r.status === 'rejected').length;
    setInstitutionalStatus(`updated ${new Date().toLocaleTimeString()} for ${symbol}` + (failedCount ? ` · ${failedCount}/7 endpoints unavailable` : ''), failedCount === 7);
}

/* --------------------------------- INIT ---------------------------------- */

window.initNewsTab = function () {
    loadFearGreed();
    loadNews();
    loadFinnhubNews();
    loadEconomicCalendar();
    loadEarningsCalendar();
    loadInstitutionalActivity();
    if (fngHistoryChart) fngHistoryChart.reflow();
};

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('fng-refresh-btn')?.addEventListener('click', loadFearGreed);
    document.getElementById('news-refresh-btn')?.addEventListener('click', loadNews);
    document.getElementById('finnhub-news-refresh-btn')?.addEventListener('click', loadFinnhubNews);
    document.getElementById('finnhub-news-category')?.addEventListener('change', loadFinnhubNews);
    document.getElementById('econ-calendar-refresh-btn')?.addEventListener('click', loadEconomicCalendar);
    document.getElementById('earnings-calendar-refresh-btn')?.addEventListener('click', loadEarningsCalendar);
    document.getElementById('institutional-refresh-btn')?.addEventListener('click', loadInstitutionalActivity);
    document.getElementById('institutional-symbol-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadInstitutionalActivity();
    });
});
