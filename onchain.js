/* onchain.js
   On-Chain & Derivatives tab. Every number here comes from a real, free,
   public API — no mocked/fabricated figures:

   - Derivatives (funding rate, open interest, top-trader long/short ratio):
     Binance Futures public API (fapi.binance.com). No key required.
   - BTC network stats (block height, mempool, hashrate, difficulty):
     mempool.space public API. No key required.
   - ETH network stats (supply, gas price, latest block):
     Etherscan public API. Requires a free personal API key (the person
     pastes their own; it's stored only in this browser's localStorage).

   Note: full "exchange flows / entity flows / whale labels" style data
   (like CryptoQuant/Glassnode/Nansen) requires proprietary, paid,
   entity-labeled datasets that aren't available through any free public
   API — so that category isn't included here.
*/

const ETH_KEY_STORAGE = 'onchain_etherscan_api_key';
let fundingChart = null;

/* ------------------------------ DERIVATIVES ------------------------------ */

function setDerivStatus(text, isError) {
    const el = document.getElementById('derivatives-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

async function loadDerivatives() {
    const symbol = document.getElementById('derivatives-symbol')?.value || 'BTCUSDT';
    setDerivStatus('loading…');

    try {
        const [premiumRes, oiRes, lsRes] = await Promise.all([
            fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`),
            fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`),
            fetch(`https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`)
        ]);

        if (!premiumRes.ok || !oiRes.ok) throw new Error('Binance Futures API unreachable (CORS or network)');

        const premium = await premiumRes.json();
        const oi = await oiRes.json();
        const ls = lsRes.ok ? await lsRes.json() : null;

        document.getElementById('deriv-mark').textContent = parseFloat(premium.markPrice).toFixed(4);
        const fundingPct = parseFloat(premium.lastFundingRate) * 100;
        const fundingEl = document.getElementById('deriv-funding');
        fundingEl.textContent = (fundingPct >= 0 ? '+' : '') + fundingPct.toFixed(4) + '%';
        fundingEl.style.color = fundingPct >= 0 ? '#3ecf8e' : '#ef5350';

        const nextFundingTime = new Date(premium.nextFundingTime);
        document.getElementById('deriv-next-funding').textContent = nextFundingTime.toLocaleTimeString();

        document.getElementById('deriv-oi').textContent = parseFloat(oi.openInterest).toLocaleString(undefined, { maximumFractionDigits: 2 });

        if (ls && ls.length > 0) {
            const latest = ls[ls.length - 1];
            document.getElementById('deriv-ls-ratio').textContent =
                `${parseFloat(latest.longAccount * 100).toFixed(1)}% long / ${parseFloat(latest.shortAccount * 100).toFixed(1)}% short (ratio ${parseFloat(latest.longShortRatio).toFixed(2)})`;
        } else {
            document.getElementById('deriv-ls-ratio').textContent = 'n/a';
        }

        await loadFundingHistory(symbol);
        setDerivStatus('updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        setDerivStatus('failed — ' + e.message, true);
    }
}

async function loadFundingHistory(symbol) {
    try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=60`);
        if (!res.ok) return;
        const rows = await res.json();
        const data = rows.map(r => [r.fundingTime, parseFloat(r.fundingRate) * 100]);

        const options = {
            chart: { animation: false, backgroundColor: 'transparent' },
            title: { text: null },
            credits: { enabled: false },
            legend: { enabled: false },
            xAxis: { type: 'datetime', labels: { style: { fontSize: '9px', color: '#9aa4b5' } }, lineColor: '#232838' },
            yAxis: { title: { text: 'Funding Rate %', style: { color: '#9aa4b5', fontSize: '9px' } }, labels: { style: { fontSize: '9px', color: '#d7dde5' } }, gridLineColor: '#1c2130', plotLines: [{ value: 0, color: '#6b7280', width: 1 }] },
            tooltip: { valueDecimals: 4 },
            plotOptions: { column: { negativeColor: '#ef5350', color: '#3ecf8e' } },
            series: [{ name: 'Funding Rate', type: 'column', data }]
        };

        if (!fundingChart) {
            fundingChart = Highcharts.chart('derivatives-funding-chart', options);
            if (typeof attachChartWatermark === 'function') attachChartWatermark(fundingChart);
        } else {
            fundingChart.update(options, true, true);
        }
    } catch (e) {
        // Non-fatal — the stat panel above still shows current values.
    }
}

/* ----------------------------- BTC NETWORK ----------------------------- */

function setBtcStatus(text, isError) {
    const el = document.getElementById('btc-network-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

async function loadBtcNetwork() {
    setBtcStatus('loading…');
    try {
        const [heightRes, mempoolRes, hashrateRes, diffRes] = await Promise.all([
            fetch('https://mempool.space/api/blocks/tip/height'),
            fetch('https://mempool.space/api/mempool'),
            fetch('https://mempool.space/api/v1/mining/hashrate/3d'),
            fetch('https://mempool.space/api/v1/difficulty-adjustment')
        ]);
        if (!heightRes.ok || !mempoolRes.ok) throw new Error('mempool.space unreachable');

        const height = await heightRes.text();
        const mempool = await mempoolRes.json();
        document.getElementById('btc-height').textContent = parseInt(height).toLocaleString();
        document.getElementById('btc-mempool-count').textContent = mempool.count.toLocaleString();
        document.getElementById('btc-mempool-fees').textContent = (mempool.total_fee / 1e8).toFixed(4);

        if (hashrateRes.ok) {
            const hr = await hashrateRes.json();
            const currentHashrate = hr.currentHashrate || (hr.hashrates && hr.hashrates.length ? hr.hashrates[hr.hashrates.length - 1].avgHashrate : null);
            if (currentHashrate) {
                document.getElementById('btc-hashrate').textContent = (currentHashrate / 1e18).toFixed(2);
            }
        }

        if (diffRes.ok) {
            const diff = await diffRes.json();
            const sign = diff.difficultyChange >= 0 ? '+' : '';
            document.getElementById('btc-diff-adj').textContent =
                `${sign}${diff.difficultyChange.toFixed(2)}% in ~${diff.remainingBlocks} blocks (${diff.remainingTime ? Math.round(diff.remainingTime / 3600000) + 'h' : 'n/a'})`;
        }

        setBtcStatus('updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        setBtcStatus('failed — ' + e.message, true);
    }
}

/* ----------------------------- ETH NETWORK ----------------------------- */

function setEthStatus(text, isError) {
    const el = document.getElementById('eth-network-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

function getEthApiKey() {
    return localStorage.getItem(ETH_KEY_STORAGE) || '';
}

async function loadEthNetwork() {
    const apiKey = getEthApiKey();
    if (!apiKey) {
        setEthStatus('paste your free Etherscan API key above and click Save Key', true);
        return;
    }
    setEthStatus('loading…');
    try {
        const [supplyRes, gasRes, blockRes] = await Promise.all([
            fetch(`https://api.etherscan.io/v2/api?chainid=1&module=stats&action=ethsupply&apikey=${apiKey}`),
            fetch(`https://api.etherscan.io/v2/api?chainid=1&module=gastracker&action=gasoracle&apikey=${apiKey}`),
            fetch(`https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_blockNumber&apikey=${apiKey}`)
        ]);
        const supply = await supplyRes.json();
        const gas = await gasRes.json();
        const block = await blockRes.json();

        if (supply.status === '0' && supply.message !== 'OK') throw new Error(supply.result || 'Etherscan rejected the request (check API key)');

        const ethSupply = parseFloat(supply.result) / 1e18;
        document.getElementById('eth-supply').textContent = ethSupply.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ETH';

        if (gas.result) {
            document.getElementById('eth-gas').textContent = `${gas.result.SafeGasPrice} / ${gas.result.ProposeGasPrice} / ${gas.result.FastGasPrice}`;
        }

        if (block.result) {
            document.getElementById('eth-block').textContent = parseInt(block.result, 16).toLocaleString();
        }

        setEthStatus('updated ' + new Date().toLocaleTimeString());
    } catch (e) {
        setEthStatus('failed — ' + e.message, true);
    }
}

/* --------------------------------- INIT ---------------------------------- */

let onchainInitialized = false;

window.initOnchainTab = function () {
    loadDerivatives();
    loadBtcNetwork();
    loadEthNetwork();
    if (fundingChart) fundingChart.reflow();
};

document.addEventListener('DOMContentLoaded', function () {
    const savedKey = getEthApiKey();
    if (savedKey) {
        const input = document.getElementById('eth-api-key-input');
        if (input) input.value = savedKey;
    }

    document.getElementById('derivatives-refresh-btn')?.addEventListener('click', loadDerivatives);
    document.getElementById('derivatives-symbol')?.addEventListener('change', loadDerivatives);
    document.getElementById('btc-network-refresh-btn')?.addEventListener('click', loadBtcNetwork);
    document.getElementById('eth-network-refresh-btn')?.addEventListener('click', loadEthNetwork);
    document.getElementById('eth-key-save-btn')?.addEventListener('click', () => {
        const input = document.getElementById('eth-api-key-input');
        if (!input) return;
        localStorage.setItem(ETH_KEY_STORAGE, input.value.trim());
        loadEthNetwork();
    });
});
