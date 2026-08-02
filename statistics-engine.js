/* statistics-engine.js
   Pure statistics functions operating on a candle array:
     [{ time, o, h, l, c }, ...]  (time in ms, o/h/l/c numeric)
   No fetching, no DOM, no localStorage — every function here is a plain
   transform so it can be tested/reused independently (Pattern Explorer,
   Research Note generator, etc. in later phases call into this same file
   rather than re-implementing formulas).

   All formulas are standard, named ones (Sharpe, Sortino, Calmar, Kelly,
   MAE/MFE, etc.) — documented inline with the exact definition used, since
   several of these have more than one common convention.
*/

/* ------------------------------- helpers ------------------------------- */

function rsMean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function rsMedian(arr) {
    if (!arr.length) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Sample standard deviation (n-1 denominator) — the standard choice when
// treating the candle set as a sample of a larger return-generating process
// rather than the entire population.
function rsStdDev(arr, mean) {
    if (arr.length < 2) return 0;
    const m = mean === undefined ? rsMean(arr) : mean;
    const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
}

// Standard normal CDF via the Abramowitz-Stegun erf approximation
// (max error ~1.5e-7) — good enough for a p-value display, no stats
// library needed.
function normalCDF(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    if (z > 0) p = 1 - p;
    return p;
}

// Periods-per-year for each supported timeframe, used to annualize
// return/volatility-based ratios (Sharpe, Sortino, Calmar).
const PERIODS_PER_YEAR = {
    '15m': 35040, '30m': 17520, '1h': 8760, '4h': 2190, '1d': 365, '1w': 52
};

/* -------------------------- return series -------------------------- */

// Simple close-to-close returns, index-aligned so returns[i] corresponds
// to candles[i] (returns[0] is always null — no prior close to compare to).
function computeReturns(candles) {
    return candles.map((c, i) => {
        if (i === 0 || !candles[i - 1].c) return null;
        return (c.c - candles[i - 1].c) / candles[i - 1].c;
    });
}

/* --------------------------- core statistics --------------------------- */

/**
 * Computes the full "Historical Statistics" panel from a candle array and
 * its timeframe (for annualization). Returns null if there isn't enough
 * data to compute anything meaningful (caller should show "insufficient
 * data" rather than zeros).
 */
function computeCoreStats(candles, timeframe) {
    if (!candles || candles.length < 5) return null;

    const returns = computeReturns(candles).filter(r => r !== null);
    const n = returns.length;
    if (n < 4) return null;

    const bullish = candles.filter(c => c.c > c.o);
    const bearish = candles.filter(c => c.c < c.o);
    const bullishPct = bullish.length / candles.length * 100;
    const bearishPct = bearish.length / candles.length * 100;

    const avgReturn = rsMean(returns);
    const medianReturn = rsMedian(returns);
    const avgHighLow = rsMean(candles.map(c => c.h - c.l));

    // ATR: Wilder's smoothed true range, period = min(14, n).
    const atrPeriod = Math.min(14, candles.length - 1);
    const trueRanges = candles.map((c, i) => {
        if (i === 0) return c.h - c.l;
        const prevClose = candles[i - 1].c;
        return Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose));
    });
    let atr = rsMean(trueRanges.slice(0, atrPeriod));
    for (let i = atrPeriod; i < trueRanges.length; i++) {
        atr = (atr * (atrPeriod - 1) + trueRanges[i]) / atrPeriod;
    }

    const stdDevReturns = rsStdDev(returns, avgReturn);
    const volatilityPct = stdDevReturns * 100;

    const priceChanges = candles.slice(1).map((c, i) => c.c - candles[i].c);
    const stdDevPrice = rsStdDev(priceChanges);

    const annFactor = PERIODS_PER_YEAR[timeframe] || 365;
    const sharpe = stdDevReturns > 0 ? (avgReturn / stdDevReturns) * Math.sqrt(annFactor) : null;

    const downside = returns.filter(r => r < 0);
    const downsideDeviation = downside.length ? Math.sqrt(rsMean(downside.map(r => r * r))) : 0;
    const sortino = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(annFactor) : null;

    // Max drawdown from a cumulative-return curve starting at 1.0.
    let cum = 1, peak = 1, maxDrawdown = 0;
    returns.forEach(r => {
        cum *= (1 + r);
        if (cum > peak) peak = cum;
        const dd = (cum - peak) / peak;
        if (dd < maxDrawdown) maxDrawdown = dd;
    });
    const annualizedReturn = avgReturn * annFactor;
    const calmar = maxDrawdown < 0 ? annualizedReturn / Math.abs(maxDrawdown) : null;

    const wins = returns.filter(r => r > 0);
    const losses = returns.filter(r => r < 0);
    const avgWin = wins.length ? rsMean(wins) : 0;
    const avgLoss = losses.length ? rsMean(losses) : 0;
    const winRate = wins.length / n;

    const profitFactor = losses.length ? Math.abs(wins.reduce((s, v) => s + v, 0) / losses.reduce((s, v) => s + v, 0)) : null;

    // Kelly criterion: f* = winRate - (1 - winRate) / (avgWin / |avgLoss|)
    const winLossRatio = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null;
    const kelly = winLossRatio ? winRate - (1 - winRate) / winLossRatio : null;

    const expectedValue = winRate * avgWin + (1 - winRate) * avgLoss;

    // MAE/MFE: per-candle excursion against the candle's own directional
    // bias (bullish candle treated as a "long", bearish as a "short").
    const excursions = candles.map(c => {
        const range = c.o !== 0 ? 1 : 1;
        if (c.c >= c.o) {
            return { mae: (c.o - c.l) / c.o, mfe: (c.h - c.o) / c.o };
        }
        return { mae: (c.h - c.o) / c.o, mfe: (c.o - c.l) / c.o };
    });
    const mae = rsMean(excursions.map(e => e.mae));
    const mfe = rsMean(excursions.map(e => e.mfe));

    const absReturns = returns.map(r => Math.abs(r));
    const largestMove = Math.max(...absReturns);
    const smallestMove = Math.min(...absReturns);

    // z-score / p-value for H0: true mean return = 0 (two-tailed).
    const stdError = n > 0 ? stdDevReturns / Math.sqrt(n) : 0;
    const zScore = stdError > 0 ? avgReturn / stdError : null;
    const pValue = zScore !== null ? 2 * (1 - normalCDF(Math.abs(zScore))) : null;
    const confidenceInterval = stdError > 0 ? [avgReturn - 1.96 * stdError, avgReturn + 1.96 * stdError] : null;
    const confidenceScore = pValue !== null ? Math.max(0, Math.min(100, (1 - pValue) * 100)) : null;

    let dataQuality;
    if (n >= 500) dataQuality = 'High';
    else if (n >= 100) dataQuality = 'Medium';
    else if (n >= 30) dataQuality = 'Low';
    else dataQuality = 'Insufficient';

    return {
        sampleSize: n,
        bullishPct, bearishPct,
        avgReturn, medianReturn, avgHighLow,
        atr, volatilityPct, stdDevReturns, stdDevPrice,
        sharpe, sortino, calmar, profitFactor, kelly,
        maxDrawdown, mae, mfe, expectedValue,
        avgWin, avgLoss, largestMove, smallestMove,
        confidenceScore, confidenceInterval, pValue, zScore,
        dataQuality
    };
}

/* ------------------------------ gap analysis ------------------------------ */

/**
 * Gaps are measured between one candle's close and the NEXT candle's open
 * (the standard definition — a "gap" is unfilled distance the market
 * jumped between two consecutive prints). Gap fill is checked by seeing
 * whether the price later re-trades back through the pre-gap close within
 * 24h/48h/72h (converted to a candle count for the active timeframe).
 */
function computeGapAnalysis(candles, timeframe) {
    if (!candles || candles.length < 10) return null;

    const msPerCandle = { '15m': 9e5, '30m': 1.8e6, '1h': 3.6e6, '4h': 1.44e7, '1d': 8.64e7, '1w': 6.048e8 }[timeframe] || 3.6e6;
    const candlesPer24h = Math.max(1, Math.round(8.64e7 / msPerCandle));

    const gaps = [];
    for (let i = 1; i < candles.length; i++) {
        const prevClose = candles[i - 1].c;
        const openPrice = candles[i].o;
        const gapPct = (openPrice - prevClose) / prevClose * 100;
        if (Math.abs(gapPct) < 0.01) continue; // ignore negligible/no gap
        gaps.push({ index: i, gapPct, prevClose, openPrice, direction: gapPct > 0 ? 'up' : 'down' });
    }

    if (gaps.length === 0) return { sampleSize: 0 };

    const upGaps = gaps.filter(g => g.direction === 'up');
    const downGaps = gaps.filter(g => g.direction === 'down');
    const avgGapSize = rsMean(gaps.map(g => Math.abs(g.gapPct)));

    function fillRateWithin(candleWindow) {
        let filled = 0;
        gaps.forEach(g => {
            const end = Math.min(candles.length - 1, g.index + candleWindow);
            for (let j = g.index; j <= end; j++) {
                const touchedPrevClose = g.direction === 'up'
                    ? candles[j].l <= g.prevClose
                    : candles[j].h >= g.prevClose;
                if (touchedPrevClose) { filled++; break; }
            }
        });
        return filled / gaps.length * 100;
    }

    return {
        sampleSize: gaps.length,
        gapUpCount: upGaps.length,
        gapDownCount: downGaps.length,
        avgGapSizePct: avgGapSize,
        fillRate24h: fillRateWithin(candlesPer24h),
        fillRate48h: fillRateWithin(candlesPer24h * 2),
        fillRate72h: fillRateWithin(candlesPer24h * 3)
    };
}

/* ---------------------------- distribution ---------------------------- */

function computeReturnHistogram(candles, binCount) {
    const returns = computeReturns(candles).filter(r => r !== null).map(r => r * 100);
    if (returns.length < 5) return null;
    const min = Math.min(...returns), max = Math.max(...returns);
    const range = max - min || 1;
    const bins = binCount || 20;
    const width = range / bins;
    const counts = new Array(bins).fill(0);
    returns.forEach(r => {
        let idx = Math.floor((r - min) / width);
        if (idx >= bins) idx = bins - 1;
        if (idx < 0) idx = 0;
        counts[idx]++;
    });
    return counts.map((count, i) => ({ binStart: min + i * width, binEnd: min + (i + 1) * width, count }));
}

function computeSeasonality(candles) {
    const returns = computeReturns(candles);
    const byWeekday = [[], [], [], [], [], [], []]; // 0=Sun..6=Sat
    candles.forEach((c, i) => {
        if (returns[i] === null) return;
        byWeekday[getUTCDay(c.time)].push(returns[i]);
    });
    return byWeekday.map((arr, day) => ({ day, avgReturnPct: arr.length ? rsMean(arr) * 100 : null, sampleSize: arr.length }));
}

function computeHourlyHeatmap(candles) {
    const returns = computeReturns(candles);
    const byHour = Array.from({ length: 24 }, () => []);
    candles.forEach((c, i) => {
        if (returns[i] === null) return;
        byHour[getUTCHour(c.time)].push(returns[i]);
    });
    return byHour.map((arr, hour) => ({ hour, avgReturnPct: arr.length ? rsMean(arr) * 100 : null, sampleSize: arr.length }));
}
