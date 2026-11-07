/* UI Page client script: current_settings (x_2160899_driftw_0) */
addLoadEvent(function () {
    var BASE = '/api/x_2160899_driftw_0/driftwood';
    var API = BASE + '/current';
    var lastMsg = '';
    var LABELS = {
        plugins: 'Plugins',
        applications: 'Applications',
        mid_servers: 'MID Servers',
        system_properties: 'System Properties',
        clone_preservers: 'Clone Preservers',
        clone_exclusions: 'Clone Exclusions',
        tables: 'Tables',
        columns: 'Columns',
        update_sets: 'Update Sets'
    };
    var COLUMNS = {
        plugins: [['key', 'Plugin ID', 1], ['name', 'Name'], ['version', 'Version'], ['state', 'State', 0, 1]],
        applications: [['key', 'Scope', 1], ['name', 'Name'], ['version', 'Version'], ['attributes.source', 'Source'], ['runtime.vendor', 'Vendor'], ['state', 'State', 0, 1]],
        mid_servers: [['name', 'Name'], ['version', 'Version'], ['runtime.status', 'Status'], ['state', 'Validated', 0, 1], ['attributes.host_name', 'Host'], ['attributes.ip_address', 'IP'], ['runtime.last_refreshed', 'Last refreshed']],
        system_properties: [['key', 'Property', 1], ['value', 'Value', 1], ['attributes.type', 'Type'], ['attributes.scope', 'Scope'], ['state', 'State', 0, 1]],
        clone_preservers: [['name', 'Name'], ['attributes.table', 'Table', 1], ['value', 'Condition', 1], ['state', 'State', 0, 1]],
        clone_exclusions: [['attributes.table', 'Table', 1], ['state', 'State', 0, 1]],
        tables: [['key', 'Table', 1], ['name', 'Label'], ['attributes.scope', 'Scope', 1], ['attributes.total', 'Rows'], ['attributes.customer_scoped', 'Custom app rows'], ['attributes.customer_global', 'Global custom (est.)'], ['attributes.customer_updates', 'Customer updates'],
                 ['attributes.column_count', 'Columns'], ['attributes.parent', 'Extends', 1], ['attributes.fingerprint', 'Schema fingerprint', 1],
                 ['attributes.clone_exclusion_rules', 'Clone excl.'], ['attributes.clone_preserver_rules', 'Clone pres.'],
                 ['attributes.source', 'Tracked because'], ['state', 'State', 0, 1]],
        columns: [['attributes.table', 'Table', 1], ['key', 'Column', 1], ['name', 'Label'], ['attributes.type', 'Type', 1], ['attributes.max_length', 'Length'],
                  ['attributes.reference', 'Reference', 1], ['attributes.mandatory', 'Mandatory'], ['attributes.read_only', 'Read only'],
                  ['attributes.scope', 'Scope', 1], ['state', 'State', 0, 1]],
        update_sets: [['name', 'Update set'], ['attributes.application', 'Application', 1], ['state', 'State', 0, 1],
                      ['attributes.remote_state', 'Retrieved state'], ['attributes.update_count', 'Updates'], ['attributes.remote_update_count', 'Retrieved updates'],
                      ['attributes.preview_errors', 'Preview errors'], ['attributes.preview_unresolved', 'Unresolved'], ['attributes.parent', 'Parent'],
                      ['runtime.origin', 'Origin'], ['runtime.created_by', 'Created by'], ['runtime.updated_on', 'Updated']]
    };

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
                var t = lum(window.getComputedStyle(document.body).color);
                if (t >= 0) return t > 160;
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
    var data = null, current = null;
    var $ = function (id) { return document.getElementById(id); };

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.appendChild(document.createTextNode(String(text)));
        return e;
    }
    function get(obj, path) {
        var parts = path.split('.');
        for (var i = 0; i < parts.length; i++) { if (obj == null) return ''; obj = obj[parts[i]]; }
        return obj == null ? '' : obj;
    }
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

    function load() {
        $('cfgnow-status').textContent = 'Loading…';
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API, true);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('X-UserToken', window.g_ck);
        xhr.onreadystatechange = function () {
            if (xhr.readyState != 4) return;
            if (xhr.status != 200) {
                $('cfgnow-status').textContent = 'Error ' + xhr.status + ' – check role x_2160899_driftw_0.configuration_read';
                return;
            }
            data = JSON.parse(xhr.responseText).result;
            render();
        };
        xhr.send();
    }

    function render() {
        var inst = data.instance || {};
        $('cfgnow-sub').textContent = (inst.instance_name || '') + ' · collected ' + data.collected_at +
            ' UTC in ' + data.duration_ms + ' ms · collector ' + data.collector_version;
        $('cfgnow-status').textContent = '';

        var w = $('cfgnow-warnings'); clear(w);
        if (data.warnings && data.warnings.length) {
            var box = el('div', 'warn');
            box.appendChild(el('strong', null, data.warnings.length + ' collection warning(s)'));
            var ul = el('ul');
            for (var i = 0; i < data.warnings.length; i++) ul.appendChild(el('li', null, data.warnings[i].area + ': ' + data.warnings[i].message));
            box.appendChild(ul);
            w.appendChild(box);
        }

        var cards = $('cfgnow-cards'); clear(cards);
        var info = [
            ['Instance', inst.instance_name], ['Family', inst.family || inst.build_name], ['Patch', inst.patch],
            ['Build date', inst.build_date], ['Environment', inst.environment || 'Not set'], ['Prod flag (property)', inst.production_flag ? 'true' : 'false'],
            ['Nodes', inst.node_count], ['Time zone', inst.timezone], ['URL', inst.instance_url]
        ];
        for (var c = 0; c < info.length; c++) {
            var card = el('div', 'card');
            card.appendChild(el('div', 'k', info[c][0]));
            card.appendChild(el('div', 'v', info[c][1] == null || info[c][1] === '' ? '—' : info[c][1]));
            cards.appendChild(card);
        }

        var tabs = $('cfgnow-tabs'); clear(tabs);
        var first = null;
        for (var cat in data.categories) {
            if (!first) first = cat;
            var t = el('div', 'tab' + (cat == current ? ' on' : ''), LABELS[cat] || cat);
            t.appendChild(el('span', 'n', data.categories[cat].count));
            t.setAttribute('data-cat', cat);
            t.onclick = function () { current = this.getAttribute('data-cat'); render(); };
            tabs.appendChild(t);
        }
        if (!current || !data.categories[current]) { current = first; if (current) return render(); }
        renderTable();
    }

    /* Per-tab list state: sort column/direction and per-column filters (kept while switching tabs). */
    var listState = {};
    function stateFor(cat) { if (!listState[cat]) listState[cat] = { sort: -1, dir: 1, filters: {} }; return listState[cat]; }

    /**
     * Per-column filter, list-view style:
     *   text   contains (case-insensitive)     =text  equals
     *   !text  does not contain                 >n / <n  numeric compare
     *   empty  is empty                          !empty  is not empty
     */
    function matches(v, f) {
        var s = String(v === '' || v == null ? '' : v).toLowerCase();
        f = String(f).toLowerCase();
        if (f == 'empty') return s === '';
        if (f == '!empty') return s !== '';
        var c = f.charAt(0), rest = f.substring(1);
        if (c == '=') return s == rest;
        if (c == '!') return s.indexOf(rest) == -1;
        if ((c == '>' || c == '<') && rest !== '' && !isNaN(parseFloat(rest))) {
            var n = parseFloat(s);
            if (isNaN(n)) return false;
            return c == '>' ? n > parseFloat(rest) : n < parseFloat(rest);
        }
        return s.indexOf(f) > -1;
    }

    function cmp(a, b) {
        var num = /^-?\d+(\.\d+)?$/;
        if (num.test(String(a)) && num.test(String(b))) return parseFloat(a) - parseFloat(b);
        a = String(a).toLowerCase(); b = String(b).toLowerCase();
        return a < b ? -1 : (a > b ? 1 : 0);
    }

    function renderTable() {
        var host = $('cfgnow-table'); clear(host);
        if (!current) return;
        var cols = COLUMNS[current] || [['key', 'Key'], ['value', 'Value'], ['state', 'State']];
        var st = stateFor(current);
        var table = el('table'), thead = el('thead'), hr = el('tr'), fr = el('tr', 'filters');
        for (var h = 0; h < cols.length; h++) {
            var th = el('th', 'sortable', cols[h][1] + (st.sort == h ? (st.dir > 0 ? ' \u25B2' : ' \u25BC') : ''));
            th.setAttribute('data-col', h);
            th.title = 'Sort by ' + cols[h][1];
            th.onclick = function () {
                var c = parseInt(this.getAttribute('data-col'), 10);
                if (st.sort == c) st.dir = -st.dir; else { st.sort = c; st.dir = 1; }
                renderTable();
            };
            hr.appendChild(th);
            var fth = el('th'), inp = el('input');
            inp.type = 'search'; inp.className = 'colf'; inp.placeholder = 'Filter';
            inp.title = 'text = contains · =text equals · !text not · >n / <n · empty / !empty';
            inp.value = st.filters[h] || '';
            inp.setAttribute('data-col', h);
            inp.oninput = function () { st.filters[this.getAttribute('data-col')] = this.value; drawBody(); };
            fth.appendChild(inp); fr.appendChild(fth);
        }
        hr.appendChild(el('th', null, '')); fr.appendChild(el('th'));
        thead.appendChild(hr); thead.appendChild(fr); table.appendChild(thead);
        var tbody = el('tbody');
        table.appendChild(tbody); host.appendChild(table);

        function drawBody() {
            clear(tbody);
            var f = ($('cfgnow-filter').value || '').toLowerCase();
            var items = data.categories[current].items, rows = [], i, c;
            for (i = 0; i < items.length; i++) {
                var it = items[i], ok = true;
                if (f && JSON.stringify(it).toLowerCase().indexOf(f) == -1) continue;
                for (c in st.filters) if (st.filters[c] && !matches(get(it, cols[c][0]), st.filters[c])) { ok = false; break; }
                if (ok) rows.push(it);
            }
            if (st.sort > -1) {
                var path = cols[st.sort][0];
                rows.sort(function (x, y) { return st.dir * cmp(get(x, path), get(y, path)); });
            }
            for (i = 0; i < rows.length; i++) {
                var tr = el('tr');
                for (c = 0; c < cols.length; c++) {
                    var v = get(rows[i], cols[c][0]);
                    var td = el('td', cols[c][2] ? 'mono' : null);
                    if (cols[c][3]) td.appendChild(el('span', 'pill ' + v, v || '\u2014'));
                    else td.appendChild(document.createTextNode(v === '' ? '\u2014' : String(v)));
                    tr.appendChild(td);
                }
                var lk = el('td');
                if (rows[i].source_table && rows[i].source_sys_id) {
                    var a = el('a', 'open', 'open \u2197');
                    a.href = '/' + rows[i].source_table + '.do?sys_id=' + rows[i].source_sys_id; a.target = '_blank'; a.rel = 'noopener';
                    a.title = 'Open the source record';
                    lk.appendChild(a);
                }
                tr.appendChild(lk);
                tbody.appendChild(tr);
            }
            $('cfgnow-status').textContent = (lastMsg ? lastMsg + ' \u00B7 ' : '') + rows.length + ' of ' + items.length + ' shown';
        }
        drawBody();
    }

    $('cfgnow-refresh').onclick = function () { lastMsg = ''; load(); };
    $('cfgnow-collect').onclick = function () {
        var btn = this;
        btn.disabled = true;
        lastMsg = '';
        $('cfgnow-status').textContent = 'Collecting and saving…';
        var xhr = new XMLHttpRequest();
        xhr.open('POST', BASE + '/collect', true);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-UserToken', window.g_ck);
        xhr.onreadystatechange = function () {
            if (xhr.readyState != 4) return;
            btn.disabled = false;
            var r = null;
            try { r = JSON.parse(xhr.responseText).result; } catch (e) { r = null; }
            if (xhr.status == 403) { $('cfgnow-status').textContent = 'Collect now needs role x_2160899_driftw_0.configuration_admin'; return; }
            if (xhr.status != 200 || !r || !r.totals) { $('cfgnow-status').textContent = 'Collect failed (' + xhr.status + ')' + (r && r.error ? ': ' + r.error : ''); return; }
            var t = r.totals;
            lastMsg = 'Saved ' + r.collected_at + ' UTC: ' + t.inserted + ' new, ' + t.updated + ' changed, ' + t.restored + ' restored, ' +
                t.removed + ' no longer present, ' + t.unchanged + ' unchanged (' + r.duration_ms + ' ms)' + (r.warnings ? ', ' + r.warnings + ' warning(s)' : '');
            load();
        };
        xhr.send('{}');
    };
    $('cfgnow-filter').oninput = function () { if (data) renderTable(); };
    $('cfgnow-download').onclick = function () {
        if (!data) return;
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'driftwood_' + (data.instance.instance_name || 'instance') + '_' + data.collected_at.replace(/[: ]/g, '-') + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    initTheme('cfgnow', 'cfgnow-theme');
    load();
});
