/* Presentación para el profesor y recepción protegida del circuito de clase. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const C = LogicCircuit, Lesson = LogicClassroom, Editor = LogicLabEditor;
  const dialog = $('#class-presenter');
  let source = 'circuit', lastToken = '', currentLink = '';

  function snapshot() {
    if (source === 'circuit') return Editor.snapshot();
    const state = LogicLabLaboratory.snapshot();
    const single = state.gate === 'NOT';
    return C.validate({ schema: 1, inputs: [{ id: 'A', value: state.A }, ...(single ? [] : [{ id: 'B', value: state.B }])], gates: [{ id: 'G1', type: state.gate, sources: single ? ['A'] : ['A', 'B'] }], outputs: [{ id: 'S1', source: 'G1' }] });
  }
  function readonlyPreview() {
    const original = $(source === 'circuit' ? '#circuit-board svg' : '#diagram svg');
    const host = $('#class-preview'); host.replaceChildren();
    if (!original) return;
    const preview = original.cloneNode(true);
    preview.querySelectorAll('[tabindex],[role="button"],[data-circuit-toggle],[data-input],[data-circuit-source],[data-circuit-target]').forEach(node => {
      ['tabindex', 'role', 'data-circuit-toggle', 'data-input', 'data-circuit-source', 'data-circuit-target', 'aria-pressed'].forEach(name => node.removeAttribute(name));
    });
    preview.setAttribute('role', 'img');
    host.append(preview);
  }
  function renderPresenter(force = false) {
    if (!dialog.open) return;
    const data = snapshot(), token = Lesson.encode(data);
    if (!force && token === lastToken) return;
    lastToken = token;
    currentLink = Lesson.url(data, location.href);
    const focusInput = document.activeElement?.dataset.classInput;
    const qr = $('#class-qr'); qr.replaceChildren();
    try {
      new QRCode(qr, { text: currentLink, width: 320, height: 320, colorDark: '#102b20', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
      $('#class-presenter-note').textContent = location.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
        ? 'Muestra esta pantalla completa. El estudiante puede comparar el código de vista para confirmar que recibió el circuito correcto.'
        : 'Esta presentación es local. Para usarla desde otro teléfono, abre el sitio HTTPS publicado y muestra allí el QR.';
    } catch { $('#class-presenter-note').textContent = 'No se pudo generar el QR. Usa Copiar enlace para estudiantes desde la versión publicada con HTTPS.'; }
    const code = Lesson.fingerprint(data);
    $('#class-presenter-code').textContent = `CÓDIGO DE VISTA / ${code}`;
    const readonly = source === 'circuit' && Editor.classroom()?.following;
    $('#class-presenter-inputs').innerHTML = data.inputs.map(i => `<button type="button" class="button subtle small ${i.value ? 'active' : ''}" data-class-input="${i.id}" aria-pressed="${!!i.value}" ${readonly ? 'disabled' : ''}>${i.id} <strong>${i.value}</strong></button>`).join('');
    const values = C.evaluate(data).values;
    $('#class-presenter-outputs').innerHTML = data.outputs.map(out => `<span>${out.id} <strong>${C.bitText(values[out.id])}</strong></span>`).join('');
    readonlyPreview();
    if (focusInput) dialog.querySelector(`[data-class-input="${focusInput}"]`)?.focus({ preventScroll: true });
  }
  function openPresenter(next) {
    source = next; lastToken = '';
    document.body.classList.add('class-presenting');
    if (!dialog.open) dialog.showModal();
    renderPresenter(true);
  }
  function renderReceived() {
    const state = Editor.classroom();
    const saved = Editor.savedClass();
    $('#class-received').hidden = !state;
    $('#circuit-refresh-class').hidden = !state;
    $('#class-saved').hidden = !!state || !saved;
    if (saved) $('#class-saved-code').textContent = `Vista ${saved.code} · ${saved.gates} compuertas`;
    if (!state) return;
    $('#class-received-title').textContent = state.following ? 'CIRCUITO DEL PROFESOR / RECIBIDO' : 'COPIA TEMPORAL / EXPLORACIÓN';
    $('#class-received-code').textContent = `Vista ${state.code}`;
    $('#class-received-description').textContent = state.following
      ? 'Para recibir cambios pulsa Actualizar desde QR y enfoca el QR actualizado del profesor. Enfocar solamente HIRO no actualiza el circuito.'
      : 'Puedes experimentar con esta copia. La recepción del QR está en pausa. Guarda un archivo si quieres conservarla; tu circuito personal no cambia.';
    $('#class-storage-note').textContent = state.stored
      ? 'La última versión recibida está guardada en este navegador. Puedes abrirla después; tu circuito personal se conserva.'
      : 'El guardado local no está disponible. Descarga el circuito para conservarlo.';
    $('#class-explore').hidden = !state.following;
    $('#class-follow').hidden = state.following;
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-class-present-lab]')) openPresenter('lab');
    if (event.target.closest('#circuit-present')) openPresenter('circuit');
    if (event.target.closest('[data-class-scan]')) {
      if ($('#view-circuit').hidden) $('.nav-item[data-view="circuit"]').click();
      Editor.scanClass();
    }
    const input = event.target.closest('[data-class-input]');
    if (input) {
      if (source === 'circuit') Editor.changeInput(input.dataset.classInput);
      else LogicLabLaboratory.changeInput(input.dataset.classInput);
    }
  });
  $('#class-presenter-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.classList.remove('class-presenting'));
  $('#class-explore').addEventListener('click', () => Editor.exploreClass());
  $('#class-follow').addEventListener('click', () => Editor.followClass());
  $('#class-restore').addEventListener('click', () => Editor.restorePersonal());
  $('#class-view-large').addEventListener('click', () => Editor.viewLarge());
  $('#class-open-saved').addEventListener('click', () => Editor.openSavedClass());
  $('#class-download').addEventListener('click', () => $('#circuit-export').click());
  $('#class-copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(currentLink); $('#class-presenter-note').textContent = 'Enlace del circuito copiado. Abre exactamente este enlace en el teléfono del estudiante.'; }
    catch { $('#class-presenter-note').textContent = `Copia este enlace para estudiantes: ${currentLink}`; }
  });
  $('#class-print').addEventListener('click', () => window.print());
  window.addEventListener('logiclab:circuit-change', () => { renderReceived(); if (source === 'circuit') renderPresenter(); });
  window.addEventListener('logiclab:gate-change', () => { if (source === 'lab') renderPresenter(); });
  renderReceived();
})();
