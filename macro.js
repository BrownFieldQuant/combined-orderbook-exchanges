/* macro.js
   Macro Liquidity tab. Real data only:

   - Fed liquidity series (balance sheet, M2, reverse repo, SOFR, Fed funds,
     10Y yield): FRED (Federal Reserve Bank of St. Louis) public API.
     Requires a free personal API key (pasted by the person, stored only in
     this browser's localStorage — same pattern as the ETH/Etherscan key).
   - "Events" are real, scheduled economic data release dates pulled from
     FRED's own release-dates endpoint (CPI, Non-Farm Payrolls/Employment
     Situation, FOMC) — not scraped news. Reuters/news headlines aren't
     reachable client-side (no free public API + no CORS), so this uses
     FRED's own release calendar instead, which is arguably more rigorous
     for this purpose anyway: exact dates, no ambiguity.
   - Asset reaction on each release date (Gold/Oil/NatGas/BTC) comes from
     Binance klines (same pattern as the rest of the app). SP500 exposure
     is attempted via trade[xyz]'s index perpetual if one is listed there;
     otherwise shown as "n/a" (no Yahoo Finance, per instructions).
*/

const FRED_KEY_STORAGE = 'macro_fred_api_key';
// FRED release IDs for the three release types shown in the event study.
const FRED_RELEASE_IDS = {
    CPI: { id: 10, label: 'CPI (Inflation)' },
    NFP: { id: 50, label: 'Employment Situation (NFP)' },
    FOMC: { id: 101, label: 'FOMC Press Release' }
};

let fredChart = null;

function getFredApiKey() {
    return localStorage.getItem(FRED_KEY_STORAGE) || '';
}

function setFredStatus(text, isError) {
    const el = document.getElementById('fred-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

async function loadFredSeries() {
    const apiKey = getFredApiKey();
    const seriesId = document.getElementById('fred-series-select')?.value || 'WALCL';
    if (!apiKey) {
        setFredStatus('paste your free FRED API key above and click Save Key', true);
        return;
    }
    setFredStatus('loading…');
    try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=asc&limit=2000`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok || !json.observations) throw new Error(json.error_message || 'FRED rejected the request (check API key)');

        const data = json.observations
            .filter(o => o.value !== '.')
            .map(o => [new Date(o.date + 'T00:00:00Z').getTime(), parseFloat(o.value)]);

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

        setFredStatus('updated ' + new Date().toLocaleTimeString() + ` · ${data.length} points`);
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

async function fetchFredReleaseDates(releaseId, limit) {
    const apiKey = getFredApiKey();
    const url = `https://api.stlouisfed.org/fred/release/dates?release_id=${releaseId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || !json.release_dates) return [];
    return json.release_dates.map(d => d.date);
}

async function fetchDailyCloses(symbol, days) {
    try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=${days}`);
        if (!res.ok) return null;
        const rows = await res.json();
        // Map "YYYY-MM-DD" (UTC close date) -> {open, close}
        const map = {};
        rows.forEach(r => {
            const dateStr = new Date(r[6]).toISOString().slice(0, 10);
            map[dateStr] = { open: parseFloat(r[1]), close: parseFloat(r[4]) };
        });
        return map;
    } catch (e) {
        return null;
    }
}

function findXyzIndexSymbol() {
    if (typeof xyzMarketsCache === 'undefined' || !Array.isArray(xyzMarketsCache)) return null;
    const match = xyzMarketsCache.find(m => /SPX|SP500|US500|XYZ100/i.test(m.name));
    return match ? match.name : null;
}

function pctChange(closesMap, dateStr) {
    const day = closesMap?.[dateStr];
    if (!day || !day.open) return null;
    return (day.close - day.open) / day.open * 100;
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
    const apiKey = getFredApiKey();
    if (!apiKey) {
        setEventStudyStatus('paste your free FRED API key above first', true);
        return;
    }
    setEventStudyStatus('loading real release dates…');

    try {
        const [cpiDates, nfpDates, fomcDates] = await Promise.all([
            fetchFredReleaseDates(FRED_RELEASE_IDS.CPI.id, 6),
            fetchFredReleaseDates(FRED_RELEASE_IDS.NFP.id, 6),
            fetchFredReleaseDates(FRED_RELEASE_IDS.FOMC.id, 6)
        ]);

        const events = [
            ...cpiDates.map(d => ({ date: d, label: FRED_RELEASE_IDS.CPI.label })),
            ...nfpDates.map(d => ({ date: d, label: FRED_RELEASE_IDS.NFP.label })),
            ...fomcDates.map(d => ({ date: d, label: FRED_RELEASE_IDS.FOMC.label }))
        ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);

        setEventStudyStatus('loading asset reactions…');

        const [goldMap, oilMap, gasMap, btcMap] = await Promise.all([
            fetchDailyCloses('XAUUSDT', 120),
            fetchDailyCloses('CLUSDT', 120),
            fetchDailyCloses('NATGASUSDT', 120),
            fetchDailyCloses('BTCUSDT', 120)
        ]);

        const spxSymbol = findXyzIndexSymbol();

        const tbody = document.querySelector('#event-study-table tbody');
        tbody.innerHTML = events.map(ev => {
            const gold = pctChange(goldMap, ev.date);
            const oil = pctChange(oilMap, ev.date);
            const gas = pctChange(gasMap, ev.date);
            const btc = pctChange(btcMap, ev.date);
            return `<tr>
                <td>${ev.date}</td>
                <td>${ev.label}</td>
                <td class="${pctClass(gold)}">${fmtPct(gold)}</td>
                <td class="${pctClass(oil)}">${fmtPct(oil)}</td>
                <td class="${pctClass(gas)}">${fmtPct(gas)}</td>
                <td class="${pctClass(btc)}">${fmtPct(btc)}</td>
                <td>${spxSymbol ? 'see trade[xyz] tab (' + spxSymbol + ')' : 'n/a — no index perp found'}</td>
            </tr>`;
        }).join('');

        setEventStudyStatus('updated ' + new Date().toLocaleTimeString() + ` · ${events.length} releases`);
    } catch (e) {
        setEventStudyStatus('failed — ' + e.message, true);
    }
}

/* --------------------------------- INIT ---------------------------------- */

window.initMacroTab = function () {
    if (getFredApiKey()) {
        loadFredSeries();
    } else {
        setFredStatus('paste your free FRED API key above and click Save Key', true);
    }
    if (fredChart) fredChart.reflow();
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
    document.getElementById('fred-series-select')?.addEventListener('change', loadFredSeries);
    document.getElementById('event-study-refresh-btn')?.addEventListener('click', loadEventStudy);
});
