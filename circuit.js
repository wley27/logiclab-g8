/* Motor de circuitos combinacionales. Los valores sin resolver son null. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.LogicCircuit = factory(root.G8Logic);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (logic) {
  'use strict';
  const limits = Object.freeze({ inputs: 4, gates: 12, outputs: 4 });
  const clone = value => JSON.parse(JSON.stringify(value));
  const arity = type => type === 'NOT' ? 1 : 2;
  const bitText = bit => bit === null ? '?' : String(bit);
  function validate(data) {
    const fail = message => { throw new Error(message); };
    if (!data || data.schema !== 1 || !Array.isArray(data.inputs) || !Array.isArray(data.gates) || !Array.isArray(data.outputs)) fail('El archivo no contiene un circuito de Logic Lab válido.');
    if (!data.inputs.length || data.inputs.length > limits.inputs || data.gates.length > limits.gates || !data.outputs.length || data.outputs.length > limits.outputs) fail('El circuito admite de 1 a 4 entradas, hasta 12 compuertas y de 1 a 4 salidas.');
    const ids = new Set();
    const add = (id, pattern) => { if (typeof id !== 'string' || !pattern.test(id) || ids.has(id)) fail('Hay identificadores inválidos o repetidos.'); ids.add(id); return id; };
    const circuit = {
      schema: 1,
      inputs: data.inputs.map(input => {
        if (!input || ![0, 1].includes(input.value)) fail('Las entradas deben valer 0 o 1.');
        return { id: add(input.id, /^[A-D]$/), value: input.value };
      }),
      gates: data.gates.map(gate => {
        if (!gate || !Object.hasOwn(logic.gates, gate.type) || !Array.isArray(gate.sources) || gate.sources.length !== arity(gate.type)) fail('Hay una compuerta o un número de entradas inválido.');
        return { id: add(gate.id, /^G[1-9]\d{0,2}$/), type: gate.type, sources: gate.sources.slice() };
      }),
      outputs: []
    };
    const sources = new Set(ids);
    const source = ref => { if (ref !== null && (typeof ref !== 'string' || !sources.has(ref))) fail('Una conexión apunta a una señal inexistente.'); return ref; };
    circuit.gates.forEach(gate => gate.sources.forEach(source));
    circuit.outputs = data.outputs.map(out => {
      if (!out) fail('Hay una salida inválida.');
      return { id: add(out.id, /^S[1-4]$/), source: source(out.source) };
    });
    const nodes = new Map(circuit.gates.map(g => [g.id, g]));
    const visited = new Set(), pending = new Set();
    function visit(id) {
      if (!nodes.has(id) || visited.has(id)) return;
      if (pending.has(id)) fail('Esa conexión crea un ciclo. Conecta las compuertas hacia adelante, sin realimentación.');
      pending.add(id); nodes.get(id).sources.forEach(visit); pending.delete(id); visited.add(id);
    }
    circuit.gates.forEach(g => visit(g.id));
    return circuit;
  }

  function operation(type, a, b = null) {
    if (!Object.hasOwn(logic.gates, type) || ![0, 1, null].includes(a) || ![0, 1, null].includes(b)) throw new Error('Señal o compuerta inválida.');
    const and = a === 0 || b === 0 ? 0 : a === 1 && b === 1 ? 1 : null;
    const or = a === 1 || b === 1 ? 1 : a === 0 && b === 0 ? 0 : null;
    const invert = bit => bit === null ? null : 1 - bit;
    if (type === 'NOT') return invert(a);
    if (type === 'AND') return and;
    if (type === 'NAND') return invert(and);
    if (type === 'OR') return or;
    if (type === 'NOR') return invert(or);
    if (a === null || b === null) return null;
    return logic.output(type, a, b);
  }

  function evaluate(data) {
    const circuit = validate(data);
    const values = Object.create(null), levels = Object.create(null), order = [];
    circuit.inputs.forEach(input => { values[input.id] = input.value; levels[input.id] = 0; });
    const nodes = new Map(circuit.gates.map(g => [g.id, g]));
    function read(id) {
      if (id === null) return null;
      if (Object.hasOwn(values, id)) return values[id];
      const gate = nodes.get(id);
      const bits = gate.sources.map(read);
      values[id] = operation(gate.type, bits[0], bits[1] ?? null);
      levels[id] = 1 + Math.max(0, ...gate.sources.map(s => levels[s] || 0));
      order.push(id);
      return values[id];
    }
    circuit.gates.forEach(g => read(g.id));
    circuit.outputs.forEach(out => { values[out.id] = read(out.source); });
    const missing = circuit.gates.reduce((n, g) => n + g.sources.filter(s => s === null).length, 0) + circuit.outputs.filter(o => o.source === null).length;
    return { values, levels, order, missing, complete: missing === 0 };
  }

  function truthTable(data) {
    const circuit = validate(data);
    return Array.from({ length: 2 ** circuit.inputs.length }, (_, index) => {
      const row = clone(circuit);
      row.inputs.forEach((input, i) => { input.value = (index >> (row.inputs.length - i - 1)) & 1; });
      return { bits: row.inputs.map(i => i.value).join(''), values: evaluate(row).values };
    });
  }

  function connect(data, target, slot, source) {
    const circuit = validate(data);
    const gate = circuit.gates.find(g => g.id === target);
    const out = circuit.outputs.find(o => o.id === target);
    if (gate && Number.isInteger(slot) && slot >= 0 && slot < gate.sources.length) gate.sources[slot] = source;
    else if (out && slot === 0) out.source = source;
    else throw new Error('Selecciona una entrada válida para conectar.');
    return validate(circuit);
  }

  function remove(data, id) {
    const circuit = validate(data);
    circuit.inputs = circuit.inputs.filter(i => i.id !== id);
    circuit.gates = circuit.gates.filter(g => g.id !== id);
    circuit.outputs = circuit.outputs.filter(o => o.id !== id);
    circuit.gates.forEach(g => { g.sources = g.sources.map(s => s === id ? null : s); });
    circuit.outputs.forEach(o => { if (o.source === id) o.source = null; });
    return validate(circuit);
  }

  function layout(data) {
    const circuit = validate(data), result = evaluate(circuit);
    const columns = new Map([[0, circuit.inputs.map(i => i.id)]]);
    circuit.gates.forEach(g => { const level = result.levels[g.id]; if (!columns.has(level)) columns.set(level, []); columns.get(level).push(g.id); });
    const last = Math.max(0, ...Object.values(result.levels));
    columns.set(last + 1, circuit.outputs.map(o => o.id));
    const height = Math.max(360, ...[...columns.values()].map(ids => ids.length * 140 + 90));
    const width = Math.max(600, (last + 1) * 240 + 160);
    const positions = Object.create(null);
    columns.forEach((ids, column) => ids.forEach((id, i) => { positions[id] = { x: column === last + 1 ? width - 80 : 80 + column * 240, y: height / (ids.length + 1) * (i + 1) }; }));
    return { width, height, positions };
  }

  const examples = {
    adder: { title: 'Medio sumador', description: 'S1 suma los dos bits (XOR). S2 indica el acarreo (AND). Prueba A = 1 y B = 1: la suma binaria es 10.', circuit: { schema: 1, inputs: [{ id: 'A', value: 1 }, { id: 'B', value: 0 }], gates: [{ id: 'G1', type: 'XOR', sources: ['A', 'B'] }, { id: 'G2', type: 'AND', sources: ['A', 'B'] }], outputs: [{ id: 'S1', source: 'G1' }, { id: 'S2', source: 'G2' }] } },
    alarm: { title: 'Alarma con bloqueo', description: 'A y B representan dos sensores. C bloquea la alarma. El circuito calcula (A OR B) AND NOT C.', circuit: { schema: 1, inputs: [{ id: 'A', value: 1 }, { id: 'B', value: 0 }, { id: 'C', value: 0 }], gates: [{ id: 'G1', type: 'OR', sources: ['A', 'B'] }, { id: 'G2', type: 'NOT', sources: ['C'] }, { id: 'G3', type: 'AND', sources: ['G1', 'G2'] }], outputs: [{ id: 'S1', source: 'G3' }] } },
    mux: { title: 'Selector de señales', description: 'C elige qué señal llega a S1: con C = 0 pasa A; con C = 1 pasa B. Un multiplexor construido con cuatro compuertas.', circuit: { schema: 1, inputs: [{ id: 'A', value: 1 }, { id: 'B', value: 0 }, { id: 'C', value: 0 }], gates: [{ id: 'G1', type: 'NOT', sources: ['C'] }, { id: 'G2', type: 'AND', sources: ['A', 'G1'] }, { id: 'G3', type: 'AND', sources: ['B', 'C'] }, { id: 'G4', type: 'OR', sources: ['G2', 'G3'] }], outputs: [{ id: 'S1', source: 'G4' }] } }
  };
  function example(key = 'adder') {
    if (!Object.hasOwn(examples, key)) throw new Error('Ejemplo desconocido.');
    return clone(examples[key].circuit);
  }
  function empty() { return { schema: 1, inputs: [{ id: 'A', value: 0 }, { id: 'B', value: 0 }], gates: [], outputs: [{ id: 'S1', source: null }] }; }
  return Object.freeze({ limits, arity, bitText, validate, evaluate, operation, truthTable, connect, remove, layout, examples, example, empty, clone });
});
