/* UI Page client script: drift_report (x_2160899_driftw_0) */
addLoadEvent(function () {
    var API = '/api/x_2160899_driftw_0/driftwood';
    var LABELS = { plugins: 'Plugins', applications: 'Applications', mid_servers: 'MID Servers', system_properties: 'System Properties', clone_preservers: 'Clone Preservers', clone_exclusions: 'Clone Exclusions', tables: 'Tables', columns: 'Columns', update_sets: 'Update Sets' };
    var TYPES = { changed: 'Changed', only_a: 'Only in A', only_b: 'Only in B' };
    var hideVersionOnly = false, hideCountOnly = false, checkSysIds = false;
    function sysQ() { return checkSysIds ? '&sys_ids=true' : ''; }
    /* "open" link to an item's source record on its own instance */
    function openLink(url) {
        var a = el('a', 'open', 'open \u2197');
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        a.title = 'Open the source record on that instance';
        return a;
    }
    /* rows hidden by the toggles, and how many of a counts object they remove */
    function hidden(r) { return (hideVersionOnly && r.version_only) || (hideCountOnly && r.count_only); }
    function hiddenCount(c) { return (hideVersionOnly ? (c.version_only || 0) : 0) + (hideCountOnly ? (c.count_only || 0) : 0); }
    function subNote(c) {
        var p = [];
        if (c.version_only) p.push(c.version_only + ' version-only' + (hideVersionOnly ? ' (hidden)' : ''));
        if (c.count_only) p.push(c.count_only + ' count-only' + (hideCountOnly ? ' (hidden)' : ''));
        return p.join(' · ');
    }
    function pill(r, fallbackCls, fallbackText) {
        if (r.version_only) return el('span', 'pill version_only', 'Version only');
        if (r.count_only) return el('span', 'pill version_only', 'Count only');
        if (r.kinds && r.kinds.length == 1 && r.kinds[0] == 'sys_id') return el('span', 'pill changed', 'sys_id only');
        if (r.kinds && r.kinds[0] == 'schema' && fallbackCls == 'changed') return el('span', 'pill changed', 'Schema');
        return el('span', 'pill ' + fallbackCls, fallbackText);
    }
    var mode = 'pair', matrix = null, mcat = null, mstatus = null;
    var $ = function (id) { return document.getElementById(id); };
    var instances = [], local = '', result = null, cat = null, typeFilter = null;

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
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.appendChild(document.createTextNode(String(text))); return e; }
    function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
    function status(t) { $('dr-status').textContent = t; }

    function call(method, path, body, done) {
        var x = new XMLHttpRequest();
        x.open(method, API + path, true);
        x.setRequestHeader('Accept', 'application/json');
        x.setRequestHeader('X-UserToken', window.g_ck);
        if (body != null) x.setRequestHeader('Content-Type', 'application/json');
        x.onreadystatechange = function () {
            if (x.readyState != 4) return;
            var payload = null;
            try { payload = JSON.parse(x.responseText).result; } catch (e) { payload = null; }
            done(x.status, payload);
        };
        x.send(body == null ? null : body);
    }

    function label(i) {
        return i.instance_name + '  ·  ' + (i.family || '?') + ' ' + (i.patch || '') + (i.environment ? '  ·  ' + i.environment : '') +
            (i.source == 'import' ? '  ·  imported' : (i.instance_name == local ? '  ·  this instance' : '')) + '  ·  ' + (i.last_collected || 'never') + ' UTC';
    }

    function loadInstances(keepA, keepB) {
        call('GET', '/instances', null, function (st, r) {
            if (st != 200 || !r) { status('Error ' + st + ' loading instances – check role x_2160899_driftw_0.configuration_read'); return; }
            instances = r.instances; local = r.local;
            var a = $('dr-a'), b = $('dr-b'); clear(a); clear(b);
            for (var i = 0; i < instances.length; i++) {
                a.appendChild(new Option(label(instances[i]), instances[i].sys_id));
                b.appendChild(new Option(label(instances[i]), instances[i].sys_id));
            }
            var localIdx = 0;
            for (var j = 0; j < instances.length; j++) if (instances[j].instance_name == local) localIdx = j;
            a.selectedIndex = localIdx;
            b.selectedIndex = instances.length > 1 ? (localIdx == 0 ? 1 : 0) : 0;
            if (keepA) a.value = keepA;
            if (keepB) b.value = keepB;
            renderChips();
            status(instances.length + ' instance(s) available' + (instances.length < 2 ? ' – import a snapshot to compare' : ''));
        });
    }

    function compare() {
        var a = $('dr-a').value, b = $('dr-b').value;
        if (!a || !b) return;
        if (a == b) { status('Pick two different instances'); return; }
        status('Comparing…');
        call('GET', '/compare?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b) + sysQ(), null, function (st, r) {
            if (st != 200 || !r) { status('Compare failed (' + st + ')' + (r && r.error ? ': ' + r.error : '')); return; }
            result = r; cat = null; typeFilter = null;
            $('dr-download').disabled = false;
            var s = r.summary;
            status('Compared ' + r.generated_at + ' UTC – ' + (s.changed + s.only_a + s.only_b) + ' difference(s), ' + (s.version_only || 0) + ' version-only, ' + (s.count_only || 0) + ' count-only');
            render();
        });
    }

    function render() {
        var host = $('dr-result'); clear(host);
        if (!result) return;
        var pair = el('div', 'pair');
        [['A', result.a], ['B', result.b]].forEach(function (p) {
            var d = el('div', 'side'); d.appendChild(el('b', null, p[0] + ': ' + p[1].instance_name));
            d.appendChild(el('div', 'muted', (p[1].family || '') + ' ' + (p[1].patch || '') + (p[1].environment ? ' · ' + p[1].environment : '') + ' · ' + (p[1].source || '') + ' · collected ' + (p[1].last_collected || '?') + ' UTC'));
            pair.appendChild(d);
        });
        host.appendChild(pair);

        var counts = cat ? result.categories[cat].counts : result.summary;
        var cards = el('div', 'cards');
        [['changed', 'Changed'], ['only_a', 'Only in A'], ['only_b', 'Only in B'], ['same', 'Same'], ['ignored', 'Ignored (expected)']].forEach(function (c) {
            var card = el('div', 'card ' + c[0] + (typeFilter == c[0] ? ' on' : ''));
            var shown = counts[c[0]] || 0;
            if (c[0] == 'changed') shown -= hiddenCount(counts);
            card.appendChild(el('div', 'k', c[1])); card.appendChild(el('div', 'v', shown));
            if (c[0] == 'changed' && subNote(counts)) card.appendChild(el('div', 's', subNote(counts)));
            if (TYPES[c[0]]) card.onclick = function () { typeFilter = typeFilter == c[0] ? null : c[0]; render(); };
            cards.appendChild(card);
        });
        host.appendChild(cards);

        var tabs = el('div', 'tabs');
        var all = el('div', 'tab' + (cat ? '' : ' on'), 'All categories');
        all.onclick = function () { cat = null; render(); }; tabs.appendChild(all);
        for (var k in result.categories) {
            var cc = result.categories[k].counts;
            var t = el('div', 'tab' + (cat == k ? ' on' : ''), LABELS[k] || k);
            t.appendChild(el('span', 'n', cc.changed - hiddenCount(cc) + cc.only_a + cc.only_b));
            t.setAttribute('data-cat', k);
            t.onclick = function () { cat = this.getAttribute('data-cat'); render(); };
            tabs.appendChild(t);
        }
        host.appendChild(tabs);

        var search = el('input'); search.type = 'search'; search.id = 'dr-search'; search.placeholder = 'Filter by key or name…';
        search.style.marginBottom = '8px';
        host.appendChild(search);
        if (cat && result.categories[cat].not_collected) host.appendChild(el('div', 'muted', 'Not collected on ' + result.categories[cat].not_collected.join(', ') + ' (snapshot predates this category) – nothing to compare.'));
        var tableHost = el('div'); host.appendChild(tableHost);
        var draw = function () { drawTable(tableHost, (search.value || '').toLowerCase()); };
        search.oninput = draw;
        draw();
    }

    /* Added/removed columns of `cols` relative to `refCols` (name:type:length strings). */
    function colDiff(refCols, cols) {
        var r = {}, c = {}, added = [], removed = [], i;
        for (i = 0; i < refCols.length; i++) r[refCols[i]] = true;
        for (i = 0; i < cols.length; i++) { c[cols[i]] = true; if (!r[cols[i]]) added.push(cols[i]); }
        for (i = 0; i < refCols.length; i++) if (!c[refCols[i]]) removed.push(refCols[i]);
        return { added: added, removed: removed };
    }
    function colLines(td, item, other) {
        if (!item || !other || !item.columns || !other.columns) return;
        var d = colDiff(other.columns, item.columns);
        if (d.added.length) { var l1 = el('div'); l1.appendChild(el('span', 'muted', 'columns + ')); l1.appendChild(el('span', 'diff', d.added.join(', '))); td.appendChild(l1); }
        if (d.removed.length) { var l2 = el('div'); l2.appendChild(el('span', 'muted', 'columns − ')); l2.appendChild(el('span', 'diff', d.removed.join(', '))); td.appendChild(l2); }
        if (item.columns_truncated || other.columns_truncated) td.appendChild(el('div', 'muted', '(column list truncated – large table)'));
    }

    function cell(item, fields, other) {
        var td = el('td', 'mono');
        if (!item) { td.appendChild(el('span', 'muted', '— not present')); return td; }
        var parts = [['value', item.value], ['version', item.version], ['state', item.state]];
        for (var i = 0; i < parts.length; i++) {
            if (parts[i][1] === '' || parts[i][1] == null) continue;
            var line = el('div');
            line.appendChild(el('span', 'muted', parts[i][0] + ': '));
            line.appendChild(el('span', fields.indexOf(parts[i][0]) > -1 ? 'diff' : null, parts[i][1]));
            td.appendChild(line);
        }
        for (var f = 0; f < fields.length; f++) {
            if (fields[f].indexOf('attributes.') != 0) continue;
            var ak = fields[f].substring(11), line2 = el('div');
            line2.appendChild(el('span', 'muted', ak + ': '));
            line2.appendChild(el('span', 'diff', item.attributes && item.attributes[ak] != null ? JSON.stringify(item.attributes[ak]) : '(none)'));
            td.appendChild(line2);
        }
        if (fields.indexOf('attributes.fingerprint') > -1) colLines(td, item, other);
        if (fields.indexOf('sys_id') > -1 && item.sys_id) {
            var ls = el('div'); ls.appendChild(el('span', 'muted', 'sys_id: ')); ls.appendChild(el('span', 'diff', item.sys_id)); td.appendChild(ls);
        }
        if (!td.firstChild) td.appendChild(el('span', 'muted', '(set)'));
        if (item.url) { var lo = el('div'); lo.appendChild(openLink(item.url)); td.appendChild(lo); }
        return td;
    }

    function drawTable(host, f) {
        clear(host);
        var rows = [];
        for (var k in result.categories) {
            if (cat && k != cat) continue;
            var rs = result.categories[k].rows;
            for (var i = 0; i < rs.length; i++) {
                var r = rs[i];
                if (typeFilter && r.type != typeFilter) continue;
                if (hidden(r)) continue;
                if (f && (r.key + ' ' + r.name).toLowerCase().indexOf(f) == -1) continue;
                rows.push([k, r]);
            }
        }
        if (!rows.length) { host.appendChild(el('div', 'muted', 'No differences match.')); return; }
        var table = el('table'), hr = el('tr');
        ['Difference', 'Category', 'Key', 'Name', 'A: ' + result.a.instance_name, 'B: ' + result.b.instance_name, 'Differs in'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
        var thead = el('thead'); thead.appendChild(hr); table.appendChild(thead);
        var tb = el('tbody');
        var max = Math.min(rows.length, 2000);
        for (var j = 0; j < max; j++) {
            var cr = rows[j][1], tr = el('tr');
            var t0 = el('td'); t0.appendChild(pill(cr, cr.type, TYPES[cr.type])); tr.appendChild(t0);
            tr.appendChild(el('td', null, LABELS[rows[j][0]] || rows[j][0]));
            tr.appendChild(el('td', 'mono', cr.key));
            tr.appendChild(el('td', null, cr.name));
            tr.appendChild(cell(cr.a, cr.fields, cr.b)); tr.appendChild(cell(cr.b, cr.fields, cr.a));
            tr.appendChild(el('td', 'mono', cr.fields.join(', ')));
            tb.appendChild(tr);
        }
        table.appendChild(tb); host.appendChild(table);
        if (rows.length > max) host.appendChild(el('div', 'muted', 'Showing first ' + max + ' of ' + rows.length + ' – download the result for all rows.'));
    }

    function importFiles() {
        var files = $('dr-files').files, logHost = $('dr-log');
        if (!files || !files.length) return;
        var force = $('dr-force').checked, allowLocal = $('dr-allowlocal').checked, i = 0;
        var qs = [];
        if (force) qs.push('force=true');
        if (allowLocal) qs.push('allow_local=true');
        var next = function () {
            if (i >= files.length) { loadInstances($('dr-a').value, $('dr-b').value); $('dr-files').value = ''; return; }
            var file = files[i++], reader = new FileReader();
            reader.onload = function () {
                var line = el('div', null, file.name + ': importing…'); logHost.appendChild(line);
                call('POST', '/snapshot' + (qs.length ? '?' + qs.join('&') : ''), reader.result, function (st, r) {
                    if (st == 200 && r) {
                        var t = r.totals;
                        line.className = 'ok';
                        line.textContent = file.name + ': ' + r.instance_name + ' (' + r.collected_at + ' UTC) – ' + t.inserted + ' new, ' + t.updated + ' changed, ' + t.removed + ' no longer present, ' + t.unchanged + ' unchanged' + (r.local ? ' – note: this is THIS instance' : '');
                    } else {
                        line.className = 'err';
                        line.textContent = file.name + ': failed (' + st + ')' + (r && r.error ? ' – ' + r.error : '');
                    }
                    next();
                });
            };
            reader.readAsText(file);
        };
        next();
    }

    $('dr-compare').onclick = compare;
    $('dr-hidever').onchange = function () { hideVersionOnly = this.checked; if (mode == 'all') renderMatrix(); else render(); };
    if ($('dr-hidecount')) $('dr-hidecount').onchange = function () { hideCountOnly = this.checked; if (mode == 'all') renderMatrix(); else render(); };
    // sys_id drift is computed on the server, so toggling it re-runs the comparison
    if ($('dr-sysids')) $('dr-sysids').onchange = function () {
        checkSysIds = this.checked;
        if (mode == 'all') { if (matrix) compareAll(); } else if (result) compare();
    };
    $('dr-mode-pair').onclick = function () { setMode('pair'); };
    $('dr-mode-all').onclick = function () { setMode('all'); };
    $('dr-compare-all').onclick = compareAll;
    $('dr-swap').onclick = function () { var a = $('dr-a').value; $('dr-a').value = $('dr-b').value; $('dr-b').value = a; if (result) compare(); };
    $('dr-import-toggle').onclick = function () { $('dr-import').className = $('dr-import').className.indexOf('open') > -1 ? 'panel' : 'panel open'; };
    $('dr-files').onchange = importFiles;
    $('dr-download').onclick = function () {
        if (mode == 'all') {
            if (!matrix) return;
            var mb = new Blob([JSON.stringify(matrix, null, 2)], { type: 'application/json' });
            var ma = document.createElement('a');
            ma.href = URL.createObjectURL(mb);
            ma.download = 'drift_matrix_' + matrix.instances.length + '_instances_' + matrix.generated_at.replace(/[: ]/g, '-') + '.json';
            document.body.appendChild(ma); ma.click(); document.body.removeChild(ma);
            return;
        }
        if (!result) return;
        var blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'drift_' + result.a.instance_name + '_vs_' + result.b.instance_name + '_' + result.generated_at.replace(/[: ]/g, '-') + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    /* ---------------- All instances (matrix) ---------------- */

    function setMode(m) {
        mode = m;
        $('dr-mode-pair').className = 'mode' + (m == 'pair' ? ' on' : '');
        $('dr-mode-all').className = 'mode' + (m == 'all' ? ' on' : '');
        $('dr-pairbar').style.display = m == 'pair' ? '' : 'none';
        $('dr-allbar').style.display = m == 'all' ? '' : 'none';
        $('dr-download').disabled = !(m == 'all' ? matrix : result);
        if (m == 'all') renderMatrix(); else render();
    }

    function renderChips() {
        var host = $('dr-insts'); clear(host);
        for (var i = 0; i < instances.length; i++) {
            var it = instances[i], lab = el('label', 'chip' + (it.is_local ? ' local' : ''));
            var cb = el('input'); cb.type = 'checkbox'; cb.value = it.sys_id; cb.checked = true; cb.id = 'dr-inst-' + i;
            if (it.is_local) { cb.disabled = true; cb.title = 'The current instance is always shown (baseline)'; }
            lab.appendChild(cb);
            lab.appendChild(document.createTextNode(' ' + it.instance_name + (it.is_local ? ' (this instance)' : '') + (it.environment ? ' · ' + it.environment : '')));
            host.appendChild(lab);
        }
    }

    function compareAll() {
        var ids = [], boxes = $('dr-insts').getElementsByTagName('input');
        for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) ids.push(boxes[i].value);
        if (ids.length < 2) { status('Select at least one instance besides this one'); return; }
        status('Comparing ' + ids.length + ' instances…');
        call('GET', '/matrix?instances=' + encodeURIComponent(ids.join(',')) + sysQ(), null, function (st, r) {
            if (st != 200 || !r) { status('Compare failed (' + st + ')' + (r && r.error ? ': ' + r.error : '')); return; }
            matrix = r; mcat = null; mstatus = null;
            $('dr-download').disabled = false;
            var s = r.summary;
            status('Compared ' + r.instances.length + ' instances at ' + r.generated_at + ' UTC – ' + (s.differs + s.partial) + ' row(s) differ, ' + s.version_only + ' version-only, ' + (s.count_only || 0) + ' count-only');
            renderMatrix();
        });
    }

    function renderMatrix() {
        var host = $('dr-result'); clear(host);
        if (!matrix) return;
        var counts = mcat ? matrix.categories[mcat].counts : matrix.summary;
        var cards = el('div', 'cards');
        [['differs', 'Differs'], ['partial', 'Missing somewhere'], ['same', 'Same everywhere'], ['ignored', 'Ignored (expected)']].forEach(function (c) {
            var card = el('div', 'card ' + (c[0] == 'differs' ? 'changed' : c[0] == 'partial' ? 'only_a' : c[0]) + (mstatus == c[0] ? ' on' : ''));
            var shown = counts[c[0]] || 0;
            if (c[0] == 'differs') shown -= hiddenCount(counts);
            card.appendChild(el('div', 'k', c[1])); card.appendChild(el('div', 'v', shown));
            if (c[0] == 'differs' && subNote(counts)) card.appendChild(el('div', 's', subNote(counts)));
            if (c[0] == 'differs' || c[0] == 'partial') card.onclick = function () { mstatus = mstatus == c[0] ? null : c[0]; renderMatrix(); };
            cards.appendChild(card);
        });
        host.appendChild(cards);

        var per = el('div', 'per');
        for (var p = 1; p < matrix.per_instance.length; p++) {
            var pi = matrix.per_instance[p], box = el('div');
            box.appendChild(el('b', null, pi.instance_name));
            box.appendChild(document.createTextNode(' vs ' + matrix.baseline + ': ' + pi.changed + ' changed · ' + pi.missing + ' missing · ' + pi.extra + ' extra'));
            per.appendChild(box);
        }
        host.appendChild(per);

        var tabs = el('div', 'tabs');
        var all = el('div', 'tab' + (mcat ? '' : ' on'), 'All categories');
        all.onclick = function () { mcat = null; renderMatrix(); }; tabs.appendChild(all);
        for (var k in matrix.categories) {
            var cc = matrix.categories[k].counts;
            var t = el('div', 'tab' + (mcat == k ? ' on' : ''), LABELS[k] || k);
            t.appendChild(el('span', 'n', cc.differs - hiddenCount(cc) + cc.partial));
            t.setAttribute('data-cat', k);
            t.onclick = function () { mcat = this.getAttribute('data-cat'); renderMatrix(); };
            tabs.appendChild(t);
        }
        host.appendChild(tabs);

        var search = el('input'); search.type = 'search'; search.id = 'dr-msearch'; search.placeholder = 'Filter by key or name…';
        search.style.marginBottom = '8px';
        host.appendChild(search);
        if (mcat && matrix.categories[mcat].not_collected) host.appendChild(el('div', 'muted', 'Not collected on ' + matrix.categories[mcat].not_collected.join(', ') + ' (snapshot predates this category) – shown as "not collected".'));
        var tableHost = el('div', 'mx'); host.appendChild(tableHost);
        var draw = function () { drawMatrix(tableHost, (search.value || '').toLowerCase()); };
        search.oninput = draw;
        draw();
    }

    function mcell(cell, row, isRef) {
        var td = el('td', 'mono');
        if (cell && cell.not_collected) { td.appendChild(el('span', 'muted', 'not collected')); td.title = 'This instance\'s snapshot predates this category'; return td; }
        if (!cell) { td.className = 'mono miss'; td.appendChild(document.createTextNode('— missing')); return td; }
        if (cell.diff && cell.diff.length) td.className = 'mono dcell';
        var show = row.fields.length ? row.fields : [cell.version ? 'version' : (cell.value ? 'value' : 'state')];
        for (var i = 0; i < show.length; i++) {
            var f = show[i], v;
            if (f.indexOf('attributes.') == 0) { var ak = f.substring(11); v = cell.attributes && cell.attributes[ak] != null ? JSON.stringify(cell.attributes[ak]) : '(none)'; }
            else if (f == 'secure_value') v = '(secret)';
            else v = cell[f];
            var line = el('div');
            if (show.length > 1) line.appendChild(el('span', 'muted', f.replace('attributes.', '') + ': '));
            line.appendChild(el('span', cell.diff && cell.diff.indexOf(f) > -1 ? 'diff' : null, v === '' || v == null ? '(empty)' : v));
            td.appendChild(line);
        }
        if (cell.diff && cell.diff.indexOf('attributes.fingerprint') > -1) colLines(td, cell, row.cells[row.reference]);
        if (cell.url) { var lo = el('div'); lo.appendChild(openLink(cell.url)); td.appendChild(lo); }
        if (isRef && !row.cells[0]) td.title = 'Reference column for this row (not on the baseline)';
        return td;
    }

    function drawMatrix(host, f) {
        clear(host);
        var rows = [];
        for (var k in matrix.categories) {
            if (mcat && k != mcat) continue;
            var rs = matrix.categories[k].rows;
            for (var i = 0; i < rs.length; i++) {
                var r = rs[i];
                if (mstatus && r.status != mstatus) continue;
                if (hidden(r)) continue;
                if (f && (r.key + ' ' + r.name).toLowerCase().indexOf(f) == -1) continue;
                rows.push([k, r]);
            }
        }
        if (!rows.length) { host.appendChild(el('div', 'muted', 'No differences match.')); return; }
        var table = el('table'), thead = el('thead'), hr = el('tr');
        var h1 = el('th', 'k1', 'Item'); hr.appendChild(h1);
        for (var c = 0; c < matrix.instances.length; c++) {
            var inst = matrix.instances[c], th = el('th', c == 0 ? 'k2' : null, inst.instance_name + (c == 0 ? ' (baseline)' : ''));
            th.appendChild(el('div', 'hsub', (inst.family || '') + ' ' + (inst.patch || '') + (inst.environment ? ' · ' + inst.environment : '') + (inst.source == 'import' ? ' · imported ' + (inst.last_collected || '').substring(0, 10) : '')));
            hr.appendChild(th);
        }
        thead.appendChild(hr); table.appendChild(thead);
        var tb = el('tbody'), max = Math.min(rows.length, 2000);
        for (var j = 0; j < max; j++) {
            var row = rows[j][1], tr = el('tr');
            var kc = el('td', 'k1');
            kc.appendChild(el('div', 'mono', row.key));
            var sub = el('div', 'muted', (LABELS[rows[j][0]] || rows[j][0]) + (row.name && row.name != row.key ? ' · ' + row.name : ''));
            kc.appendChild(sub);
            kc.appendChild(row.status == 'partial' ? el('span', 'pill only_a', 'Missing somewhere') : pill(row, 'changed', 'Differs'));
            tr.appendChild(kc);
            for (var x = 0; x < row.cells.length; x++) {
                var td = mcell(row.cells[x], row, x == row.reference);
                if (x == 0) td.className += ' k2';
                tr.appendChild(td);
            }
            tb.appendChild(tr);
        }
        table.appendChild(tb); host.appendChild(table);
        if (rows.length > max) host.appendChild(el('div', 'muted', 'Showing first ' + max + ' of ' + rows.length + ' – download the result for all rows.'));
    }

    initTheme('drift', 'dr-theme');
    loadInstances();
});
