/* UI Page client script: health (x_2160899_driftw_0) */
addLoadEvent(function () {
    var API = '/api/x_2160899_driftw_0/driftwood';
    var $ = function (id) { return document.getElementById(id); };
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.appendChild(document.createTextNode(String(text))); return e; }
    function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

    /* Light/dark: follows the surrounding theme; the Theme button overrides it (remembered per browser). */
    function initTheme(rootId, btnId) {
        var KEY = 'x_2160899_driftw_0.theme';
        var root = document.getElementById(rootId), btn = document.getElementById(btnId);
        if (!root) return;
        function lum(c) {
            var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s\/]+([\d.]+))?/.exec(c || '');
            if (!m || (m[4] !== undefined && parseFloat(m[4]) == 0)) return -1;
            return 0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3];
        }
        function detect() {
            try {
                for (var n = root.parentNode; n && n.nodeType == 1; n = n.parentNode) {
                    var l = lum(window.getComputedStyle(n).backgroundColor);
                    if (l >= 0) return l < 128;
                }
                return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
            } catch (e) { return false; }
        }
        function apply(dark) {
            root.className = root.className.replace(/\s*cn-dark/g, '') + (dark ? ' cn-dark' : '');
            if (btn) btn.textContent = dark ? 'Light' : 'Dark';
        }
        var saved = null;
        try { saved = window.localStorage.getItem(KEY); } catch (e) { saved = null; }
        apply(saved ? saved == 'dark' : detect());
        if (btn) btn.onclick = function () {
            var dark = root.className.indexOf('cn-dark') == -1;
            apply(dark);
            try { window.localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (e) { /* not stored */ }
        };
    }

    var LABEL = { ok: 'Healthy', info: 'Healthy (notes)', warn: 'Needs attention', fail: 'Problem' };
    function load() {
        $('hl-overall').className = 'overall info'; $('hl-overall').textContent = 'Checking…';
        var x = new XMLHttpRequest();
        x.open('GET', API + '/health', true);
        x.setRequestHeader('Accept', 'application/json');
        x.setRequestHeader('X-UserToken', window.g_ck);
        x.onreadystatechange = function () {
            if (x.readyState != 4) return;
            var r = null;
            try { r = JSON.parse(x.responseText).result; } catch (e) { r = null; }
            if (x.status == 403) { $('hl-overall').className = 'overall fail'; $('hl-overall').textContent = 'Needs role x_2160899_driftw_0.configuration_admin'; return; }
            if (x.status != 200 || !r || !r.checks) { $('hl-overall').className = 'overall fail'; $('hl-overall').textContent = 'Health check failed (' + x.status + ')' + (r && r.error ? ': ' + r.error : ''); return; }
            render(r);
        };
        x.send(null);
    }
    function render(r) {
        $('hl-overall').className = 'overall ' + r.status;
        $('hl-overall').textContent = LABEL[r.status] || r.status;
        $('hl-meta').textContent = r.instance_name + ' · ' + r.collector_version + ' · ' + r.generated_at + ' UTC · ' + r.counts.ok + ' ok, ' + r.counts.info + ' info, ' +
            r.counts.warn + ' warn, ' + r.counts.fail + ' fail · ' + r.duration_ms + ' ms';
        var host = $('hl-result'); clear(host);
        var t = el('table'), th = el('thead'), hr = el('tr');
        ['Area', 'Check', 'Status', 'Detail'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
        th.appendChild(hr); t.appendChild(th);
        var tb = el('tbody'), order = { fail: 0, warn: 1, info: 2, ok: 3 };
        var rows = r.checks.slice().sort(function (a, b) { return (order[a.status] - order[b.status]); });
        for (var i = 0; i < rows.length; i++) {
            var c = rows[i], tr = el('tr');
            tr.appendChild(el('td', null, c.area)); tr.appendChild(el('td', null, c.name));
            var td = el('td'); td.appendChild(el('span', 'pill ' + c.status, c.status)); tr.appendChild(td);
            tr.appendChild(el('td', null, c.detail));
            tb.appendChild(tr);
        }
        t.appendChild(tb); host.appendChild(t);
    }
    $('hl-refresh').onclick = load;
    initTheme('hl', 'hl-theme');
    load();
});
