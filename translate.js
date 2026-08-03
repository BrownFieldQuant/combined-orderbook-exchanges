/* translate.js
   Translates STATIC UI text (panel titles, tab names, description notes)
   via the Google Cloud Translation API (v2 REST). Deliberately does NOT
   touch live data: table cells, prices, status messages that get
   overwritten every few seconds by other scripts, or any element that
   contains nested HTML (to avoid ever corrupting markup) — only plain-text
   leaf elements are translated.

   Note: Google ML Kit (on-device/offline translation) is an Android/iOS
   native SDK — there is no web/JavaScript version, so it can't be used in
   a browser app. This file only implements the Cloud Translation API
   (online) path.
*/

const TRANSLATE_KEY_STORAGE = 'translate_google_api_key';
const TRANSLATE_CACHE_PREFIX = 'translate_cache_';

// Curated, safe selector list: panel titles, tab names, and known static
// note/description text that is set once and never overwritten by other
// scripts afterward (unlike #...-status elements, which update live and
// would be pointless — and wasteful — to keep re-translating).
const TRANSLATE_SELECTORS = [
    '.quant-cell-title',
    '.tab-btn',
    '#rl-note', '#macro-liq-note', '#onchain-note', '#tradfi-note',
    '#footprint-note', '#compare-note', '#eth-key-note', '#fred-key-note',
    '#finnhub-key-note', '#rl-ai-key-note', '#translate-key-note',
    '#macro-note', '#macro-funding-note', '#compare-corr-panel > b',
    '.rl-learn-item summary'
];

function getTranslateApiKey() {
    return localStorage.getItem(TRANSLATE_KEY_STORAGE) || '';
}

function setTranslateStatus(text, isError) {
    const el = document.getElementById('translate-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef5350' : '#6b7280';
}

function loadTranslateCache(lang) {
    try {
        return JSON.parse(localStorage.getItem(TRANSLATE_CACHE_PREFIX + lang)) || {};
    } catch (e) {
        return {};
    }
}

function saveTranslateCache(lang, cache) {
    try {
        localStorage.setItem(TRANSLATE_CACHE_PREFIX + lang, JSON.stringify(cache));
    } catch (e) {
        // Non-fatal — just means this session's translations won't persist.
    }
}

// Collects only "leaf" elements (no child elements, just text) matching
// the safe selector list — this is what guarantees we never mangle HTML
// that has nested tags (e.g. a title containing a live <span>).
function collectTranslatableElements() {
    const seen = new Set();
    const elements = [];
    TRANSLATE_SELECTORS.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            if (el.children.length > 0) return; // skip anything with nested markup
            const text = el.textContent.trim();
            if (!text || seen.has(el)) return;
            seen.add(el);
            elements.push(el);
        });
    });
    return elements;
}

async function callGoogleTranslate(texts, targetLang, apiKey) {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: texts, target: targetLang, format: 'text' })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);
    return json.data.translations.map(t => t.translatedText);
}

async function translatePage(targetLang) {
    if (!targetLang || targetLang === 'en') {
        revertToOriginal();
        return;
    }

    const apiKey = getTranslateApiKey();
    if (!apiKey) {
        setTranslateStatus('paste your Google Cloud Translation API key first (🔑 button)', true);
        document.getElementById('translate-lang-select').value = '';
        return;
    }

    setTranslateStatus('translating…');
    const elements = collectTranslatableElements();
    const cache = loadTranslateCache(targetLang);

    // Store each element's original text once, so switching languages or
    // reverting never loses the source text.
    elements.forEach(el => {
        if (!el.dataset.i18nOriginal) el.dataset.i18nOriginal = el.textContent.trim();
    });

    const toTranslate = [];
    const toTranslateElements = [];
    elements.forEach(el => {
        const original = el.dataset.i18nOriginal;
        if (cache[original]) {
            el.textContent = cache[original];
        } else {
            toTranslate.push(original);
            toTranslateElements.push(el);
        }
    });

    if (toTranslate.length === 0) {
        setTranslateStatus(`applied (all ${elements.length} labels from cache)`);
        return;
    }

    try {
        // Google's API accepts a batch array in one call — dedupe first to
        // minimize billed characters.
        const uniqueTexts = Array.from(new Set(toTranslate));
        const translated = await callGoogleTranslate(uniqueTexts, targetLang, apiKey);
        const map = {};
        uniqueTexts.forEach((t, i) => { map[t] = translated[i]; });

        toTranslateElements.forEach(el => {
            const original = el.dataset.i18nOriginal;
            if (map[original]) el.textContent = map[original];
        });

        Object.assign(cache, map);
        saveTranslateCache(targetLang, cache);

        setTranslateStatus(`translated ${uniqueTexts.length} new labels (${elements.length - uniqueTexts.length} from cache)`);
    } catch (e) {
        setTranslateStatus('failed — ' + e.message, true);
    }
}

function revertToOriginal() {
    document.querySelectorAll('[data-i18n-original]').forEach(el => {
        el.textContent = el.dataset.i18nOriginal;
    });
    setTranslateStatus('reverted to English');
}

document.addEventListener('DOMContentLoaded', function () {
    const savedKey = getTranslateApiKey();
    const keyInput = document.getElementById('translate-api-key-input');
    if (keyInput && savedKey) keyInput.value = savedKey;

    document.getElementById('translate-key-toggle-btn')?.addEventListener('click', () => {
        const panel = document.getElementById('translate-key-panel');
        if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    });

    document.getElementById('translate-key-save-btn')?.addEventListener('click', () => {
        if (!keyInput) return;
        localStorage.setItem(TRANSLATE_KEY_STORAGE, keyInput.value.trim());
        setTranslateStatus('key saved');
    });

    document.getElementById('translate-lang-select')?.addEventListener('change', function () {
        translatePage(this.value);
    });
});
