/* news.js
   News & Sentiment tab. Sources:
   - Fear & Greed Index: alternative.me (free, no key).
   - Crypto headlines: CryptoCompare + Finnhub crypto category, merged and
     de-duplicated so one provider's outage/rate-limit doesn't blank the feed.
   - Economic Calendar: Finnhub /calendar/economic.
   - Equity Analyst Desk (per symbol): Finnhub /stock/recommendation,
     /stock/price-target, /stock/upgrade-downgrade, /news-sentiment,
     /stock/social-sentiment, /company-news.

   Finnhub needs an API key. A default is bundled below but it's read
   from (and savable to) localStorage, same pattern as the FRED key on
   the Macro tab, in case it gets rate-limited or the person wants to
   swap in their own.
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
    if (!key) throw new Error('no Finnhub API key set');
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

/* ------------------------------ HEADLINES --------------------------------- */

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

async function fetchCryptoCompareNews() {
    const res = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest');
    if (!res.ok) throw new Error(`CryptoCompare returned ${res.status}`);
    const json = await res.json();
    const items = json.Data || [];
    return items.map(item => ({
        title: item.title, url: item.url, image: item.imageurl || '',
        source: item.source_info?.name || item.source || 'Unknown',
        publishedOn: item.published_on, provider: 'CryptoCompare'
    }));
}

async function fetchFinnhubCryptoNews() {
    const json = await finnhubGet('/news', { category: 'crypto' });
    if (!Array.isArray(json)) return [];
    return json.map(item => ({
        title: item.headline, url: item.url, image: item.image || '',
        source: item.source || 'Finnhub', publishedOn: item.datetime, provider: 'Finnhub'
    }));
}

function dedupeAndSort(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        if (!item.title || !item.url) continue;
        const key = item.title.trim().toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    out.sort((a, b) => b.publishedOn - a.publishedOn);
    return out;
}

function renderNewsList(elId, items) {
    const list = document.getElementById(elId);
    if (!list) return;
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
        title.textContent = item.title;

        const meta = document.createElement('div');
        meta.className = 'news-item-meta';
        const providerTag = document.createElement('span');
        providerTag.className = 'news-item-provider';
        providerTag.textContent = item.provider;
        meta.appendChild(providerTag);
        meta.appendChild(document.createTextNode(` ${item.source} · ${timeAgo(item.publishedOn)}`));

        textWrap.appendChild(title); textWrap.appendChild(meta);
        a.appendChild(img); a.appendChild(textWrap);
        list.appendChild(a);
    });
}

async function loadNews() {
    setNewsStatus('loading…');
    const results = await Promise.allSettled([fetchCryptoCompareNews(), fetchFinnhubCryptoNews()]);
    const merged = [];
    const failed = [];
    results.forEach((r, i) => {
        const label = i === 0 ? 'CryptoCompare' : 'Finnhub';
        if (r.status === 'fulfilled') merged.push(...r.value); else failed.push(label);
    });

    if (merged.length === 0) {
        setNewsStatus('failed — all sources unreachable' + (failed.length ? ` (${failed.join(', ')})` : ''), true);
        return;
    }

    const items = dedupeAndSort(merged).slice(0, 40);
    renderNewsList('news-list', items);

    const ccCount = merged.filter(i => i.provider === 'CryptoCompare').length;
    const fhCount = merged.filter(i => i.provider === 'Finnhub').length;
    let msg = `updated ${new Date().toLocaleTimeString()} · ${items.length} items (CryptoCompare ${ccCount}, Finnhub ${fhCount})`;
    if (failed.length) msg += ` — ${failed.join(', ')} unreachable`;
    setNewsStatus(msg, failed.length === 2);
}

/* ---------------------------- ECONOMIC CALENDAR --------------------------- */

const setEconCalStatus = genericStatusSetter('econ-calendar-status');

function impactBadge(impact) {
    const lvl = (impact || '').toLowerCase();
    if (lvl.includes('3') || lvl === 'high') return '<span class="econ-impact econ-impact-high">HIGH</span>';
    if (lvl.includes('2') || lvl === 'medium') return '<span class="econ-impact econ-impact-med">MED</span>';
    return '<span class="econ-impact econ-impact-low">LOW</span>';
}

async function loadEconomicCalendar() {
    setEconCalStatus('loading…');
    try {
        const today = new Date();
        const from = new Date(today); from.setUTCDate(from.getUTCDate() - 2);
        const to = new Date(today); to.setUTCDate(to.getUTCDate() + 7);
        const fmt = d => d.toISOString().slice(0, 10);

        const json = await finnhubGet('/calendar/economic', { from: fmt(from), to: fmt(to) });
        const events = (json.economicCalendar || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        const tbody = document.querySelector('#econ-calendar-table tbody');
        if (!tbody) return;
        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="opacity:0.6;">no events in range</td></tr>';
        } else {
            tbody.innerHTML = events.slice(0, 60).map(ev => `
                <tr>
                    <td>${(ev.time || '').replace('T', ' ').slice(0, 16)}</td>
                    <td>${ev.country || '-'}</td>
                    <td>${ev.event || '-'}</td>
                    <td>${impactBadge(String(ev.impact))}</td>
                    <td>${ev.actual ?? '-'}</td>
                    <td>${ev.estimate ?? '-'}</td>
                    <td>${ev.prev ?? '-'}</td>
                </tr>
            `).join('');
        }
        setEconCalStatus('updated ' + new Date().toLocaleTimeString() + ` · ${events.length} events`);
    } catch (e) {
        setEconCalStatus('failed — ' + e.message, true);
    }
}

/* ----------------------------- ANALYST DESK -------------------------------- */

const setAnalystStatus = genericStatusSetter('analyst-desk-status');

function fmtNum(v, decimals) {
    if (v === null || v === undefined || !isFinite(v)) return '-';
    return Number(v).toFixed(decimals ?? 2);
}

async function loadAnalystDesk() {
    const symbol = (document.getElementById('analyst-symbol-input')?.value || 'COIN').trim().toUpperCase();
    if (!symbol) return;
    const echo = document.getElementById('analyst-symbol-echo');
    if (echo) echo.textContent = symbol;
    setAnalystStatus(`loading ${symbol}…`);

    const setCell = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    ['analyst-rec-value', 'analyst-pt-value', 'analyst-sentiment-value', 'analyst-social-value', 'analyst-upgrade-value']
        .forEach(id => setCell(id, '<span style="opacity:0.5;">loading…</span>'));
    const newsEl = document.getElementById('analyst-company-news');
    if (newsEl) newsEl.innerHTML = '';

    const today = new Date();
    const from = new Date(today); from.setUTCDate(from.getUTCDate() - 14);
    const fmtDate = d => d.toISOString().slice(0, 10);

    const [rec, pt, upg, sent, social, cnews] = await Promise.allSettled([
        finnhubGet('/stock/recommendation', { symbol }),
        finnhubGet('/stock/price-target', { symbol }),
        finnhubGet('/stock/upgrade-downgrade', { symbol }),
        finnhubGet('/news-sentiment', { symbol }),
        finnhubGet('/stock/social-sentiment', { symbol }),
        finnhubGet('/company-news', { symbol, from: fmtDate(from), to: fmtDate(today) })
    ]);

    // Recommendation trend
    if (rec.status === 'fulfilled' && Array.isArray(rec.value) && rec.value.length > 0) {
        const r = rec.value[0];
        const total = (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strongBuy || 0) + (r.strongSell || 0);
        setCell('analyst-rec-value', total > 0
            ? `<span class="quant-positive">Buy ${r.strongBuy + r.buy}</span> / Hold ${r.hold} / <span class="quant-negative">Sell ${r.sell + r.strongSell}</span> <span style="opacity:0.5;">(${r.period || ''})</span>`
            : 'no coverage');
    } else {
        setCell('analyst-rec-value', '<span style="opacity:0.5;">unavailable</span>');
    }

    // Price target
    if (pt.status === 'fulfilled' && pt.value && pt.value.targetMean) {
        const t = pt.value;
        setCell('analyst-pt-value', `Mean $${fmtNum(t.targetMean)} &nbsp;·&nbsp; High $${fmtNum(t.targetHigh)} &nbsp;·&nbsp; Low $${fmtNum(t.targetLow)}`);
    } else {
        setCell('analyst-pt-value', '<span style="opacity:0.5;">unavailable</span>');
    }

    // News sentiment / buzz
    if (sent.status === 'fulfilled' && sent.value && sent.value.sentiment) {
        const s = sent.value;
        const bullish = (s.sentiment.bullishPercent * 100).toFixed(0);
        const bearish = (s.sentiment.bearishPercent * 100).toFixed(0);
        setCell('analyst-sentiment-value', `<span class="quant-positive">Bullish ${bullish}%</span> / <span class="quant-negative">Bearish ${bearish}%</span> &nbsp;·&nbsp; Buzz ${fmtNum(s.buzz?.buzz, 2)}`);
    } else {
        setCell('analyst-sentiment-value', '<span style="opacity:0.5;">unavailable</span>');
    }

    // Social sentiment (reddit + twitter mention counts, most recent day)
    if (social.status === 'fulfilled' && social.value && (social.value.reddit || social.value.twitter)) {
        const reddit = (social.value.reddit || [])[0];
        const twitter = (social.value.twitter || [])[0];
        const parts = [];
        if (reddit) parts.push(`Reddit mentions ${reddit.mention} (score ${fmtNum(reddit.score, 2)})`);
        if (twitter) parts.push(`Twitter mentions ${twitter.mention} (score ${fmtNum(twitter.score, 2)})`);
        setCell('analyst-social-value', parts.length ? parts.join(' &nbsp;·&nbsp; ') : 'no recent data');
    } else {
        setCell('analyst-social-value', '<span style="opacity:0.5;">unavailable</span>');
    }

    // Recent rating actions
    if (upg.status === 'fulfilled' && Array.isArray(upg.value) && upg.value.length > 0) {
        const recent = upg.value.slice(0, 3).map(u => {
            const cls = /up/i.test(u.action) ? 'quant-positive' : /down/i.test(u.action) ? 'quant-negative' : '';
            return `<span class="${cls}">${u.company}: ${u.fromGrade || '?'} → ${u.toGrade || '?'}</span>`;
        }).join(' &nbsp;·&nbsp; ');
        setCell('analyst-upgrade-value', recent);
    } else {
        setCell('analyst-upgrade-value', '<span style="opacity:0.5;">no recent actions</span>');
    }

    // Company news
    if (cnews.status === 'fulfilled' && Array.isArray(cnews.value)) {
        const items = cnews.value.slice(0, 12).map(item => ({
            title: item.headline, url: item.url, image: item.image || '',
            source: item.source || 'Finnhub', publishedOn: item.datetime, provider: symbol
        }));
        renderNewsList('analyst-company-news', dedupeAndSort(items));
    }

    const failedCount = [rec, pt, upg, sent, social, cnews].filter(r => r.status === 'rejected').length;
    setAnalystStatus(`updated ${new Date().toLocaleTimeString()} for ${symbol}` + (failedCount ? ` · ${failedCount}/6 endpoints unavailable` : ''), failedCount === 6);
}

/* --------------------------------- INIT ---------------------------------- */

window.initNewsTab = function () {
    loadFearGreed();
    loadNews();
    loadEconomicCalendar();
    loadAnalystDesk();
    if (fngHistoryChart) fngHistoryChart.reflow();
};

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('fng-refresh-btn')?.addEventListener('click', loadFearGreed);
    document.getElementById('news-refresh-btn')?.addEventListener('click', loadNews);
    document.getElementById('econ-calendar-refresh-btn')?.addEventListener('click', loadEconomicCalendar);
    document.getElementById('analyst-desk-refresh-btn')?.addEventListener('click', loadAnalystDesk);
    document.getElementById('analyst-symbol-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadAnalystDesk();
    });

    // Finnhub key row, injected once into #news-controls (optional to
    // touch — a default key is bundled — but overridable/persisted).
    const controls = document.getElementById('news-controls');
    if (controls && !document.getElementById('finnhub-key-input')) {
        const wrap = document.createElement('span');
        wrap.id = 'finnhub-key-row';
        wrap.innerHTML = `
            <input type="text" id="finnhub-key-input" placeholder="Finnhub API key (default bundled)">
            <button id="finnhub-key-save-btn">Save Key</button>
        `;
        controls.appendChild(wrap);
        const input = document.getElementById('finnhub-key-input');
        const saved = localStorage.getItem(FINNHUB_KEY_STORAGE);
        if (saved) input.value = saved;
        document.getElementById('finnhub-key-save-btn')?.addEventListener('click', () => {
            localStorage.setItem(FINNHUB_KEY_STORAGE, input.value.trim());
            loadNews(); loadEconomicCalendar(); loadAnalystDesk();
        });
    }
});
