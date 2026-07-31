<!DOCTYPE html>
<html data-theme="dark">
<head>
    <script>
        (function () {
            try {
                var saved = localStorage.getItem('orderbook_theme');
                if (saved) document.documentElement.setAttribute('data-theme', saved);
            } catch (e) { /* localStorage unavailable — keep default dark theme */ }
        })();
    </script>
    <title>Combined Order Book Data Chart</title>
    <script src="https://code.highcharts.com/highcharts.js"></script>
    <script src="https://code.highcharts.com/modules/exporting.js"></script>
    <script src="https://code.highcharts.com/modules/annotations.js"></script>
    <script src="https://code.highcharts.com/modules/stock.js"></script>
    <style>
        body {
            font-size: 10px;
            font-family: "Noto Sans Sundanese", sans-serif;
            flex-direction: column;
            align-items: flex-start;
            margin: 0;
            padding: 8px;
            background: #f4f5f7;
            color: #1a1a1a;
        }
        button {
            font-size: 11px; 
        }
        #destroyChartButton {
            font-weight: bold; 
        }
        #controls {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
        #dropdown,
        #symbol-dropdown,
        #fetch-data,
        #auto-refresh-container,
        #zoom-container {
            display: inline-block;
            margin-right: 5px; 
        }
        #dropdown,
        #symbol-dropdown {
            width: auto; 
        }
        #fetch-data {
            width: auto;
        }
        .dropdown-content,
        .symbol-dropdown-content {
            display: none;
            position: absolute;
            background-color: #f9f9f9;
            min-width: 160px;
            box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
            z-index: 1;
            max-height: 500px; 
            overflow-y: auto; 
        }
        .dropdown-content label,
        .symbol-dropdown-content label {
            display: block;
            padding: 8px 16px;
            cursor: pointer;
        }
        .dropdown-content label:hover,
        .symbol-dropdown-content label:hover {
            background-color: #f1f1f1;
        }
        .dropdown:hover .dropdown-content,
        .symbol-dropdown:hover .symbol-dropdown-content {
            display: block;
        }
        #orderbookchart {
            width: 570px;
            padding: 1px; 
            overflow: hidden; 
            border: 1px solid black; 
        }
        #auto-refresh-container {
            display: flex;
            align-items: center;
        }
        #total-info {
            font-weight: bold; 
            margin-top: 1px;
        }
        #zoom-container {
            display: flex;
            align-items: center;
        }

        #zoom-container button {
            font-weight: bold; 
            margin-right: 5px; 
        }
        #config-container {
            display: inline-block;
            margin-left: 5px;
        }
        #alerts-panel, #comparison-panel, #depth-panel, #slippage-panel,
        #history-panel, #watchlist-panel, #export-panel, #ladder-panel {
            background: #ffffff;
            border: 1px solid #dcdfe4;
            border-radius: 6px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        #alerts-panel, #comparison-panel {
            border: 1px solid #ccc;
            padding: 6px;
            margin-top: 6px;
        }
        #alert-list {
            list-style: none;
            padding: 0;
            margin: 4px 0 0 0;
        }
        #alert-list li {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 3px 0;
            border-bottom: 1px dashed #eee;
        }
        #alert-list li.triggered {
            color: #fff;
            background: #d9534f;
            padding-left: 4px;
        }
        #alert-list button {
            margin-left: 8px;
        }
        #comparison-table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 4px;
        }
        #comparison-table th, #comparison-table td {
            border: 1px solid #ddd;
            padding: 3px 6px;
            text-align: right;
            white-space: nowrap;
        }
        #comparison-table th:first-child, #comparison-table td:first-child {
            text-align: left;
        }
        #comparison-table tr.best-bid td:nth-child(2) {
            background: #c8f7c5;
            font-weight: bold;
        }
        #comparison-table tr.best-ask td:nth-child(3) {
            background: #c8f7c5;
            font-weight: bold;
        }
        #arbitrage-info {
            margin-top: 4px;
            font-weight: bold;
        }
        #arbitrage-info.positive {
            color: #2e7d32;
        }
        #agg-imbalance-container {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 6px;
        }
        #agg-imbalance-bar {
            flex: 1;
            height: 12px;
            background: #f28b82;
            border-radius: 3px;
            overflow: hidden;
        }
        #agg-imbalance-fill {
            height: 100%;
            background: #81c995;
            width: 50%;
        }
        #depth-panel, #slippage-panel, #history-panel, #watchlist-panel, #export-panel {
            border: 1px solid #ccc;
            padding: 6px;
            margin-top: 6px;
        }
        #main-dashboard {
            display: flex;
            align-items: stretch;
            gap: 8px;
            width: 100%;
        }
        #chart-col {
            flex: 2 1 600px;
            min-width: 0;
        }
        #chart-col #orderbookchart {
            width: 100%;
            height: 100%;
        }
        #chart-col {
            display: flex;
            flex-direction: column;
        }
        #side-col {
            flex: 1 1 320px;
            min-width: 300px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        #side-col #alerts-panel,
        #side-col #slippage-panel,
        #side-col #export-panel {
            margin-top: 0;
        }
        #dashboard-grid {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin-top: 8px;
            width: 100%;
        }
        #comparison-panel {
            margin-top: 8px;
            width: 100%;
        }
        #dashboard-left-col {
            flex: 1 1 50%;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        #ladder-panel {
            flex: 1 1 50%;
            min-width: 0;
        }
        @media (max-width: 1000px) {
            #dashboard-grid {
                flex-direction: column;
            }
            #dashboard-left-col, #ladder-panel {
                width: 100%;
            }
        }
        @media (max-width: 900px) {
            #main-dashboard {
                flex-direction: column;
            }
            #side-col {
                min-width: 0;
                width: 100%;
            }
        }
        #comparison-panel, #watchlist-panel {
            overflow-x: auto;
        }
        #comparison-table {
            min-width: 780px;
        }
        #watchlist-table {
            min-width: 480px;
        }
        #ladder-container {
            max-height: 420px;
            overflow-y: auto;
        }
        #depthchart, #spreadhistorychart {
            min-width: 0;
        }
        #ladder-panel {
            border: 1px solid #ccc;
            padding: 6px;
        }
        #ladder-container {
            font-variant-numeric: tabular-nums;
            font-size: 10px;
        }
        .ladder-header {
            display: flex;
            justify-content: space-between;
            font-weight: bold;
            padding: 2px 4px;
            border-bottom: 1px solid #ccc;
        }
        .ladder-row {
            position: relative;
            display: flex;
            justify-content: space-between;
            padding: 2px 4px;
            overflow: hidden;
        }
        .ladder-bar {
            position: absolute;
            top: 0;
            left: 0;
            bottom: 0;
            z-index: 0;
        }
        .ask-row .ladder-bar {
            background: rgba(198, 40, 40, 0.35);
        }
        .bid-row .ladder-bar {
            background: rgba(46, 125, 50, 0.35);
        }
        .ladder-price, .ladder-qty {
            position: relative;
            z-index: 1;
        }
        .ask-row .ladder-price {
            color: #c62828;
            font-weight: bold;
        }
        .bid-row .ladder-price {
            color: #2e7d32;
            font-weight: bold;
        }
        .ladder-mid {
            text-align: center;
            font-weight: bold;
            padding: 3px 0;
            background: #f0f0f0;
            margin: 2px 0;
        }
        #depthchart, #spreadhistorychart {
            width: 100%;
            height: 220px;
        }
        #slippage-result {
            margin-top: 4px;
            font-weight: bold;
        }
        #watchlist-table-scroll {
            max-height: 260px;
            overflow-y: auto;
            margin-top: 4px;
            border: 1px solid #232838;
            border-radius: 4px;
        }
        #watchlist-table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 0;
        }
        #watchlist-table thead th {
            position: sticky;
            top: 0;
            z-index: 1;
        }
        #watchlist-table th, #watchlist-table td {
            border: 1px solid #ddd;
            padding: 3px 6px;
            text-align: right;
            white-space: nowrap;
        }
        #watchlist-table th:first-child, #watchlist-table td:first-child {
            text-align: left;
        }
        #export-panel button, #export-panel label {
            margin-right: 6px;
        }
        #app-content {
            opacity: 0;
        }
        #app-content.revealed {
            opacity: 1;
            transition: opacity 0.6s ease;
        }
        #loading-screen {
            position: fixed;
            inset: 0;
            background: radial-gradient(circle at 75% 45%, #4a2a12 0%, #2a1a0e 35%, #0d0906 75%, #060403 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            transition: opacity 0.6s ease;
        }
        #loading-screen.fade-out {
            opacity: 0;
            pointer-events: none;
        }
        #loading-logo-img {
            width: 72px;
            height: 72px;
            object-fit: contain;
            margin-bottom: 14px;
            filter: drop-shadow(0 0 14px rgba(180, 100, 30, 0.5));
        }
        #loading-logo {
            color: #ffffff;
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 4px;
            margin-bottom: 22px;
            font-family: Arial, sans-serif;
        }
        #loading-spinner {
            width: 34px;
            height: 34px;
            border: 3px solid rgba(201, 151, 90, 0.2);
            border-top-color: #c9975a;
            border-radius: 50%;
            animation: loading-spin 0.9s linear infinite;
            margin-bottom: 16px;
        }
        @keyframes loading-spin {
            to { transform: rotate(360deg); }
        }
        #loading-status {
            color: #d9b98a;
            font-size: 13px;
            font-family: Arial, sans-serif;
            margin-bottom: 14px;
            min-height: 16px;
        }
        #loading-bar-track {
            width: 260px;
            height: 6px;
            background: rgba(201, 151, 90, 0.15);
            border-radius: 3px;
            overflow: hidden;
        }
        #loading-bar-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #7a4a12, #c9975a);
            border-radius: 3px;
            transition: width 0.3s linear;
        }


        /* ===================== THEME SYSTEM ===================== */
        /* Uses native CSS nesting (supported in all modern evergreen
           browsers) so each theme's rules only apply when the matching
           html[data-theme="..."] attribute is set — set/persisted by
           theme.js. Dark/Midnight/Matrix/Crimson share the same dark
           structural palette and only swap the accent color via CSS
           variables; Light swaps the full structural palette too. */
        :root {
            --accent: #c9975a;
            --accent-rgb: 201, 151, 90;
        }

        /* Smooth theme switching — matches landing page feel.
           Scoped to color/background/border so charts, canvases and
           WebSocket-driven live numbers are never affected. */
        html, body,
        #controls, #zoom-container, #config-container, #auto-refresh-container,
        #add-symbol-container,
        button, select, input[type="text"], input[type="number"], input[type="file"],
        a, .panel, [class*="panel"], [class*="card"], [class*="tab"], table, th, td {
            transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
        }
        button:hover, a:hover, select:hover {
            transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.2s cubic-bezier(.22,1,.36,1);
        }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.001ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.001ms !important;
            }
        }
        html[data-theme="midnight"] {
            --accent: #5aa9e6;
            --accent-rgb: 90, 169, 230;
        }
        html[data-theme="matrix"] {
            --accent: #39ff88;
            --accent-rgb: 57, 255, 136;
        }
        html[data-theme="crimson"] {
            --accent: #ff5566;
            --accent-rgb: 255, 85, 102;
        }
        html[data-theme="light"] {
            --accent: #8a5a1f;
            --accent-rgb: 138, 90, 31;
        }

        html[data-theme="dark"],
        html[data-theme="midnight"],
        html[data-theme="matrix"],
        html[data-theme="crimson"] {
                    html, body {
                background: #0b0e14;
                color: #d7dde5;
                font-family: 'Consolas', 'SFMono-Regular', 'Courier New', monospace;
            }
            #controls, #zoom-container, #config-container, #auto-refresh-container,
            #add-symbol-container {
                color: #d7dde5;
            }
            button, select, input[type="text"], input[type="number"], input[type="file"] {
                background: #1a1f2b;
                color: #d7dde5;
                border: 1px solid #2b3242;
                border-radius: 3px;
                font-family: inherit;
            }
            button {
                cursor: pointer;
            }
            button:hover {
                background: #262d3d;
                border-color: var(--accent);
            }
            input::placeholder {
                color: #6b7280;
            }
            #destroyChartButton {
                background: #2a1216;
                color: #ff6b6b !important;
                border-color: #5a2020;
            }
            .dropdown-content, .symbol-dropdown-content {
                background-color: #12151d;
                border: 1px solid #2b3242;
            }
            .dropdown-content label, .symbol-dropdown-content label {
                color: #d7dde5;
            }
            .dropdown-content label:hover, .symbol-dropdown-content label:hover {
                background-color: #1f2533;
            }
            #orderbookchart {
                border: 1px solid #2b3242;
                background: #0e1119;
            }
            #alerts-panel, #comparison-panel, #depth-panel, #slippage-panel,
            #history-panel, #watchlist-panel, #export-panel, #ladder-panel {
                background: #11151d;
                border: 1px solid #232838;
                box-shadow: none;
            }
            #comparison-table th, #comparison-table td,
            #watchlist-table th, #watchlist-table td {
                border: 1px solid #232838;
                color: #d7dde5;
            }
            #comparison-table th, #watchlist-table th {
                background: #171b26;
                color: var(--accent);
            }
            #comparison-table tr.best-bid td:nth-child(2) {
                background: rgba(62, 207, 142, 0.25);
                color: #3ecf8e;
            }
            #comparison-table tr.best-ask td:nth-child(3) {
                background: rgba(239, 83, 80, 0.25);
                color: #ef5350;
            }
            #arbitrage-info.positive {
                color: #3ecf8e;
            }
            #agg-imbalance-bar {
                background: #ef5350;
            }
            #agg-imbalance-fill {
                background: #3ecf8e;
            }
            #alert-list li {
                border-bottom: 1px dashed #232838;
            }
            .ladder-header {
                border-bottom: 1px solid #232838;
                color: var(--accent);
            }
            .ladder-mid {
                background: #171b26;
                color: var(--accent);
            }
            .ask-row .ladder-price {
                color: #ef5350;
            }
            .bid-row .ladder-price {
                color: #3ecf8e;
            }
            .ask-row .ladder-bar {
                background: rgba(239, 83, 80, 0.22);
            }
            .bid-row .ladder-bar {
                background: rgba(62, 207, 142, 0.22);
            }
            #total-info {
                color: #d7dde5;
            }
            a {
                color: var(--accent);
            }
            #quant-panel {
                background: #11151d;
                border: 1px solid #232838;
                padding: 6px;
                font-size: 10px;
            }
            #quant-symbol-label {
                color: var(--accent);
                font-weight: bold;
            }
            .quant-row {
                display: flex;
                justify-content: space-between;
                padding: 3px 2px;
                border-bottom: 1px dashed #232838;
            }
            .quant-row span:first-child {
                color: #9aa4b5;
            }
            .quant-row span:last-child {
                font-weight: bold;
                font-variant-numeric: tabular-nums;
            }
            .quant-positive {
                color: #3ecf8e !important;
            }
            .quant-negative {
                color: #ef5350 !important;
            }
            #quant-note {
                color: #6b7280;
                font-size: 9px;
                margin-top: 4px;
            }
            #tab-bar {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 4px;
                margin-bottom: 8px;
            }
            .tab-btn {
                background: #11151d;
                color: #9aa4b5;
                border: 1px solid #232838;
                border-radius: 4px 4px 0 0;
                padding: 6px 16px;
                font-size: 11px;
                font-weight: bold;
                letter-spacing: 0.5px;
            }
            .tab-btn:hover {
                background: #1a1f2b;
                color: #d7dde5;
            }
            .tab-btn.active {
                background: #1a1f2b;
                color: var(--accent);
                border-bottom: 2px solid var(--accent);
            }
            .tab-view {
                display: none;
            }
            .tab-view.active {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            #quant-header-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #11151d;
                border: 1px solid #232838;
                border-radius: 6px;
                padding: 8px;
            }
            #quant-analytics-note {
                color: #6b7280;
                font-size: 9px;
                margin: 6px 0;
            }
            #quant-range-buttons {
                display: flex;
                gap: 4px;
            }
            #quant-range-buttons button {
                background: #11151d;
                color: #9aa4b5;
                border: 1px solid #232838;
                border-radius: 3px;
                padding: 3px 10px;
                font-size: 10px;
                cursor: pointer;
            }
            #quant-range-buttons button:hover {
                border-color: var(--accent);
                color: #d7dde5;
            }
            #quant-range-buttons button.active {
                background: #1a1f2b;
                color: var(--accent);
                border-color: var(--accent);
            }
            #quant-quad-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                grid-template-rows: 1fr 1fr;
                gap: 8px;
                height: calc(100vh - 260px);
                min-height: 560px;
            }
            .quant-cell {
                position: relative;
                background: #11151d;
                border: 1px solid #232838;
                border-radius: 6px;
                padding: 8px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            .quant-cell-title {
                color: var(--accent);
                font-size: 11px;
                font-weight: bold;
                z-index: 2;
                position: relative;
            }
            .quant-cell-watermark {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-18deg);
                font-size: 30px;
                font-weight: 800;
                letter-spacing: 3px;
                color: rgba(var(--accent-rgb), 0.06);
                white-space: nowrap;
                z-index: 0;
                pointer-events: none;
                user-select: none;
            }
            .quant-cell-chart {
                flex: 1;
                min-height: 0;
                z-index: 1;
                position: relative;
            }
            #quant-analytics-stat-panel {
                z-index: 1;
                position: relative;
                font-size: 11px;
                overflow-y: auto;
            }
            @media (max-width: 1000px) {
                #quant-quad-grid {
                    grid-template-columns: 1fr;
                    grid-template-rows: none;
                    height: auto;
                }
                .quant-cell-chart {
                    height: 260px;
                }
                #indicators-grid {
                    grid-template-columns: 1fr;
                }
            }
            #indicators-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #11151d;
                border: 1px solid #232838;
                border-radius: 6px;
                padding: 8px;
                margin-top: 8px;
            }
            #indicators-symbol-label {
                color: var(--accent);
                font-weight: bold;
            }
            #indicators-status {
                font-size: 9px;
                color: #6b7280;
                font-weight: bold;
            }
            #indicators-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
                margin-top: 8px;
                height: 300px;
            }
            #compare-header-bar {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
                background: #11151d;
                border: 1px solid #232838;
                border-radius: 6px;
                padding: 8px;
            }
            #compare-symbol-list {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                flex: 1 1 auto;
            }
            #compare-symbol-list label {
                display: flex;
                align-items: center;
                gap: 3px;
                font-size: 10px;
                color: #d7dde5;
                background: #171b26;
                border: 1px solid #232838;
                border-radius: 3px;
                padding: 3px 8px;
            }
            #compare-range-buttons {
                display: flex;
                gap: 4px;
            }
            #compare-range-buttons button {
                background: #11151d;
                color: #9aa4b5;
                border: 1px solid #232838;
                border-radius: 3px;
                padding: 3px 10px;
                font-size: 10px;
                cursor: pointer;
            }
            #compare-range-buttons button:hover {
                border-color: var(--accent);
                color: #d7dde5;
            }
            #compare-range-buttons button.active {
                background: #1a1f2b;
                color: var(--accent);
                border-color: var(--accent);
            }
            #compare-note {
                color: #6b7280;
                font-size: 9px;
                margin: 6px 0;
            }
            #compare-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                height: 380px;
            }
            #compare-perf-chart, #compare-vol-chart {
                flex: 1;
                min-height: 0;
            }
            @media (max-width: 1000px) {
                #compare-grid {
                    grid-template-columns: 1fr;
                    height: auto;
                }
                #compare-perf-chart, #compare-vol-chart {
                    height: 260px;
                }
            }
            #compare-corr-panel {
                background: #11151d;
                border: 1px solid #232838;
                border-radius: 6px;
                padding: 8px;
                margin-top: 8px;
                overflow-x: auto;
            }
            #compare-corr-table {
                border-collapse: collapse;
                margin-top: 6px;
                font-size: 10px;
            }
            #compare-corr-table th, #compare-corr-table td {
                border: 1px solid #232838;
                padding: 4px 8px;
                text-align: center;
                white-space: nowrap;
            }
            #compare-corr-table th {
                background: #171b26;
                color: var(--accent);
            }
            #binance-ws-container {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-right: 5px;
            }
            #watchlist-ws-container {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-right: 5px;
            }
            #binance-ws-status, #watchlist-ws-status {
                font-size: 9px;
                font-weight: bold;
            }
            #binance-ws-status.live, #watchlist-ws-status.live {
                color: #3ecf8e;
            }
            #binance-ws-status.off, #watchlist-ws-status.off {
                color: #6b7280;
            }
            #binance-ws-status.error, #watchlist-ws-status.error {
                color: #ef5350;
            }
            #onchain-note {
                color: #6b7280;
                font-size: 9px;
                margin-bottom: 6px;
            }
            #derivatives-panel {
                padding: 8px;
                margin-bottom: 8px;
            }
            #derivatives-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 6px 0;
            }
            #derivatives-funding-chart {
                height: 220px;
                margin-top: 6px;
            }
            #onchain-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }
            #btc-network-panel, #eth-network-panel {
                padding: 8px;
            }
            #eth-key-row {
                display: flex;
                align-items: center;
                gap: 6px;
                margin: 6px 0;
                flex-wrap: wrap;
            }
            #eth-api-key-input {
                width: 220px;
            }
            #eth-key-note {
                color: #6b7280;
                font-size: 9px;
                margin-top: 6px;
            }
            #eth-key-note a {
                color: var(--accent);
            }
            #derivatives-status, #btc-network-status, #eth-network-status {
                font-size: 9px;
                font-weight: bold;
                color: #6b7280;
            }
            @media (max-width: 1000px) {
                #onchain-grid {
                    grid-template-columns: 1fr;
                }
            }
            #view-news {
                display: none;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }
            #view-news.active {
                display: grid;
            }
            @media (max-width: 1000px) {
                #view-news.active {
                    grid-template-columns: 1fr;
                }
            }
            #fng-panel, #news-panel {
                padding: 10px;
                display: flex;
                flex-direction: column;
            }
            #fng-current-row {
                display: flex;
                align-items: baseline;
                gap: 10px;
                margin: 8px 0 4px 0;
            }
            #fng-gauge-value {
                font-size: 32px;
                font-weight: 800;
                color: var(--accent);
            }
            #fng-gauge-label {
                font-size: 13px;
                font-weight: bold;
                color: #d7dde5;
            }
            #fng-status {
                font-size: 9px;
                color: #6b7280;
                margin-left: auto;
            }
            #fng-bar {
                position: relative;
                height: 14px;
                border-radius: 7px;
                background: linear-gradient(90deg, #ef5350 0%, #e5893f 25%, #e5c07b 50%, #8bc48a 75%, #3ecf8e 100%);
                margin-top: 6px;
            }
            #fng-bar-fill {
                display: none;
            }
            #fng-bar-pointer {
                position: absolute;
                top: -4px;
                width: 4px;
                height: 22px;
                background: #ffffff;
                border-radius: 2px;
                left: 50%;
                box-shadow: 0 0 4px rgba(0,0,0,0.6);
                transition: left 0.4s ease;
            }
            #fng-scale-labels {
                display: flex;
                justify-content: space-between;
                font-size: 8px;
                color: #6b7280;
                margin-top: 4px;
            }
            #fng-history-chart {
                height: 220px;
                margin-top: 10px;
            }
            #news-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 4px 0 8px 0;
            }
            #news-status {
                font-size: 9px;
                color: #6b7280;
            }
            #news-list {
                overflow-y: auto;
                max-height: 560px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .news-item {
                display: flex;
                gap: 8px;
                padding: 6px;
                border: 1px solid #232838;
                border-radius: 5px;
                background: #171b26;
                text-decoration: none;
            }
            .news-item img {
                width: 56px;
                height: 56px;
                object-fit: cover;
                border-radius: 4px;
                flex-shrink: 0;
            }
            .news-item-title {
                color: #d7dde5;
                font-size: 11px;
                font-weight: bold;
                line-height: 1.3;
            }
            .news-item-meta {
                color: #6b7280;
                font-size: 9px;
                margin-top: 3px;
            }
            .news-item:hover .news-item-title {
                color: var(--accent);
            }

        #tradfi-note {
            color: #6b7280;
            font-size: 9px;
            margin-bottom: 6px;
        }
        #binance-tradfi-controls, #xyz-tradfi-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 6px 0;
        }
        #binance-tradfi-status, #xyz-tradfi-status {
            font-size: 9px;
            font-weight: bold;
            color: #6b7280;
        }
        #binance-tradfi-chart {
            height: 220px;
            margin-top: 6px;
        }
        #xyz-tradfi-table-wrap {
            overflow-y: auto;
            max-height: 420px;
        }
        #xyz-tradfi-table {
            border-collapse: collapse;
            width: 100%;
            font-size: 10px;
        }
        #xyz-tradfi-table th, #xyz-tradfi-table td {
            border: 1px solid #232838;
            padding: 4px 8px;
            text-align: right;
            white-space: nowrap;
        }
        #xyz-tradfi-table th:first-child, #xyz-tradfi-table td:first-child {
            text-align: left;
        }
        #xyz-tradfi-table th {
            background: #171b26;
            color: var(--accent);
            position: sticky;
            top: 0;
        }

        #footprint-note {
            color: #6b7280;
            font-size: 9px;
            margin-bottom: 6px;
        }
        #footprint-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        #footprint-symbol {
            width: 100px;
        }
        #footprint-ticksize {
            width: 90px;
        }
        #footprint-status {
            font-size: 9px;
            font-weight: bold;
            color: #6b7280;
        }
        #footprint-panel {
            margin-bottom: 8px;
        }
        #footprint-grid-wrap {
            overflow: auto;
            max-height: 520px;
            margin-top: 6px;
        }
        #footprint-table {
            border-collapse: collapse;
            font-size: 9px;
            font-variant-numeric: tabular-nums;
        }
        #footprint-table th, #footprint-table td {
            border: 1px solid #232838;
            padding: 2px 4px;
            text-align: center;
            white-space: nowrap;
            min-width: 74px;
        }
        #footprint-table thead th {
            background: #171b26;
            color: var(--accent);
            position: sticky;
            top: 0;
            z-index: 2;
        }
        #footprint-table td.price-col, #footprint-table th.price-col {
            position: sticky;
            left: 0;
            background: #171b26;
            color: #d7dde5;
            font-weight: bold;
            z-index: 1;
        }
        #footprint-table td.delta-row {
            font-weight: bold;
        }
        #footprint-cell-buy {
            color: #3ecf8e;
        }
        #footprint-cell-sell {
            color: #ef5350;
        }
        .fp-delta-pos {
            color: #3ecf8e;
        }
        .fp-delta-neg {
            color: #ef5350;
        }
        #cvd-panel #footprint-cvd-chart {
            height: 220px;
        }
        #footprint-candle-panel #footprint-candle-chart {
            height: 320px;
        }

        #tradfi-macro-header {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #11151d;
            border: 1px solid #232838;
            border-radius: 6px;
            padding: 8px;
            margin-top: 8px;
        }
        #tradfi-macro-status {
            font-size: 9px;
            color: #6b7280;
            font-weight: bold;
        }
        #macro-note, #macro-funding-note {
            color: #6b7280;
            font-size: 9px;
            margin-top: 6px;
        }
        #macro-corr-wrap, #macro-funding-wrap {
            overflow: auto;
            max-height: 320px;
            margin-top: 4px;
        }
        #macro-corr-table, #macro-funding-table {
            border-collapse: collapse;
            width: 100%;
            font-size: 10px;
        }
        #macro-corr-table th, #macro-corr-table td,
        #macro-funding-table th, #macro-funding-table td {
            border: 1px solid #232838;
            padding: 4px 8px;
            text-align: center;
            white-space: nowrap;
        }
        #macro-funding-table th:first-child, #macro-funding-table td:first-child,
        #macro-funding-table td:nth-child(2) {
            text-align: left;
        }
        #macro-corr-table th, #macro-funding-table th {
            background: #171b26;
            color: var(--accent);
            position: sticky;
            top: 0;
        }

        #events-panel {
            margin-top: 8px;
        }
        #events-note {
            color: #6b7280;
            font-size: 9px;
            margin-bottom: 6px;
        }
        #events-builtin-list, #events-custom-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 6px;
        }
        .event-chip {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 10px;
            background: #171b26;
            border: 1px solid #232838;
            border-radius: 3px;
            padding: 3px 8px;
            color: #d7dde5;
        }
        .event-chip .event-dates {
            color: #6b7280;
            font-size: 9px;
        }
        .event-chip button {
            font-size: 9px;
            padding: 1px 5px;
        }
        #events-add-row {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        #event-label-input {
            width: 220px;
        }

        #macro-liq-note {
            color: #6b7280;
            font-size: 9px;
            margin-bottom: 6px;
        }
        #fred-key-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            flex-wrap: wrap;
        }
        #fred-api-key-input {
            width: 220px;
        }
        #fred-key-note {
            font-size: 9px;
            color: #6b7280;
        }
        #fred-key-note a {
            color: var(--accent);
        }
        #macro-liq-panel {
            margin-bottom: 8px;
        }
        #fred-controls, #event-study-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 6px 0;
        }
        #fred-status, #event-study-status {
            font-size: 9px;
            font-weight: bold;
            color: #6b7280;
        }
        #fred-chart {
            height: 260px;
        }
        #event-study-table-wrap {
            overflow-x: auto;
            max-height: 420px;
        }
        #event-study-table {
            border-collapse: collapse;
            width: 100%;
            font-size: 10px;
        }
        #event-study-table th, #event-study-table td {
            border: 1px solid #232838;
            padding: 4px 8px;
            text-align: right;
            white-space: nowrap;
        }
        #event-study-table th:first-child, #event-study-table td:first-child,
        #event-study-table th:nth-child(2), #event-study-table td:nth-child(2) {
            text-align: left;
        }
        #event-study-table th {
            background: #171b26;
            color: var(--accent);
            position: sticky;
            top: 0;
        }
        #event-study-legend {
            color: #6b7280;
            font-size: 9px;
            margin-top: 6px;
        }

        #event-study-table tbody tr {
            cursor: pointer;
        }
        #event-study-table tbody tr:hover {
            background: #1a1f2b;
        }
        #event-study-chart {
            height: 240px;
            margin-top: 8px;
        }

        #fred-key-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
            flex-wrap: wrap;
        }
        #fred-api-key-input {
            width: 220px;
        }
        #fred-key-note {
            font-size: 9px;
            color: #6b7280;
        }
        #fred-key-note a {
            color: var(--accent);
        }
        #fred-custom-series {
            width: 160px;
        }

        #inflation-exp-controls, #btc-basket-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 6px 0;
        }
        #inflation-exp-status, #btc-basket-status {
            font-size: 9px;
            font-weight: bold;
            color: #6b7280;
        }
        #inflation-exp-note, #btc-basket-note {
            color: #6b7280;
            font-size: 9px;
            margin-top: 6px;
        }
        #btc-basket-ticker-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 6px;
            min-height: 24px;
        }
        #btc-basket-search {
            width: 200px;
        }
        .basket-chip {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 10px;
            color: #d7dde5;
            background: #171b26;
            border: 1px solid #232838;
            border-radius: 3px;
            padding: 3px 8px;
        }
        .basket-chip .basket-chip-source {
            color: #6b7280;
            font-size: 9px;
        }
        .basket-chip button {
            font-size: 9px;
            padding: 1px 5px;
        }
        .basket-chip.pending {
            color: #6b7280;
        }
        .basket-chip.failed {
            border-color: #5a2020;
            color: #ef5350;
        }

        }

        html[data-theme="light"] {
                    html, body {
                background: #f4f5f7;
                color: #1a1f29;
                font-family: 'Consolas', 'SFMono-Regular', 'Courier New', monospace;
            }
            #controls, #zoom-container, #config-container, #auto-refresh-container,
            #add-symbol-container {
                color: #1a1f29;
            }
            button, select, input[type="text"], input[type="number"], input[type="file"] {
                background: #ffffff;
                color: #1a1f29;
                border: 1px solid #c7ccd4;
                border-radius: 3px;
                font-family: inherit;
            }
            button {
                cursor: pointer;
            }
            button:hover {
                background: #e2e5ea;
                border-color: var(--accent);
            }
            input::placeholder {
                color: #6b7280;
            }
            #destroyChartButton {
                background: #fde8e8;
                color: #c62828 !important;
                border-color: #f3b4b4;
            }
            .dropdown-content, .symbol-dropdown-content {
                background-color: #ffffff;
                border: 1px solid #c7ccd4;
            }
            .dropdown-content label, .symbol-dropdown-content label {
                color: #1a1f29;
            }
            .dropdown-content label:hover, .symbol-dropdown-content label:hover {
                background-color: #eef0f3;
            }
            #orderbookchart {
                border: 1px solid #c7ccd4;
                background: #f9fafb;
            }
            #alerts-panel, #comparison-panel, #depth-panel, #slippage-panel,
            #history-panel, #watchlist-panel, #export-panel, #ladder-panel {
                background: #ffffff;
                border: 1px solid #dcdfe4;
                box-shadow: none;
            }
            #comparison-table th, #comparison-table td,
            #watchlist-table th, #watchlist-table td {
                border: 1px solid #dcdfe4;
                color: #1a1f29;
            }
            #comparison-table th, #watchlist-table th {
                background: #eef0f3;
                color: var(--accent);
            }
            #comparison-table tr.best-bid td:nth-child(2) {
                background: rgba(31, 157, 99, 0.25);
                color: #1f9d63;
            }
            #comparison-table tr.best-ask td:nth-child(3) {
                background: rgba(198, 40, 40, 0.25);
                color: #c62828;
            }
            #arbitrage-info.positive {
                color: #1f9d63;
            }
            #agg-imbalance-bar {
                background: #c62828;
            }
            #agg-imbalance-fill {
                background: #1f9d63;
            }
            #alert-list li {
                border-bottom: 1px dashed #dcdfe4;
            }
            .ladder-header {
                border-bottom: 1px solid #dcdfe4;
                color: var(--accent);
            }
            .ladder-mid {
                background: #eef0f3;
                color: var(--accent);
            }
            .ask-row .ladder-price {
                color: #c62828;
            }
            .bid-row .ladder-price {
                color: #1f9d63;
            }
            .ask-row .ladder-bar {
                background: rgba(198, 40, 40, 0.22);
            }
            .bid-row .ladder-bar {
                background: rgba(31, 157, 99, 0.22);
            }
            #total-info {
                color: #1a1f29;
            }
            a {
                color: var(--accent);
            }
            #quant-panel {
                background: #ffffff;
                border: 1px solid #dcdfe4;
                padding: 6px;
                font-size: 10px;
            }
            #quant-symbol-label {
                color: var(--accent);
                font-weight: bold;
            }
            .quant-row {
                display: flex;
                justify-content: space-between;
                padding: 3px 2px;
                border-bottom: 1px dashed #dcdfe4;
            }
            .quant-row span:first-child {
                color: #5b6472;
            }
            .quant-row span:last-child {
                font-weight: bold;
                font-variant-numeric: tabular-nums;
            }
            .quant-positive {
                color: #1f9d63 !important;
            }
            .quant-negative {
                color: #c62828 !important;
            }
            #quant-note {
                color: #6b7280;
                font-size: 9px;
                margin-top: 4px;
            }
            #tab-bar {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 4px;
                margin-bottom: 8px;
            }
            .tab-btn {
                background: #ffffff;
                color: #5b6472;
                border: 1px solid #dcdfe4;
                border-radius: 4px 4px 0 0;
                padding: 6px 16px;
                font-size: 11px;
                font-weight: bold;
                letter-spacing: 0.5px;
            }
            .tab-btn:hover {
                background: #ffffff;
                color: #1a1f29;
            }
            .tab-btn.active {
                background: #ffffff;
                color: var(--accent);
                border-bottom: 2px solid var(--accent);
            }
            .tab-view {
                display: none;
            }
            .tab-view.active {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            #quant-header-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #ffffff;
                border: 1px solid #dcdfe4;
                border-radius: 6px;
                padding: 8px;
            }
            #quant-analytics-note {
                color: #6b7280;
                font-size: 9px;
                margin: 6px 0;
            }
            #quant-range-buttons {
                display: flex;
                gap: 4px;
            }
            #quant-range-buttons button {
                background: #ffffff;
                color: #5b6472;
                border: 1px solid #dcdfe4;
                border-radius: 3px;
                padding: 3px 10px;
                font-size: 10px;
                cursor: pointer;
            }
            #quant-range-buttons button:hover {
                border-color: var(--accent);
                color: #1a1f29;
            }
            #quant-range-buttons button.active {
                background: #ffffff;
                color: var(--accent);
                border-color: var(--accent);
            }
            #quant-quad-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                grid-template-rows: 1fr 1fr;
                gap: 8px;
                height: calc(100vh - 260px);
                min-height: 560px;
            }
            .quant-cell {
                position: relative;
                background: #ffffff;
                border: 1px solid #dcdfe4;
                border-radius: 6px;
                padding: 8px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            .quant-cell-title {
                color: var(--accent);
                font-size: 11px;
                font-weight: bold;
                z-index: 2;
                position: relative;
            }
            .quant-cell-watermark {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-18deg);
                font-size: 30px;
                font-weight: 800;
                letter-spacing: 3px;
                color: rgba(var(--accent-rgb), 0.06);
                white-space: nowrap;
                z-index: 0;
                pointer-events: none;
                user-select: none;
            }
            .quant-cell-chart {
                flex: 1;
                min-height: 0;
                z-index: 1;
                position: relative;
            }
            #quant-analytics-stat-panel {
                z-index: 1;
                position: relative;
                font-size: 11px;
                overflow-y: auto;
            }
            @media (max-width: 1000px) {
                #quant-quad-grid {
                    grid-template-columns: 1fr;
                    grid-template-rows: none;
                    height: auto;
                }
                .quant-cell-chart {
                    height: 260px;
                }
                #indicators-grid {
                    grid-template-columns: 1fr;
                }
            }
            #indicators-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #ffffff;
                border: 1px solid #dcdfe4;
                border-radius: 6px;
                padding: 8px;
                margin-top: 8px;
            }
            #indicators-symbol-label {
                color: var(--accent);
                font-weight: bold;
            }
            #indicators-status {
                font-size: 9px;
                color: #6b7280;
                font-weight: bold;
            }
            #indicators-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
                margin-top: 8px;
                height: 300px;
            }
            #compare-header-bar {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
                background: #ffffff;
                border: 1px solid #dcdfe4;
                border-radius: 6px;
                padding: 8px;
            }
            #compare-symbol-list {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                flex: 1 1 auto;
            }
            #compare-symbol-list label {
                display: flex;
                align-items: center;
                gap: 3px;
                font-size: 10px;
                color: #1a1f29;
                background: #eef0f3;
                border: 1px solid #dcdfe4;
                border-radius: 3px;
                padding: 3px 8px;
            }
            #compare-range-buttons {
                display: flex;
                gap: 4px;
            }
            #compare-range-buttons button {
                background: #ffffff;
                color: #5b6472;
                border: 1px solid #dcdfe4;
                border-radius: 3px;
                padding: 3px 10px;
                font-size: 10px;
                cursor: pointer;
            }
            #compare-range-buttons button:hover {
                border-color: var(--accent);
                color: #1a1f29;
            }
            #compare-range-buttons button.active {
                background: #ffffff;
                color: var(--accent);
                border-color: var(--accent);
            }
            #compare-note {
                color: #6b7280;
                font-size: 9px;
                margin: 6px 0;
            }
            #compare-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                height: 380px;
            }
            #compare-perf-chart, #compare-vol-chart {
                flex: 1;
                min-height: 0;
            }
            @media (max-width: 1000px) {
                #compare-grid {
                    grid-template-columns: 1fr;
                    height: auto;
                }
                #compare-perf-chart, #compare-vol-chart {
                    height: 260px;
                }
            }
            #compare-corr-panel {
                background: #ffffff;
                border: 1px solid #dcdfe4;
                border-radius: 6px;
                padding: 8px;
                margin-top: 8px;
                overflow-x: auto;
            }
            #compare-corr-table {
                border-collapse: collapse;
                margin-top: 6px;
                font-size: 10px;
            }
            #compare-corr-table th, #compare-corr-table td {
                border: 1px solid #dcdfe4;
                padding: 4px 8px;
                text-align: center;
                white-space: nowrap;
            }
            #compare-corr-table th {
                background: #eef0f3;
                color: var(--accent);
            }
            #binance-ws-container {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-right: 5px;
            }
            #watchlist-ws-container {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-right: 5px;
            }
            #binance-ws-status, #watchlist-ws-status {
                font-size: 9px;
                font-weight: bold;
            }
            #binance-ws-status.live, #watchlist-ws-status.live {
                color: #1f9d63;
            }
            #binance-ws-status.off, #watchlist-ws-status.off {
                color: #6b7280;
            }
            #binance-ws-status.error, #watchlist-ws-status.error {
                color: #c62828;
            }
            #onchain-note {
                color: #6b7280;
                font-size: 9px;
                margin-bottom: 6px;
            }
            #derivatives-panel {
                padding: 8px;
                margin-bottom: 8px;
            }
            #derivatives-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 6px 0;
            }
            #derivatives-funding-chart {
                height: 220px;
                margin-top: 6px;
            }
            #onchain-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }
            #btc-network-panel, #eth-network-panel {
                padding: 8px;
            }
            #eth-key-row {
                display: flex;
                align-items: center;
                gap: 6px;
                margin: 6px 0;
                flex-wrap: wrap;
            }
            #eth-api-key-input {
                width: 220px;
            }
            #eth-key-note {
                color: #6b7280;
                font-size: 9px;
                margin-top: 6px;
            }
            #eth-key-note a {
                color: var(--accent);
            }
            #derivatives-status, #btc-network-status, #eth-network-status {
                font-size: 9px;
                font-weight: bold;
                color: #6b7280;
            }
            @media (max-width: 1000px) {
                #onchain-grid {
                    grid-template-columns: 1fr;
                }
            }
            #view-news {
                display: none;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }
            #view-news.active {
                display: grid;
            }
            @media (max-width: 1000px) {
                #view-news.active {
                    grid-template-columns: 1fr;
                }
            }
            #fng-panel, #news-panel {
                padding: 10px;
                display: flex;
                flex-direction: column;
            }
            #fng-current-row {
                display: flex;
                align-items: baseline;
                gap: 10px;
                margin: 8px 0 4px 0;
            }
            #fng-gauge-value {
                font-size: 32px;
                font-weight: 800;
                color: var(--accent);
            }
            #fng-gauge-label {
                font-size: 13px;
                font-weight: bold;
                color: #1a1f29;
            }
            #fng-status {
                font-size: 9px;
                color: #6b7280;
                margin-left: auto;
            }
            #fng-bar {
                position: relative;
                height: 14px;
                border-radius: 7px;
                background: linear-gradient(90deg, #c62828 0%, #e5893f 25%, #e5c07b 50%, #8bc48a 75%, #1f9d63 100%);
                margin-top: 6px;
            }
            #fng-bar-fill {
                display: none;
            }
            #fng-bar-pointer {
                position: absolute;
                top: -4px;
                width: 4px;
                height: 22px;
                background: #ffffff;
                border-radius: 2px;
                left: 50%;
                box-shadow: 0 0 4px rgba(0,0,0,0.6);
                transition: left 0.4s ease;
            }
            #fng-scale-labels {
                display: flex;
                justify-content: space-between;
                font-size: 8px;
                color: #6b7280;
                margin-top: 4px;
            }
            #fng-history-chart {
                height: 220px;
                margin-top: 10px;
            }
            #news-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 4px 0 8px 0;
            }
            #news-status {
                font-size: 9px;
                color: #6b7280;
            }
            #news-list {
                overflow-y: auto;
                max-height: 560px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .news-item {
                display: flex;
                gap: 8px;
                padding: 6px;
                border: 1px solid #dcdfe4;
                border-radius: 5px;
                background: #eef0f3;
                text-decoration: none;
            }
            .news-item img {
                width: 56px;
                height: 56px;
                object-fit: cover;
                border-radius: 4px;
                flex-shrink: 0;
            }
            .news-item-title {
                color: #1a1f29;
                font-size: 11px;
                font-weight: bold;
                line-height: 1.3;
            }
            .news-item-meta {
                color: #6b7280;
                font-size: 9px;
                margin-top: 3px;
            }
            .news-item:hover .news-item-title {
                color: var(--accent);
            }

        #tradfi-note {
            color: #5b6472;
            font-size: 9px;
            margin-bottom: 6px;
        }
        #binance-tradfi-controls, #xyz-tradfi-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 6px 0;
        }
        #binance-tradfi-status, #xyz-tradfi-status {
            font-size: 9px;
            font-weight: bold;
            color: #5b6472;
        }
        #binance-tradfi-chart {
            height: 220px;
            margin-top: 6px;
        }
        #xyz-tradfi-table-wrap {
            overflow-y: auto;
            max-height: 420px;
        }
        #xyz-tradfi-table {
            border-collapse: collapse;
            width: 100%;
            font-size: 10px;
        }
        #xyz-tradfi-table th, #xyz-tradfi-table td {
            border: 1px solid #dcdfe4;
            padding: 4px 8px;
            text-align: right;
            white-space: nowrap;
        }
        #xyz-tradfi-table th:first-child, #xyz-tradfi-table td:first-child {
            text-align: left;
        }
        #xyz-tradfi-table th {
            background: #eef0f3;
            color: var(--accent);
            position: sticky;
            top: 0;
        }

        #footprint-note {
            color: #5b6472;
            font-size: 9px;
            margin-bottom: 6px;
        }
        #footprint-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        #footprint-symbol {
            width: 100px;
        }
        #footprint-ticksize {
            width: 90px;
        }
        #footprint-status {
            font-size: 9px;
            font-weight: bold;
            color: #5b6472;
        }
        #footprint-panel {
            margin-bottom: 8px;
        }
        #footprint-grid-wrap {
            overflow: auto;
            max-height: 520px;
            margin-top: 6px;
        }
        #footprint-table {
            border-collapse: collapse;
            font-size: 9px;
            font-variant-numeric: tabular-nums;
        }
        #footprint-table th, #footprint-table td {
            border: 1px solid #dcdfe4;
            padding: 2px 4px;
            text-align: center;
            white-space: nowrap;
            min-width: 74px;
        }
        #footprint-table thead th {
            background: #eef0f3;
            color: var(--accent);
            position: sticky;
            top: 0;
            z-index: 2;
        }
        #footprint-table td.price-col, #footprint-table th.price-col {
            position: sticky;
            left: 0;
            background: #eef0f3;
            color: #1a1f29;
            font-weight: bold;
            z-index: 1;
        }
        #footprint-table td.delta-row {
            font-weight: bold;
        }
        #footprint-cell-buy {
            color: #1f9d63;
        }
        #footprint-cell-sell {
            color: #c62828;
        }
        .fp-delta-pos {
            color: #1f9d63;
        }
        .fp-delta-neg {
            color: #c62828;
        }
        #cvd-panel #footprint-cvd-chart {
            height: 220px;
        }
        #footprint-candle-panel #footprint-candle-chart {
            height: 320px;
        }

        #tradfi-macro-header {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #ffffff;
            border: 1px solid #dcdfe4;
            border-radius: 6px;
            padding: 8px;
            margin-top: 8px;
        }
        #tradfi-macro-status {
            font-size: 9px;
            color: #5b6472;
            font-weight: bold;
        }
        #macro-note, #macro-funding-note {
            color: #5b6472;
            font-size: 9px;
            margin-top: 6px;
        }
        #macro-corr-wrap, #macro-funding-wrap {
            overflow: auto;
            max-height: 320px;
            margin-top: 4px;
        }
        #macro-corr-table, #macro-funding-table {
            border-collapse: collapse;
            width: 100%;
            font-size: 10px;
        }
        #macro-corr-table th, #macro-corr-table td,
        #macro-funding-table th, #macro-funding-table td {
            border: 1px solid #dcdfe4;
            padding: 4px 8px;
            text-align: center;
            white-space: nowrap;
        }
        #macro-funding-table th:first-child, #macro-funding-table td:first-child,
        #macro-funding-table td:nth-child(2) {
            text-align: left;
        }
        #macro-corr-table th, #macro-funding-table th {
            background: #eef0f3;
            color: var(--accent);
            position: sticky;
            top: 0;
        }

        #events-panel {
            margin-top: 8px;
        }
        #events-note {
            color: #5b6472;
            font-size: 9px;
            margin-bottom: 6px;
        }
        #events-builtin-list, #events-custom-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 6px;
        }
        .event-chip {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 10px;
            background: #eef0f3;
            border: 1px solid #dcdfe4;
            border-radius: 3px;
            padding: 3px 8px;
            color: #1a1f29;
        }
        .event-chip .event-dates {
            color: #5b6472;
            font-size: 9px;
        }
        .event-chip button {
            font-size: 9px;
            padding: 1px 5px;
        }
        #events-add-row {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        #event-label-input {
            width: 220px;
        }

        #macro-liq-note {
            color: #5b6472;
            font-size: 9px;
            margin-bottom: 6px;
        }
        #fred-key-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            flex-wrap: wrap;
        }
        #fred-api-key-input {
            width: 220px;
        }
        #fred-key-note {
            font-size: 9px;
            color: #5b6472;
        }
        #fred-key-note a {
            color: var(--accent);
        }
        #macro-liq-panel {
            margin-bottom: 8px;
        }
        #fred-controls, #event-study-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 6px 0;
        }
        #fred-status, #event-study-status {
            font-size: 9px;
            font-weight: bold;
            color: #5b6472;
        }
        #fred-chart {
            height: 260px;
        }
        #event-study-table-wrap {
            overflow-x: auto;
            max-height: 420px;
        }
        #event-study-table {
            border-collapse: collapse;
            width: 100%;
            font-size: 10px;
        }
        #event-study-table th, #event-study-table td {
            border: 1px solid #dcdfe4;
            padding: 4px 8px;
            text-align: right;
            white-space: nowrap;
        }
        #event-study-table th:first-child, #event-study-table td:first-child,
        #event-study-table th:nth-child(2), #event-study-table td:nth-child(2) {
            text-align: left;
        }
        #event-study-table th {
            background: #eef0f3;
            color: var(--accent);
            position: sticky;
            top: 0;
        }
        #event-study-legend {
            color: #5b6472;
            font-size: 9px;
            margin-top: 6px;
        }

        #event-study-table tbody tr {
            cursor: pointer;
        }
        #event-study-table tbody tr:hover {
            background: #e2e5ea;
        }
        #event-study-chart {
            height: 240px;
            margin-top: 8px;
        }

        #fred-key-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
            flex-wrap: wrap;
        }
        #fred-api-key-input {
            width: 220px;
        }
        #fred-key-note {
            font-size: 9px;
            color: #5b6472;
        }
        #fred-key-note a {
            color: var(--accent);
        }
        #fred-custom-series {
            width: 160px;
        }

        #inflation-exp-controls, #btc-basket-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 6px 0;
        }
        #inflation-exp-status, #btc-basket-status {
            font-size: 9px;
            font-weight: bold;
            color: #5b6472;
        }
        #inflation-exp-note, #btc-basket-note {
            color: #5b6472;
            font-size: 9px;
            margin-top: 6px;
        }
        #btc-basket-ticker-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 6px;
            min-height: 24px;
        }
        #btc-basket-search {
            width: 200px;
        }
        .basket-chip {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 10px;
            color: #1a1f29;
            background: #eef0f3;
            border: 1px solid #dcdfe4;
            border-radius: 3px;
            padding: 3px 8px;
        }
        .basket-chip .basket-chip-source {
            color: #5b6472;
            font-size: 9px;
        }
        .basket-chip button {
            font-size: 9px;
            padding: 1px 5px;
        }
        .basket-chip.pending {
            color: #5b6472;
        }
        .basket-chip.failed {
            border-color: #f3b4b4;
            color: #c62828;
        }

        }

        #theme-select {
            font-size: 10px;
            margin-left: 12px;
        }
        #tradfi-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        @media (max-width: 1000px) {
            #tradfi-grid {
                grid-template-columns: 1fr;
            }
        }
        #tradfi-macro-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 8px;
            margin-top: 8px;
        }
        @media (max-width: 1200px) {
            #tradfi-macro-grid {
                grid-template-columns: 1fr 1fr;
            }
        }
        @media (max-width: 800px) {
            #tradfi-macro-grid {
                grid-template-columns: 1fr;
            }
        }
        /* ============================================================
           RESEARCH DESK SKIN — institutional sell-side aesthetic.
           Pure CSS override layer (loaded last = wins on cascade).
           Nothing here renames/removes an id, class or tab — every
           element below still exists and works exactly as before.
           ============================================================ */
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');

        :root {
            --rd-navy: #0a1628;
            --rd-navy-2: #0f2036;
            --rd-navy-3: #16273f;
            --rd-hair: rgba(201,151,90,0.16);
            --rd-hair-soft: rgba(255,255,255,0.07);
            --rd-cream: #f6f3ea;
            --rd-cream-2: #efe9da;
            --rd-ink: #1c1a15;
            --rd-serif: 'Playfair Display', Georgia, 'Times New Roman', serif;
            --rd-sans: 'Inter', -apple-system, sans-serif;
            --rd-mono: 'IBM Plex Mono', 'Consolas', 'SFMono-Regular', monospace;
        }

        html[data-theme="dark"] html, html[data-theme="dark"] body,
        html[data-theme="midnight"] html, html[data-theme="midnight"] body,
        html[data-theme="matrix"] html, html[data-theme="matrix"] body,
        html[data-theme="crimson"] html, html[data-theme="crimson"] body,
        html[data-theme="dark"] body, html[data-theme="midnight"] body,
        html[data-theme="matrix"] body, html[data-theme="crimson"] body {
            background: var(--rd-navy) !important;
            color: #d9dee7 !important;
            font-family: var(--rd-mono) !important;
        }
        html[data-theme="light"] body {
            background: var(--rd-cream) !important;
            color: var(--rd-ink) !important;
            font-family: var(--rd-mono) !important;
        }

        /* Masthead */
        #rd-masthead {
            display: flex; align-items: baseline; justify-content: space-between;
            padding: 14px 4px 12px; margin-bottom: 10px;
            border-bottom: 2px solid var(--accent);
            font-family: var(--rd-serif);
        }
        #rd-masthead .rd-title {
            font-size: 20px; font-weight: 700; letter-spacing: 0.3px;
            color: inherit;
        }
        #rd-masthead .rd-title span { color: var(--accent); font-style: italic; }
        #rd-masthead .rd-meta {
            font-family: var(--rd-sans); font-size: 10.5px; letter-spacing: 1.2px; text-transform: uppercase;
            opacity: 0.55;
        }

        /* Panels: hairline institutional borders, no glow */
        html[data-theme="dark"] #alerts-panel, html[data-theme="dark"] #comparison-panel,
        html[data-theme="dark"] #depth-panel, html[data-theme="dark"] #slippage-panel,
        html[data-theme="dark"] #history-panel, html[data-theme="dark"] #watchlist-panel,
        html[data-theme="dark"] #export-panel, html[data-theme="dark"] #ladder-panel,
        html[data-theme="dark"] #quant-panel, html[data-theme="dark"] #orderbookchart,
        html[data-theme="midnight"] #alerts-panel, html[data-theme="midnight"] #comparison-panel,
        html[data-theme="midnight"] #depth-panel, html[data-theme="midnight"] #slippage-panel,
        html[data-theme="midnight"] #history-panel, html[data-theme="midnight"] #watchlist-panel,
        html[data-theme="midnight"] #export-panel, html[data-theme="midnight"] #ladder-panel,
        html[data-theme="midnight"] #quant-panel, html[data-theme="midnight"] #orderbookchart,
        html[data-theme="matrix"] #alerts-panel, html[data-theme="matrix"] #comparison-panel,
        html[data-theme="matrix"] #depth-panel, html[data-theme="matrix"] #slippage-panel,
        html[data-theme="matrix"] #history-panel, html[data-theme="matrix"] #watchlist-panel,
        html[data-theme="matrix"] #export-panel, html[data-theme="matrix"] #ladder-panel,
        html[data-theme="matrix"] #quant-panel, html[data-theme="matrix"] #orderbookchart,
        html[data-theme="crimson"] #alerts-panel, html[data-theme="crimson"] #comparison-panel,
        html[data-theme="crimson"] #depth-panel, html[data-theme="crimson"] #slippage-panel,
        html[data-theme="crimson"] #history-panel, html[data-theme="crimson"] #watchlist-panel,
        html[data-theme="crimson"] #export-panel, html[data-theme="crimson"] #ladder-panel,
        html[data-theme="crimson"] #quant-panel, html[data-theme="crimson"] #orderbookchart {
            background: var(--rd-navy-2) !important;
            border: 1px solid var(--rd-hair-soft) !important;
            border-top: 2px solid var(--rd-hair) !important;
            border-radius: 2px !important;
            box-shadow: none !important;
        }
        html[data-theme="light"] #alerts-panel, html[data-theme="light"] #comparison-panel,
        html[data-theme="light"] #depth-panel, html[data-theme="light"] #slippage-panel,
        html[data-theme="light"] #history-panel, html[data-theme="light"] #watchlist-panel,
        html[data-theme="light"] #export-panel, html[data-theme="light"] #ladder-panel,
        html[data-theme="light"] #quant-panel, html[data-theme="light"] #orderbookchart {
            background: #ffffff !important;
            border: 1px solid #e2ddd0 !important;
            border-top: 2px solid var(--accent) !important;
            border-radius: 2px !important;
            box-shadow: 0 1px 3px rgba(60,50,30,0.06) !important;
        }

        /* Section labels — small caps, letter-spaced, sans-serif (report style) */
        #quant-symbol-label, .ladder-header, #comparison-table th, #watchlist-table th {
            font-family: var(--rd-sans) !important;
            text-transform: uppercase !important;
            letter-spacing: 0.9px !important;
            font-size: 10.5px !important;
            font-weight: 600 !important;
        }

        /* Tab bar → report section tabs */
        #tab-bar {
            border-bottom: 1px solid var(--rd-hair-soft);
            padding-bottom: 0;
            gap: 2px !important;
        }
        .tab-btn {
            font-family: var(--rd-sans) !important;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            border: none !important;
            border-radius: 0 !important;
            background: transparent !important;
            padding: 8px 14px !important;
            position: relative;
            transition: color 0.2s ease;
        }
        .tab-btn:hover { background: rgba(201,151,90,0.08) !important; }
        .tab-btn.active {
            color: var(--accent) !important;
            border-bottom: 2px solid var(--accent) !important;
            font-weight: 700 !important;
        }

        /* Buttons: quieter, institutional */
        button, select, input[type="text"], input[type="number"] {
            font-family: var(--rd-mono) !important;
            border-radius: 2px !important;
        }

        /* Data tables: tighter hairlines, tabular alignment */
        #comparison-table, #watchlist-table { border-collapse: collapse !important; }
        #comparison-table td, #watchlist-table td { font-variant-numeric: tabular-nums; }

        @media (max-width: 900px) {
            #rd-masthead { flex-direction: column; align-items: flex-start; gap: 4px; }
        }
        /* ============================================================
           PER-TAB DEEP STYLING — research-report treatment applied to
           every tab (Order Book, Quant, Compare, On-Chain, News, TradFi,
           Footprint, Macro). Pure CSS, no ids/classes removed.
           ============================================================ */

        /* Every research "exhibit" card gets a numbered label + serif
           small-caps title bar, reset per tab so numbering starts at 1
           on every tab. */
        .tab-view { counter-reset: rd-exhibit; }
        .quant-cell {
            position: relative;
            padding-top: 30px !important;
        }
        .quant-cell-title {
            counter-increment: rd-exhibit;
            font-family: var(--rd-sans) !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.75;
            padding-bottom: 8px;
            margin-bottom: 10px;
            border-bottom: 1px solid var(--rd-hair);
        }
        .quant-cell-title::before {
            content: "EXHIBIT " counter(rd-exhibit) " — ";
            color: var(--accent);
            font-weight: 700;
        }

        /* Tab header bars (Quant / Compare) — report section header */
        #quant-header-bar, #compare-header-bar {
            display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
            padding-bottom: 10px; margin-bottom: 4px;
            border-bottom: 2px solid var(--accent);
            font-family: var(--rd-serif);
        }
        #quant-header-bar b, #compare-header-bar b { font-size: 16px; font-weight: 700; }

        /* Note / disclosure text — footnote style used on Compare,
           On-Chain, TradFi, Footprint, Macro tabs */
        #compare-note, #onchain-note, #tradfi-note, #footprint-note, #macro-liq-note,
        #quant-analytics-note, #eth-key-note, #fred-key-note, #event-study-legend {
            font-family: var(--rd-sans) !important;
            font-size: 11px !important;
            font-style: italic;
            opacity: 0.65;
            border-left: 2px solid var(--rd-hair);
            padding: 4px 0 4px 12px;
            margin: 6px 0 16px;
            line-height: 1.5;
        }

        /* Range / interval segmented controls (Quant range, Compare range) */
        #quant-range-buttons, #compare-range-buttons {
            display: inline-flex; border: 1px solid var(--rd-hair-soft); border-radius: 3px; overflow: hidden;
        }
        #quant-range-buttons button, #compare-range-buttons button {
            border: none !important; border-right: 1px solid var(--rd-hair-soft) !important;
            border-radius: 0 !important; background: transparent !important;
            font-family: var(--rd-sans) !important; font-size: 10.5px !important; padding: 5px 11px !important;
        }
        #quant-range-buttons button:last-child, #compare-range-buttons button:last-child { border-right: none !important; }
        #quant-range-buttons button.active, #compare-range-buttons button.active {
            background: var(--accent) !important; color: #191008 !important; font-weight: 700 !important;
        }

        /* Ledger-style rows (quant-row) — label ..... value, like a
           research figure list rather than a plain flex row */
        .quant-row {
            font-family: var(--rd-mono) !important;
            border-bottom: 1px dotted var(--rd-hair-soft) !important;
        }
        .quant-row span:first-child { font-family: var(--rd-sans) !important; font-size: 10.5px !important; letter-spacing: 0.2px; }
        .quant-row span:last-child { font-size: 12px !important; }

        /* Data tables — zebra rows, serif caption feel */
        #comparison-table, #watchlist-table, #compare-corr-table, #event-study-table, #footprint-table {
            width: 100%;
        }
        #comparison-table tbody tr:nth-child(even) td,
        #watchlist-table tbody tr:nth-child(even) td,
        #event-study-table tbody tr:nth-child(even) td {
            background: rgba(201,151,90,0.045) !important;
        }
        #comparison-table th, #watchlist-table th, #event-study-table th {
            border-bottom: 2px solid var(--accent) !important;
        }
        #event-study-table td, #event-study-table th { padding: 6px 10px !important; }

        /* Order Book tab: quant sidebar reads like a research sidebar
           ledger with a masthead-style label */
        #quant-panel b { font-family: var(--rd-serif); font-size: 13px; }
        #comparison-panel b, #ladder-panel b, #depth-panel b, #history-panel b,
        #alerts-panel b, #watchlist-panel b, #slippage-panel b, #export-panel b {
            font-family: var(--rd-serif); font-size: 13px; display: block; margin-bottom: 8px;
        }

        /* News tab — Fear & Greed gauge as an editorial pull-figure */
        #fng-current-row { display: flex; align-items: baseline; gap: 14px; }
        #fng-gauge-value { font-family: var(--rd-serif) !important; font-size: 40px !important; font-weight: 700; color: var(--accent); }
        #fng-gauge-label { font-family: var(--rd-sans) !important; text-transform: uppercase; letter-spacing: 1px; font-size: 11px; opacity: 0.7; }
        #news-list { font-family: var(--rd-sans) !important; }

        /* On-chain / TradFi / Macro: form rows (key inputs, selects)
           laid out like a filings desk toolbar */
        #eth-key-row, #fred-key-row, #derivatives-controls, #binance-tradfi-controls,
        #footprint-controls, #event-study-controls {
            display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
            padding: 8px 0 14px;
        }

        /* Footprint tab table — dense trading-desk grid */
        #footprint-table th, #footprint-table td {
            font-family: var(--rd-mono) !important; font-size: 10.5px !important;
        }

        /* versionInfo strip — quieten to a footer credit line */
        #versionInfo {
            font-family: var(--rd-sans) !important;
            font-size: 9.5px !important;
            opacity: 0.5;
            background: var(--rd-navy) !important;
            padding: 3px 8px !important;
            border-top-left-radius: 3px;
        }
        html[data-theme="light"] #versionInfo { background: var(--rd-cream-2) !important; }

        /* Macro tab: selected event-study row + terminal status line */
        #event-study-table tbody tr { cursor: pointer; }
        #event-study-table tbody tr.rd-row-active td {
            background: rgba(201,151,90,0.14) !important;
            box-shadow: inset 2px 0 0 var(--accent);
        }
        #fred-status, #event-study-status, #inflation-exp-status {
            font-family: var(--rd-mono) !important;
            letter-spacing: 0.2px;
        }
    </style>
</head>
<body>
    <div id="loading-screen">
        <img id="loading-logo-img" src="logo.png" alt="Lowcost Research">
        <div id="loading-logo">LOWCOST RESEARCH</div>
        <div id="loading-spinner"></div>
        <div id="loading-status">Initializing...</div>
        <div id="loading-bar-track"><div id="loading-bar-fill"></div></div>
    </div>
    <div id="app-content">
    <div id="rd-masthead">
        <div class="rd-title">LOWCOST<span> RESEARCH</span> &nbsp;·&nbsp; GLOBAL MARKETS DESK</div>
        <div class="rd-meta" id="rd-masthead-date"></div>
    </div>
    <script>
        (function(){
            var el = document.getElementById('rd-masthead-date');
            if (el) {
                var d = new Date();
                el.textContent = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            }
        })();
    </script>
    <div id="tab-bar">
        <button class="tab-btn active" data-tab="orderbook">Order Book</button>
        <button class="tab-btn" data-tab="quant">Quant Analytics</button>
        <button class="tab-btn" data-tab="compare">Asset Compare</button>
        <button class="tab-btn" data-tab="onchain">On-Chain &amp; Derivatives</button>
        <button class="tab-btn" data-tab="news">News &amp; Sentiment</button>
        <button class="tab-btn" data-tab="tradfi">TradFi</button>
        <button class="tab-btn" data-tab="footprint">Footprint</button>
        <button class="tab-btn" data-tab="macro">Macro Liquidity</button>
        <select id="theme-select" title="Color theme">
            <option value="dark">🌑 Dark (Gold)</option>
            <option value="midnight">🌌 Midnight Blue</option>
            <option value="matrix">🟢 Matrix Green</option>
            <option value="crimson">🔴 Crimson Red</option>
            <option value="light">☀️ Light</option>
        </select>
    </div>
    <div id="controls">
        <div id="dropdown" class="dropdown">
            <button>Exchanges</button>
            <div class="dropdown-content">
                <input type="text" id="exchange-search" placeholder="Search exchanges..." onkeyup="filterExchanges()">
                <button onclick="selectAllExchanges()">Select All</button>
                <button onclick="unselectAllExchanges()">Unselect All</button>				
                <label><input type="checkbox" class="exchange" value="Ascendex"> Ascendex</label>
                <label><input type="checkbox" class="exchange" value="Azbit"> Azbit</label>
                <label><input type="checkbox" class="exchange" value="Bequant"> Bequant</label>
                <label><input type="checkbox" class="exchange" value="BigOne"> BigOne</label>
                <label><input type="checkbox" class="exchange" value="Binance"> Binance</label>
                <label><input type="checkbox" class="exchange" value="BinanceUS"> BinanceUS</label>
                <label><input type="checkbox" class="exchange" value="Bitbns"> Bitbns</label>
                <label><input type="checkbox" class="exchange" value="Bitdelta"> Bitdelta</label>
                <label><input type="checkbox" class="exchange" value="Bitfinex"> Bitfinex</label>
                <label><input type="checkbox" class="exchange" value="Bitget"> Bitget</label>
                <label><input type="checkbox" class="exchange" value="Bitmart"> Bitmart</label>
                <label><input type="checkbox" class="exchange" value="Bitso"> Bitso</label>
                <label><input type="checkbox" class="exchange" value="Bitstamp"> Bitstamp</label>
                <label><input type="checkbox" class="exchange" value="Bybit"> Bybit</label>
                <label><input type="checkbox" class="exchange" value="Coinbase"> Coinbase</label>
                <label><input type="checkbox" class="exchange" value="Coinex"> Coinex</label>
                <label><input type="checkbox" class="exchange" value="Digifinex"> Digifinex</label>
                <label><input type="checkbox" class="exchange" value="Exmo"> Exmo</label>
                <label><input type="checkbox" class="exchange" value="Fmfw"> Fmfw</label>
                <label><input type="checkbox" class="exchange" value="Gateio"> Gateio</label>
                <label><input type="checkbox" class="exchange" value="Hitbtc"> Hitbtc</label>
                <label><input type="checkbox" class="exchange" value="Huobi"> Huobi</label>
                <label><input type="checkbox" class="exchange" value="Kraken"> Kraken</label>
                <label><input type="checkbox" class="exchange" value="Kucoin"> Kucoin</label>
                <label><input type="checkbox" class="exchange" value="MEXC"> MEXC</label>
				<label><input type="checkbox" class="exchange" value="Poloniex"> Poloniex</label>
				<label><input type="checkbox" class="exchange" value="Probit"> Probit</label>
				<label><input type="checkbox" class="exchange" value="Wazirx"> Wazirx</label>
				<label><input type="checkbox" class="exchange" value="Whitebit"> Whitebit</label>
				<label><input type="checkbox" class="exchange" value="Websea"> Websea</label>				
            </div>
        </div>
        <div id="symbol-dropdown" class="symbol-dropdown">
            <button>Symbols</button>
            <div class="symbol-dropdown-content">
                <input type="text" id="symbol-search" placeholder="Search symbols..." onkeyup="filterSymbols()">
            </div>
        </div>
        <button id="fetch-data">Fetch Data</button>
        <div id="auto-refresh-container">
            <input type="checkbox" id="auto-refresh">
            <label for="auto-refresh">Auto Refresh</label>
            <select id="auto-refresh-interval" title="Auto refresh interval">
                <option value="3000">3s</option>
                <option value="5000">5s</option>
                <option value="10000" selected>10s</option>
                <option value="30000">30s</option>
            </select>
        </div>
        <div id="binance-ws-container">
            <input type="checkbox" id="binance-ws-toggle">
            <label for="binance-ws-toggle" title="Streams Binance's order book live via WebSocket (~100ms updates) instead of REST polling">Binance Live (WS)</label>
            <span id="binance-ws-status"></span>
        </div>
        <div id="watchlist-ws-container">
            <input type="checkbox" id="watchlist-ws-toggle">
            <label for="watchlist-ws-toggle" title="Streams live prices for every symbol in your Watchlist via Binance WebSocket, feeding Asset Compare automatically (no manual refresh needed)">Watchlist Live (WS)</label>
            <span id="watchlist-ws-status"></span>
        </div>
		<div id="add-symbol-container">
			<input type="text" id="add-symbol-input" placeholder="Enter symbol...">
			<button id="add-symbol-button">Add Symbol</button>
		</div>		
        <button id="destroyChartButton" title="Delete chart and create new one if you encounter any errors" style="color: red;">X</button>
        <div id="config-container">
            <button id="save-config-btn" title="Save current exchanges, symbol, slice size to browser">Save Config</button>
            <button id="load-config-btn" title="Load previously saved config">Load Config</button>
            <button id="export-config-btn" title="Export config as JSON file">Export</button>
            <button id="import-config-btn" title="Import config from JSON file">Import</button>
            <input type="file" id="import-config-input" accept="application/json" style="display:none;">
        </div>
    </div>
    <div>
        <div id="zoom-container">
            <button id="zoom-in">+</button>
            <button id="zoom-out">-</button>
            <select id="slice-size">
                <option value="1">Top 1</option>
                <option value="2">Top 2</option>
                <option value="3">Top 3</option>
                <option value="4">Top 4</option>
                <option value="5">Top 5</option>
                <option value="10">Top 10</option>
                <option value="15">Top 15</option>
                <option value="25">Top 25</option>
                <option value="30">Top 30</option>
                <option value="50">Top 50</option>
                <option value="100">Top 100</option>
            </select>            
            <div id="total-info">Asks: 0.00% Bids: 0.00%</div>    
        </div>  
    </div>  
    <div id="view-orderbook" class="tab-view active">
    <div id="main-dashboard">
        <div id="chart-col">
            <div id="orderbookchart"></div>
        </div>

        <div id="side-col">
            <div id="quant-panel">
                <b>Quant Signals</b> — <span id="quant-symbol-label">-</span>
                <div class="quant-row"><span>Mid Price</span><span id="quant-mid">-</span></div>
                <div class="quant-row"><span>Microprice</span><span id="quant-microprice">-</span></div>
                <div class="quant-row"><span>Spread Z-score</span><span id="quant-zscore">-</span></div>
                <div class="quant-row"><span>Realized Vol (ann.)</span><span id="quant-vol">-</span></div>
                <div class="quant-row"><span>Order Flow Imbalance Δ</span><span id="quant-ofi">-</span></div>
                <div id="quant-note">Signals build up accuracy after a few fetches.</div>
            </div>

            <div id="alerts-panel">
                <b>Price Alerts</b>
                <select id="alert-condition">
                    <option value="above">Best Ask &le;</option>
                    <option value="below">Best Bid &ge;</option>
                    <option value="arbitrage">Arbitrage spread &ge; (%)</option>
                    <option value="lowvolume">Top-N total volume &le;</option>
                </select>
                <input type="number" id="alert-price" placeholder="Price / % / Qty" step="any" style="width:120px;">
                <button id="add-alert-btn">Add Alert</button>
                <ul id="alert-list"></ul>
            </div>

            <div id="watchlist-panel">
                <b>Multi-Symbol Watchlist</b> (uses currently selected exchanges)
                <input type="text" id="watch-symbol-input" placeholder="e.g. ETHUSDT">
                <button id="watch-add-btn">Add to Watchlist</button>
                <button id="watch-refresh-btn">Refresh Watchlist</button>
                <div id="watchlist-table-scroll">
                    <table id="watchlist-table">
                        <thead><tr><th>Symbol</th><th>Best Bid</th><th>Best Ask</th><th>Spread %</th><th></th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>

            <div id="slippage-panel">
                <b>Slippage Calculator</b>
                <select id="slippage-side">
                    <option value="buy">Buy (hits Asks)</option>
                    <option value="sell">Sell (hits Bids)</option>
                </select>
                <input type="number" id="slippage-qty" placeholder="Quantity" step="any" style="width:100px;">
                <button id="slippage-calc-btn">Calculate</button>
                <div id="slippage-result"></div>
            </div>

            <div id="export-panel">
                <b>Export / Research Log</b>
                <button id="export-csv-btn">Export Current Snapshot (CSV)</button>
                <button id="export-json-btn">Export Current Snapshot (JSON)</button>
                <label><input type="checkbox" id="log-record-toggle"> Log every fetch to memory</label>
                <button id="export-log-btn">Download Log (JSON)</button>
                <span id="log-count">0 entries logged</span>
            </div>
        </div>
    </div>

    <div id="comparison-panel">
        <b>Exchange Price Comparison</b>
        <table id="comparison-table">
            <thead>
                <tr><th>Exchange</th><th>Best Bid</th><th>Best Ask</th><th>Spread</th><th>Spread %</th><th>Bid VWAP</th><th>Ask VWAP</th><th>Imbalance</th></tr>
            </thead>
            <tbody></tbody>
        </table>
        <div id="arbitrage-info"></div>
        <div id="agg-imbalance-container">
            <span>Aggregate Imbalance (Bids vs Asks):</span>
            <div id="agg-imbalance-bar"><div id="agg-imbalance-fill"></div></div>
            <span id="agg-imbalance-label">0% / 0%</span>
        </div>
    </div>

    <div id="dashboard-grid">
        <div id="dashboard-left-col">
            <div id="depth-panel">
                <b>Cumulative Depth Chart</b>
                <div id="depthchart"></div>
            </div>

            <div id="history-panel">
                <b>Spread History</b>
                <label><input type="checkbox" id="history-record-toggle"> Record snapshots on each fetch</label>
                <div id="spreadhistorychart"></div>
            </div>
        </div>

        <div id="ladder-panel">
            <b>Order Book Heatmap (Price Ladder)</b>
            <div id="ladder-container"></div>
        </div>
    </div>
    </div>

    <div id="view-quant" class="tab-view">
        <div id="quant-header-bar">
            <b>Quant Analytics — <span id="quant-analytics-symbol">-</span></b>
            <div id="quant-range-buttons">
                <button data-range="15m">15m</button>
                <button data-range="1h" class="active">1h</button>
                <button data-range="4h">4h</button>
                <button data-range="1d">1D</button>
                <button data-range="all">All</button>
            </div>
        </div>
        <div id="quant-analytics-note">Each fetch on the Order Book tab saves a data point to this browser (per symbol, persists across reloads — up to 5000 points). Use the range buttons above to inspect a specific research window instead of only the live edge.</div>

        <div id="quant-quad-grid">
            <div class="quant-cell">
                <div class="quant-cell-title">Mid Price</div>
                <div id="qa-chart-mid" class="quant-cell-chart"></div>
            </div>
            <div class="quant-cell">
                <div class="quant-cell-title">Cumulative Order Flow Imbalance</div>
                <div id="qa-chart-ofi" class="quant-cell-chart"></div>
            </div>
            <div class="quant-cell">
                <div class="quant-cell-title">Spread Z-score</div>
                <div id="qa-chart-zscore" class="quant-cell-chart"></div>
            </div>
            <div class="quant-cell">
                <div class="quant-cell-title">Current Signals</div>
                <div class="quant-cell-watermark">Lowcost Research</div>
                <div id="quant-analytics-stat-panel">
                    <div class="quant-row"><span>Mid Price</span><span id="qa-mid">-</span></div>
                    <div class="quant-row"><span>Microprice</span><span id="qa-microprice">-</span></div>
                    <div class="quant-row"><span>Spread Z-score</span><span id="qa-zscore">-</span></div>
                    <div class="quant-row"><span>Realized Vol (ann.)</span><span id="qa-vol">-</span></div>
                    <div class="quant-row"><span>Cumulative OFI</span><span id="qa-cofi">-</span></div>
                    <div class="quant-row"><span>Data Points Collected</span><span id="qa-points">0</span></div>
                </div>
            </div>
        </div>

        <div id="indicators-header">
            <b>Technical Indicators — <span id="indicators-symbol-label">-</span></b>
            <span id="indicators-status"></span>
        </div>
        <div id="indicators-grid">
            <div class="quant-cell">
                <div class="quant-cell-title">Price + Bollinger Bands (20, 2σ)</div>
                <div id="ind-bb-chart" class="quant-cell-chart"></div>
            </div>
            <div class="quant-cell">
                <div class="quant-cell-title">RSI (14)</div>
                <div id="ind-rsi-chart" class="quant-cell-chart"></div>
            </div>
            <div class="quant-cell">
                <div class="quant-cell-title">MACD (12, 26, 9)</div>
                <div id="ind-macd-chart" class="quant-cell-chart"></div>
            </div>
        </div>
    </div>

    <div id="view-compare" class="tab-view">
        <div id="compare-header-bar">
            <b>Asset Compare</b>
            <div id="compare-symbol-list"></div>
            <button id="compare-refresh-btn">Refresh Comparison</button>
            <div id="compare-range-buttons">
                <button data-range="15m">15m</button>
                <button data-range="1h" class="active">1h</button>
                <button data-range="4h">4h</button>
                <button data-range="1d">1D</button>
                <button data-range="all">All</button>
            </div>
        </div>
        <div id="compare-note">Historical prices are pulled directly from Binance's kline (candlestick) API for the selected range — instant, no need to wait or run a live feed first. Only symbols that are valid Binance pairs will have data.</div>

        <div id="compare-grid">
            <div class="quant-cell" id="compare-perf-cell">
                <div class="quant-cell-title">Relative Performance (rebased to 100)</div>
                <div id="compare-perf-chart" class="quant-cell-chart"></div>
            </div>
            <div class="quant-cell" id="compare-vol-cell">
                <div class="quant-cell-title">Volatility Comparison (annualized)</div>
                <div id="compare-vol-chart" class="quant-cell-chart"></div>
            </div>
        </div>

        <div id="compare-corr-panel">
            <b>Return Correlation Matrix</b>
            <div id="compare-corr-table-wrap">
                <table id="compare-corr-table"><tbody></tbody></table>
            </div>
        </div>
    </div>

    <div id="view-onchain" class="tab-view">
        <div id="onchain-note">Real, free public data — no mock numbers. Derivatives come from Binance Futures (no key needed). BTC network stats come from mempool.space (no key needed). ETH stats need your own free Etherscan API key (saved only in this browser).</div>

        <div id="derivatives-panel" class="quant-cell">
            <div class="quant-cell-title">Derivatives — Binance Futures</div>
            <div id="derivatives-controls">
                <select id="derivatives-symbol">
                    <option value="BTCUSDT">BTCUSDT</option>
                    <option value="ETHUSDT">ETHUSDT</option>
                    <option value="SOLUSDT">SOLUSDT</option>
                    <option value="BNBUSDT">BNBUSDT</option>
                    <option value="XRPUSDT">XRPUSDT</option>
                    <option value="DOGEUSDT">DOGEUSDT</option>
                </select>
                <button id="derivatives-refresh-btn">Refresh</button>
                <span id="derivatives-status"></span>
            </div>
            <div id="derivatives-stats">
                <div class="quant-row"><span>Mark Price</span><span id="deriv-mark">-</span></div>
                <div class="quant-row"><span>Current Funding Rate</span><span id="deriv-funding">-</span></div>
                <div class="quant-row"><span>Next Funding Time</span><span id="deriv-next-funding">-</span></div>
                <div class="quant-row"><span>Open Interest (contracts)</span><span id="deriv-oi">-</span></div>
                <div class="quant-row"><span>Top Traders Long/Short Ratio</span><span id="deriv-ls-ratio">-</span></div>
            </div>
            <div id="derivatives-funding-chart" class="quant-cell-chart"></div>
        </div>

        <div id="onchain-grid">
            <div id="btc-network-panel" class="quant-cell">
                <div class="quant-cell-title">BTC Network Stats — mempool.space</div>
                <button id="btc-network-refresh-btn">Refresh</button>
                <span id="btc-network-status"></span>
                <div class="quant-row"><span>Block Height</span><span id="btc-height">-</span></div>
                <div class="quant-row"><span>Mempool Tx Count</span><span id="btc-mempool-count">-</span></div>
                <div class="quant-row"><span>Mempool Total Fees (BTC)</span><span id="btc-mempool-fees">-</span></div>
                <div class="quant-row"><span>Estimated Hashrate (EH/s)</span><span id="btc-hashrate">-</span></div>
                <div class="quant-row"><span>Next Difficulty Adjustment</span><span id="btc-diff-adj">-</span></div>
            </div>

            <div id="eth-network-panel" class="quant-cell">
                <div class="quant-cell-title">ETH Network Stats — Etherscan</div>
                <div id="eth-key-row">
                    <input type="text" id="eth-api-key-input" placeholder="Your free Etherscan API key">
                    <button id="eth-key-save-btn">Save Key</button>
                    <button id="eth-network-refresh-btn">Refresh</button>
                    <span id="eth-network-status"></span>
                </div>
                <div class="quant-row"><span>Total ETH Supply</span><span id="eth-supply">-</span></div>
                <div class="quant-row"><span>Gas Price — Safe / Propose / Fast (Gwei)</span><span id="eth-gas">-</span></div>
                <div class="quant-row"><span>Latest Block Number</span><span id="eth-block">-</span></div>
                <div id="eth-key-note">Get a free key at <a href="https://etherscan.io/apis" target="_blank" rel="noopener">etherscan.io/apis</a> — stored only in your browser's localStorage, never sent anywhere else.</div>
            </div>
        </div>
    </div>

    <div id="view-news" class="tab-view">
        <div id="fng-panel" class="quant-cell">
            <div class="quant-cell-title">Fear &amp; Greed Index — alternative.me</div>
            <div id="fng-current-row">
                <div id="fng-gauge-value">-</div>
                <div id="fng-gauge-label">-</div>
                <button id="fng-refresh-btn">Refresh</button>
                <span id="fng-status"></span>
            </div>
            <div id="fng-bar"><div id="fng-bar-fill"></div><div id="fng-bar-pointer"></div></div>
            <div id="fng-scale-labels">
                <span>Extreme Fear</span><span>Fear</span><span>Neutral</span><span>Greed</span><span>Extreme Greed</span>
            </div>
            <div id="fng-history-chart" class="quant-cell-chart"></div>
        </div>

        <div id="news-panel" class="quant-cell">
            <div class="quant-cell-title">Latest Crypto News — CryptoCompare</div>
            <div id="news-controls">
                <button id="news-refresh-btn">Refresh</button>
                <span id="news-status"></span>
            </div>
            <div id="news-list"></div>
        </div>
    </div>

    <div id="view-tradfi" class="tab-view">
        <div id="tradfi-note">Commodities/FX perpetuals — real prices, no Yahoo Finance. Left panel: Binance's own TradFi perpetuals (fapi.binance.com). Right panel: trade[xyz], a HIP-3 market deployed on Hyperliquid (api.hyperliquid.xyz) offering commodities, FX, and equity perps.</div>

        <div id="tradfi-grid">
            <div id="binance-tradfi-panel" class="quant-cell">
                <div class="quant-cell-title">Binance TradFi Perpetuals</div>
                <div id="binance-tradfi-controls">
                    <select id="binance-tradfi-symbol">
                        <option value="XAUUSDT">Gold — XAUUSDT</option>
                        <option value="XAGUSDT">Silver — XAGUSDT</option>
                        <option value="CLUSDT">WTI Crude Oil — CLUSDT</option>
                        <option value="BZUSDT">Brent Crude Oil — BZUSDT</option>
                        <option value="NATGASUSDT">Natural Gas — NATGASUSDT</option>
                    </select>
                    <label><input type="checkbox" id="btf-show-ma" checked> MA(50/200)</label>
                    <label><input type="checkbox" id="btf-show-events" checked> Event shading</label>
                    <button id="binance-tradfi-refresh-btn">Refresh</button>
                    <span id="binance-tradfi-status"></span>
                </div>
                <div id="binance-tradfi-stats">
                    <div class="quant-row"><span>Mark Price</span><span id="btf-mark">-</span></div>
                    <div class="quant-row"><span>Index Price</span><span id="btf-index">-</span></div>
                    <div class="quant-row"><span>Basis (Mark − Index)</span><span id="btf-basis">-</span></div>
                    <div class="quant-row"><span>24h Change</span><span id="btf-change">-</span></div>
                    <div class="quant-row"><span>Funding Rate</span><span id="btf-funding">-</span></div>
                    <div class="quant-row"><span>Next Funding Time</span><span id="btf-next-funding">-</span></div>
                    <div class="quant-row"><span>Open Interest</span><span id="btf-oi">-</span></div>
                </div>
                <div id="binance-tradfi-chart" class="quant-cell-chart"></div>
            </div>

            <div id="xyz-tradfi-panel" class="quant-cell">
                <div class="quant-cell-title">trade[xyz] Markets — Hyperliquid (HIP-3)</div>
                <div id="xyz-tradfi-controls">
                    <button id="xyz-tradfi-refresh-btn">Refresh</button>
                    <span id="xyz-tradfi-status"></span>
                </div>
                <div id="xyz-tradfi-table-wrap">
                    <table id="xyz-tradfi-table">
                        <thead><tr><th>Market</th><th>Mark Price</th><th>24h Change</th><th>Funding</th><th>Open Interest</th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        </div>

        <div id="btc-basket-panel" class="quant-cell">
            <div class="quant-cell-title">BTC vs Asset Basket — Binance → Hyperliquid → trade[xyz]</div>
            <div id="btc-basket-controls">
                <span>Range:</span>
                <select id="btc-basket-range">
                    <option value="30">30d</option>
                    <option value="90" selected>90d</option>
                    <option value="180">180d</option>
                    <option value="365">1y</option>
                </select>
                <input type="text" id="btc-basket-search" placeholder="Search ticker (e.g. NVDA, ETH, GOLD)" list="btc-basket-suggestions">
                <datalist id="btc-basket-suggestions"></datalist>
                <button id="btc-basket-add-btn">Add</button>
                <button id="btc-basket-refresh-btn">Refresh</button>
                <span id="btc-basket-status"></span>
            </div>
            <div id="btc-basket-ticker-list"></div>
            <div id="btc-basket-chart" class="quant-cell-chart"></div>
            <div id="btc-basket-note">Rebased to 100 at the start of the range. Each ticker is tried on Binance first (fastest/most reliable), then Hyperliquid's main perp market, then trade[xyz] (HIP-3) as a last resort for stocks/commodities not on the first two. Source used per ticker is shown in the chip below.</div>
        </div>

        <div id="tradfi-macro-header">
            <b>Macro Signals — Desk View</b>
            <button id="tradfi-macro-refresh-btn">Refresh</button>
            <span id="tradfi-macro-status"></span>
        </div>

        <div id="tradfi-macro-grid">
            <div class="quant-cell">
                <div class="quant-cell-title">Key Ratios &amp; Spreads</div>
                <div class="quant-row"><span>Gold/Silver Ratio</span><span id="macro-gsr">-</span></div>
                <div class="quant-row"><span>WTI–Brent Spread ($)</span><span id="macro-wti-brent">-</span></div>
                <div class="quant-row"><span>Gold/BTC Ratio (oz per BTC-equiv $)</span><span id="macro-gold-btc">-</span></div>
                <div id="macro-note">GSR &gt; ~80 historically flags silver cheap vs gold (mean-reversion candidate); Brent premium to WTI widens on supply-risk/transport stress.</div>
            </div>

            <div class="quant-cell">
                <div class="quant-cell-title">Cross-Asset Correlation (1h returns, last 100 candles)</div>
                <div id="macro-corr-wrap">
                    <table id="macro-corr-table"><tbody></tbody></table>
                </div>
            </div>

            <div class="quant-cell">
                <div class="quant-cell-title">Funding Rate Leaderboard (all TradFi markets)</div>
                <div id="macro-funding-wrap">
                    <table id="macro-funding-table">
                        <thead><tr><th>Market</th><th>Source</th><th>Funding Rate</th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
                <div id="macro-funding-note">Most positive = longs pay shorts (crowded long, costly to hold); most negative = shorts pay longs (crowded short / cheap to be long).</div>
            </div>
        </div>

        <div id="events-panel" class="quant-cell">
            <div class="quant-cell-title">Chart Events (shaded regions on the price chart above)</div>
            <div id="events-note">A few well-known past events are built in. Add your own (any date range + label) to mark regimes on the chart — like the "Iran war" shading in your example. Applies to the Binance TradFi price chart above.</div>
            <div id="events-builtin-list"></div>
            <div id="events-add-row">
                <input type="date" id="event-from-input">
                <input type="date" id="event-to-input">
                <input type="text" id="event-label-input" placeholder="Label (e.g. FOMC surprise hike)">
                <button id="event-add-btn">Add Event</button>
            </div>
            <div id="events-custom-list"></div>
        </div>
    </div>

    <div id="view-footprint" class="tab-view">
        <div id="footprint-note">Simplified footprint chart — real trades from Binance Futures aggTrade WebSocket, bucketed by price level per candle (buy volume left, sell volume right). Not a port of Cryexc (that's a compiled C++/WASM app, not portable code) — this is a from-scratch build using our own stack, so it's lighter: single exchange, no DOM ladder/options-flow/multi-exchange correlation.</div>

        <div id="footprint-controls">
            <input type="text" id="footprint-symbol" placeholder="BTCUSDT" value="BTCUSDT">
            <select id="footprint-interval">
                <option value="30000">30s</option>
                <option value="60000" selected>1m</option>
                <option value="300000">5m</option>
                <option value="900000">15m</option>
            </select>
            <input type="number" id="footprint-ticksize" placeholder="Tick size $" value="10" step="any">
            <button id="footprint-toggle-btn">Start Stream</button>
            <span id="footprint-status"></span>
        </div>

        <div id="footprint-candle-panel" class="quant-cell">
            <div class="quant-cell-title">Price — Binance Kline WebSocket</div>
            <div id="footprint-candle-chart" class="quant-cell-chart"></div>
        </div>

        <div id="footprint-panel" class="quant-cell">
            <div class="quant-cell-title">Footprint — <span id="footprint-symbol-label">-</span></div>
            <div id="footprint-grid-wrap">
                <table id="footprint-table"><thead></thead><tbody></tbody><tfoot></tfoot></table>
            </div>
        </div>

        <div id="cvd-panel" class="quant-cell">
            <div class="quant-cell-title">Cumulative Volume Delta (this session)</div>
            <div id="footprint-cvd-chart" class="quant-cell-chart"></div>
        </div>
    </div>

    <div id="view-macro" class="tab-view">
        <div id="macro-liq-note">Real data only, no Reuters/news scraping (not reachable client-side). FRED: your API key is tried first via a direct call (most accurate); if your browser can't reach FRED directly (CORS — common, not your key's fault), it automatically falls back to a free community proxy. Type any FRED series ID to chart it (find IDs on fred.stlouisfed.org). "Events" reuse the same list as the TradFi tab's "Chart Events" — pick a window, click a row, get a chart.</div>

        <div id="macro-liq-panel" class="quant-cell">
            <div class="quant-cell-title">Fed Liquidity &amp; Custom FRED Series</div>
            <div id="fred-key-row">
                <input type="text" id="fred-api-key-input" placeholder="Your FRED API key (optional but recommended)">
                <button id="fred-key-save-btn">Save Key</button>
                <span id="fred-key-note">Free key at <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener">fred.stlouisfed.org</a> — tried first (direct call); falls back to a community CORS proxy automatically if your browser can't reach FRED directly.</span>
            </div>
            <div id="fred-controls">
                <select id="fred-series-select">
                    <option value="WALCL">Fed Balance Sheet (Total Assets) — WALCL</option>
                    <option value="M2SL">M2 Money Supply — M2SL</option>
                    <option value="RRPONTSYD">Overnight Reverse Repo — RRPONTSYD</option>
                    <option value="SOFR">SOFR (Secured Overnight Financing Rate) — SOFR</option>
                    <option value="FEDFUNDS">Effective Fed Funds Rate — FEDFUNDS</option>
                    <option value="DGS10">10-Year Treasury Yield — DGS10</option>
                    <option value="CPIAUCSL">US CPI (All Urban Consumers) — CPIAUCSL</option>
                </select>
                <input type="text" id="fred-custom-series" placeholder="...or type any FRED series ID">
                <button id="fred-refresh-btn">Refresh</button>
                <span id="fred-status"></span>
            </div>
            <div id="fred-chart" class="quant-cell-chart"></div>
        </div>

        <div id="inflation-exp-panel" class="quant-cell">
            <div class="quant-cell-title">Long-Term Inflation Expectations — FRED</div>
            <div id="inflation-exp-controls">
                <button id="inflation-exp-refresh-btn">Load</button>
                <span id="inflation-exp-status"></span>
            </div>
            <div id="inflation-exp-chart" class="quant-cell-chart"></div>
            <div id="inflation-exp-note">5Y5Y Forward Breakeven (T5YIFR) vs University of Michigan 1-Year Inflation Expectations (MICH) — both real FRED series. (SPF from the original chart isn't in FRED and is skipped rather than faked.)</div>
        </div>

        <div id="event-study-panel" class="quant-cell">
            <div class="quant-cell-title">Event Study — click a row for a chart</div>
            <div id="event-study-controls">
                <span>Window:</span>
                <select id="event-study-window">
                    <option value="1">±1 day</option>
                    <option value="3" selected>±3 days</option>
                    <option value="7">±7 days</option>
                    <option value="14">±14 days</option>
                </select>
                <span>Asset:</span>
                <select id="event-study-asset">
                    <option value="XAUUSDT">Gold</option>
                    <option value="XAGUSDT">Silver</option>
                    <option value="CLUSDT">WTI Oil</option>
                    <option value="BZUSDT">Brent Oil</option>
                    <option value="NATGASUSDT">Natural Gas</option>
                    <option value="BTCUSDT">BTC</option>
                </select>
                <button id="event-study-refresh-btn">Load Events</button>
                <span id="event-study-status"></span>
            </div>
            <div id="event-study-table-wrap">
                <table id="event-study-table">
                    <thead><tr><th>Event</th><th>Dates</th><th>Gold</th><th>Oil (WTI)</th><th>Nat Gas</th><th>BTC</th></tr></thead>
                    <tbody></tbody>
                </table>
            </div>
            <div id="event-study-legend">% = price change from window-start to window-end (using the selected ± window above). Click any row to render a chart for it using the "Asset" dropdown. Event list is shared with the TradFi tab's "Chart Events" — add/remove events there.</div>
            <div id="event-study-chart" class="quant-cell-chart"></div>
        </div>
    </div>

	<div id="versionInfo" style="position: fixed; bottom: 0; right: 0; margin: 1px;">
		<a><a href="https://chromewebstore.google.com/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf" style="font-weight: bold; margin-right: 5px;">Install CORS browser extension to see data from all exchanges ❗❗</a></a>	
		<a href="https://github.com/NotDev1/combined-orderbook-exchanges" style="font-weight: bold; margin-right: 5px;">#1.20000000</a>
		<a href="https://t.me/msiresearch" style="font-weight: bold; margin-right: 5px;">Contacts</a>	
	</div>
    </div>
    <script src="script.js"></script>
	<script src="exchanges.js"></script>
	<script src="features.js"></script>
	<script src="research.js"></script>
	<script src="binance-ws.js"></script>
	<script src="onchain.js"></script>
	<script src="news.js"></script>
	<script src="tradfi.js"></script>
	<script src="footprint.js"></script>
	<script src="macro.js"></script>
	<script src="theme.js"></script>
	<script src="loading.js"></script>
</body>
</html>
