/* Datos de una clase dentro del QR: funcionan también en GitHub Pages. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./circuit.js'), require('./logic.js'));
  else root.LogicClassroom = factory(root.LogicCircuit, root.G8Logic);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, logic) {
  'use strict';
  function encode(circuit) {
    const data = C.validate(circuit);
    const packed = [1, data.inputs.map(i => [i.id, i.value]), data.gates.map(g => [g.id, logic.keys.indexOf(g.type), ...g.sources]), data.outputs.map(o => [o.id, o.source])];
    const text = JSON.stringify(packed);
    const binary = typeof btoa === 'function' ? btoa(text) : Buffer.from(text, 'ascii').toString('base64');
    return binary.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(token) {
    if (typeof token !== 'string' || token.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('El QR no contiene un circuito de clase válido.');
    try {
      const binary = token.replace(/-/g, '+').replace(/_/g, '/');
      const packed = JSON.parse(typeof atob === 'function' ? atob(binary) : Buffer.from(binary, 'base64').toString('ascii'));
      if (!Array.isArray(packed) || packed.length !== 4 || packed[0] !== 1 || !packed.slice(1).every(Array.isArray)) throw new Error();
      if (packed[1].length > 4 || packed[2].length > 12 || packed[3].length > 4) throw new Error();
      const pair = row => { if (!Array.isArray(row) || row.length !== 2) throw new Error(); return row; };
      return C.validate({
        schema: 1,
        inputs: packed[1].map(row => { const [id, value] = pair(row); return { id, value }; }),
        gates: packed[2].map(row => {
          if (!Array.isArray(row) || !Number.isInteger(row[1]) || !logic.keys[row[1]]) throw new Error();
          return { id: row[0], type: logic.keys[row[1]], sources: row.slice(2) };
        }),
        outputs: packed[3].map(row => { const [id, source] = pair(row); return { id, source }; })
      });
    } catch { throw new Error('El QR no contiene un circuito de clase válido o tiene conexiones incorrectas.'); }
  }
  function fingerprint(circuit) {
    let hash = 2166136261;
    for (const char of encode(circuit)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return hash.toString(16).toUpperCase().padStart(8, '0');
  }
  function url(circuit, base) {
    const address = new URL('index.html', base);
    address.search = '';
    address.searchParams.set('lesson', encode(circuit));
    address.searchParams.set('mode', 'ar');
    address.hash = 'circuit';
    return address.href;
  }
  function readURL(text, base) {
    if (typeof text !== 'string' || text.length > 8000) return null;
    try {
      const address = new URL(text), expected = new URL('index.html', base);
      if (!['https:', 'http:'].includes(address.protocol) || address.origin !== expected.origin || address.pathname !== expected.pathname || address.username || address.password) return null;
      const token = address.searchParams.get('lesson');
      if (!token) return null;
      const circuit = decode(token);
      return { circuit, fingerprint: fingerprint(circuit) };
    } catch { return null; }
  }
  return Object.freeze({ encode, decode, fingerprint, url, readURL });
});
