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

async function loadBinanceTradFiChart(symbol) {
    try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=100`);
        if (!res.ok) return;
        const rows = await res.json();
        const data = rows.map(r => [r[6], parseFloat(r[4])]);

        const options = {
            chart: { animation: false, backgroundColor: 'transparent' },
            title: { text: null },
            credits: { enabled: false },
            legend: { enabled: false },
            xAxis: { type: 'datetime', labels: { style: { fontSize: '9px', color: '#9aa4b5' } }, lineColor: '#232838' },
            yAxis: { title: { text: null }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130' },
            tooltip: { valueDecimals: 4 },
            series: [{ name: symbol, type: 'line', data, color: '#c9975a', marker: { enabled: false } }]
        };

        if (!btfChart) {
            btfChart = Highcharts.chart('binance-tradfi-chart', options);
            if (typeof attachChartWatermark === 'function') attachChartWatermark(btfChart);
        } else {
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
    if (btfChart) btfChart.reflow();
};

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('tradfi-macro-refresh-btn')?.addEventListener('click', loadMacroSignals);
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('binance-tradfi-refresh-btn')?.addEventListener('click', loadBinanceTradFi);
    document.getElementById('binance-tradfi-symbol')?.addEventListener('change', loadBinanceTradFi);
    document.getElementById('xyz-tradfi-refresh-btn')?.addEventListener('click', loadXyzMarkets);
});
