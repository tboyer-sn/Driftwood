// ES3 strict check: parse as ES3, then walk an ES5 parse for reserved words used as
// property keys or dotted member names (legal in ES5, a compile error in Rhino ES level 0).
const acorn = require('acorn'), walk = require('acorn-walk'), fs = require('fs');
const RES = new Set(('break case catch continue default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with ' +
  'abstract boolean byte char class const debugger double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile ' +
  'null true false').split(' '));
let bad = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8'); const probs = [];
  try { acorn.parse(src, { ecmaVersion: 3, allowReturnOutsideFunction: true }); } catch (e) { probs.push('ES3 parse: ' + e.message); }
  try {
    const ast = acorn.parse(src, { ecmaVersion: 5, locations: true, allowReturnOutsideFunction: true });
    walk.full(ast, n => {
      if (n.type === 'Property' && !n.computed && n.key.type === 'Identifier' && RES.has(n.key.name)) probs.push(`line ${n.key.loc.start.line}: reserved key "${n.key.name}"`);
      if (n.type === 'MemberExpression' && !n.computed && RES.has(n.property.name)) probs.push(`line ${n.property.loc.start.line}: reserved member ".${n.property.name}"`);
      if (n.type === 'Property' && n.kind !== 'init') probs.push(`line ${n.loc.start.line}: getter/setter`);
    });
    // trailing commas in object/array literals break old Rhino too
    walk.full(ast, n => { if ((n.type === 'ObjectExpression' && n.properties.length) || (n.type === 'ArrayExpression' && n.elements.length)) {
      const inner = src.slice(0, n.end - 1).replace(/\s+$/, ''); if (inner.endsWith(',')) probs.push(`line ${n.loc.end.line}: trailing comma`); } });
  } catch (e) { probs.push('ES5 parse: ' + e.message); }
  if (probs.length) { bad++; console.log('FAIL', f.split('/').slice(-2).join('/')); probs.forEach(p => console.log('   ', p)); }
  else console.log('OK  ', f.split('/').slice(-2).join('/'));
}
process.exit(bad ? 1 : 0);
