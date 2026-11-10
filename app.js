/* Logic Lab · interfaz sin framework ni servicios externos. */
(() => {
  'use strict';
  const { gates, keys, output, combinations, explanation } = window.G8Logic;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const color = (bit) => bit ? '#72edb4' : '#718395';
  const state = { gate: 'AND', A: 1, B: 0, mode: 'simulator', view: 'lab' };
  const storageKey = 'g8-logic-lab-v2';
  const validVisits = new Set(keys.flatMap(g => combinations(g).map(([a, b]) => `${g}:${a}${g === 'NOT' ? '' : b}`)));
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { saved = {}; }
  const visits = new Set((Array.isArray(saved?.visits) ? saved.visits : []).filter(v => validVisits.has(v)));
  let best = Number.isInteger(saved?.best) && saved.best >= 0 && saved.best <= 7 ? saved.best : null;
  let autoTimer = null;
  let frameTimer = null;
  let frame = null;
  let quiz = null;
  const canCamera = window.isSecureContext && location.protocol !== 'file:' && !!navigator.mediaDevices?.getUserMedia;
  const messageOrigin = location.protocol === 'file:' ? '*' : location.origin;

  function saveProgress() {
    try { localStorage.setItem(storageKey, JSON.stringify({ visits: [...visits], best })); } catch { /* Storage may be unavailable in private or local-file contexts. */ }
  }

  function shape(gate) {
    const inverse = ['NAND', 'NOR', 'XNOR'].includes(gate);
    const isOr = ['OR', 'NOR', 'XOR', 'XNOR'].includes(gate);
    const d = gate === 'NOT' ? 'M12 5 78 35 12 65Z' : isOr ? 'M8 5Q48 5 82 35Q48 65 8 65Q30 35 8 5Z' : 'M8 5H46A30 30 0 0 1 46 65H8Z';
    return `<path d="${d}"/>${['XOR', 'XNOR'].includes(gate) ? '<path d="M0 5Q22 35 0 65" fill="none"/>' : ''}${inverse || gate === 'NOT' ? `<circle cx="${isOr ? 88 : gate === 'NOT' ? 84 : 82}" cy="35" r="6"/>` : ''}`;
  }

  $('#gate-choices').innerHTML = keys.map(g => `<button type="button" data-gate="${g}" class="gate-choice" aria-pressed="false" aria-label="${g}: ${gates[g].title}"><svg viewBox="-5 0 106 70" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape(g)}</svg><span><strong>${g}</strong><small>${gates[g].title}</small></span></button>`).join('');

  function circuit() {
    const single = state.gate === 'NOT';
    const s = output(state.gate, state.A, state.B);
    const isOr = ['OR', 'NOR', 'XOR', 'XNOR'].includes(state.gate);
    const negative = ['NOT', 'NAND', 'NOR', 'XNOR'].includes(state.gate);
    const inputX = single ? 249 : isOr ? 262 : 243;
    const endX = (negative ? isOr ? 94 : state.gate === 'NOT' ? 90 : 88 : isOr ? 82 : 76) * 1.6 + 230;
    const wire = (path, bit) => `<path class="signal-wire" d="${path}" stroke="${color(bit)}"/>${bit ? `<path class="signal-flow" d="${path}"/>` : ''}`;
    const input = (name, y) => `${wire(`M94 ${y}H${inputX}`, state[name])}<g class="svg-input" role="button" tabindex="0" aria-label="Cambiar entrada ${name}, actualmente ${state[name]}" aria-pressed="${!!state[name]}" data-input="${name}"><rect x="46" y="${y - 22}" width="48" height="44" rx="11" fill="${state[name] ? '#193c2d' : '#182530'}" stroke="${color(state[name])}" class="svg-node"/><text x="70" y="${y + 8}" font-size="25" class="circuit-text" style="fill:${color(state[name])}">${state[name]}</text><text x="70" y="${name === 'B' ? y + 43 : y - 35}" class="circuit-text circuit-small">ENTRADA ${name}</text></g>`;
    return `<svg viewBox="0 0 620 245" xmlns="http://www.w3.org/2000/svg" aria-label="Circuito ${state.gate}: A ${state.A}${single ? '' : `, B ${state.B}`}, salida S ${s}">
      ${input('A', single ? 121 : 96)}${single ? '' : input('B', 146)}
      ${wire(`M${endX} 121H526`, s)}
      <g transform="translate(230 65) scale(1.6)" class="circuit-symbol">${shape(state.gate)}</g>
      <text x="${isOr ? 301 : 291}" y="127" class="circuit-text" font-size="${state.gate.length > 3 ? 13 : 16}" font-weight="600">${state.gate}</text>
      <text x="302" y="205" class="circuit-text circuit-small">${gates[state.gate].expression}</text>
      <rect x="526" y="97" width="48" height="48" rx="13" fill="${s ? '#193c2d' : '#182530'}" stroke="${color(s)}" class="svg-node"/>
      <text x="550" y="130" class="circuit-text" font-size="28" style="fill:${color(s)}">${s}</text>
      <text x="550" y="84" class="circuit-text circuit-small">SALIDA S</text>
      <circle cx="550" cy="164" r="3" fill="${color(s)}"/>
    </svg>`;
  }

  function renderProgress() {
    $('#progress-label').textContent = `${visits.size} / 26`;
    $('#exploration-progress').value = visits.size;
    $('#gate-progress').innerHTML = keys.map((g, i) => {
      const complete = combinations(g).every(([a, b]) => visits.has(`${g}:${a}${g === 'NOT' ? '' : b}`));
      return `<span class="${complete ? 'complete' : ''}" title="${g}${complete ? ': explorada' : ': por explorar'}" aria-label="${g}${complete ? ', explorada' : ', por explorar'}">${complete ? '✓' : i + 1}</span>`;
    }).join('');
    $('#best-score').textContent = best === null ? 'Sin intentos todavía' : `Mejor resultado: ${best} / 7`;
  }

  function renderLab() {
    const active = document.activeElement;
    const focusInput = active?.dataset.input;
    const focusCombo = active?.dataset.combo;
    const g = gates[state.gate];
    const single = state.gate === 'NOT';
    const s = output(state.gate, state.A, state.B);
    visits.add(`${state.gate}:${state.A}${single ? '' : state.B}`);
    saveProgress();
    $$('.gate-choice').forEach(el => { const selected = el.dataset.gate === state.gate; el.classList.toggle('active', selected); el.setAttribute('aria-pressed', String(selected)); });
    $('#scene-heading').textContent = state.gate;
    $('#gate-name').textContent = state.gate;
    $('#gate-translation').textContent = g.title;
    $('#gate-family').textContent = g.family;
    $('#gate-meaning').textContent = g.description;
    $('#expression').textContent = g.expression;
    for (const bit of ['A', 'B']) {
      const button = $(`#input${bit}`);
      button.setAttribute('aria-checked', String(!!state[bit]));
      button.setAttribute('aria-label', `Entrada ${bit}, ${state[bit] ? 'encendida, valor 1' : 'apagada, valor 0'}. Tocar para cambiar.`);
      button.querySelector('.bit').textContent = state[bit];
    }
    $('#inputB').hidden = single;
    $('#output-value').textContent = s;
    $('#output-card').classList.toggle('on', !!s);
    $('#output-state').textContent = s ? 'Encendida' : 'Apagada';
    $('#signal-explain').textContent = explanation(state.gate, state.A, state.B);
    $('#diagram').innerHTML = circuit();
    const rows = combinations(state.gate).map(([a, b]) => {
      const selected = a === state.A && (single || b === state.B);
      const value = output(state.gate, a, b);
      return `<tr class="${selected ? 'selected' : ''}"><td>${a}</td>${single ? '' : `<td>${b}</td>`}<td class="out-${value}"><strong>${value}</strong></td><td><button type="button" class="table-try" data-combo="${a}${b}" aria-label="Probar entrada A ${a}${single ? '' : `, B ${b}`}${selected ? ', fila actual' : ''}" ${selected ? 'aria-current="true"' : ''}>↗</button></td></tr>`;
    }).join('');
    $('#truth-table').innerHTML = `<thead><tr><th scope="col">A</th>${single ? '' : '<th scope="col">B</th>'}<th scope="col">S</th><th scope="col"><span class="sr-only">Probar</span></th></tr></thead><tbody>${rows}</tbody>`;
    $('#example-title').textContent = g.example;
    $('#example-description').textContent = g.analogy;
    $('#experiment-hint').textContent = g.hint;
    const exampleBit = (label, bit, extra = '') => `<div class="${extra}"><span>${label}</span><strong class="${bit ? 'on' : ''}">${bit}</strong></div>`;
    $('#example-signals').innerHTML = exampleBit(`A · ${g.inputA}`, state.A) + (single ? '' : exampleBit(`B · ${g.inputB}`, state.B)) + exampleBit(`S · ${g.result}`, s, 'example-result');
    renderProgress();
    postToScene({ type: 'state', gate: state.gate, A: state.A, B: state.B });
    if (focusInput) $(`[data-input="${focusInput}"]`)?.focus({ preventScroll: true });
    if (focusCombo) $(`[data-combo="${focusCombo}"]`)?.focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent('logiclab:gate-change', { detail: { gate: state.gate, A: state.A, B: state.B } }));
  }

  function stopAuto() {
    clearInterval(autoTimer);
    autoTimer = null;
    $('#autoplay').setAttribute('aria-pressed', 'false');
    $('#autoplay').setAttribute('aria-label', 'Recorrer automáticamente la tabla');
    $('#autoplay').innerHTML = `${icon('play')}<span>Recorrer tabla</span>`;
  }

  function changeInput(name) {
    if (!['A', 'B'].includes(name) || (name === 'B' && state.gate === 'NOT')) return;
    stopAuto();
    state[name] = 1 - state[name];
    renderLab();
  }

  function status(text, error = false) {
    $('#scene-status').textContent = text;
    $('#scene-status').hidden = !text;
    $('#scene-status').classList.toggle('error', error);
  }

  function postToScene(message) {
    frame?.contentWindow?.postMessage({ app: 'g8-logic-lab', ...message }, messageOrigin);
  }

  function destroyScene() {
    clearTimeout(frameTimer);
    postToScene({ type: 'stop' });
    if (frame) { frame.src = 'about:blank'; frame.remove(); frame = null; }
    $('#scene-host').hidden = true;
  }

  function startScene(mode) {
    destroyScene();
    $('#ar-intro').hidden = true;
    $('#scene-host').hidden = false;
    frame = document.createElement('iframe');
    frame.title = mode === 'ar' ? 'Compuerta en realidad aumentada' : 'Modelo tridimensional de la compuerta';
    frame.allow = 'camera; fullscreen; xr-spatial-tracking';
    frame.src = `scene.html?v=3.3.0&mode=${mode}`;
    $('#scene-host').append(frame);
    status(mode === 'ar' ? 'Preparando la cámara… Acepta el permiso de tu navegador.' : 'Preparando el modelo 3D…');
    frameTimer = setTimeout(() => {
      destroyScene();
      if (mode === 'ar') $('#ar-intro').hidden = false;
      status('El visor está tardando demasiado. Vuelve a seleccionar el modo para reintentar. Puedes seguir aprendiendo con el Simulador.', true);
    }, 30000);
  }

  function setMode(mode, force = false) {
    if (!['simulator', '3d', 'ar'].includes(mode) || (!force && state.mode === mode)) return;
    stopAuto();
    destroyScene();
    state.mode = mode;
    $$('[data-mode]').forEach(el => { const selected = el.dataset.mode === mode; el.classList.toggle('active', selected); el.setAttribute('aria-pressed', String(selected)); });
    $('#diagram').hidden = mode !== 'simulator';
    $('#ar-intro').hidden = mode !== 'ar';
    $('#stage-label').textContent = { simulator: 'SIMULACIÓN EN TIEMPO REAL', '3d': 'EXPLORA EL CIRCUITO EN 3D', ar: 'REALIDAD AUMENTADA · MARCADOR HIRO' }[mode];
    $('#stage-hint').textContent = { simulator: 'Toca A o B para experimentar', '3d': 'Arrastra para girar · Pellizca para acercar', ar: 'Mantén visible todo el marcador' }[mode];
    status('');
    if (mode === '3d') startScene(mode);
    if (mode === 'ar' && !canCamera) {
      $('#ar-intro-text').textContent = 'Para activar la cámara, abre este proyecto publicado con HTTPS. En la guía para móvil tienes los pasos. Puedes usar el Simulador sin cámara.';
      $('#start-camera').innerHTML = `${icon('phone')} Ver guía para el teléfono`;
    }
  }

  function showView(view, focus = true) {
    if (!['lab', 'circuit', 'practice', 'phone'].includes(view)) view = 'lab';
    if (view !== 'lab') { stopAuto(); destroyScene(); }
    const previous = state.view;
    state.view = view;
    $$('.view').forEach(el => { el.hidden = el.id !== `view-${view}`; });
    $$('.nav-item').forEach(el => { const selected = el.dataset.view === view; el.classList.toggle('active', selected); if (selected) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
    $('#breadcrumb-current').textContent = { lab: 'Laboratorio interactivo', circuit: 'Constructor de circuitos', practice: 'Ponte a prueba', phone: 'Guía para móvil' }[view];
    window.dispatchEvent(new CustomEvent('logiclab:view', { detail: view }));
    if (view === 'practice' && !quiz) startQuiz();
    if (view === 'phone') renderSharing();
    if (view === 'lab' && previous !== 'lab') setMode(state.mode, true);
    try { history.replaceState(null, '', `#${view}`); } catch { /* Local browser restrictions do not affect navigation. */ }
    if (focus) { window.scrollTo({ top: 0, behavior: 'instant' }); $('#main').focus({ preventScroll: true }); }
  }

  function startQuiz() {
    quiz = { index: 0, score: 0, answered: false, questions: keys.map(gate => { const rows = combinations(gate); const [A, B] = rows[Math.floor(Math.random() * rows.length)]; return { gate, A, B }; }), missed: [] };
    renderQuiz();
  }

  function renderQuiz() {
    $('#quiz-feedback').hidden = true;
    $('#quiz-next').hidden = true;
    $('#quiz-progress').value = quiz.index;
    $('#quiz-score').textContent = `${quiz.score} ${quiz.score === 1 ? 'acierto' : 'aciertos'}`;
    if (quiz.index === 7) {
      best = best === null ? quiz.score : Math.max(best, quiz.score);
      saveProgress(); renderProgress();
      $('#quiz-count').textContent = 'RETO COMPLETADO';
      $('#quiz-content').innerHTML = `<div class="quiz-summary"><span class="intro-icon">${icon('target')}</span><div class="summary-score">${quiz.score}<span> / 7</span></div><h2>${quiz.score === 7 ? '¡Todas las señales conectadas!' : quiz.score >= 4 ? 'Tu intuición está creciendo.' : 'Cada intento es un nuevo comienzo.'}</h2><p>${quiz.missed.length ? `Vuelve al laboratorio y experimenta con ${quiz.missed.join(', ')}. Después inténtalo de nuevo.` : 'Reconociste la regla de cada compuerta. Vuelve a experimentar con otras entradas.'}</p><button type="button" class="button primary" id="quiz-restart">${icon('reset')} Practicar de nuevo</button><div><button type="button" class="text-link" id="back-lab">Volver al laboratorio ${icon('arrow')}</button></div></div>`;
      return;
    }
    quiz.answered = false;
    const q = quiz.questions[quiz.index];
    $('#quiz-count').textContent = `RETO ${String(quiz.index + 1).padStart(2, '0')} / 07`;
    const bit = (label, value, extra = '') => `<div class="quiz-bit ${extra}"><span>${label}</span><strong>${value}</strong></div>`;
    $('#quiz-content').innerHTML = `<div class="quiz-gate">${q.gate} · ${gates[q.gate].title}</div><h2>¿Qué valor tendrá la salida?</h2><p>Piensa en la regla de ${q.gate} y elige tu respuesta.</p><div class="quiz-signals">${bit('ENTRADA A', q.A)}${q.gate === 'NOT' ? '' : bit('ENTRADA B', q.B)}${icon('arrow')}${bit('SALIDA S', '?', 'unknown')}</div><div class="quiz-answers" role="group" aria-label="Elige el valor de la salida"><button type="button" class="quiz-answer" data-answer="0">0<small>Apagada</small></button><button type="button" class="quiz-answer" data-answer="1">1<small>Encendida</small></button></div>`;
  }

  function answerQuiz(answer) {
    if (!quiz || quiz.answered || quiz.index >= 7) return;
    quiz.answered = true;
    const q = quiz.questions[quiz.index];
    const expected = output(q.gate, q.A, q.B);
    const correct = answer === expected;
    if (correct) quiz.score++; else quiz.missed.push(q.gate);
    $$('.quiz-answer').forEach(el => { el.disabled = true; if (+el.dataset.answer === expected) el.classList.add('correct-answer'); else if (+el.dataset.answer === answer) el.classList.add('wrong-answer'); });
    $('.quiz-bit.unknown strong').textContent = expected;
    $('#quiz-feedback').hidden = false;
    $('#quiz-feedback').classList.toggle('incorrect', !correct);
    $('#quiz-feedback').textContent = `${correct ? '¡Correcto!' : `La salida correcta es ${expected}.`} ${explanation(q.gate, q.A, q.B)}`;
    $('#quiz-score').textContent = `${quiz.score} ${quiz.score === 1 ? 'acierto' : 'aciertos'}`;
    $('#quiz-progress').value = quiz.index + 1;
    $('#quiz-next').hidden = false;
    $('#quiz-next').innerHTML = `${quiz.index === 6 ? 'Ver mi resultado' : 'Siguiente reto'} ${icon('arrow')}`;
    $('#quiz-next').focus({ preventScroll: true });
  }

  function publicURL() {
    if (location.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return null;
    const url = new URL('index.html', location.href);
    url.hash = 'lab';
    return url.href;
  }

  let qrRendered = false;
  function renderSharing() {
    const url = publicURL();
    $('#share-description').textContent = url ? 'Escanea este QR desde otro dispositivo o copia el enlace para abrirlo en tu teléfono.' : 'El proyecto está abierto localmente. Publícalo con HTTPS para obtener un enlace que puedas abrir en tu teléfono.';
    $('#share-url').textContent = url || 'El QR aparecerá cuando abras la versión publicada.';
    $('#share-link').hidden = !url;
    if (url && !qrRendered && window.QRCode) {
      try {
        new QRCode($('#qr-code'), { text: url, width: 176, height: 176, colorDark: '#102519', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
        $('#qr-code').hidden = false;
        qrRendered = true;
      } catch { $('#share-feedback').textContent = 'Usa el botón para copiar el enlace.'; }
    }
  }

  document.addEventListener('click', event => {
    const gate = event.target.closest('[data-gate]');
    const nav = event.target.closest('[data-view]');
    const mode = event.target.closest('[data-mode]');
    const input = event.target.closest('[data-input]');
    const combo = event.target.closest('[data-combo]');
    const answer = event.target.closest('[data-answer]');
    if (gate) { stopAuto(); state.gate = gate.dataset.gate; state.A = 0; state.B = 0; renderLab(); }
    if (nav) showView(nav.dataset.view);
    if (mode) setMode(mode.dataset.mode, true);
    if (input) changeInput(input.dataset.input);
    if (combo) { stopAuto(); [state.A, state.B] = [...combo.dataset.combo].map(Number); renderLab(); }
    if (answer) answerQuiz(+answer.dataset.answer);
    if (event.target.closest('#quiz-restart')) startQuiz();
    if (event.target.closest('#back-lab')) showView('lab');
  });
  $('#diagram').addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-input]')) { event.preventDefault(); changeInput(event.target.dataset.input); }
  });
  $('#inputA').addEventListener('click', () => changeInput('A'));
  $('#inputB').addEventListener('click', () => changeInput('B'));
  $('#reset').addEventListener('click', () => { stopAuto(); state.A = 0; state.B = 0; renderLab(); postToScene({ type: 'reset-view' }); });
  $('#autoplay').addEventListener('click', () => {
    if (autoTimer) { stopAuto(); return; }
    $('#autoplay').setAttribute('aria-pressed', 'true');
    $('#autoplay').setAttribute('aria-label', 'Pausar recorrido de la tabla');
    $('#autoplay').innerHTML = `${icon('pause')}<span>Pausar recorrido</span>`;
    autoTimer = setInterval(() => { const rows = combinations(state.gate); const i = rows.findIndex(([a, b]) => a === state.A && (state.gate === 'NOT' || b === state.B)); [state.A, state.B] = rows[(i + 1) % rows.length]; renderLab(); }, 1600);
  });
  $('#start-camera').addEventListener('click', () => { if (canCamera) startScene('ar'); else showView('phone'); });
  $('#go-ar').addEventListener('click', () => { showView('lab'); setMode('ar', true); $('#stage').scrollIntoView({ block: 'center' }); });
  $('#quiz-next').addEventListener('click', () => { if (quiz?.answered) { quiz.index++; renderQuiz(); $('#quiz-content').setAttribute('tabindex', '-1'); $('#quiz-content').focus({ preventScroll: true }); } });
  $('#share-link').addEventListener('click', async () => {
    const url = publicURL();
    if (!url) return;
    try { await navigator.clipboard.writeText(url); $('#share-feedback').textContent = 'Enlace copiado. Ya puedes enviarlo a tu teléfono.'; }
    catch { $('#share-feedback').textContent = 'Mantén pulsada la dirección de arriba para copiarla, o usa el QR.'; }
  });
  $('#fullscreen').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if ($('#stage').requestFullscreen) await $('#stage').requestFullscreen(); else status('Tu navegador no ofrece pantalla completa aquí. Gira el teléfono para ampliar el circuito.'); }
    catch { status('No se pudo activar la pantalla completa. Puedes seguir usando el circuito en esta vista.'); }
  });
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || (location.protocol !== 'file:' && event.origin !== location.origin) || event.data?.app !== 'g8-logic-lab') return;
    const data = event.data;
    if (data.type === 'ready') {
      clearTimeout(frameTimer);
      postToScene({ type: 'state', gate: state.gate, A: state.A, B: state.B });
      postToScene({ type: 'scan-classroom', enabled: true });
      status(state.mode === 'ar' ? 'Cámara activa · Buscando marcador HIRO. Mantén visible el borde completo.' : 'Modelo 3D listo · Arrastra para girar. Usa la rueda o pellizca para acercarte.');
    }
    if (data.type === 'marker-found') status('Marcador detectado · Cambia A y B para seguir las señales en tu circuito.');
    if (data.type === 'marker-lost') status('Buscando marcador HIRO · Apunta de nuevo al marcador completo.');
    if (data.type === 'toggle-input') changeInput(data.input);
    if (data.type === 'classroom-circuit') {
      const received = LogicClassroom.readURL(data.url, location.href);
      if (received) {
        showView('circuit');
        window.dispatchEvent(new CustomEvent('logiclab:receive-class', { detail: { circuit: received.circuit, openCamera: true } }));
      }
    }
    if (data.type === 'qr-unavailable') status(data.message, true);
    if (data.type === 'error') { destroyScene(); if (state.mode === 'ar') $('#ar-intro').hidden = false; status(typeof data.message === 'string' ? data.message : 'No se pudo iniciar el visor.', true); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopAuto(); if (state.mode === 'ar' && frame) { destroyScene(); $('#ar-intro').hidden = false; status('Cámara en pausa. Toca Activar cámara para volver a experimentar.'); } }
  });
  window.addEventListener('pagehide', destroyScene);
  window.addEventListener('hashchange', () => showView(location.hash.slice(1), false));
  window.LogicLabLaboratory = Object.freeze({ snapshot: () => ({ gate: state.gate, A: state.A, B: state.B }), changeInput });
  renderLab();
  showView(location.hash.slice(1) || (new URLSearchParams(location.search).has('lesson') ? 'circuit' : 'lab'), false);
  const requestedMode = new URLSearchParams(location.search).get('mode');
  if (state.view === 'lab' && ['3d', 'ar'].includes(requestedMode)) setMode(requestedMode, true);
})();
