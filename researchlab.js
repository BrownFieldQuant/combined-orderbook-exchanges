/* researchlab.js
   UI/orchestration layer for the Research Lab tab. Responsibilities:
     - Fetch deep historical candles (reusing the same Binance -> Hyperliquid
       -> trade[xyz] cascade already established in tradfi.js, extended
       here to pull full OHLC instead of just close price).
     - Cache fetched history in localStorage, keyed by asset+timeframe+depth,
       so re-running the same selection doesn't refetch (per spec: "Không
       fetch lại dữ liệu nếu đã có").
     - Call session-engine.js / statistics-engine.js (pure functions, no
       fetching in those files) to compute everything shown.
     - Render the stats grid, session table, gap panel, and charts.
   No mock/random data anywhere — if there isn't enough real history for a
   metric, the UI says so instead of inventing a number.
*/

const RL_TIMEFRAME_MS = { '15m': 9e5, '30m': 1.8e6, '1h': 3.6e6, '4h': 1.44e7, '1d': 8.64e7, '1w': 6.048e8 };
const RL_HISTORY_CACHE_PREFIX = 'rl_history_';

let rlDistChart = null;
let rlSeasonalityChart = null;
let rlHourlyChart = null;

/* ------------------------------ deep history ------------------------------ */

function rlSetStatus(text, isError) {
    const el = document.getElementById('rl-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

function rlSetProgress(pct) {
    const fill = document.getElementById('rl-progress-fill');
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

async function fetchDeepHistoryBinance(symbol, interval, targetCount) {
    let all = [];
    let endTime = Date.now();
    const batchLimit = 1000;
    let guard = 0;
    while (all.length < targetCount && guard < 30) {
        guard++;
        const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&endTime=${endTime}&limit=${batchLimit}`;
        let res;
        try { res = await fetch(url); } catch (e) { break; }
        if (!res.ok) break;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) break;
        const batch = rows.map(r => ({ time: r[6], o: parseFloat(r[1]), h: parseFloat(r[2]), l: parseFloat(r[3]), c: parseFloat(r[4]) }))
            .filter(c => isFinite(c.o) && isFinite(c.h) && isFinite(c.l) && isFinite(c.c));
        all = batch.concat(all);
        rlSetProgress(Math.min(95, all.length / targetCount * 100));
        endTime = rows[0][0] - 1;
        if (rows.length < batchLimit) break; // hit the start of available history
    }
    if (all.length > targetCount) all = all.slice(all.length - targetCount);
    return all;
}

async function fetchDeepHistoryHyperliquid(coin, interval, targetCount, intervalMs) {
    try {
        const endTime = Date.now();
        const startTime = endTime - targetCount * intervalMs;
        const res = await fetch('https://api.hyperliquid.xyz/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime, endTime } })
        });
        if (!res.ok) return null;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rows.map(r => ({ time: r.t, o: parseFloat(r.o), h: parseFloat(r.h), l: parseFloat(r.l), c: parseFloat(r.c) }))
            .filter(c => isFinite(c.o) && isFinite(c.h) && isFinite(c.l) && isFinite(c.c));
    } catch (e) {
        return null;
    }
}

// Cascade: Binance -> Hyperliquid main perp -> trade[xyz] (HIP-3). Same
// priority order already used for the TradFi Asset Basket, so behavior is
// consistent across the app.
async function resolveDeepHistory(assetSelection, timeframe, targetCount) {
    const intervalMs = RL_TIMEFRAME_MS[timeframe];

    if (assetSelection.startsWith('xyz:')) {
        const candles = await fetchDeepHistoryHyperliquid(assetSelection, timeframe, targetCount, intervalMs);
        return { source: 'trade[xyz]', candles: candles || [] };
    }

    const binanceCandles = await fetchDeepHistoryBinance(assetSelection, timeframe, targetCount);
    if (binanceCandles.length >= 30) return { source: 'Binance', candles: binanceCandles };

    const bareTicker = assetSelection.replace(/USDT$/i, '');
    const hlCandles = await fetchDeepHistoryHyperliquid(bareTicker, timeframe, targetCount, intervalMs);
    if (hlCandles && hlCandles.length >= 30) return { source: 'Hyperliquid', candles: hlCandles };

    const xyzCandles = await fetchDeepHistoryHyperliquid(`xyz:${bareTicker}`, timeframe, targetCount, intervalMs);
    if (xyzCandles && xyzCandles.length >= 30) return { source: 'trade[xyz]', candles: xyzCandles };

    // Whichever partial Binance result we got (even if under 30 candles) is
    // still real data — surface it rather than silently returning nothing.
    return { source: binanceCandles.length ? 'Binance' : null, candles: binanceCandles };
}

function rlCacheKey(asset, timeframe, depth) {
    return `${RL_HISTORY_CACHE_PREFIX}${asset}_${timeframe}_${depth}`;
}

function loadCachedHistory(asset, timeframe, depth) {
    try {
        const raw = localStorage.getItem(rlCacheKey(asset, timeframe, depth));
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function saveCachedHistory(asset, timeframe, depth, payload) {
    try {
        localStorage.setItem(rlCacheKey(asset, timeframe, depth), JSON.stringify(payload));
    } catch (e) {
        // Storage full — not fatal, just means this run won't be cached.
    }
}

/* --------------------------------- tooltips -------------------------------- */

const RL_STAT_TOOLTIPS = {
    sampleSize: 'Number of return observations used in every calculation below. Larger = more statistically reliable.',
    bullishPct: '% of candles that closed higher than they opened.',
    bearishPct: '% of candles that closed lower than they opened.',
    avgReturn: 'Mean of all period-over-period returns.',
    medianReturn: 'Middle value of all returns — less skewed by outliers than the average.',
    avgHighLow: 'Average range (high minus low) per candle, in price units.',
    atr: "Average True Range (Wilder's, 14-period) — a standard volatility/range measure.",
    volatilityPct: 'Standard deviation of returns, expressed as a percentage.',
    stdDevPrice: 'Standard deviation of raw price changes between candles, in price units.',
    sharpe: 'Annualized return divided by annualized volatility. Higher = better risk-adjusted return.',
    sortino: 'Like Sharpe, but only penalizes downside volatility — ignores upside swings.',
    calmar: 'Annualized return divided by maximum drawdown. Higher = better return relative to the worst losing streak.',
    profitFactor: 'Sum of all gains divided by the absolute sum of all losses. Above 1 means gains outweigh losses.',
    kelly: 'Kelly criterion — theoretical optimal fraction of capital to risk per period, given this win rate and win/loss size. Often used at a fraction (e.g. 1/4 Kelly) in practice, not in full.',
    maxDrawdown: 'Largest peak-to-trough decline in the cumulative return curve over this sample.',
    mae: 'Maximum Adverse Excursion — average how far price moved against the candle\'s own direction before it closed.',
    mfe: 'Maximum Favorable Excursion — average how far price moved in the candle\'s own direction before it closed.',
    expectedValue: 'Win rate × average win, plus loss rate × average loss — the theoretical average return per period.',
    avgWin: 'Mean return of all positive-return periods.',
    avgLoss: 'Mean return of all negative-return periods.',
    largestMove: 'Biggest single-period absolute return in the sample.',
    smallestMove: 'Smallest single-period absolute return in the sample.',
    confidenceScore: '0-100 score derived from the p-value — how confident we can be the average return isn\'t just noise.',
    confidenceInterval: 'Range the true average return likely falls in, 95% of the time, given this sample (95% confidence interval).',
    pValue: 'Probability of seeing this average return (or more extreme) if the true average were actually zero. Lower = more statistically significant.',
    zScore: 'How many standard errors the average return is from zero — the test statistic behind the p-value.',
    dataQuality: 'Sample-size-based label: Insufficient (<30) / Low (30-99) / Medium (100-499) / High (500+).'
};

function rlTooltipIcon(text) {
    return `<span class="rl-tip" title="${text.replace(/"/g, '&quot;')}">?</span>`;
}

/* ------------------------------ rendering ------------------------------ */

function rlFmtPct(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return 'n/a';
    return (v * 100).toFixed(digits ?? 3) + '%';
}
function rlFmtNum(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return 'n/a';
    return v.toFixed(digits ?? 3);
}

const RL_STAT_ROWS = [
    ['sampleSize', 'Sample Size', v => v ?? 'n/a', 0],
    ['bullishPct', 'Bullish %', v => (v ?? 0).toFixed(1) + '%'],
    ['bearishPct', 'Bearish %', v => (v ?? 0).toFixed(1) + '%'],
    ['avgReturn', 'Average Return', v => rlFmtPct(v)],
    ['medianReturn', 'Median Return', v => rlFmtPct(v)],
    ['avgHighLow', 'Average High-Low', v => rlFmtNum(v, 4)],
    ['atr', 'ATR (14)', v => rlFmtNum(v, 4)],
    ['volatilityPct', 'Volatility', v => rlFmtNum(v, 3) + '%'],
    ['stdDevPrice', 'Standard Deviation', v => rlFmtNum(v, 4)],
    ['sharpe', 'Sharpe Ratio', v => rlFmtNum(v, 2)],
    ['sortino', 'Sortino Ratio', v => rlFmtNum(v, 2)],
    ['calmar', 'Calmar Ratio', v => rlFmtNum(v, 2)],
    ['profitFactor', 'Profit Factor', v => rlFmtNum(v, 2)],
    ['kelly', 'Kelly %', v => rlFmtPct(v, 1)],
    ['maxDrawdown', 'Maximum Drawdown', v => rlFmtPct(v, 2)],
    ['mae', 'MAE', v => rlFmtPct(v, 3)],
    ['mfe', 'MFE', v => rlFmtPct(v, 3)],
    ['expectedValue', 'Expected Value', v => rlFmtPct(v)],
    ['avgWin', 'Average Win', v => rlFmtPct(v)],
    ['avgLoss', 'Average Loss', v => rlFmtPct(v)],
    ['largestMove', 'Largest Move', v => rlFmtPct(v, 2)],
    ['smallestMove', 'Smallest Move', v => rlFmtPct(v, 3)],
    ['confidenceScore', 'Confidence Score', v => v !== null ? v.toFixed(1) : 'n/a'],
    ['confidenceInterval', 'Confidence Interval (95%)', v => v ? `${rlFmtPct(v[0])} … ${rlFmtPct(v[1])}` : 'n/a'],
    ['pValue', 'P-value', v => v !== null ? v.toFixed(4) : 'n/a'],
    ['zScore', 'Z-score', v => v !== null ? v.toFixed(2) : 'n/a'],
    ['dataQuality', 'Data Quality', v => v ?? 'n/a']
];

function renderStatsGrid(stats) {
    const grid = document.getElementById('rl-stats-grid');
    if (!grid) return;
    if (!stats) {
        grid.innerHTML = '<div class="rl-stat-cell">Not enough candles in this selection to compute statistics.</div>';
        return;
    }
    grid.innerHTML = RL_STAT_ROWS.map(([key, label, formatter]) => `
        <div class="rl-stat-cell">
            <div class="rl-stat-label">${label} ${rlTooltipIcon(RL_STAT_TOOLTIPS[key] || '')}</div>
            <div class="rl-stat-value">${formatter(stats[key])}</div>
        </div>
    `).join('');
}

function renderSessionTable(candles) {
    const tbody = document.querySelector('#rl-session-table tbody');
    if (!tbody) return;
    const buckets = splitCandlesBySession(candles);
    const rows = [
        ['Asia', buckets.asia],
        ['London', buckets.london],
        ['New York', buckets.ny],
        ['Friday Close', buckets.friday_close],
        ['Monday Open', buckets.monday_open]
    ];
    tbody.innerHTML = rows.map(([label, bucket]) => {
        if (bucket.length < 5) {
            return `<tr><td>${label}</td><td>${bucket.length}</td><td colspan="3">not enough candles</td></tr>`;
        }
        const bullishPct = bucket.filter(c => c.c > c.o).length / bucket.length * 100;
        const returns = computeReturns(bucket).filter(r => r !== null);
        const avgReturn = returns.length ? rsMean(returns) : null;
        const avgRange = rsMean(bucket.map(c => c.h - c.l));
        return `<tr>
            <td>${label}</td>
            <td>${bucket.length}</td>
            <td class="${bullishPct >= 50 ? 'quant-positive' : 'quant-negative'}">${bullishPct.toFixed(1)}%</td>
            <td class="${(avgReturn ?? 0) >= 0 ? 'quant-positive' : 'quant-negative'}">${rlFmtPct(avgReturn)}</td>
            <td>${rlFmtNum(avgRange, 4)}</td>
        </tr>`;
    }).join('');
}

function renderGapPanel(candles, timeframe) {
    const grid = document.getElementById('rl-gap-grid');
    if (!grid) return;
    const gaps = computeGapAnalysis(candles, timeframe);
    if (!gaps || gaps.sampleSize === 0) {
        grid.innerHTML = '<div class="rl-stat-cell">No meaningful gaps detected (or not enough candles) in this selection.</div>';
        return;
    }
    const cells = [
        ['Gaps Found', gaps.sampleSize],
        ['Gap Up Count', gaps.gapUpCount],
        ['Gap Down Count', gaps.gapDownCount],
        ['Avg Gap Size', gaps.avgGapSizePct.toFixed(3) + '%'],
        ['Fill Rate 24h', gaps.fillRate24h.toFixed(1) + '%'],
        ['Fill Rate 48h', gaps.fillRate48h.toFixed(1) + '%'],
        ['Fill Rate 72h', gaps.fillRate72h.toFixed(1) + '%']
    ];
    grid.innerHTML = cells.map(([label, value]) => `
        <div class="rl-stat-cell">
            <div class="rl-stat-label">${label}</div>
            <div class="rl-stat-value">${value}</div>
        </div>
    `).join('');
}

function renderDistributionChart(candles) {
    const container = document.getElementById('rl-dist-chart');
    if (!container || typeof Highcharts === 'undefined') return;
    const hist = computeReturnHistogram(candles, 24);
    if (!hist) { container.innerHTML = ''; return; }

    const options = {
        chart: { type: 'column', animation: false, backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { categories: hist.map(b => b.binStart.toFixed(2) + '%'), labels: { style: { fontSize: '8px', color: '#9aa4b5' }, rotation: -45 } },
        yAxis: { title: { text: 'Count' }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130' },
        tooltip: { headerFormat: '', pointFormat: 'Return bucket: {point.category}<br>Count: {point.y}' },
        series: [{ name: 'Return distribution', data: hist.map(b => b.count), color: '#c9975a' }]
    };
    if (!rlDistChart) {
        rlDistChart = Highcharts.chart('rl-dist-chart', options);
        if (typeof attachChartWatermark === 'function') attachChartWatermark(rlDistChart, 'own history cache, sourced from Binance / Hyperliquid / trade[xyz]');
    } else {
        rlDistChart.update(options, true, true);
    }
}

function renderSeasonalityChart(candles) {
    const container = document.getElementById('rl-seasonality-chart');
    if (!container || typeof Highcharts === 'undefined') return;
    const seasonality = computeSeasonality(candles);
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const options = {
        chart: { type: 'column', animation: false, backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { categories: weekdayNames, labels: { style: { fontSize: '9px', color: '#9aa4b5' } } },
        yAxis: { title: { text: 'Avg Return %' }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130', plotLines: [{ value: 0, color: '#6b7280', width: 1 }] },
        tooltip: { valueDecimals: 4 },
        plotOptions: { column: { negativeColor: '#ef5350', color: '#3ecf8e' } },
        series: [{ name: 'Avg Return %', data: seasonality.map(s => s.avgReturnPct === null ? null : Number(s.avgReturnPct.toFixed(4))) }]
    };
    if (!rlSeasonalityChart) {
        rlSeasonalityChart = Highcharts.chart('rl-seasonality-chart', options);
        if (typeof attachChartWatermark === 'function') attachChartWatermark(rlSeasonalityChart, 'own history cache, sourced from Binance / Hyperliquid / trade[xyz]');
    } else {
        rlSeasonalityChart.update(options, true, true);
    }
}

function renderHourlyHeatmap(candles) {
    const container = document.getElementById('rl-hourly-chart');
    if (!container || typeof Highcharts === 'undefined') return;
    const hourly = computeHourlyHeatmap(candles);

    const options = {
        chart: { type: 'column', animation: false, backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { categories: hourly.map(h => h.hour + ':00'), labels: { style: { fontSize: '8px', color: '#9aa4b5' } } },
        yAxis: { title: { text: 'Avg Return %' }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130', plotLines: [{ value: 0, color: '#6b7280', width: 1 }] },
        tooltip: { valueDecimals: 4 },
        plotOptions: { column: { negativeColor: '#ef5350', color: '#3ecf8e' } },
        series: [{ name: 'Avg Return %', data: hourly.map(h => h.avgReturnPct === null ? null : Number(h.avgReturnPct.toFixed(4))) }]
    };
    if (!rlHourlyChart) {
        rlHourlyChart = Highcharts.chart('rl-hourly-chart', options);
        if (typeof attachChartWatermark === 'function') attachChartWatermark(rlHourlyChart, 'own history cache, sourced from Binance / Hyperliquid / trade[xyz]');
    } else {
        rlHourlyChart.update(options, true, true);
    }
}

/* --------------------------------- run --------------------------------- */

async function runResearchLabAnalysis() {
    const assetSelect = document.getElementById('rl-asset');
    const customInput = document.getElementById('rl-asset-custom');
    const asset = assetSelect.value === 'custom' ? customInput.value.trim() : assetSelect.value;
    const sessionKey = document.getElementById('rl-session')?.value || 'all';
    const timeframe = document.getElementById('rl-timeframe')?.value || '1h';
    const depth = parseInt(document.getElementById('rl-depth')?.value || '3000');

    if (!asset) {
        rlSetStatus('enter a custom ticker first', true);
        return;
    }

    document.getElementById('rl-stats-label').textContent = `${asset} · ${timeframe} · ${sessionKey}`;
    rlSetProgress(5);
    rlSetStatus('checking cache…');

    let cached = loadCachedHistory(asset, timeframe, depth);
    let source, candles;

    if (cached && Array.isArray(cached.candles) && cached.candles.length >= 30) {
        source = cached.source + ' (cached)';
        candles = cached.candles;
        rlSetProgress(100);
        rlSetStatus(`using cached history · ${candles.length} candles · ${source}`);
    } else {
        rlSetStatus('fetching real historical candles…');
        const result = await resolveDeepHistory(asset, timeframe, depth);
        source = result.source;
        candles = result.candles;
        if (candles.length >= 30) {
            saveCachedHistory(asset, timeframe, depth, { source, candles, fetchedAt: Date.now() });
        }
        rlSetProgress(100);
    }

    if (!candles || candles.length < 30) {
        rlSetStatus(`only found ${candles ? candles.length : 0} candles for ${asset} — not enough for reliable statistics (need 30+). Try a different asset/timeframe.`, true);
        renderStatsGrid(null);
        return;
    }

    const filtered = filterCandlesBySession(candles, sessionKey);
    if (filtered.length < 30) {
        rlSetStatus(`${filtered.length} candles match this session filter — not enough (need 30+). Try "All hours" or a longer history depth.`, true);
        renderStatsGrid(null);
        return;
    }

    const stats = computeCoreStats(filtered, timeframe);
    renderStatsGrid(stats);
    renderSessionTable(candles); // session table always shows all sessions, unfiltered
    renderGapPanel(candles, timeframe);
    renderDistributionChart(filtered);
    renderSeasonalityChart(candles);
    renderHourlyHeatmap(candles);

    rlSetStatus(`done · ${filtered.length}/${candles.length} candles used · source: ${source}`);
    setTimeout(() => rlSetProgress(0), 1200);
}

/* --------------------------------- init --------------------------------- */

const RL_OPENROUTER_KEY_STORAGE = 'rl_openrouter_api_key';

window.initResearchlabTab = function () {
    if (rlDistChart) rlDistChart.reflow();
    if (rlSeasonalityChart) rlSeasonalityChart.reflow();
    if (rlHourlyChart) rlHourlyChart.reflow();
};

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('rl-asset')?.addEventListener('change', function () {
        document.getElementById('rl-asset-custom').style.display = this.value === 'custom' ? 'block' : 'none';
    });
    document.getElementById('rl-run-btn')?.addEventListener('click', runResearchLabAnalysis);

    const savedKey = localStorage.getItem(RL_OPENROUTER_KEY_STORAGE) || '';
    const keyInput = document.getElementById('rl-openrouter-key-input');
    if (keyInput && savedKey) keyInput.value = savedKey;
    document.getElementById('rl-openrouter-key-save-btn')?.addEventListener('click', () => {
        if (!keyInput) return;
        localStorage.setItem(RL_OPENROUTER_KEY_STORAGE, keyInput.value.trim());
    });
});
