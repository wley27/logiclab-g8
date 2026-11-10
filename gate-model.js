/* Construye símbolos diferentes para cada familia, con volumen y LEDs. */
(() => {
  'use strict';
  window.G8Model = {
    build(THREE, state) {
      const group = new THREE.Group();
      const { gate, A, B } = state;
      const single = gate === 'NOT';
      const isOr = ['OR', 'NOR', 'XOR', 'XNOR'].includes(gate);
      const inverted = ['NOT', 'NAND', 'NOR', 'XNOR'].includes(gate);
      const S = Object.hasOwn(state, 'S') ? state.S : G8Logic.output(gate, A, B);
      group.userData.logic = { gate, A, B, S };
      const active = 0x72edb4, inactive = 0x617688;
      const color = bit => bit === null ? 0xe5bd81 : bit ? active : inactive;
      const bitText = bit => bit === null ? '?' : String(bit);
      const solid = (hex, glow = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: .43, metalness: .24, emissive: hex, emissiveIntensity: glow });
      const board = new THREE.Mesh(new THREE.BoxGeometry(3.65, .08, 2.05), solid(0x14232e));
      board.position.y = -.04;
      group.add(board);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), new THREE.LineBasicMaterial({ color: 0x3d6458 }));
      outline.position.copy(board.position); group.add(outline);

      function text(value, x, z, width, height = .2, y = .012, hex = '#c8d9e3') {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = '600 88px "Segoe UI", Arial, sans-serif';
        canvas.width = Math.ceil(ctx.measureText(value).width) + 40;
        ctx.font = '600 88px "Segoe UI", Arial, sans-serif'; ctx.fillStyle = hex; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, canvas.width / 2, 64);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); group.add(mesh);
      }
      text('LOGIC LAB', 0, -.86, 1.35, .16, .012, '#83a69e');
      text(G8Logic.gates[gate].expression, 0, .76, 1.5, .22, .012, '#a2c8b3');

      const shape = new THREE.Shape();
      if (single) {
        shape.moveTo(-.55, -.54); shape.lineTo(.54, 0); shape.lineTo(-.55, .54); shape.closePath();
      } else if (isOr) {
        shape.moveTo(-.64, -.54); shape.quadraticCurveTo(.09, -.54, .61, 0); shape.quadraticCurveTo(.09, .54, -.64, .54); shape.quadraticCurveTo(-.22, 0, -.64, -.54); shape.closePath();
      } else {
        shape.moveTo(-.6, -.54); shape.lineTo(0, -.54); shape.absarc(0, 0, .54, -Math.PI / 2, Math.PI / 2, false); shape.lineTo(-.6, .54); shape.closePath();
      }
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: .23, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .025, bevelThickness: .025, curveSegments: 28 });
      const body = new THREE.Mesh(geometry, solid(0x285e49, .10));
      body.rotation.x = -Math.PI / 2; body.position.y = .075; group.add(body);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color: active, transparent: true, opacity: .75 }));
      edges.rotation.copy(body.rotation); edges.position.copy(body.position); group.add(edges);
      text(gate, single ? -.19 : -.08, 0, single ? .59 : .75, .22, .335, '#e0fff0');

      function tube(points, hex, radius = .026, glow = .15) {
        const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, radius, 8, false), solid(hex, glow));
        group.add(mesh); return mesh;
      }
      if (['XOR', 'XNOR'].includes(gate)) {
        tube([[-.78, .18, -.53], [-.56, .18, 0], [-.78, .18, .53]], active, .018, .2);
      }
      const outputStart = single ? .54 : isOr ? .61 : .54;
      if (inverted) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.073, .018, 8, 24), solid(active, .2));
        ring.rotation.x = -Math.PI / 2; ring.position.set(outputStart + .10, .18, 0); group.add(ring);
      }
      const first = outputStart + (inverted ? .18 : 0);
      tube([[first, .17, 0], [1.43, .17, 0]], color(S), .027, S ? .6 : .05);

      function led(name, bit, x, z, input) {
        const mount = new THREE.Mesh(new THREE.CylinderGeometry(.135, .15, .035, 24), solid(0x273c48));
        mount.position.set(x, .035, z); group.add(mount);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(.095, 20, 12), solid(color(bit), bit ? .7 : .03));
        lamp.position.set(x, .14, z); if (input) lamp.userData.input = name; group.add(lamp);
        text(`${name} = ${bitText(bit)}`, x, z + .29, .59, .17, .014, bit === null ? '#e5bd81' : bit ? '#93f2bf' : '#a2b5c3');
      }
      const zA = single ? 0 : -.32;
      const inputEnd = single ? -.55 : isOr ? -.45 : -.6;
      tube([[-1.43, .17, zA], [inputEnd, .17, zA]], color(A), .027, A ? .6 : .05);
      led('A', A, -1.43, zA, true);
      if (!single) { tube([[-1.43, .17, .32], [inputEnd, .17, .32]], color(B), .027, B ? .6 : .05); led('B', B, -1.43, .32, true); }
      led('S', S, 1.43, 0, false);
      return group;
    },
    dispose(model) {
      if (!model) return;
      model.traverse(object => {
        object.geometry?.dispose();
        const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
        materials.forEach(material => { material.map?.dispose(); material.dispose(); });
      });
    }
  };
})();
