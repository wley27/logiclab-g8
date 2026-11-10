/* El visor vive en un iframe: AR.js puede ajustar su cámara sin alterar la interfaz. */
(() => {
  'use strict';
  const mode = new URLSearchParams(location.search).get('mode') === 'ar' ? 'ar' : '3d';
  let state = { gate: 'AND', A: 1, B: 0 };
  let scene, holder, model;
  let stopped = false;
  let failed = false;
  let fitCamera = () => {};
  let zoom = 1, panMode = false;
  let scanTimer = null, scanEnabled = false, lastClassCode = '', nativeDetector = null;
  const origin = location.protocol === 'file:' ? '*' : location.origin;
  const send = (type, extra = {}) => parent.postMessage({ app: 'g8-logic-lab', type, ...extra }, origin);
  function setZoom(value) {
    if (!holder || stopped || !Number.isFinite(value)) return;
    zoom = Math.max(.35, Math.min(mode === 'ar' ? 4 : 6, value));
    holder.object3D.scale.setScalar((mode === 'ar' ? .4 : 1) * zoom);
    send('view-state', { zoom });
  }
  function resetView() {
    if (!holder || stopped) return;
    holder.object3D.rotation.set(0, mode === '3d' ? -.15 : 0, 0);
    holder.object3D.position.set(0, mode === 'ar' ? .02 : 0, 0);
    setZoom(1); fitCamera();
  }

  function cameraFailure(error) {
    const messages = {
      NotAllowedError: 'No se autorizó la cámara. Permite su acceso en los ajustes de este sitio y pulsa Activar cámara para reintentar.',
      NotFoundError: 'No se encontró una cámara. Prueba desde tu teléfono o usa el Modelo 3D.',
      NotReadableError: 'La cámara está ocupada. Cierra otras apps que la utilicen y vuelve a intentarlo.',
      OverconstrainedError: 'Esta cámara no admite la configuración solicitada. Prueba otro navegador o el Modelo 3D.'
    };
    fail(messages[error?.name] || 'No se pudo iniciar la cámara. Comprueba HTTPS y el permiso de cámara del navegador.');
  }

  function stop() {
    stopped = true;
    clearTimeout(scanTimer);
    document.querySelectorAll('video').forEach(video => { video.srcObject?.getTracks().forEach(track => track.stop()); video.srcObject = null; });
    scene?.pause();
    window.G8Model?.dispose(model);
    model = null;
  }
  function fail(message) {
    if (failed || stopped) return;
    failed = true;
    const loading = document.getElementById('loading');
    loading.hidden = false; loading.textContent = message;
    send('error', { message });
    stop();
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = src; element.onload = resolve;
      element.onerror = () => reject(new Error('No se pudo cargar el visor. Comprueba que la carpeta vendor esté junto a los archivos del proyecto.'));
      document.head.append(element);
    });
  }
  function updateModel() {
    if (!holder || stopped) return;
    holder.removeObject3D('gate');
    G8Model.dispose(model);
    model = state.circuit ? LogicCircuitModel.build(AFRAME.THREE, state.circuit) : G8Model.build(AFRAME.THREE, state);
    holder.setObject3D('gate', model);
    fitCamera();
  }

  function startClassScanner() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    try { if (window.BarcodeDetector) nativeDetector = new BarcodeDetector({ formats: ['qr_code'] }); } catch { nativeDetector = null; }
    async function scan() {
      if (stopped) return;
      try {
        const video = document.querySelector('video');
        if (!scanEnabled || document.hidden || !video || video.readyState < 2 || !video.videoWidth || !context) return;
        const ratio = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.round(video.videoWidth * ratio), height = Math.round(video.videoHeight * ratio);
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        context.drawImage(video, 0, 0, width, height);
        let candidates = [];
        if (nativeDetector) {
          let timeout;
          try {
            const found = await Promise.race([nativeDetector.detect(canvas), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('QR timeout')), 900); })]);
            candidates = found.map(item => item.rawValue);
          }
          catch { nativeDetector = null; }
          finally { clearTimeout(timeout); }
        }
        const newClass = url => {
          const received = LogicClassroom.readURL(url, location.href);
          return received && LogicClassroom.encode(received.circuit) !== lastClassCode;
        };
        if (!candidates.some(newClass) && window.jsQR) {
          const pixels = context.getImageData(0, 0, width, height);
          const found = jsQR(pixels.data, width, height, { inversionAttempts: 'dontInvert' });
          if (found) candidates.unshift(found.data);
        }
        if (stopped || !scanEnabled) return;
        for (const url of candidates) {
          const received = LogicClassroom.readURL(url, location.href);
          if (!received) continue;
          const code = LogicClassroom.encode(received.circuit);
          if (code !== lastClassCode) { lastClassCode = code; send('classroom-circuit', { url }); }
          break;
        }
      } catch { /* A frame can be unavailable while the phone changes orientation. */ }
      finally { if (!stopped) scanTimer = setTimeout(scan, 700); }
    }
    scanTimer = setTimeout(scan, 350);
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || (location.protocol !== 'file:' && event.origin !== location.origin) || event.data?.app !== 'g8-logic-lab') return;
    const data = event.data;
    if (data.type === 'stop') { stop(); return; }
    if (data.type === 'scan-classroom') { scanEnabled = data.enabled === true; if (scanEnabled) lastClassCode = ''; }
    if (data.type === 'reset-view') resetView();
    if (data.type === 'zoom-view' && [1.25, .8].includes(data.factor)) setZoom(zoom * data.factor);
    if (data.type === 'pan-view') panMode = mode === '3d' && data.enabled === true;
    if (data.type === 'state' && Object.hasOwn(G8Logic.gates, data.gate) && [0, 1].includes(data.A) && [0, 1].includes(data.B)) {
      state = { gate: data.gate, A: data.A, B: data.B }; updateModel();
    }
    if (data.type === 'circuit-state') {
      try { state = { circuit: LogicCircuit.validate(data.circuit) }; updateModel(); }
      catch { send('error', { message: 'El circuito enviado al visor no es válido. Revisa las conexiones.' }); }
    }
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('camera-error', event => cameraFailure(event.detail?.error || event.error));

  function interactions() {
    const canvas = scene.canvas;
    if (!canvas) return;
    if (mode === '3d') {
      fitCamera = () => {
        const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
        const tangent = Math.tan(44 * Math.PI / 360);
        const size = model?.userData.size || { width: 3.65, depth: 2.05, height: .4 };
        const projectedHeight = size.depth * Math.sin(40 * Math.PI / 180) + size.height * Math.cos(40 * Math.PI / 180);
        const distance = 1.18 * Math.max(size.width / (2 * tangent * aspect * .78), projectedHeight / (2 * tangent * .7));
        document.getElementById('model-camera').setAttribute('position', { x: 0, y: Math.sin(40 * Math.PI / 180) * distance, z: Math.cos(40 * Math.PI / 180) * distance });
      };
      fitCamera();
      window.addEventListener('resize', fitCamera);
    }
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fail('Se interrumpió el visor 3D. Vuelve al Simulador o selecciona otra vez el modo para reintentar.'); });
    const pointers = new Map();
    const raycaster = new AFRAME.THREE.Raycaster();
    let lastX = 0, lastY = 0, moved = false, pinchDistance = 0;
    const distance = () => { const p = [...pointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
    canvas.addEventListener('pointerdown', event => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      lastX = event.clientX; lastY = event.clientY; moved = false;
      if (pointers.size === 2) { pinchDistance = distance(); moved = true; }
    });
    canvas.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const dx = event.clientX - lastX, dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (!stopped) {
        if (pointers.size === 2) {
          const next = distance();
          if (pinchDistance > 0) setZoom(zoom * next / pinchDistance);
          pinchDistance = next;
        } else if (mode === '3d' && panMode) {
          const distance = scene.camera.getWorldPosition(new AFRAME.THREE.Vector3()).length();
          const unit = 2 * distance * Math.tan(44 * Math.PI / 360) / Math.max(canvas.clientHeight, 1);
          holder.object3D.position.x += dx * unit;
          holder.object3D.position.y -= dy * unit * Math.cos(40 * Math.PI / 180);
          holder.object3D.position.z += dy * unit * Math.sin(40 * Math.PI / 180);
        } else if (mode === '3d') { holder.object3D.rotation.y += dx * .009; holder.object3D.rotation.x = Math.max(-.45, Math.min(.65, holder.object3D.rotation.x + dy * .005)); }
      }
      lastX = event.clientX; lastY = event.clientY;
    });
    canvas.addEventListener('pointerup', event => {
      const wasTap = !moved && pointers.size === 1;
      pointers.delete(event.pointerId);
      if (wasTap && model && (mode !== 'ar' || holder.parentElement.object3D.visible)) {
        const rect = canvas.getBoundingClientRect();
        raycaster.setFromCamera(new AFRAME.THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), scene.camera);
        const hits = raycaster.intersectObject(model, true);
        if (hits[0]?.object.userData.input) send('toggle-input', { input: hits[0].object.userData.input });
      }
    });
    canvas.addEventListener('pointercancel', event => pointers.delete(event.pointerId));
    canvas.addEventListener('wheel', event => {
      if (stopped) return;
      event.preventDefault();
      setZoom(zoom * (event.deltaY > 0 ? .93 : 1.07));
    }, { passive: false });
  }

  async function init() {
    try {
      await loadScript('vendor/aframe-1.6.0.min.js');
      if (stopped) return;
      if (mode === 'ar') {
        if (!navigator.mediaDevices?.getUserMedia) { cameraFailure(); return; }
        // Capture the native rejection: this AR.js version omits it from event.detail.
        const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async constraints => {
          try {
            const stream = await getMedia(constraints);
            if (stopped) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Visor cerrado', 'AbortError'); }
            return stream;
          } catch (error) { if (!stopped) cameraFailure(error); throw error; }
        };
        await loadScript('vendor/aframe-ar-3.4.7.js');
        try { await loadScript('vendor/jsqr-1.4.0.js'); }
        catch { send('qr-unavailable', { message: 'El lector de clase no está disponible. Abre el enlace o QR del profesor con la cámara del teléfono y vuelve a activar RA.' }); }
      }
      if (stopped) return;
      const common = 'embedded xr-mode-ui="enabled: false" vr-mode-ui="enabled: false" loading-screen="enabled: false" device-orientation-permission-ui="enabled: false" renderer="antialias: true; alpha: true; precision: mediump; colorManagement: true"';
      const lights = '<a-entity light="type: ambient; intensity: 1.5; color: #c4dbe0"></a-entity><a-entity light="type: directional; intensity: 2; color: #e4fff0" position="2 5 3"></a-entity>';
      const root = document.getElementById('scene-root');
      root.innerHTML = mode === 'ar'
        ? `<a-scene ${common} arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono; trackingMethod: best; cameraParametersUrl: vendor/camera_para.dat; sourceWidth: 640; sourceHeight: 480; maxDetectionRate: 30;">
            ${lights}<a-marker id="hiro-marker" type="pattern" url="vendor/hiro.patt" emitevents="true" smooth="true" smooth-count="5" smooth-tolerance="0.01" smooth-threshold="2"><a-entity id="gate-model" scale="0.4 0.4 0.4" position="0 0.02 0"></a-entity></a-marker><a-entity camera></a-entity></a-scene>`
        : `<a-scene ${common} background="color: #0b141d">${lights}<a-entity id="gate-model" rotation="0 -8.6 0"></a-entity><a-entity id="model-camera" camera="fov: 44" position="0 3.4 4" rotation="-40 0 0" look-controls="enabled: false" wasd-controls="enabled: false"></a-entity></a-scene>`;
      scene = root.querySelector('a-scene');
      const ready = () => {
        if (stopped) return;
        holder = document.getElementById('gate-model');
        updateModel();
        document.getElementById('loading').hidden = true;
        if (scene.canvas) interactions(); else scene.addEventListener('render-target-loaded', interactions, { once: true });
        if (mode === '3d') send('ready');
      };
      if (scene.hasLoaded) ready(); else scene.addEventListener('loaded', ready, { once: true });
      if (mode === 'ar') {
        startClassScanner();
        window.addEventListener('camera-init', event => {
          const source = event.detail?.stream;
          if (stopped) { source?.getTracks().forEach(track => track.stop()); return; }
          send('ready');
        }, { once: true });
        const marker = document.getElementById('hiro-marker');
        marker.addEventListener('markerFound', () => send('marker-found'));
        marker.addEventListener('markerLost', () => send('marker-lost'));
      }
    } catch (error) { fail(error.message || 'No se pudo abrir el modelo. Puedes continuar con el Simulador.'); }
  }
  init();
})();
