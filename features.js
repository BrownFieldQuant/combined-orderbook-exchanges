/* features.js
   Adds three features on top of the existing order book chart:
   1. Save/Load/Export/Import config (selected exchanges, symbol, slice size, auto-refresh)
   2. Live exchange price comparison table (best bid/ask per exchange + arbitrage spread)
   3. Price alerts (best ask <= X, or best bid >= X) with browser notification + in-page flag
   All functions are attached to `window` at top level (not inside DOMContentLoaded)
   so they are available as soon as script.js calls them.
*/

const CONFIG_STORAGE_KEY = 'orderbook_saved_config';
const ALERTS_STORAGE_KEY = 'orderbook_price_alerts';

/* ---------------------------- CONFIG SAVE/LOAD ---------------------------- */

function getCurrentConfig() {
    const selectedExchanges = Array.from(document.querySelectorAll('.exchange:checked')).map(el => el.value);
    const selectedSymbol = document.querySelector('.symbol:checked')?.value || null;
    const sliceSize = document.getElementById('slice-size')?.value || '10';
    const autoRefresh = document.getElementById('auto-refresh')?.checked || false;
    return { selectedExchanges, selectedSymbol, sliceSize, autoRefresh };
}

function applyConfig(config) {
    if (!config) return;
    document.querySelectorAll('.exchange').forEach(el => {
        el.checked = config.selectedExchanges ? config.selectedExchanges.includes(el.value) : false;
    });
    if (config.selectedSymbol) {
        const radio = document.querySelector(`.symbol[value="${CSS.escape(config.selectedSymbol)}"]`);
        if (radio) radio.checked = true;
    }
    if (config.sliceSize) {
        const sliceEl = document.getElementById('slice-size');
        if (sliceEl) sliceEl.value = config.sliceSize;
    }
    const autoRefreshEl = document.getElementById('auto-refresh');
    if (autoRefreshEl && config.autoRefresh) {
        autoRefreshEl.checked = true;
        autoRefreshEl.dispatchEvent(new Event('change'));
    }
}

window.saveConfig = function () {
    const config = getCurrentConfig();
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    flashMessage('save-config-btn', 'Saved!');
};

window.loadConfig = function () {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) {
        alert('No saved config found.');
        return;
    }
    try {
        applyConfig(JSON.parse(raw));
        flashMessage('load-config-btn', 'Loaded!');
    } catch (e) {
        console.error('Failed to parse saved config', e);
    }
};

// Silent auto-save called after every successful fetch, so the last-used
// setup is restored automatically next time the page is opened.
window.autoSaveConfig = function () {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(getCurrentConfig()));
};

function exportConfig() {
    const config = getCurrentConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orderbook-config.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importConfigFromFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const config = JSON.parse(e.target.result);
            applyConfig(config);
            flashMessage('import-config-btn', 'Imported!');
        } catch (err) {
            alert('Invalid config file.');
        }
    };
    reader.readAsText(file);
}

function flashMessage(buttonId, text) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = original; }, 1200);
}

/* ------------------------------ PRICE ALERTS ------------------------------ */

function loadAlerts() {
    try {
        return JSON.parse(localStorage.getItem(ALERTS_STORAGE_KEY)) || [];
    } catch (e) {
        return [];
    }
}

function saveAlerts(alerts) {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
}

function renderAlerts() {
    const list = document.getElementById('alert-list');
    if (!list) return;
    const alerts = loadAlerts();
    list.innerHTML = '';
    alerts.forEach((alert, idx) => {
        const li = document.createElement('li');
        if (alert.triggered) li.classList.add('triggered');
        let label;
        switch (alert.condition) {
            case 'above': label = `Best Ask ≤ ${alert.price} (${alert.symbol})`; break;
            case 'below': label = `Best Bid ≥ ${alert.price} (${alert.symbol})`; break;
            case 'arbitrage': label = `Arbitrage spread ≥ ${alert.price}% (${alert.symbol})`; break;
            case 'lowvolume': label = `Top-N total volume ≤ ${alert.price} (${alert.symbol})`; break;
            default: label = `${alert.condition} ${alert.price} (${alert.symbol})`;
        }
        li.innerHTML = `<span>${label}${alert.triggered ? ' — TRIGGERED' : ''}</span>`;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => {
            const current = loadAlerts();
            current.splice(idx, 1);
            saveAlerts(current);
            renderAlerts();
        };
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
}

function addAlert() {
    const priceInput = document.getElementById('alert-price');
    const conditionInput = document.getElementById('alert-condition');
    const symbol = document.querySelector('.symbol:checked')?.value;
    const price = parseFloat(priceInput.value);

    if (!symbol) {
        alert('Select a symbol first.');
        return;
    }
    if (isNaN(price) || price <= 0) {
        alert('Enter a valid price.');
        return;
    }

    const alerts = loadAlerts();
    alerts.push({ symbol, condition: conditionInput.value, price, triggered: false });
    saveAlerts(alerts);
    priceInput.value = '';
    renderAlerts();
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function notify(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
    } else {
        // Fallback: brief visual cue via the alert list, no blocking alert().
        console.log(`[ALERT] ${title}: ${body}`);
    }
}

// Called from script.js's fetchData() with the raw per-exchange data array.
window.checkPriceAlerts = function (data, symbol) {
    const alerts = loadAlerts();
    if (alerts.length === 0) return;

    let bestBid = -Infinity;
    let bestAsk = Infinity;
    let totalVolume = 0;
    data.forEach(({ bids, asks }) => {
        bids.forEach(([price, qty]) => { if (price > bestBid) bestBid = price; totalVolume += qty; });
        asks.forEach(([price, qty]) => { if (price < bestAsk) bestAsk = price; totalVolume += qty; });
    });
    const arbitragePct = (isFinite(bestBid) && isFinite(bestAsk) && bestAsk > 0 && bestBid > bestAsk)
        ? (bestBid - bestAsk) / bestAsk * 100 : 0;

    let changed = false;
    alerts.forEach(a => {
        if (a.symbol !== symbol || a.triggered) return;
        if (a.condition === 'above' && bestAsk <= a.price) {
            a.triggered = true;
            changed = true;
            notify('Price Alert', `${symbol}: Best Ask reached ${bestAsk} (target ${a.price})`);
        } else if (a.condition === 'below' && bestBid >= a.price) {
            a.triggered = true;
            changed = true;
            notify('Price Alert', `${symbol}: Best Bid reached ${bestBid} (target ${a.price})`);
        } else if (a.condition === 'arbitrage' && arbitragePct >= a.price) {
            a.triggered = true;
            changed = true;
            notify('Arbitrage Alert', `${symbol}: spread reached ${arbitragePct.toFixed(3)}% (target ${a.price}%)`);
        } else if (a.condition === 'lowvolume' && totalVolume <= a.price) {
            a.triggered = true;
            changed = true;
            notify('Liquidity Alert', `${symbol}: total top-N volume dropped to ${totalVolume.toFixed(4)} (target ${a.price})`);
        }
    });

    if (changed) {
        saveAlerts(alerts);
        renderAlerts();
    }
};

/* --------------------------- COMPARISON TABLE --------------------------- */

// Called from script.js's fetchData() with the raw per-exchange data array.
window.updateComparisonTable = function (data, symbol) {
    const tbody = document.querySelector('#comparison-table tbody');
    const arbitrageInfo = document.getElementById('arbitrage-info');
    if (!tbody) return;

    tbody.innerHTML = '';

    const vwap = (levels) => {
        const totalQty = levels.reduce((s, [, q]) => s + q, 0);
        if (!totalQty) return null;
        const notional = levels.reduce((s, [p, q]) => s + p * q, 0);
        return notional / totalQty;
    };

    const rows = data.map(({ exchange, bids, asks }) => {
        const bestBid = bids.length ? Math.max(...bids.map(b => b[0])) : null;
        const bestAsk = asks.length ? Math.min(...asks.map(a => a[0])) : null;
        const spread = (bestBid !== null && bestAsk !== null) ? (bestAsk - bestBid) : null;
        const spreadPct = (spread !== null && bestBid) ? (spread / bestBid * 100) : null;
        const bidQty = bids.reduce((s, [, q]) => s + q, 0);
        const askQty = asks.reduce((s, [, q]) => s + q, 0);
        const totalQty = bidQty + askQty;
        const imbalancePct = totalQty ? (bidQty / totalQty * 100) : null;
        return {
            exchange, bestBid, bestAsk, spread, spreadPct,
            bidVwap: vwap(bids), askVwap: vwap(asks),
            imbalancePct, bidQty, askQty
        };
    }).filter(r => r.bestBid !== null || r.bestAsk !== null);

    const maxBid = Math.max(...rows.map(r => r.bestBid ?? -Infinity));
    const minAsk = Math.min(...rows.map(r => r.bestAsk ?? Infinity));

    rows.sort((a, b) => (b.bestBid ?? -Infinity) - (a.bestBid ?? -Infinity));

    let totalBidQty = 0, totalAskQty = 0;
    rows.forEach(r => {
        totalBidQty += r.bidQty || 0;
        totalAskQty += r.askQty || 0;
        const tr = document.createElement('tr');
        if (r.bestBid === maxBid) tr.classList.add('best-bid');
        if (r.bestAsk === minAsk) tr.classList.add('best-ask');
        tr.innerHTML = `
            <td>${r.exchange}</td>
            <td>${r.bestBid !== null ? r.bestBid : '-'}</td>
            <td>${r.bestAsk !== null ? r.bestAsk : '-'}</td>
            <td>${r.spread !== null ? r.spread.toFixed(6) : '-'}</td>
            <td>${r.spreadPct !== null ? r.spreadPct.toFixed(3) + '%' : '-'}</td>
            <td>${r.bidVwap !== null ? r.bidVwap.toFixed(6) : '-'}</td>
            <td>${r.askVwap !== null ? r.askVwap.toFixed(6) : '-'}</td>
            <td>${r.imbalancePct !== null ? r.imbalancePct.toFixed(1) + '% bid' : '-'}</td>
        `;
        tbody.appendChild(tr);
    });

    const aggTotal = totalBidQty + totalAskQty;
    const aggBidPct = aggTotal ? (totalBidQty / aggTotal * 100) : 50;
    const fill = document.getElementById('agg-imbalance-fill');
    const label = document.getElementById('agg-imbalance-label');
    if (fill) fill.style.width = aggBidPct.toFixed(1) + '%';
    if (label) label.textContent = `Bids ${aggBidPct.toFixed(1)}% / Asks ${(100 - aggBidPct).toFixed(1)}%`;

    // Cross-exchange arbitrage: buy at the lowest ask, sell at the highest bid.
    if (arbitrageInfo) {
        if (isFinite(maxBid) && isFinite(minAsk) && maxBid > minAsk) {
            const profitPct = ((maxBid - minAsk) / minAsk * 100).toFixed(3);
            arbitrageInfo.textContent = `Arbitrage opportunity on ${symbol}: buy at ${minAsk}, sell at ${maxBid} (+${profitPct}%)`;
            arbitrageInfo.classList.add('positive');
        } else {
            arbitrageInfo.textContent = `No arbitrage spread detected for ${symbol} right now.`;
            arbitrageInfo.classList.remove('positive');
        }
    }
};

/* --------------------------------- INIT ---------------------------------- */

document.addEventListener('DOMContentLoaded', function () {
    // Runs after script.js's own DOMContentLoaded handler (script.js is
    // loaded first, so its listener was registered first) which means the
    // symbol radio buttons already exist by the time this fires.
    requestNotificationPermission();

    const savedRaw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (savedRaw) {
        try {
            applyConfig(JSON.parse(savedRaw));
        } catch (e) {
            console.error('Failed to restore saved config', e);
        }
    }

    renderAlerts();

    document.getElementById('save-config-btn')?.addEventListener('click', window.saveConfig);
    document.getElementById('load-config-btn')?.addEventListener('click', window.loadConfig);
    document.getElementById('export-config-btn')?.addEventListener('click', exportConfig);
    document.getElementById('import-config-btn')?.addEventListener('click', () => {
        document.getElementById('import-config-input').click();
    });
    document.getElementById('import-config-input')?.addEventListener('change', (e) => {
        if (e.target.files.length) importConfigFromFile(e.target.files[0]);
    });
    document.getElementById('add-alert-btn')?.addEventListener('click', addAlert);
});
