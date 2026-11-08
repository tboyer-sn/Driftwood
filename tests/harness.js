// Minimal in-memory mock of the ServiceNow server APIs used by the POC.
const vm = require('vm'), fs = require('fs'), crypto = require('crypto'), path = require('path');
let idSeq = 0; const newId = () => (++idSeq).toString(16).padStart(32, '0');

// Emulates a Rhino java.lang.String in global scope: works with concatenation,
// String() and RegExp.test, but .replace(RegExp, ...) is ambiguous and throws.
class JavaString {
  constructor(s) { this.s = s; }
  toString() { return this.s; } valueOf() { return this.s; } toJSON() { return this.s; }
  get length() { return this.s.length; }
  indexOf(x) { return this.s.indexOf(x); } substring(a, b) { return this.s.substring(a, b); }
  replace(a, b) {
    if (a instanceof RegExp || typeof a === 'function') throw new Error('The choice of Java method java.lang.String.replace matching JavaScript argument types is ambiguous');
    return this.s.split(a).join(b);
  }
}
function makeEnv(db, props, opts) {
  opts = opts || {};
  const out = [];
  class GlideRecord {
    constructor(t) { this.t = t; this.q = []; this.or = null; this.rows = null; this.i = -1; this.cur = null; this.limit = 1e9; this.ob = null; }
    isValid() { return !!db[this.t]; }
    isValidField(f) { return db[this.t].fields.includes(f) || ['sys_id', 'name'].includes(f); }
    addQuery(f, op, v) {
      if (arguments.length < 3) { v = op; op = '='; }
      const eq = r => String(r[f] ?? '') === String(v);
      if (op === 'STARTSWITH') { this.q.push(r => String(r[f] ?? '').startsWith(String(v))); return; }
      if (op === 'IN') { const set = String(v).split(','); this.q.push(r => set.includes(String(r[f] ?? ''))); return; }
      if (['>=', '<=', '>', '<'].includes(op)) {
        const c = (x) => op === '>=' ? x >= String(v) : op === '<=' ? x <= String(v) : op === '>' ? x > String(v) : x < String(v);
        this.q.push(r => c(String(r[f] ?? ''))); return;
      }
      this.q.push(op === '!=' ? (r => !eq(r)) : eq);
    }
    addEncodedQuery(eq) {
      // terms joined by ^ (AND); a term starting with OR joins the previous group
      const term = p => {
        let m;
        const val = (r, f) => String(r[f] ?? '');
        if ((m = /^([\w.]+)ISEMPTY$/.exec(p))) return r => val(r, m[1]) === '';
        if ((m = /^([\w.]+)ISNOTEMPTY$/.exec(p))) return r => val(r, m[1]) !== '';
        if ((m = /^([\w.]+)NOT IN(.*)$/.exec(p))) { const s = m[2].split(','); return r => !s.includes(val(r, m[1])); }
        if ((m = /^([\w.]+)IN(.*)$/.exec(p))) { const s = m[2].split(','); return r => s.includes(val(r, m[1])); }
        if ((m = /^([\w.]+)NOT LIKE(.*)$/.exec(p))) return r => !val(r, m[1]).includes(m[2]);
        if ((m = /^([\w.]+)LIKE(.*)$/.exec(p))) return r => val(r, m[1]).includes(m[2]);
        if ((m = /^([\w.]+)STARTSWITH(.*)$/.exec(p))) return r => val(r, m[1]).startsWith(m[2]);
        if ((m = /^([\w.]+)!=(.*)$/.exec(p))) return r => val(r, m[1]) !== m[2];
        if ((m = /^([\w.]+)=(.*)$/.exec(p))) return r => val(r, m[1]) === m[2];
        throw new Error('unsupported eq ' + p);
      };
      const groups = [];
      for (const t of eq.split('^')) {
        if (t.startsWith('OR') && groups.length) groups[groups.length - 1].push(term(t.substring(2)));
        else groups.push([term(t)]);
      }
      this.q.push(r => groups.every(g => g.some(f => f(r))));
    }
    orderBy(f) { this.ob = f; this.desc = false; } orderByDesc(f) { this.ob = f; this.desc = true; } setLimit(n) { this.limit = n; }
    query() { let r = db[this.t].rows.filter(x => this.q.every(f => f(x))); if (this.ob) { r = r.slice().sort((a, b) => String(a[this.ob]).localeCompare(String(b[this.ob]))); if (this.desc) r.reverse(); } this.rows = r.slice(0, this.limit); this.i = -1; }
    next() { this.i++; if (this.i < this.rows.length) { this.cur = this.rows[this.i]; return true; } return false; }
    get(a, b) { const r = b === undefined ? db[this.t].rows.find(x => x.sys_id === a) : db[this.t].rows.find(x => String(x[a] ?? '') === String(b)); if (r) { this.cur = r; return true; } return false; }
    getValue(f) { const v = this.cur[f]; return v === undefined || v === '' ? null : String(v); }
    getDisplayValue(f) { return this.cur[f + '$display'] || this.getValue(f); }
    getUniqueValue() { return this.cur.sys_id; }
    initialize() { this.cur = { sys_id: newId() }; this.isNew = true; }
    setValue(f, v) { if (!this.isValidField(f)) throw new Error(`${this.t}.${f} not a field`); this.cur[f] = typeof v === 'boolean' ? String(v) : String(v); }
    insert() { for (const u of (db[this.t].unique || [])) if (db[this.t].rows.some(x => x[u] !== undefined && x[u] === this.cur[u])) return null;
      db[this.t].rows.push(this.cur); db[this.t].writes = (db[this.t].writes || 0) + 1; return this.cur.sys_id; }
    update() { db[this.t].writes = (db[this.t].writes || 0) + 1; return this.cur.sys_id; }
    deleteRecord() {
      const rows = db[this.t].rows, i = rows.indexOf(this.cur); if (i > -1) rows.splice(i, 1);
      if (this.rows) { const j = this.rows.indexOf(this.cur); if (j > -1) { this.rows.splice(j, 1); if (j <= this.i) this.i--; } }
      db[this.t].deletes = (db[this.t].deletes || 0) + 1; return true;
    }
  }
  class GlideAggregate extends GlideRecord {
    addAggregate() {} groupBy(f) { (this.gb = this.gb || []).push(f); }
    query() {
      super.query(); this._done = false;
      if (this.gb) {
        const groups = new Map();
        for (const r of this.rows) { const k = JSON.stringify(this.gb.map(f => String(r[f] ?? ''))); if (!groups.has(k)) groups.set(k, { row: r, n: 0 }); groups.get(k).n++; }
        this.groups = [...groups.values()]; this.gi = -1;
      }
    }
    next() {
      if (this.gb) { this.gi++; if (this.gi < this.groups.length) { this.cur = this.groups[this.gi].row; return true; } return false; }
      if (this._done) return false; this._done = true; return true;
    }
    getAggregate() { return String(this.gb ? this.groups[this.gi].n : this.rows.length); }
  }
  const ctx = {
    GlideRecord, GlideAggregate,
    GlideDateTime: class { getValue() { return opts.javaStrings ? new JavaString('2026-10-22 12:00:00') : '2026-10-22 12:00:00'; } },
    GlideDigest: class { getSHA256Hex(s) { return crypto.createHash('sha256').update(s).digest('hex').toUpperCase(); } },
    Class: { create: () => function () { this.initialize.apply(this, arguments); } },
    gs: {
      getProperty: (n, d) => props[n] !== undefined ? (opts.javaStrings ? new JavaString(String(props[n])) : props[n]) : d,
      print: s => out.push(s), info: s => out.push(s), warn: s => out.push(s),
      hasRole: () => false
    },
    JSON, Date, Object, String, parseInt
  };
  vm.createContext(ctx);
  return { ctx, out };
}

module.exports = { makeEnv, load: (ctx, files) => files.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f })) };
