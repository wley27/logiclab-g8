/* Editor táctil de circuitos, guardado local y comunicación con el visor. */
(() => {
  'use strict';
  const C = window.LogicCircuit;
  const $ = selector => document.querySelector(selector);
  const root = $('#view-circuit');
  const storeKey = 'logic-lab-circuit-v1';
  const color = bit => bit === null ? '#e5bd81' : bit ? '#72edb4' : '#718395';
  let circuit = C.example(), undo = [], redo = [], pending = null, mode = 'simulator', frame = null, timer = null;
  const origin = location.protocol === 'file:' ? '*' : location.origin;
  const canCamera = isSecureContext && location.protocol !== 'file:' && !!navigator.mediaDevices?.getUserMedia;
  let initialMessage = 'Empieza con el medio sumador: cambia A y B y compara la suma S1 con el acarreo S2.';
  try { const saved = localStorage.getItem(storeKey); if (saved) circuit = C.validate(JSON.parse(saved)); } catch { /* An invalid local file must not prevent startup. */ }
  const shared = new URLSearchParams(location.search).get('circuit');
  if (shared) {
    try {
      if (shared.length > 8000) throw new Error('El enlace supera el tamaño permitido.');
      circuit = C.validate(JSON.parse(atob(shared.replace(/-/g, '+').replace(/_/g, '/'))));
      initialMessage = 'Circuito compartido cargado. Cambia sus entradas o edita las conexiones.';
    } catch { initialMessage = 'El enlace del circuito no es válido. Puedes abrir un archivo JSON o empezar con un ejemplo.'; }
  }

  function message(text, error = false) {
    $('#circuit-message').textContent = text;
    $('#circuit-message').classList.toggle('error', error);
  }
  function send(data) { frame?.contentWindow?.postMessage({ app: 'g8-logic-lab', ...data }, origin); }
  function save() { try { localStorage.setItem(storeKey, JSON.stringify(circuit)); } catch { /* The editor also works with storage disabled. */ } }
  function commit(next, text) {
    try {
      next = C.validate(next);
      if (JSON.stringify(next) !== JSON.stringify(circuit)) { undo.push(C.clone(circuit)); undo = undo.slice(-50); redo = []; circuit = next; }
      pending = null; save(); render(); if (text) message(text);
    } catch (error) { message(error.message, true); render(); }
  }
  const sources = () => [...circuit.inputs.map(i => ({ id: i.id, label: `Entrada ${i.id}` })), ...circuit.gates.map(g => ({ id: g.id, label: `${g.id} · ${g.type}` }))];
  function options(selected, excluded = '') {
    return '<option value="">Sin conectar</option>' + sources().filter(s => s.id !== excluded).map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.label}</option>`).join('');
  }
  function symbol(type) {
    const isOr = ['OR', 'NOR', 'XOR', 'XNOR'].includes(type);
    const path = type === 'NOT' ? 'M12 5 78 35 12 65Z' : isOr ? 'M8 5Q48 5 82 35Q48 65 8 65Q30 35 8 5Z' : 'M8 5H46A30 30 0 0 1 46 65H8Z';
    return `<path d="${path}"/>${['XOR', 'XNOR'].includes(type) ? '<path d="M0 5Q22 35 0 65" fill="none"/>' : ''}${['NOT', 'NAND', 'NOR', 'XNOR'].includes(type) ? `<circle cx="${isOr ? 88 : type === 'NOT' ? 84 : 82}" cy="35" r="6"/>` : ''}`;
  }
  function draw(result) {
    const layout = C.layout(circuit), positions = layout.positions;
    const inputIds = new Set(circuit.inputs.map(i => i.id));
    const from = id => ({ x: positions[id].x + (inputIds.has(id) ? 35 : 78), y: positions[id].y });
    const to = (id, slot) => {
      const g = circuit.gates.find(g => g.id === id), p = positions[id];
      return { x: p.x - (g ? 78 : 35), y: p.y + (g && g.type !== 'NOT' ? slot === 0 ? -18 : 18 : 0) };
    };
    const wires = [];
    function wire(source, target, slot) {
      if (source === null) return;
      const a = from(source), b = to(target, slot), middle = (a.x + b.x) / 2;
      const d = `M${a.x} ${a.y} C${middle} ${a.y} ${middle} ${b.y} ${b.x} ${b.y}`;
      const value = result.values[source];
      wires.push(`<path d="${d}" class="circuit-wire ${value === null ? 'unresolved' : ''}" stroke="${color(value)}"/>${value === 1 ? `<path d="${d}" class="signal-flow"/>` : ''}`);
    }
    circuit.gates.forEach(g => g.sources.forEach((source, slot) => wire(source, g.id, slot)));
    circuit.outputs.forEach(o => wire(o.source, o.id, 0));
    function port(x, y, source, target, slot = 0) {
      const bit = result.values[source || (target.startsWith('G') ? circuit.gates.find(g => g.id === target).sources[slot] : circuit.outputs.find(o => o.id === target).source)] ?? null;
      return `<g role="button" tabindex="0" aria-label="${source ? `Usar salida de ${source}` : `Conectar entrada ${slot + 1} de ${target}`}" ${source ? `data-circuit-source="${source}"` : `data-circuit-target="${target}:${slot}"`} class="circuit-port ${source === pending && source ? 'picked' : ''}"><circle cx="${x}" cy="${y}" r="19" fill="transparent"/><circle cx="${x}" cy="${y}" r="6" fill="#10231e" stroke="${color(bit)}" stroke-width="2"/></g>`;
    }
    const nodes = [];
    circuit.inputs.forEach(input => {
      const p = positions[input.id];
      nodes.push(`<g><g role="button" tabindex="0" data-circuit-toggle="${input.id}" aria-label="Cambiar entrada ${input.id}, valor ${input.value}" class="circuit-node-button"><rect x="${p.x - 29}" y="${p.y - 29}" width="58" height="58" rx="12" fill="#183027" stroke="${color(input.value)}"/><text x="${p.x}" y="${p.y + 9}" class="circuit-svg-bit" fill="${color(input.value)}">${input.value}</text></g><text x="${p.x}" y="${p.y - 45}" class="circuit-svg-label">ENTRADA ${input.id}</text>${port(p.x + 35, p.y, input.id)}</g>`);
    });
    circuit.gates.forEach(g => {
      const p = positions[g.id], bit = result.values[g.id];
      nodes.push(`<g><rect x="${p.x - 69}" y="${p.y - 51}" width="138" height="102" rx="12" fill="#13241f" stroke="#365b49"/><text x="${p.x - 49}" y="${p.y - 30}" class="circuit-svg-id">${g.id}</text><g transform="translate(${p.x - 29} ${p.y - 27}) scale(.65)" stroke="#72edb4" fill="#19392d" stroke-width="2.5">${symbol(g.type)}</g><text x="${p.x}" y="${p.y + 36}" class="circuit-svg-label">${g.type}</text><text x="${p.x + 49}" y="${p.y - 30}" fill="${color(bit)}" class="circuit-svg-value">${C.bitText(bit)}</text>${g.sources.map((_, i) => { const t = to(g.id, i); return port(t.x, t.y, null, g.id, i); }).join('')}${port(p.x + 78, p.y, g.id)}</g>`);
    });
    circuit.outputs.forEach(out => {
      const p = positions[out.id], bit = result.values[out.id];
      nodes.push(`<g>${port(p.x - 35, p.y, null, out.id)}<rect x="${p.x - 29}" y="${p.y - 29}" width="58" height="58" rx="12" fill="#12251e" stroke="${color(bit)}"/><text x="${p.x}" y="${p.y + 9}" class="circuit-svg-bit" fill="${color(bit)}">${C.bitText(bit)}</text><text x="${p.x}" y="${p.y - 45}" class="circuit-svg-label">SALIDA ${out.id}</text></g>`);
    });
    $('#circuit-board').innerHTML = `<svg width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" xmlns="http://www.w3.org/2000/svg" aria-label="Circuito con ${circuit.gates.length} compuertas conectadas y ${circuit.outputs.length} salidas"><defs><pattern id="circuit-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#36564c"/></pattern></defs><rect width="100%" height="100%" fill="url(#circuit-dots)" opacity=".5"/>${wires.join('')}${nodes.join('')}</svg>`;
  }

  function render() {
    const result = C.evaluate(circuit), focused = document.activeElement;
    const focusTarget = focused?.dataset.circuitSelect, focusToggle = focused?.dataset.circuitToggle, scrollTop = window.scrollY;
    $('#circuit-inputs').innerHTML = circuit.inputs.map(input => `<div class="circuit-input-wrap"><button type="button" role="switch" aria-checked="${!!input.value}" aria-label="Entrada ${input.id}" data-circuit-toggle="${input.id}" class="input-card"><span class="input-label">ENTRADA ${input.id}</span><span class="input-bottom"><span class="bit">${input.value}</span><span class="toggle-track"><span></span></span></span></button><button type="button" data-circuit-remove="${input.id}" class="circuit-remove" aria-label="Eliminar entrada ${input.id}" ${circuit.inputs.length === 1 ? 'disabled' : ''}>×</button></div>`).join('');
    $('#circuit-outputs').innerHTML = circuit.outputs.map(out => {
      const bit = result.values[out.id];
      return `<div class="circuit-output ${bit === 1 ? 'on' : bit === null ? 'unknown' : ''}"><div><strong>${out.id}</strong><span class="circuit-output-bit" data-output-id="${out.id}">${C.bitText(bit)}</span><button type="button" class="circuit-remove" data-circuit-remove="${out.id}" aria-label="Eliminar salida ${out.id}" ${circuit.outputs.length === 1 ? 'disabled' : ''}>×</button></div><label>Recibe la señal de<select data-circuit-select="${out.id}:0" aria-label="Origen de ${out.id}">${options(out.source)}</select></label></div>`;
    }).join('');
    $('#circuit-gates').innerHTML = circuit.gates.length ? circuit.gates.map(g => `<article class="circuit-gate-editor"><div class="circuit-gate-editor-title"><strong>${g.id} <span>${g.type}</span></strong><span class="circuit-intermediate" style="color:${color(result.values[g.id])}">Salida ${C.bitText(result.values[g.id])}</span><button type="button" class="circuit-remove" data-circuit-remove="${g.id}" aria-label="Eliminar compuerta ${g.id}">×</button></div><div class="circuit-gate-selects">${g.sources.map((source, i) => `<label>Entrada ${i + 1}<select data-circuit-select="${g.id}:${i}" aria-label="Origen de ${g.id}, entrada ${i + 1}">${options(source, g.id)}</select></label>`).join('')}</div></article>`).join('') : '<p class="circuit-help">Tu lienzo está listo. Añade una compuerta con los botones de arriba.</p>';
    $('#circuit-add-input').disabled = circuit.inputs.length >= C.limits.inputs;
    $('#circuit-add-output').disabled = circuit.outputs.length >= C.limits.outputs;
    $('#circuit-undo').disabled = !undo.length;
    $('#circuit-redo').disabled = !redo.length;
    $('#circuit-gate-count').textContent = `${circuit.gates.length} / ${C.limits.gates} compuertas`;
    root.querySelectorAll('[data-circuit-add]').forEach(el => { el.disabled = circuit.gates.length >= C.limits.gates; });
    $('#circuit-health').textContent = result.complete ? 'Circuito conectado' : `${result.missing} ${result.missing === 1 ? 'conexión pendiente' : 'conexiones pendientes'}`;
    $('#circuit-health').classList.toggle('unknown', !result.complete);
    $('#circuit-cancel-connection').hidden = !pending;
    draw(result);
    const columns = [...circuit.inputs.map(i => i.id), ...circuit.gates.map(g => g.id), ...circuit.outputs.map(o => o.id)];
    const current = circuit.inputs.map(i => i.value).join('');
    $('#circuit-truth-table').innerHTML = `<thead><tr>${columns.map(id => `<th scope="col">${id}</th>`).join('')}<th scope="col"><span class="sr-only">Probar</span></th></tr></thead><tbody>${C.truthTable(circuit).map(row => `<tr class="${row.bits === current ? 'selected' : ''}">${columns.map(id => `<td class="${row.values[id] === 1 ? 'on' : row.values[id] === null ? 'unknown' : ''}">${C.bitText(row.values[id])}</td>`).join('')}<td><button type="button" class="table-try" data-circuit-row="${row.bits}" aria-label="Probar combinación ${row.bits}">↗</button></td></tr>`).join('')}</tbody>`;
    if (focusTarget) root.querySelector(`[data-circuit-select="${focusTarget}"]`)?.focus({ preventScroll: true });
    if (focusToggle) root.querySelector(`button[data-circuit-toggle="${focusToggle}"]`)?.focus({ preventScroll: true });
    if (window.scrollY !== scrollTop) window.scrollTo(0, scrollTop);
    send({ type: 'circuit-state', circuit });
  }

  function connection(target, source) { const [id, slot] = target.split(':'); commit(C.connect(circuit, id, +slot, source), source ? `${source} conectado a ${id}, entrada ${+slot + 1}.` : `Entrada de ${id} desconectada.`); }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function sceneStatus(text, error = false) { $('#circuit-scene-status').hidden = !text; $('#circuit-scene-status').textContent = text; $('#circuit-scene-status').classList.toggle('error', error); }
  function stopScene() {
    clearTimeout(timer); send({ type: 'stop' });
    if (frame) { frame.src = 'about:blank'; frame.remove(); frame = null; }
    $('#circuit-scene-host').hidden = true;
  }
  function startScene() {
    stopScene(); $('#circuit-ar-intro').hidden = true; $('#circuit-scene-host').hidden = false;
    frame = document.createElement('iframe'); frame.title = mode === 'ar' ? 'Circuito en realidad aumentada' : 'Circuito completo en 3D'; frame.allow = 'camera; fullscreen; xr-spatial-tracking'; frame.src = `scene.html?mode=${mode}`; $('#circuit-scene-host').append(frame);
    sceneStatus(mode === 'ar' ? 'Preparando cámara… Acepta el permiso de tu navegador.' : 'Preparando el circuito en 3D…');
    timer = setTimeout(() => { stopScene(); $('#circuit-ar-intro').hidden = mode !== 'ar'; sceneStatus('No se pudo iniciar el visor. Selecciona el modo para reintentar o sigue probando en Conexiones.', true); }, 30000);
  }
  function setMode(next) {
    if (!['simulator', '3d', 'ar'].includes(next)) return;
    stopScene(); mode = next;
    root.querySelectorAll('[data-circuit-mode]').forEach(el => { el.classList.toggle('active', el.dataset.circuitMode === mode); el.setAttribute('aria-pressed', String(el.dataset.circuitMode === mode)); });
    $('#circuit-board').hidden = mode !== 'simulator'; $('#circuit-ar-intro').hidden = mode !== 'ar'; sceneStatus('');
    if (mode === '3d') startScene();
    if (mode === 'ar' && !canCamera) sceneStatus('Para la cámara abre la versión publicada con HTTPS. La vista Conexiones funciona también con archivos locales.', true);
  }

  $('#circuit-palette').innerHTML = G8Logic.keys.map(type => `<button type="button" class="button subtle small" data-circuit-add="${type}" aria-label="Añadir compuerta ${type}"><span>+</span> ${type}</button>`).join('');
  root.addEventListener('click', event => {
    const get = key => event.target.closest(`[data-circuit-${key}]`);
    try {
      if (get('add')) {
        const next = C.clone(circuit), type = get('add').dataset.circuitAdd;
        const id = Array.from({ length: 999 }, (_, i) => `G${i + 1}`).find(id => !next.gates.some(g => g.id === id));
        next.gates.push({ id, type, sources: Array(C.arity(type)).fill(null) }); commit(next, `${id} · ${type} añadida. Conecta sus entradas.`);
      } else if (get('toggle')) {
        const next = C.clone(circuit), input = next.inputs.find(i => i.id === get('toggle').dataset.circuitToggle);
        input.value = 1 - input.value; commit(next, `Entrada ${input.id} = ${input.value}. Todas las señales se han actualizado.`);
      } else if (get('remove')) commit(C.remove(circuit, get('remove').dataset.circuitRemove), 'Elemento eliminado. Puedes deshacer el cambio.');
      else if (get('source')) { pending = get('source').dataset.circuitSource; draw(C.evaluate(circuit)); $('#circuit-cancel-connection').hidden = false; message(`Origen ${pending} seleccionado. Ahora toca la entrada de una compuerta o de una salida final.`); }
      else if (get('target')) {
        if (pending) connection(get('target').dataset.circuitTarget, pending);
        else message('Primero toca un punto de salida a la derecha de una entrada o compuerta. Después toca este punto de entrada.');
      } else if (get('row')) {
        const next = C.clone(circuit); next.inputs.forEach((i, index) => { i.value = +get('row').dataset.circuitRow[index]; }); commit(next, 'Combinación de la tabla aplicada al circuito.');
      }
    } catch (error) { message(error.message, true); }
  });
  root.addEventListener('keydown', event => {
    if (event.target.tagName.toLowerCase() === 'g' && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    if (event.key === 'Escape') { pending = null; render(); message('Conexión cancelada.'); }
  });
  root.addEventListener('change', event => {
    if (!event.target.matches('[data-circuit-select]')) return;
    try { connection(event.target.dataset.circuitSelect, event.target.value || null); }
    catch (error) { message(error.message, true); render(); }
  });
  $('#circuit-add-input').addEventListener('click', () => { const next = C.clone(circuit); next.inputs.push({ id: ['A', 'B', 'C', 'D'].find(id => !next.inputs.some(i => i.id === id)), value: 0 }); commit(next, 'Entrada añadida. Puedes usar su señal en todas las compuertas.'); });
  $('#circuit-add-output').addEventListener('click', () => { const next = C.clone(circuit); next.outputs.push({ id: ['S1', 'S2', 'S3', 'S4'].find(id => !next.outputs.some(i => i.id === id)), source: null }); commit(next, 'Salida añadida. Selecciona la señal que quieres observar.'); });
  $('#circuit-new').addEventListener('click', () => commit(C.empty(), 'Circuito nuevo. Añade compuertas y conecta sus entradas. Puedes deshacer para recuperar el anterior.'));
  $('#circuit-load-example').addEventListener('click', () => { const key = $('#circuit-example').value; commit(C.example(key), C.examples[key].description); });
  $('#circuit-cancel-connection').addEventListener('click', () => { pending = null; render(); message('Conexión cancelada.'); });
  $('#circuit-undo').addEventListener('click', () => { if (!undo.length) return; redo.push(C.clone(circuit)); circuit = undo.pop(); pending = null; save(); render(); message('Cambio deshecho.'); });
  $('#circuit-redo').addEventListener('click', () => { if (!redo.length) return; undo.push(C.clone(circuit)); circuit = redo.pop(); pending = null; save(); render(); message('Cambio recuperado.'); });
  $('#circuit-export').addEventListener('click', () => { download('logiclab-circuito.json', JSON.stringify(circuit, null, 2), 'application/json'); message('Circuito guardado. Puedes abrir este archivo en otro dispositivo.'); });
  $('#circuit-import').addEventListener('click', () => $('#circuit-file').click());
  $('#circuit-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 32768) throw new Error('El archivo es demasiado grande. Usa un circuito de Logic Lab de hasta 32 KB.'); commit(C.validate(JSON.parse(await file.text())), 'Circuito abierto. Sus conexiones y valores ya están disponibles.'); }
    catch (error) { message(error instanceof SyntaxError ? 'El archivo no es un JSON válido. Tu circuito se conserva.' : error.message, true); }
    event.target.value = '';
  });
  $('#circuit-csv').addEventListener('click', () => {
    const columns = [...circuit.inputs.map(i => i.id), ...circuit.gates.map(g => g.id), ...circuit.outputs.map(o => o.id)];
    const rows = [columns.join(';'), ...C.truthTable(circuit).map(row => columns.map(id => C.bitText(row.values[id])).join(';'))];
    download('logiclab-tabla-de-verdad.csv', '\uFEFF' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  });
  $('#circuit-share').addEventListener('click', async () => {
    if (location.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) { message('Publica el proyecto con HTTPS para compartirlo con tu teléfono. Mientras tanto, usa Guardar archivo.'); return; }
    const url = new URL('index.html', location.href); url.searchParams.set('circuit', btoa(JSON.stringify(circuit)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')); url.hash = 'circuit';
    try { await navigator.clipboard.writeText(url.href); message('Enlace del circuito copiado. Al abrirlo en otro dispositivo recuperará estas mismas conexiones y entradas.'); }
    catch { message(`Copia este enlace: ${url.href}`); }
  });
  root.querySelectorAll('[data-circuit-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.circuitMode)));
  $('#circuit-start-camera').addEventListener('click', () => { if (canCamera) startScene(); else { message('Abre la guía para publicar el sitio con HTTPS y activar la cámara.', true); document.querySelector('.nav-item[data-view="phone"]').click(); } });
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || (location.protocol !== 'file:' && event.origin !== location.origin) || event.data?.app !== 'g8-logic-lab') return;
    const data = event.data;
    if (data.type === 'ready') { clearTimeout(timer); send({ type: 'circuit-state', circuit }); sceneStatus(mode === 'ar' ? 'Cámara activa · Buscando marcador HIRO.' : 'Circuito 3D listo · Arrastra para girar y pellizca para ampliar.'); }
    if (data.type === 'marker-found') sceneStatus('Marcador detectado · Cambia las entradas para ver las señales del circuito completo.');
    if (data.type === 'marker-lost') sceneStatus('Buscando marcador HIRO · Mantén el borde completo dentro de la cámara.');
    if (data.type === 'toggle-input' && circuit.inputs.some(i => i.id === data.input)) { const next = C.clone(circuit); const input = next.inputs.find(i => i.id === data.input); input.value = 1 - input.value; commit(next, `Entrada ${input.id} actualizada desde el modelo.`); }
    if (data.type === 'error') { stopScene(); $('#circuit-ar-intro').hidden = mode !== 'ar'; sceneStatus(typeof data.message === 'string' ? data.message : 'No se pudo iniciar el visor.', true); }
  });
  window.addEventListener('logiclab:view', event => { if (event.detail !== 'circuit') stopScene(); else if (mode !== 'simulator') setMode(mode); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'ar' && frame) { stopScene(); $('#circuit-ar-intro').hidden = false; sceneStatus('Cámara en pausa. Actívala para volver a ver tu circuito.'); } });
  window.addEventListener('pagehide', stopScene);
  render(); save(); message(initialMessage);
})();
