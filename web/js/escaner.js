// Lector de QR dentro de la página, para agregar varios equipos seguidos sin salir del formulario.
// Usa el detector nativo del navegador cuando existe (Chrome en Android) y, si no, la librería jsQR
// (iPhone y otros), que se descarga solo la primera vez que se abre el lector.

const URL_JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
const PATRON = /OAN-[A-Z]{3}-\d{4}/i;

let promesaJsQR = null;
function cargarJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  promesaJsQR = promesaJsQR || new Promise((ok, falla) => {
    const s = document.createElement('script');
    s.src = URL_JSQR;
    s.onload = () => ok(window.jsQR);
    s.onerror = () => falla(new Error('No se pudo cargar el lector de QR.'));
    document.head.append(s);
  });
  return promesaJsQR;
}

/** Extrae el código del equipo del texto del QR (la URL) o de lo que se escriba. */
export function codigoDe(texto) {
  const m = String(texto || '').match(PATRON);
  return m ? m[0].toUpperCase() : null;
}

export function camaraDisponible() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
}

/**
 * Abre el lector a pantalla completa. Llama alEncontrar(codigo) por cada QR nuevo;
 * esa función devuelve un texto corto que se muestra como confirmación.
 */
export async function abrirEscaner(alEncontrar) {
  const capa = document.createElement('div');
  capa.className = 'escaner';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-modal', 'true');
  capa.setAttribute('aria-label', 'Escanear QR de equipos');
  capa.innerHTML = `
    <video playsinline muted></video>
    <div class="escaner-marco" aria-hidden="true"></div>
    <div class="escaner-pie">
      <p class="escaner-estado" role="status">Apunte la cámara al QR del equipo.</p>
      <ul class="escaner-lista"></ul>
      <button type="button" class="principal">Listo</button>
    </div>`;
  document.body.append(capa);
  document.body.classList.add('sin-scroll');
  const video = capa.querySelector('video');
  const estado = capa.querySelector('.escaner-estado');
  const lista = capa.querySelector('.escaner-lista');
  let activo = true;
  let flujo = null;
  const vistos = new Set();
  let ocupado = false;

  const cerrar = () => {
    activo = false;
    flujo?.getTracks().forEach(t => t.stop());
    capa.remove();
    document.body.classList.remove('sin-scroll');
    document.removeEventListener('keydown', teclas);
  };
  const teclas = ev => { if (ev.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', teclas);
  capa.querySelector('button').addEventListener('click', cerrar);
  capa.querySelector('button').focus();

  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (e) {
    estado.textContent = 'No se pudo usar la cámara. Revise el permiso del navegador o escriba el código.';
    return;
  }
  if (!activo) { flujo.getTracks().forEach(t => t.stop()); return; }
  video.srcObject = flujo;
  await video.play().catch(() => {});

  let detectar;
  if ('BarcodeDetector' in window) {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    detectar = async () => (await detector.detect(video))[0]?.rawValue;
  } else {
    let jsQR;
    try { jsQR = await cargarJsQR(); } catch (e) { estado.textContent = e.message + ' Escriba el código.'; return; }
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    detectar = async () => {
      const w = video.videoWidth, h = video.videoHeight;
      if (!w) return null;
      const escala = Math.min(1, 640 / Math.max(w, h));
      lienzo.width = w * escala; lienzo.height = h * escala;
      ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      return jsQR(ctx.getImageData(0, 0, lienzo.width, lienzo.height).data, lienzo.width, lienzo.height)?.data;
    };
  }

  const ciclo = async () => {
    if (!activo) return;
    if (!ocupado && video.readyState >= 2) {
      try {
        const codigo = codigoDe(await detectar());
        if (codigo && !vistos.has(codigo)) {
          vistos.add(codigo);
          ocupado = true;
          navigator.vibrate?.(60);
          estado.textContent = `Leyendo ${codigo}…`;
          const mensaje = await alEncontrar(codigo);
          const li = document.createElement('li');
          li.textContent = mensaje;
          lista.prepend(li);
          estado.textContent = 'Escanee el siguiente equipo o toque «Listo».';
          ocupado = false;
        }
      } catch (e) { ocupado = false; }
    }
    setTimeout(() => requestAnimationFrame(ciclo), 180);
  };
  ciclo();
}
