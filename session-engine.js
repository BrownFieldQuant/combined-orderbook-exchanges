/* session-engine.js
   Pure functions that classify a timestamp into a trading session.
   No fetching, no state — just timestamp math, so it's trivially testable
   and reusable by both the Research Lab UI and (later) the Pattern
   Explorer / Research Note generator.

   Sessions are defined in UTC. This deliberately sidesteps daylight-saving
   ambiguity: London/New York local-time session boundaries shift twice a
   year with DST, but their UTC equivalents are what actually matters for
   "when does volume/volatility pick up" — and are unambiguous year-round.
   (If a person wants strict local-exchange-time DST handling later, that's
   a targeted follow-up, not something to fudge with an approximation now.)
*/

const SESSION_DEFINITIONS = {
    asia: { label: 'Asia', startHourUTC: 0, endHourUTC: 8 },
    london: { label: 'London', startHourUTC: 7, endHourUTC: 16 },
    ny: { label: 'New York', startHourUTC: 13, endHourUTC: 21 }
};

/**
 * Returns the UTC hour-of-day (0-23) for a timestamp (ms).
 */
function getUTCHour(timestampMs) {
    return new Date(timestampMs).getUTCHours();
}

/**
 * Returns the UTC day-of-week for a timestamp (0=Sunday..6=Saturday).
 */
function getUTCDay(timestampMs) {
    return new Date(timestampMs).getUTCDay();
}

/**
 * True if the timestamp falls within the given named session's UTC hour
 * window (asia/london/ny). Sessions can overlap (e.g. London/NY overlap
 * 13:00-16:00 UTC) — a candle can belong to more than one.
 */
function isInSession(timestampMs, sessionKey) {
    const def = SESSION_DEFINITIONS[sessionKey];
    if (!def) return false;
    const hour = getUTCHour(timestampMs);
    return hour >= def.startHourUTC && hour < def.endHourUTC;
}

/**
 * "Friday Close" window: Friday 20:00-23:59 UTC — the run-up to the
 * weekend close, when liquidity typically thins.
 */
function isFridayClose(timestampMs) {
    const d = new Date(timestampMs);
    return d.getUTCDay() === 5 && d.getUTCHours() >= 20;
}

/**
 * "Monday Open" window: Monday 00:00-04:00 UTC — the first hours after
 * the weekend gap, before London opens.
 */
function isMondayOpen(timestampMs) {
    const d = new Date(timestampMs);
    return d.getUTCDay() === 1 && d.getUTCHours() < 4;
}

/**
 * Filters a candle array (each {time, o, h, l, c}) down to only the
 * candles whose open time falls within the requested session.
 * sessionKey: 'all' | 'asia' | 'london' | 'ny' | 'friday_close' | 'monday_open'
 */
function filterCandlesBySession(candles, sessionKey) {
    if (!sessionKey || sessionKey === 'all') return candles;
    if (sessionKey === 'friday_close') return candles.filter(c => isFridayClose(c.time));
    if (sessionKey === 'monday_open') return candles.filter(c => isMondayOpen(c.time));
    if (SESSION_DEFINITIONS[sessionKey]) return candles.filter(c => isInSession(c.time, sessionKey));
    return candles;
}

/**
 * Splits a candle array into the three main overlapping session buckets
 * plus Friday Close / Monday Open, for the "Session Behavior" table which
 * shows all sessions side by side regardless of the main session filter.
 */
function splitCandlesBySession(candles) {
    return {
        asia: candles.filter(c => isInSession(c.time, 'asia')),
        london: candles.filter(c => isInSession(c.time, 'london')),
        ny: candles.filter(c => isInSession(c.time, 'ny')),
        friday_close: candles.filter(c => isFridayClose(c.time)),
        monday_open: candles.filter(c => isMondayOpen(c.time))
    };
}
