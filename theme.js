/* theme.js
   Handles the color theme picker (#theme-select). Switching themes:
   1. Sets html[data-theme="..."] which flips all the CSS (panels, tables,
      buttons, etc — see the THEME SYSTEM block in index.html's <style>).
   2. Persists the choice to localStorage (read synchronously in <head>
      on next load, before first paint, so there's no flash of the
      wrong theme).
   3. Re-themes any Highcharts instances already on screen — chart text/
      grid colors are baked into the SVG at render time, so a CSS-only
      change wouldn't update them. Chart series colors are left as-is
      (a gold/blue/green line reads fine against any of these palettes);
      only axis labels, gridlines, legend, and subtitle text are adjusted,
      since those are the parts that can become unreadable if left
      dark-on-dark or light-on-light after a switch.

   Chart instances register themselves for this by calling
   window.registerThemedChart(chart) once, right after creation — this is
   already wired into research.js's attachChartWatermark() helper, which
   every chart in the app already calls, so no other file needs changes.
*/

const THEME_STORAGE_KEY = 'orderbook_theme';

const CHART_THEME_COLORS = {
    dark: { text: '#d7dde5', dim: '#9aa4b5', grid: '#1c2130', border: '#232838' },
    midnight: { text: '#d7dde5', dim: '#9aa4b5', grid: '#1c2130', border: '#232838' },
    matrix: { text: '#d7dde5', dim: '#9aa4b5', grid: '#1c2130', border: '#232838' },
    crimson: { text: '#d7dde5', dim: '#9aa4b5', grid: '#1c2130', border: '#232838' },
    light: { text: '#1a1f29', dim: '#5b6472', grid: '#e5e7eb', border: '#dcdfe4' }
};

window.__themedCharts = window.__themedCharts || [];

// Called by attachChartWatermark() in research.js right after every chart
// is created, so every chart in the app is covered automatically.
window.registerThemedChart = function (chart) {
    if (!chart || window.__themedCharts.includes(chart)) return;
    window.__themedCharts.push(chart);
    applyChartTheme(chart, getCurrentTheme());
};

function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyChartTheme(chart, themeName) {
    const c = CHART_THEME_COLORS[themeName] || CHART_THEME_COLORS.dark;
    const axisLabelStyle = { style: { color: c.text } };
    const dimLabelStyle = { style: { color: c.dim } };

    try {
        chart.update({
            xAxis: { labels: dimLabelStyle, lineColor: c.border, tickColor: c.border },
            yAxis: { labels: axisLabelStyle, gridLineColor: c.grid, title: { style: { color: c.dim } } },
            legend: { itemStyle: { color: c.text } },
            subtitle: { style: { color: c.dim } },
            caption: { style: { color: c.dim } }
        }, false, false, false);
        chart.redraw();
    } catch (e) {
        // A chart with an array yAxis (multi-axis) ignores the singular
        // yAxis merge above in some Highcharts versions — retry per-axis.
        if (Array.isArray(chart.yAxis) && chart.yAxis.length > 1) {
            chart.yAxis.forEach(axis => {
                try {
                    axis.update({ labels: axisLabelStyle, gridLineColor: c.grid, title: { style: { color: c.dim } } }, false);
                } catch (e2) { /* ignore */ }
            });
            chart.redraw();
        }
    }
}

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    try { localStorage.setItem(THEME_STORAGE_KEY, themeName); } catch (e) { /* ignore */ }

    window.__themedCharts.forEach(chart => {
        if (chart && chart.update) applyChartTheme(chart, themeName);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const select = document.getElementById('theme-select');
    if (!select) return;

    select.value = getCurrentTheme();

    select.addEventListener('change', function () {
        applyTheme(this.value);
    });
});
