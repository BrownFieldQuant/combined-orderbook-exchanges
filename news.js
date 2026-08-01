/* news.js
   News & Sentiment tab:
   - Fear & Greed Index: alternative.me public API (free, no key, CORS-open).
   - Crypto news headlines: CryptoCompare public news API (free, no key,
     CORS-open — widely used client-side for exactly this).
*/

let fngHistoryChart = null;

/* --------------------------------- FNG ----------------------------------- */

function classificationColor(classification) {
    const c = (classification || '').toLowerCase();
    if (c.includes('extreme fear')) return '#ef5350';
    if (c.includes('fear')) return '#e5893f';
    if (c.includes('greed') && !c.includes('extreme')) return '#8bc48a';
    if (c.includes('extreme greed')) return '#3ecf8e';
    return '#e5c07b'; // neutral
}

function setFngStatus(text, isError) {
    const el = document.getElementById('fng-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

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

        // History chart (oldest -> newest for a left-to-right timeline)
        const chronological = points.slice().reverse();
        const seriesData = chronological.map(p => [parseInt(p.timestamp) * 1000, parseInt(p.value)]);

        const options = {
            chart: { animation: false, backgroundColor: 'transparent' },
            title: { text: null },
            credits: { enabled: false },
            legend: { enabled: false },
            xAxis: { type: 'datetime', labels: { style: { fontSize: '9px', color: '#9aa4b5' } }, lineColor: '#232838' },
            yAxis: {
                title: { text: null }, min: 0, max: 100,
                labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130',
                plotBands: [
                    { from: 0, to: 25, color: 'rgba(239, 83, 80, 0.08)' },
                    { from: 25, to: 45, color: 'rgba(229, 137, 63, 0.08)' },
                    { from: 45, to: 55, color: 'rgba(229, 192, 123, 0.08)' },
                    { from: 55, to: 75, color: 'rgba(139, 196, 138, 0.08)' },
                    { from: 75, to: 100, color: 'rgba(62, 207, 142, 0.08)' }
                ]
            },
            tooltip: { valueDecimals: 0 },
            series: [{ name: 'Fear & Greed', type: 'line', data: seriesData, color: '#c9975a', marker: { enabled: false } }]
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

/* --------------------------------- NEWS ----------------------------------- */

function setNewsStatus(text, isError) {
    const el = document.getElementById('news-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

function timeAgo(unixSeconds) {
    const diffMs = Date.now() - unixSeconds * 1000;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

async function loadNews() {
    setNewsStatus('loading…');
    try {
        const res = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest');
        if (!res.ok) throw new Error('CryptoCompare unreachable');
        const json = await res.json();
        const items = (json.Data || []).slice(0, 30);
        if (items.length === 0) throw new Error('no articles returned');

        const list = document.getElementById('news-list');
        list.innerHTML = '';
        items.forEach(item => {
            const a = document.createElement('a');
            a.className = 'news-item';
            a.href = item.url;
            a.target = '_blank';
            a.rel = 'noopener';

            const img = document.createElement('img');
            img.src = item.imageurl || '';
            img.alt = '';
            img.onerror = () => { img.style.display = 'none'; };

            const textWrap = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'news-item-title';
            title.textContent = item.title;
            const meta = document.createElement('div');
            meta.className = 'news-item-meta';
            meta.textContent = `${item.source_info?.name || item.source || 'Unknown'} · ${timeAgo(item.published_on)}`;
            textWrap.appendChild(title);
            textWrap.appendChild(meta);

            a.appendChild(img);
            a.appendChild(textWrap);
            list.appendChild(a);
        });

        setNewsStatus('updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        setNewsStatus('failed — ' + e.message, true);
    }
}

/* --------------------------------- FINNHUB --------------------------------- */

const FINNHUB_KEY_STORAGE = 'news_finnhub_api_key';

function getFinnhubApiKey() {
    return localStorage.getItem(FINNHUB_KEY_STORAGE) || '';
}

function setFinnhubStatus(elId, text, isError) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

function requireFinnhubKey(statusElId) {
    const key = getFinnhubApiKey();
    if (!key) {
        setFinnhubStatus(statusElId, 'paste your free Finnhub API key above and click Save Key', true);
        return null;
    }
    return key;
}

function todayISO(offsetDays) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + (offsetDays || 0));
    return d.toISOString().slice(0, 10);
}

function finnhubTimeAgo(unixSeconds) {
    const diffMs = Date.now() - unixSeconds * 1000;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

async function loadFinnhubNews() {
    const key = requireFinnhubKey('finnhub-news-status');
    if (!key) return;
    const category = document.getElementById('finnhub-news-category')?.value || 'general';
    setFinnhubStatus('finnhub-news-status', 'loading…');

    try {
        const res = await fetch(`https://finnhub.io/api/v1/news?category=${category}&token=${key}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!Array.isArray(json)) throw new Error('unexpected response shape');

        const rows = json.slice(0, 40);
        const tbody = document.querySelector('#finnhub-news-table tbody');
        tbody.innerHTML = rows.map(item => `
            <tr>
                <td>${finnhubTimeAgo(item.datetime)}</td>
                <td><a href="${item.url}" target="_blank" rel="noopener">${item.headline}</a></td>
                <td>${item.source || '-'}</td>
                <td>${item.category || category}</td>
            </tr>
        `).join('');

        setFinnhubStatus('finnhub-news-status', 'updated ' + new Date().toLocaleTimeString() + ` · ${rows.length} articles`);
    } catch (e) {
        setFinnhubStatus('finnhub-news-status', 'failed — ' + e.message, true);
    }
}

async function loadEconomicCalendar() {
    const key = requireFinnhubKey('econ-calendar-status');
    if (!key) return;
    setFinnhubStatus('econ-calendar-status', 'loading…');

    try {
        const from = todayISO(-7);
        const to = todayISO(7);
        const res = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${key}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        const rows = (json.economicCalendar || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        const tbody = document.querySelector('#econ-calendar-table tbody');
        tbody.innerHTML = rows.map(ev => {
            const impact = (ev.impact || '').toLowerCase();
            const impactClass = impact.includes('high') ? 'impact-high' : (impact.includes('medium') || impact.includes('med') ? 'impact-medium' : 'impact-low');
            return `<tr>
                <td>${ev.time || '-'}</td>
                <td>${ev.country || '-'}</td>
                <td>${ev.event || '-'}</td>
                <td class="${impactClass}">${ev.impact || '-'}</td>
                <td>${ev.actual ?? '-'}</td>
                <td>${ev.estimate ?? '-'}</td>
                <td>${ev.prev ?? '-'}</td>
            </tr>`;
        }).join('');

        setFinnhubStatus('econ-calendar-status', 'updated ' + new Date().toLocaleTimeString() + ` · ${rows.length} events`);
    } catch (e) {
        setFinnhubStatus('econ-calendar-status', 'failed — ' + e.message, true);
    }
}

async function loadEarningsCalendar() {
    const key = requireFinnhubKey('earnings-calendar-status');
    if (!key) return;
    setFinnhubStatus('earnings-calendar-status', 'loading…');

    try {
        const from = todayISO(-7);
        const to = todayISO(7);
        const res = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        const rows = (json.earningsCalendar || []).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        const tbody = document.querySelector('#earnings-calendar-table tbody');
        tbody.innerHTML = rows.map(ev => `
            <tr>
                <td>${ev.date || '-'}</td>
                <td>${ev.symbol || '-'}</td>
                <td>${ev.hour || '-'}</td>
                <td>${ev.epsEstimate ?? '-'}</td>
                <td>${ev.epsActual ?? '-'}</td>
                <td>${ev.revenueEstimate ? ev.revenueEstimate.toLocaleString() : '-'}</td>
                <td>${ev.revenueActual ? ev.revenueActual.toLocaleString() : '-'}</td>
            </tr>
        `).join('');

        setFinnhubStatus('earnings-calendar-status', 'updated ' + new Date().toLocaleTimeString() + ` · ${rows.length} reports`);
    } catch (e) {
        setFinnhubStatus('earnings-calendar-status', 'failed — ' + e.message, true);
    }
}

/* --------------------------------- INIT ---------------------------------- */

window.initNewsTab = function () {
    loadFearGreed();
    loadNews();
    if (getFinnhubApiKey()) {
        loadFinnhubNews();
        loadEconomicCalendar();
        loadEarningsCalendar();
    }
    if (fngHistoryChart) fngHistoryChart.reflow();
};

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('fng-refresh-btn')?.addEventListener('click', loadFearGreed);
    document.getElementById('news-refresh-btn')?.addEventListener('click', loadNews);

    const savedKey = getFinnhubApiKey();
    if (savedKey) {
        const input = document.getElementById('finnhub-api-key-input');
        if (input) input.value = savedKey;
    }
    document.getElementById('finnhub-key-save-btn')?.addEventListener('click', () => {
        const input = document.getElementById('finnhub-api-key-input');
        if (!input) return;
        localStorage.setItem(FINNHUB_KEY_STORAGE, input.value.trim());
        loadFinnhubNews();
        loadEconomicCalendar();
        loadEarningsCalendar();
    });
    document.getElementById('finnhub-news-refresh-btn')?.addEventListener('click', loadFinnhubNews);
    document.getElementById('finnhub-news-category')?.addEventListener('change', loadFinnhubNews);
    document.getElementById('econ-calendar-refresh-btn')?.addEventListener('click', loadEconomicCalendar);
    document.getElementById('earnings-calendar-refresh-btn')?.addEventListener('click', loadEarningsCalendar);
});
