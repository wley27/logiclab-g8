/* Conexiones y compuertas del mismo circuito en un único modelo tridimensional. */
(() => {
  'use strict';
  window.LogicCircuitModel = {
    build(THREE, data) {
      const C = LogicCircuit, circuit = C.validate(data), result = C.evaluate(circuit), layout = C.layout(circuit);
      const group = new THREE.Group(), scale = .34;
      const width = layout.width / 140, depth = layout.height / 140;
      const point = id => ({ x: (layout.positions[id].x - layout.width / 2) / 140, z: (layout.positions[id].y - layout.height / 2) / 140 });
      const color = bit => bit === null ? 0xe5bd81 : bit ? 0x72edb4 : 0x617688;
      const material = bit => new THREE.MeshStandardMaterial({ color: color(bit), emissive: color(bit), emissiveIntensity: bit === 1 ? .5 : .04, roughness: .5, metalness: .15 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(width, .055, depth), new THREE.MeshStandardMaterial({ color: 0x12202a, roughness: .75, metalness: .1 }));
      board.position.y = -.04; group.add(board);
      const border = new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), new THREE.LineBasicMaterial({ color: 0x41654e }));
      border.position.copy(board.position); group.add(border);
      function text(value, x, z, w = .65) {
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        ctx.font = '600 80px Arial'; canvas.width = Math.ceil(ctx.measureText(value).width) + 30; canvas.height = 120;
        ctx.font = '600 80px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#c3decf'; ctx.fillText(value, canvas.width / 2, 60);
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Mesh(new THREE.PlaneGeometry(w, .14), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        label.rotation.x = -Math.PI / 2; label.position.set(x, .012, z); group.add(label);
      }
      const inputIds = new Set(circuit.inputs.map(i => i.id));
      const sourcePoint = id => { const p = point(id); return { x: p.x + (inputIds.has(id) ? 0 : 1.43 * scale), z: p.z }; };
      const targetPoint = (id, index) => {
        const p = point(id), gate = circuit.gates.find(g => g.id === id);
        return { x: p.x - (gate ? 1.43 * scale : 0), z: p.z + (gate && gate.type !== 'NOT' ? index === 0 ? -.32 * scale : .32 * scale : 0) };
      };
      function wire(source, target, slot) {
        if (source === null) return;
        const a = sourcePoint(source), b = targetPoint(target, slot), middle = (a.x + b.x) / 2;
        const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(a.x, .13, a.z), new THREE.Vector3(middle, .13, a.z), new THREE.Vector3(middle, .13, b.z), new THREE.Vector3(b.x, .13, b.z));
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .016, 6, false), material(result.values[source]));
        group.add(mesh);
      }
      circuit.gates.forEach(gate => {
        const p = point(gate.id);
        const mini = G8Model.build(THREE, { gate: gate.type, A: gate.sources[0] === null ? null : result.values[gate.sources[0]], B: gate.sources[1] == null ? null : result.values[gate.sources[1]], S: result.values[gate.id] });
        mini.traverse(object => { if (object.userData.input) delete object.userData.input; });
        mini.scale.setScalar(scale); mini.position.set(p.x, .08, p.z); group.add(mini);
        text(`${gate.id} · ${gate.type}`, p.x, p.z + .46, .8);
        gate.sources.forEach((source, slot) => wire(source, gate.id, slot));
      });
      function led(id, input) {
        const p = point(id), bit = result.values[id];
        const base = new THREE.Mesh(new THREE.CylinderGeometry(.13, .15, .035, 20), new THREE.MeshStandardMaterial({ color: 0x2b414b }));
        base.position.set(p.x, .02, p.z); group.add(base);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(.095, 16, 10), material(bit)); lamp.position.set(p.x, .12, p.z);
        if (input) lamp.userData.input = id;
        group.add(lamp); text(`${id} = ${C.bitText(bit)}`, p.x, p.z + .28, .63);
      }
      circuit.inputs.forEach(i => led(i.id, true));
      circuit.outputs.forEach(out => { led(out.id, false); wire(out.source, out.id, 0); });
      const normalize = 4 / Math.max(width, depth); group.scale.setScalar(normalize);
      group.userData.size = { width: width * normalize, depth: depth * normalize, height: .5 * normalize };
      group.userData.logic = { kind: 'circuit', gates: circuit.gates.length, inputs: Object.fromEntries(circuit.inputs.map(i => [i.id, i.value])), outputs: Object.fromEntries(circuit.outputs.map(o => [o.id, result.values[o.id]])) };
      return group;
    }
  };
})();
