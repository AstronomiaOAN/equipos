import { CONFIG } from './config.js';
import { llamar, MODO_DEMO } from './api.js';
import { reiniciarDemo } from './demo.js';
import { abrirEscaner, camaraDisponible, codigoDe } from './escaner.js';
import { CATALOGOS as CATALOGOS_LOCALES, ESTADOS_EQUIPO, ESTADOS_PRESTAMO, EQUIPOS_DEMO, DIAS_MAX_PRESTAMO } from './catalogos.js';

// ─── Estado y utilidades ────────────────────────────────────────────────────

const raiz = document.getElementById('app');
let catalogos = CATALOGOS_LOCALES;

const almacen = {
  leer(clave) { try { return JSON.parse(localStorage.getItem(clave)); } catch (e) { return null; } },
  escribir(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ } },
  borrar(clave) { try { localStorage.removeItem(clave); } catch (e) { /* nada */ } }
};
let sesion = almacen.leer('oan-sesion');

/**
 * La «salida» es la lista de equipos que la persona va a sacar para una misma actividad.
 * Se guarda en el navegador mientras la arma, junto con lo que lleva escrito del formulario,
 * para que pueda escanear otros QR con la cámara del celular sin perder nada.
 */
const salida = {
  equipos() { return almacen.leer('oan-salida') || []; },
  guardar(lista) { lista.length ? almacen.escribir('oan-salida', lista) : this.vaciar(); },
  agregar(eq) {
    const lista = this.equipos().filter(x => x.id !== eq.id);
    lista.push({ id: eq.id, nombre: eq.nombre, componentes: eq.componentes || [], laboratorio: eq.laboratorio, foto: eq.foto || '' });
    this.guardar(lista);
  },
  quitar(id) { this.guardar(this.equipos().filter(x => x.id !== id)); },
  tiene(id) { return this.equipos().some(x => x.id === id); },
  vaciar() { almacen.borrar('oan-salida'); almacen.borrar('oan-borrador'); }
};

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sinTildes = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Una foto del equipo, o un recuadro con un ícono si no tiene o si no carga. */
const ICONO_EQUIPO = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 30l26-14 3 6-26 14z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M22 30l-6 12M24 29l6 13M37 22l4-2" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="23" cy="29" r="2.5" fill="currentColor"/></svg>';
const fotoVacia = () => `<div class="foto-vacia">${ICONO_EQUIPO}<span>Foto pendiente</span></div>`;
function fotoDe(eq, cargaDiferida = true) {
  if (!eq.foto) return fotoVacia();
  return `<img class="foto" src="${esc(eq.foto)}" alt="${esc(eq.nombre)}"${cargaDiferida ? ' loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer">`;
}
document.addEventListener('error', ev => {
  const img = ev.target;
  if (img.tagName === 'IMG' && img.classList.contains('foto')) img.outerHTML = fotoVacia();
}, true);

function creditoFoto(eq) {
  const c = String(eq.credito_foto || '').trim();
  if (!c) return '';
  if (!/^https:\/\//.test(c)) return esc(c);
  const fuente = c.includes('wikimedia.org') ? 'Wikimedia Commons' : new URL(c).hostname;
  return `Foto de referencia: <a href="${esc(c)}" target="_blank" rel="noopener">${esc(fuente)}</a> (autor y licencia)`;
}

/** «Apertura: 203 mm; Distancia focal: 2032 mm» → [['Apertura', '203 mm'], …] */
const caracteristicas = texto => String(texto || '').split(/\s*[;\n]\s*/).filter(Boolean).map(par => {
  const i = par.indexOf(':');
  return i > 0 ? [par.slice(0, i).trim(), par.slice(i + 1).trim()] : ['', par.trim()];
});

const opciones = (lista, elegido) => lista.map(o => `<option${o === elegido ? ' selected' : ''}>${esc(o)}</option>`).join('');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const formatoFecha = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
const fecha = v => v ? formatoFecha.format(new Date(v)) : '—';

// Plazos en días calendario (hora de Colombia): el préstamo vence al final del día elegido.
const formatoDia = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' });
const dia = v => v ? formatoDia.format(new Date(v)) : '—';
const formatoDiaCorto = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
const hoyBogota = () => new Date(Date.now() - 5 * 36e5).toISOString().slice(0, 10);
const sumarDias = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const finDelDia = ymd => new Date(ymd + 'T23:59:00-05:00');

/** Valor para un <input type="datetime-local"> en la hora del dispositivo. */
function valorLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Agrupa préstamos por salida (lote), conservando el orden. */
function porSalida(lista) {
  const grupos = new Map();
  lista.forEach(p => {
    const k = p.lote_id || p.id;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  });
  return [...grupos.entries()].map(([lote, items]) => ({ lote, items }));
}

function ir(ruta, reemplazar = false) {
  history[reemplazar ? 'replaceState' : 'pushState']({}, '', ruta);
  enrutar();
}

function mostrar(html) {
  raiz.innerHTML = html;
  const titulo = raiz.querySelector('h1, h2');
  if (titulo) { titulo.setAttribute('tabindex', '-1'); titulo.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}

function cargando(texto = 'Cargando…') {
  raiz.innerHTML = `<p class="cargando" role="status">${esc(texto)}</p>`;
}

function aviso(form, mensaje) {
  let caja = form.querySelector('.error');
  if (!caja) {
    caja = document.createElement('p');
    caja.className = 'error';
    caja.setAttribute('role', 'alert');
    form.querySelector('.acciones').before(caja);
  }
  caja.textContent = mensaje;
  caja.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** Envía un formulario: desactiva el botón, llama la acción y maneja errores y sesión vencida. */
async function enviar(form, accion, datos, alTerminar) {
  const boton = form.querySelector('button[type=submit]');
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Enviando…';
  const r = await llamar(accion, { token: sesion?.token, ...datos });
  boton.disabled = false;
  boton.textContent = original;
  if (r.ok) {
    if (!['solicitarCodigo', 'verificarCodigo'].includes(accion)) cacheCatalogo = null;
    return alTerminar(r);
  }
  if (r.codigo === 401 && accion !== 'verificarCodigo') {
    cerrarSesion(false);
    return pedirSesion(location.search);
  }
  aviso(form, r.error || 'No se pudo completar la acción.');
}

function cerrarSesion(redirigir = true) {
  sesion = null;
  almacen.borrar('oan-sesion');
  pintarCabecera();
  if (redirigir) ir('./', true);
}

function pintarCabecera() {
  const zona = document.getElementById('cuenta');
  if (!zona) return;
  const n = salida.equipos().length;
  zona.innerHTML = '<a href="?vista=catalogo">Equipos</a>' + (n ? `<a href="?vista=salida" class="enlace-salida">Mi salida (${n})</a>` : '') + (sesion
    ? `<a href="?vista=mis">Mis préstamos</a>${sesion.usuario?.gestiona?.length ? '<a href="?vista=gestion">Panel</a>' : ''}`
    : '<a href="?vista=entrar">Iniciar sesión</a>');
}

// ─── Modo nocturno (luz roja para no perder la adaptación a la oscuridad) ───

function aplicarNocturno(activo) {
  document.documentElement.dataset.nocturno = activo ? 'si' : 'no';
  const boton = document.getElementById('nocturno');
  boton.setAttribute('aria-pressed', String(activo));
  boton.querySelector('span').textContent = activo ? 'Luz roja activada' : 'Luz roja';
  document.querySelector('meta[name=theme-color]').content = activo ? '#140302' : '#f3f6f9';
}

// ─── Inicio y sesión ────────────────────────────────────────────────────────

function vistaInicio() {
  const demo = MODO_DEMO ? `
    <section class="demo-lista">
      <h2>Equipos de ejemplo</h2>
      <p>En la demostración no hace falta escanear: abra cualquiera de estos equipos.</p>
      <ul class="enlaces-equipos">
        ${EQUIPOS_DEMO.map(e => `<li><a href="?e=${e.id}"><span class="codigo-mini">${e.id}</span> ${esc(e.nombre)}</a></li>`).join('')}
      </ul>
      <p class="nota">Para ver el panel del laboratorio, inicie sesión como <strong>tecnico@unal.edu.co</strong>.
      <button type="button" class="enlace" id="reiniciar">Borrar los datos de la demostración</button></p>
    </section>` : '';
  mostrar(`
    <h1>Préstamo de equipos</h1>
    <p class="entrada">Escanee con la cámara del celular el código QR pegado en el equipo. Si va a sacar varios equipos para la misma actividad, escanee el primero y agregue los demás desde el formulario.</p>
    <p><a class="boton secundario" href="?vista=catalogo">Ver todos los equipos</a></p>
    <form id="buscar" class="buscar" novalidate>
      <label for="codigo">Código del equipo</label>
      <div class="fila-buscar">
        <input id="codigo" name="codigo" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="OAN-TEL-0001" required>
        <button type="submit">Abrir</button>
      </div>
    </form>
    ${demo}`);
  document.getElementById('buscar').addEventListener('submit', ev => {
    ev.preventDefault();
    const valor = ev.target.codigo.value;
    const codigo = codigoDe(valor) || valor.trim().toUpperCase().replace(/\s+/g, '');
    if (codigo) ir('?e=' + encodeURIComponent(codigo));
  });
  document.getElementById('reiniciar')?.addEventListener('click', () => {
    reiniciarDemo();
    salida.vaciar();
    cerrarSesion();
  });
}

function pedirSesion(volverA) {
  mostrar(`
    <h1>Iniciar sesión</h1>
    <p class="entrada">Le enviaremos un código de 6 dígitos a su correo para confirmar que es usted. En este celular la sesión dura 30 días.</p>
    <form id="f-correo" novalidate>
      <label for="email">Correo electrónico</label>
      <input id="email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="usuario@unal.edu.co" required>
      <p class="ayuda">Use el correo institucional. Si no pertenece a la universidad, use su correo personal: su préstamo necesitará un avalista.</p>
      <div class="acciones"><button type="submit" class="principal">Enviarme el código</button></div>
    </form>`);
  const form = document.getElementById('f-correo');
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const email = form.email.value.trim();
    enviar(form, 'solicitarCodigo', { email }, r => pedirCodigo(email, r, volverA));
  });
}

function pedirCodigo(email, envio, volverA) {
  mostrar(`
    <h1>Escriba el código</h1>
    <p class="entrada">Lo enviamos a <strong>${esc(email)}</strong>. Vence en ${esc(envio.minutos)} minutos. Revise también la carpeta de correo no deseado.</p>
    ${envio.codigo_demo ? `<p class="nota demo-codigo">Demostración: el código es <strong>${esc(envio.codigo_demo)}</strong></p>` : ''}
    <form id="f-codigo" novalidate>
      <label for="cod">Código de 6 dígitos</label>
      <input id="cod" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="codigo-otp" required>
      <div class="acciones">
        <button type="submit" class="principal">Entrar</button>
        <button type="button" class="secundario" id="otro">Usar otro correo</button>
      </div>
    </form>`);
  const form = document.getElementById('f-codigo');
  document.getElementById('otro').addEventListener('click', () => pedirSesion(volverA));
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    enviar(form, 'verificarCodigo', { email, codigo: form.codigo.value }, r => {
      sesion = { token: r.token, usuario: r.usuario };
      almacen.escribir('oan-sesion', sesion);
      pintarCabecera();
      ir(volverA && !volverA.includes('vista=entrar') ? volverA : './', true);
    });
  });
}

// ─── Ficha del equipo (lo que abre el QR) ───────────────────────────────────

async function vistaEquipo(id) {
  cargando('Buscando el equipo…');
  const r = await llamar('equipo', { id, token: sesion?.token });
  if (!r.ok) {
    mostrar(`<h1>No encontramos el equipo</h1><p class="entrada">${esc(r.error)}</p>
      <p><a class="boton secundario" href="./">Buscar otro código</a></p>`);
    return;
  }
  if (r.catalogos) catalogos = { ...CATALOGOS_LOCALES, ...r.catalogos };
  const { equipo: eq, prestamo: p, puede_gestionar: gestor } = r;
  const enSalida = salida.equipos();
  const diasMax = eq.dias_max || DIAS_MAX_PRESTAMO;

  let accion = '';
  if (eq.estado === 'disponible') {
    if (salida.tiene(eq.id)) {
      accion = `<p class="aviso-estado">Este equipo ya está en su salida.</p>
        <a class="boton principal" href="?vista=salida">Continuar con la salida (${enSalida.length})</a>`;
    } else if (enSalida.length) {
      accion = `<button class="principal" id="b-prestar">Agregar a mi salida</button>
        <p class="ayuda">Su salida ya tiene ${plural(enSalida.length, 'equipo', 'equipos')}: ${esc(enSalida.map(x => x.nombre).join(', '))}.</p>`;
    } else {
      accion = `<button class="principal" id="b-prestar">Prestar este equipo</button>
        <p class="ayuda">¿Necesita varios equipos para la misma actividad? Después de este podrá agregar los demás.</p>`;
    }
  } else if (eq.estado === 'prestado' && p) {
    const plazo = `${p.vencido ? 'Debía devolverse el' : 'Se devuelve a más tardar el'} <strong>${dia(p.fecha_prevista)}</strong>`;
    const varios = p.es_mio && p.activos_en_salida > 1;
    accion = p.es_mio || gestor
      ? `${gestor && !p.es_mio ? datosSolicitante(p) : ''}
         <div class="aviso-estado ${p.vencido ? 'vencido' : ''}"><p>${p.es_mio ? 'Usted tiene este equipo. ' : ''}${plazo}.</p></div>
         <button class="principal" id="b-devolver">${p.es_mio ? 'Devolver este equipo' : 'Registrar la devolución'}</button>
         ${varios ? `<button class="secundario ancho" id="b-devolver-todo">Devolver los ${p.activos_en_salida} equipos de esta salida</button>` : ''}`
      : `<p class="aviso-estado ${p.vencido ? 'vencido' : ''}">${plazo}.</p>`;
  } else {
    accion = `<p class="aviso-estado">Este equipo no se puede prestar en este momento (${esc(ESTADOS_EQUIPO[eq.estado] || eq.estado).toLowerCase()}).</p>`;
  }

  mostrar(`
    <article class="equipo">
      <p class="codigo-equipo">${esc(eq.id).replace(/-/g, '‑')}</p>
      <h1>${esc(eq.nombre)}</h1>
      <p class="estado estado-${esc(eq.estado)}"><span class="punto" aria-hidden="true"></span>${esc(ESTADOS_EQUIPO[eq.estado] || eq.estado)}</p>
      <figure class="foto-equipo"><span class="marco-foto">${fotoDe(eq, false)}</span>${eq.credito_foto ? `<figcaption>${creditoFoto(eq)}</figcaption>` : ''}</figure>
      <div class="zona-accion">${accion}</div>
      ${eq.descripcion ? `<p class="descripcion">${esc(eq.descripcion)}</p>` : ''}
      ${caracteristicas(eq.especificaciones).length ? `<h2 class="subtitulo">Características</h2>
      <dl class="ficha">${caracteristicas(eq.especificaciones).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      <h2 class="subtitulo">Préstamo</h2>
      <dl class="ficha">
        <div><dt>Laboratorio</dt><dd>${esc(eq.laboratorio)}${eq.ubicacion ? `<br><span class="tenue">${esc(eq.ubicacion)}</span>` : ''}</dd></div>
        ${eq.marca || eq.modelo ? `<div><dt>Modelo</dt><dd>${esc([eq.marca, eq.modelo].filter(Boolean).join(' '))}</dd></div>` : ''}
        <div><dt>Plazo</dt><dd>Hasta ${diasMax} días calendario.</dd></div>
        ${eq.componentes?.length ? `<div><dt>Incluye</dt><dd><ul class="componentes">${eq.componentes.map(c => `<li>${esc(c)}</li>`).join('')}</ul></dd></div>` : ''}
        ${eq.notas ? `<div><dt>Notas</dt><dd>${esc(eq.notas)}</dd></div>` : ''}
      </dl>
      <p class="pie-equipo"><button class="enlace" id="b-reportar">Reportar un daño o falla de este equipo</button></p>
    </article>`);

  const requiereSesion = fn => () => sesion ? fn() : pedirSesion(location.search);
  document.getElementById('b-prestar')?.addEventListener('click', () => {
    salida.agregar(eq);
    pintarCabecera();
    ir('?vista=salida');
  });
  document.getElementById('b-devolver')?.addEventListener('click', requiereSesion(() => formularioDevolucion([{ ...p, equipo_id: eq.id, equipo_nombre: eq.nombre }])));
  document.getElementById('b-devolver-todo')?.addEventListener('click', requiereSesion(() => devolverSalida(p.lote_id)));
  document.getElementById('b-reportar').addEventListener('click', requiereSesion(() => formularioReporte(eq)));
}

function datosSolicitante(p) {
  return `<dl class="ficha solicitante">
    <div><dt>Responsable</dt><dd>${esc(p.nombre)}${p.tipo_usuario ? ` · ${esc(p.tipo_usuario)}` : ''}<br><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd></div>
    <div><dt>Actividad</dt><dd>${esc(p.proposito)}<br><span class="tenue">${esc(p.descripcion)}</span></dd></div>
    ${p.lugar_uso ? `<div><dt>Dónde</dt><dd>${esc(p.lugar_uso)}</dd></div>` : ''}
    ${p.avalista_email ? `<div><dt>Avalista</dt><dd>${esc(p.avalista_email)}</dd></div>` : ''}
    <div><dt>Plazo</dt><dd>Salió el ${fecha(p.fecha_salida)}<br>Devolver a más tardar el ${dia(p.fecha_prevista)}</dd></div>
  </dl>`;
}

// ─── Salida: varios equipos para una misma actividad ────────────────────────

/** Agrega un equipo a la salida consultando su estado. Devuelve un texto de confirmación. */
async function agregarPorCodigo(codigo) {
  if (salida.tiene(codigo)) return `${codigo} ya estaba en la lista.`;
  const r = await llamar('equipos', { ids: [codigo] });
  const eq = r.ok && r.equipos[0];
  if (!eq || eq.error) return `${codigo}: ${eq?.error || r.error || 'no se pudo consultar.'}`;
  if (eq.estado !== 'disponible') return `${eq.nombre} no está disponible (${(ESTADOS_EQUIPO[eq.estado] || eq.estado).toLowerCase()}).`;
  salida.agregar(eq);
  pintarCabecera();
  return `Agregado: ${eq.nombre} (${eq.id}).`;
}

function guardarBorrador(form) {
  const datos = {};
  new FormData(form).forEach((v, k) => { if (typeof v === 'string') datos[k] = v; });
  form.querySelectorAll('input[type=checkbox]').forEach(c => { datos[c.name] = c.checked; });
  almacen.escribir('oan-borrador', datos);
}

function restaurarBorrador(form) {
  const datos = almacen.leer('oan-borrador');
  if (!datos) return;
  Object.entries(datos).forEach(([k, v]) => {
    const campo = form.elements[k];
    if (!campo) return;
    if (campo instanceof RadioNodeList) { campo.value = v; return; }
    if (campo.type === 'checkbox') campo.checked = !!v;
    else campo.value = v;
  });
}

function vistaSalida() {
  if (!sesion) return pedirSesion('?vista=salida');
  const equipos = salida.equipos();
  if (!equipos.length) {
    mostrar(`<h1>Mi salida</h1>
      <p class="entrada">No hay equipos en la lista. Escanee el QR del primer equipo que va a sacar o elíjalo en el catálogo.</p>
      <div class="acciones">${camaraDisponible() ? '<button class="principal" id="b-escanear">Escanear QR</button>' : ''}
      <a class="boton secundario" href="?vista=catalogo">Ver los equipos</a></div>`);
    document.getElementById('b-escanear')?.addEventListener('click', escanearYVolver);
    return;
  }
  const u = sesion.usuario || {};
  const externo = !u.interno;
  const EXTERNO = 'Externo a la UNAL';
  const tipoActual = u.tipo === 'Externo' ? EXTERNO : u.tipo;
  const varios = equipos.length > 1;
  const hoy = hoyBogota();
  const maximo = sumarDias(hoy, DIAS_MAX_PRESTAMO);
  const atajos = [['Hoy', 0], ['Mañana', 1], ['En 3 días', 3], ['En una semana', DIAS_MAX_PRESTAMO]];

  const perfil = u.registrado ? '' : `
    <fieldset>
      <legend>Sus datos</legend>
      <p class="ayuda">Solo se piden la primera vez.</p>
      <label for="nombre">Nombre completo</label>
      <input id="nombre" name="nombre" autocomplete="name" required>
      <label class="casilla"><input type="checkbox" name="acepta_datos" required>
        <span>Autorizo el tratamiento de mis datos personales para gestionar el préstamo, según la <a href="${esc(CONFIG.URL_POLITICA_DATOS)}" target="_blank" rel="noopener">política de datos</a> (Ley 1581 de 2012).</span></label>
    </fieldset>`;

  mostrar(`
    <h1>${varios ? `Préstamo de ${equipos.length} equipos` : `Prestar ${esc(equipos[0].nombre)}`}</h1>
    <form id="f-prestamo" novalidate>
      <fieldset>
        <legend>Equipos</legend>
        <ul class="lista-salida">
          ${equipos.map(e => `<li>
            <span class="miniatura">${fotoDe(e)}</span>
            <span class="lista-salida-texto"><strong>${esc(e.nombre)}</strong><br><span class="tenue">${esc(e.id)}</span></span>
            <button type="button" class="quitar" data-quitar="${esc(e.id)}" aria-label="Quitar ${esc(e.nombre)}">Quitar</button>
          </li>`).join('')}
        </ul>
        <div class="agregar-equipo">
          ${camaraDisponible() ? '<button type="button" class="secundario" id="b-escanear">Escanear otro QR</button>' : ''}
          <div class="fila-buscar">
            <label class="oculto" for="otro-codigo">Código de otro equipo</label>
            <input id="otro-codigo" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Código, p. ej. OAN-OCU-0001">
            <button type="button" class="secundario" id="b-agregar">Agregar</button>
          </div>
          <p class="ayuda" id="msj-agregar" role="status"></p>
        </div>
      </fieldset>
      ${perfil}
      <fieldset>
        <legend>Préstamo</legend>
        <label for="tipo-usuario">Usted es</label>
        <select id="tipo-usuario" name="tipo_usuario" required>${externo
          ? opciones([EXTERNO], EXTERNO)
          : `<option value="">Seleccione…</option>${opciones(catalogos.tipos_usuario, tipoActual)}`}</select>
        ${externo ? '<p class="ayuda">Su correo no es de la UNAL, por eso se registra como externo.</p>' : ''}
        <label for="proposito">Tipo de actividad</label>
        <select id="proposito" name="proposito" required><option value="">Seleccione…</option>${opciones(catalogos.propositos)}</select>
        <label for="descripcion">Descripción breve</label>
        <input id="descripcion" name="descripcion" maxlength="300" placeholder="Ej.: observación pública de la Luna" required>
        <fieldset class="grupo-opciones">
          <legend>¿Dónde ${varios ? 'se usarán' : 'se usará'}?</legend>
          ${(catalogos.lugares || []).map((l, i) => `<label class="casilla"><input type="radio" name="lugar_uso" value="${esc(l)}" required><span>${esc(l)}</span></label>`).join('')}
        </fieldset>
        <label for="devolucion">Día de devolución</label>
        <div class="atajos" role="group" aria-label="Elegir rápido el día de devolución">
          ${atajos.map(([t, n]) => `<button type="button" class="chip" data-dias="${n}">${t}</button>`).join('')}
        </div>
        <input id="devolucion" name="fecha_devolucion" type="date" min="${hoy}" max="${maximo}" value="${sumarDias(hoy, 1)}" required>
        <p class="ayuda" id="ayuda-devolucion"></p>
        <div id="bloque-avalista"${externo || tipoActual === EXTERNO ? '' : ' hidden'}>
          <label for="avalista">Correo institucional de su avalista</label>
          <input id="avalista" name="avalista_email" type="email" inputmode="email" placeholder="docente@unal.edu.co">
          <p class="ayuda">Docente o funcionario de la universidad que responde por el préstamo.</p>
        </div>
        <label class="casilla compromiso"><input type="checkbox" name="compromiso" required>
          <span>Recibo ${varios ? 'los equipos completos' : 'el equipo completo'} y me comprometo a cuidar${varios ? 'los' : 'lo'} y devolver${varios ? 'los' : 'lo'} a tiempo.</span></label>
      </fieldset>
      <div class="acciones">
        <button type="submit" class="principal">${varios ? `Registrar préstamo de ${equipos.length} equipos` : 'Registrar préstamo'}</button>
        <button type="button" class="secundario" id="b-vaciar">Cancelar</button>
      </div>
    </form>`);

  const form = document.getElementById('f-prestamo');
  restaurarBorrador(form);
  if (form.fecha_devolucion.value < hoy || form.fecha_devolucion.value > maximo) form.fecha_devolucion.value = sumarDias(hoy, 1);
  const actualizarFecha = () => {
    const v = form.fecha_devolucion.value;
    const n = v ? Math.round((Date.parse(v) - Date.parse(hoy)) / 864e5) : null;
    document.getElementById('ayuda-devolucion').textContent = v
      ? `Devolver a más tardar el ${dia(finDelDia(v))}${n === 0 ? ' (hoy)' : n === 1 ? ' (mañana)' : ` (en ${n} días)`}. Máximo ${DIAS_MAX_PRESTAMO} días calendario.`
      : `Máximo ${DIAS_MAX_PRESTAMO} días calendario.`;
    form.querySelectorAll('[data-dias]').forEach(b => b.setAttribute('aria-pressed', String(v === sumarDias(hoy, Number(b.dataset.dias)))));
  };
  form.querySelectorAll('[data-dias]').forEach(b => b.addEventListener('click', () => {
    form.fecha_devolucion.value = sumarDias(hoy, Number(b.dataset.dias));
    actualizarFecha();
    guardarBorrador(form);
  }));
  form.addEventListener('change', () => { actualizarFecha(); guardarBorrador(form); });
  form.addEventListener('input', () => guardarBorrador(form));
  actualizarFecha();

  form.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => {
    guardarBorrador(form);
    salida.quitar(b.dataset.quitar);
    pintarCabecera();
    vistaSalida();
  }));
  const msj = document.getElementById('msj-agregar');
  const agregar = async () => {
    const campo = document.getElementById('otro-codigo');
    const codigo = codigoDe(campo.value) || campo.value.trim().toUpperCase();
    if (!codigo) return;
    guardarBorrador(form);
    msj.textContent = 'Consultando…';
    const texto = await agregarPorCodigo(codigo);
    if (texto.startsWith('Agregado')) vistaSalida(); else msj.textContent = texto;
  };
  document.getElementById('b-agregar').addEventListener('click', agregar);
  document.getElementById('otro-codigo').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); agregar(); } });
  document.getElementById('b-escanear')?.addEventListener('click', () => { guardarBorrador(form); escanearYVolver(); });
  document.getElementById('b-vaciar').addEventListener('click', () => {
    if (!confirm('¿Descartar esta salida y su lista de equipos?')) return;
    salida.vaciar();
    pintarCabecera();
    ir('./');
  });

  form.tipo_usuario.addEventListener('change', () => {
    document.getElementById('bloque-avalista').hidden = form.tipo_usuario.value !== EXTERNO;
  });

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (form.nombre && form.nombre.value.trim().length < 3) return aviso(form, 'Escriba su nombre completo.');
    if (form.tipo_usuario && !form.tipo_usuario.value) return aviso(form, 'Seleccione su vinculación con la universidad.');
    if (form.tipo_usuario.value === EXTERNO && !/@/.test(form.avalista_email.value)) return aviso(form, 'Escriba el correo institucional de su avalista.');
    if (form.acepta_datos && !form.acepta_datos.checked) return aviso(form, 'Debe autorizar el tratamiento de datos para registrar el préstamo.');
    if (!form.proposito.value) return aviso(form, 'Seleccione para qué va a usar los equipos.');
    if (form.descripcion.value.trim().length < 3) return aviso(form, 'Escriba en pocas palabras la actividad.');
    if (!form.lugar_uso.value) return aviso(form, 'Elija dónde se usarán los equipos.');
    const v = form.fecha_devolucion.value;
    if (!v || v < hoy || v > maximo) return aviso(form, `Elija un día de devolución entre hoy y el ${dia(finDelDia(maximo))}.`);
    if (!form.compromiso.checked) return aviso(form, 'Marque la casilla de compromiso para continuar.');
    const datos = {
      equipos: equipos.map(e => e.id),
      proposito: form.proposito.value,
      descripcion: form.descripcion.value,
      lugar_uso: form.lugar_uso.value,
      tipo_usuario: form.tipo_usuario.value,
      fecha_devolucion: v,
      fecha_prevista: finDelDia(v).toISOString(),
      avalista_email: form.tipo_usuario.value === EXTERNO ? form.avalista_email.value : ''
    };
    if (form.nombre) datos.perfil = { nombre: form.nombre.value, tipo: datos.tipo_usuario, acepta_datos: form.acepta_datos.checked };
    enviar(form, 'prestar', datos, r => {
      if (datos.perfil) {
        sesion.usuario = { ...sesion.usuario, registrado: true, nombre: datos.perfil.nombre };
      }
      sesion.usuario = { ...sesion.usuario, tipo: datos.tipo_usuario };
      almacen.escribir('oan-sesion', sesion);
      salida.vaciar();
      pintarCabecera();
      comprobante(r.prestamos || [r.prestamo], 'prestamo');
    });
  });
}

function escanearYVolver() {
  abrirEscaner(agregarPorCodigo).then(() => {
    // Al cerrar el lector se redibuja la lista con lo agregado.
    const vigilar = setInterval(() => {
      if (!document.querySelector('.escaner')) { clearInterval(vigilar); vistaSalida(); }
    }, 300);
  });
}

// ─── Devolución (uno o varios equipos) ──────────────────────────────────────

async function devolverSalida(loteId) {
  cargando();
  const r = await llamar('misPrestamos', { token: sesion.token });
  if (!r.ok) {
    if (r.codigo === 401) { cerrarSesion(false); return pedirSesion(location.search); }
    return mostrar(`<p class="error">${esc(r.error)}</p>`);
  }
  const items = r.prestamos.filter(p => p.lote_id === loteId && p.estado === 'activo');
  if (!items.length) return ir('?vista=mis', true);
  formularioDevolucion(items);
}

async function formularioDevolucion(items) {
  cargando();
  const info = await llamar('equipos', { ids: items.map(p => p.equipo_id) });
  const fichas = Object.fromEntries((info.equipos || []).map(e => [e.id, e]));
  const varios = items.length > 1;
  mostrar(`
    ${varios ? '' : `<p class="migas"><a href="?e=${esc(items[0].equipo_id)}">${esc(items[0].equipo_id)}</a></p>`}
    <h1>${varios ? `Devolver ${items.length} equipos` : `Devolver ${esc(items[0].equipo_nombre)}`}</h1>
    <p class="entrada">Revise que esté completo.${varios ? ' Desmarque los equipos que todavía no devuelve.' : ''}</p>
    <form id="f-devolucion" novalidate>
      ${items.map((p, i) => {
        const comps = fichas[p.equipo_id]?.componentes || [];
        return `<fieldset class="item-devolucion" data-equipo="${esc(p.equipo_id)}">
          <legend>${varios ? `<label class="casilla-titulo"><input type="checkbox" name="incluir" value="${esc(p.equipo_id)}" checked> ` : ''}${esc(p.equipo_nombre)}${varios ? '</label>' : ''}</legend>
          <p class="tenue codigo-linea">${esc(p.equipo_id)}${comps.length ? ` · Incluye: ${esc(comps.join(', '))}` : ''}</p>
          <label for="cond-${i}">Estado en que lo entrega</label>
          <select id="cond-${i}" name="condicion">${opciones(catalogos.condiciones, 'Bueno')}</select>
          <label for="obs-${i}" class="obs-etiqueta" hidden>Describa el daño o lo que falta</label>
          <textarea id="obs-${i}" name="observaciones" rows="2" maxlength="500" placeholder="Qué pasó o qué falta" hidden></textarea>
        </fieldset>`;
      }).join('')}
      <div class="acciones">
        <button type="submit" class="principal">Registrar devolución</button>
        <a class="boton secundario" href="?vista=mis">Cancelar</a>
      </div>
    </form>`);
  const form = document.getElementById('f-devolucion');
  const bloques = [...form.querySelectorAll('.item-devolucion')];
  const refrescar = () => {
    const incluidos = bloques.filter(b => b.querySelector('[name=incluir]')?.checked !== false);
    bloques.forEach(b => {
      const activo = b.querySelector('[name=incluir]')?.checked !== false;
      b.classList.toggle('excluido', !activo);
      const problema = ['Dañado', 'Incompleto'].includes(b.querySelector('[name=condicion]').value);
      b.querySelector('.obs-etiqueta').hidden = !problema;
      b.querySelector('[name=observaciones]').hidden = !problema;
    });
    form.querySelector('button[type=submit]').textContent = incluidos.length > 1 ? `Registrar devolución de ${incluidos.length} equipos` : 'Registrar devolución';
  };
  form.addEventListener('change', refrescar);
  refrescar();
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const devoluciones = bloques.filter(b => b.querySelector('[name=incluir]')?.checked !== false).map(b => ({
      equipo_id: b.dataset.equipo,
      condicion: b.querySelector('[name=condicion]').value,
      observaciones: b.querySelector('[name=observaciones]').hidden ? '' : b.querySelector('[name=observaciones]').value
    }));
    if (!devoluciones.length) return aviso(form, 'Marque al menos un equipo para devolver.');
    const sinDescribir = devoluciones.find(d => ['Dañado', 'Incompleto'].includes(d.condicion) && d.observaciones.trim().length < 5);
    if (sinDescribir) return aviso(form, `Describa el daño o lo que falta de ${sinDescribir.equipo_id}.`);
    enviar(form, 'devolver', { devoluciones }, r => comprobante(r.prestamos || [r.prestamo], 'devolucion'));
  });
}

function formularioReporte(eq) {
  mostrar(`
    <p class="migas"><a href="?e=${esc(eq.id)}">${esc(eq.id)}</a></p>
    <h1>Reportar un problema</h1>
    <p class="entrada">${esc(eq.nombre)}. El reporte le llega al responsable del laboratorio.</p>
    <form id="f-reporte" novalidate>
      <label for="tipo-inc">Tipo de problema</label>
      <select id="tipo-inc" name="tipo" required><option value="">Seleccione…</option>${opciones(catalogos.tipos_incidencia)}</select>
      <label for="desc-inc">¿Qué pasó?</label>
      <textarea id="desc-inc" name="descripcion" rows="4" maxlength="500" required></textarea>
      <div class="acciones">
        <button type="submit" class="principal">Enviar reporte</button>
        <a class="boton secundario" href="?e=${esc(eq.id)}">Cancelar</a>
      </div>
    </form>`);
  const form = document.getElementById('f-reporte');
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    enviar(form, 'reportar', { equipo_id: eq.id, tipo: form.tipo.value, descripcion: form.descripcion.value }, () => {
      mostrar(`<h1>Reporte enviado</h1><p class="entrada">Gracias. El laboratorio revisará el ${esc(eq.nombre)}.</p>
        <p><a class="boton" href="?e=${esc(eq.id)}">Volver al equipo</a></p>`);
    });
  });
}

function comprobante(prestamos, tipo) {
  const p = prestamos[0];
  const devolucion = tipo === 'devolucion';
  const enMantenimiento = prestamos.some(x => x.estado_equipo === 'mantenimiento');
  const mensaje = devolucion
    ? (enMantenimiento ? 'Los equipos con daño o faltantes quedaron en mantenimiento. El laboratorio ya fue avisado.' : 'El laboratorio ya fue avisado. Gracias por devolver a tiempo.')
    : 'El laboratorio ya fue avisado. Para devolver, escanee el QR de cualquiera de los equipos o use «Mis préstamos».';
  mostrar(`
    <section class="comprobante">
      <h1>${devolucion ? 'Devolución registrada' : 'Préstamo registrado'}</h1>
      <p class="hora-grande">${fecha(devolucion ? p.fecha_devolucion : p.fecha_salida)}</p>
      <ul class="prestamos">${prestamos.map(x => `
        <li><span class="titulo-prestamo">${esc(x.equipo_nombre)}</span>
        <span class="detalle">${esc(x.equipo_id)}${devolucion ? ` · ${esc(x.condicion_devolucion)}` : ''}</span></li>`).join('')}</ul>
      <dl class="ficha">
        <div><dt>Responsable</dt><dd>${esc(p.nombre)}${p.tipo_usuario ? `<br><span class="tenue">${esc(p.tipo_usuario)}</span>` : ''}</dd></div>
        ${devolucion ? '' : `<div><dt>Actividad</dt><dd>${esc(p.proposito)}<br><span class="tenue">${esc(p.descripcion)}</span></dd></div>
        ${p.lugar_uso ? `<div><dt>Dónde</dt><dd>${esc(p.lugar_uso)}</dd></div>` : ''}
        <div><dt>Devolver a más tardar</dt><dd><strong>${dia(p.fecha_prevista)}</strong></dd></div>`}
        <div><dt>Número de salida</dt><dd>${esc(p.lote_id || p.id)}</dd></div>
      </dl>
      <p>${mensaje}</p>
      <div class="acciones"><a class="boton principal" href="?vista=mis">Ver mis préstamos</a><a class="boton secundario" href="./">Listo</a></div>
    </section>`);
}

// ─── Mis préstamos y panel ──────────────────────────────────────────────────

async function vistaMisPrestamos() {
  if (!sesion) return pedirSesion('?vista=mis');
  cargando();
  const r = await llamar('misPrestamos', { token: sesion.token });
  if (!r.ok) {
    if (r.codigo === 401) { cerrarSesion(false); return pedirSesion('?vista=mis'); }
    return mostrar(`<h1>Mis préstamos</h1><p class="error">${esc(r.error)}</p>`);
  }
  sesion.usuario = r.usuario;
  almacen.escribir('oan-sesion', sesion);
  pintarCabecera();
  const activos = r.prestamos.filter(p => p.estado === 'activo');
  const historial = r.prestamos.filter(p => p.estado !== 'activo');
  mostrar(`
    <h1>Mis préstamos</h1>
    <p class="entrada">${esc(r.usuario.nombre || r.usuario.email)}</p>
    <h2>Ahora</h2>
    ${activos.length ? porSalida(activos).map(g => bloqueSalida(g, true)).join('') : '<p class="vacio">No tiene equipos a su cargo. Para prestar uno, escanee su código QR o búsquelo en <a href="?vista=catalogo">Equipos</a>.</p>'}
    ${historial.length ? `<h2>Historial</h2>${listaPrestamos(historial)}` : ''}
    <p class="pie-sesion">${esc(r.usuario.email)} · <button class="enlace" id="salir">Cerrar sesión</button></p>`);
  document.getElementById('salir').addEventListener('click', () => cerrarSesion());
  raiz.querySelectorAll('[data-devolver-lote]').forEach(b => b.addEventListener('click', () => {
    formularioDevolucion(activos.filter(p => (p.lote_id || p.id) === b.dataset.devolverLote));
  }));
}

/** Una salida (varios equipos para una actividad). */
function bloqueSalida({ lote, items }, propio, extra = () => '') {
  const p = items[0];
  return `<section class="salida">
    <p class="salida-titulo"><strong>${propio ? esc(p.proposito) : esc(p.nombre)}</strong>${propio ? '' : ` · ${esc(p.proposito)}`}<br>
      <span class="tenue">${esc(p.descripcion)}${p.lugar_uso ? ` · ${esc(p.lugar_uso)}` : ''}${!propio && p.tipo_usuario ? ` · ${esc(p.tipo_usuario)}` : ''} · devolver a más tardar el ${dia(p.fecha_prevista)}</span></p>
    ${listaPrestamos(items, extra)}
    ${propio ? `<div class="acciones compactas">
      <button class="principal" data-devolver-lote="${esc(lote)}">${items.length > 1 ? `Devolver ${items.length} equipos` : 'Devolver'}</button>
    </div>` : ''}
  </section>`;
}

function listaPrestamos(lista, extra = () => '') {
  return `<ul class="prestamos">${lista.map(p => `
    <li class="${p.vencido ? 'vencido' : ''}" data-prestamo="${esc(p.id)}">
      <a href="?e=${esc(p.equipo_id)}" class="titulo-prestamo">${esc(p.equipo_nombre)}</a>
      <span class="etiqueta etiqueta-${esc(p.estado)}">${p.vencido ? 'Vencido' : esc(ESTADOS_PRESTAMO[p.estado] || p.estado)}</span>
      <span class="detalle">${p.estado === 'activo' ? `Devolver a más tardar el ${dia(p.fecha_prevista)}` :
        p.fecha_devolucion ? `Devuelto el ${fecha(p.fecha_devolucion)}` : `Salió el ${fecha(p.fecha_salida)}`}</span>
      ${extra(p)}
    </li>`).join('')}</ul>`;
}

async function vistaGestion() {
  if (!sesion) return pedirSesion('?vista=gestion');
  cargando();
  const r = await llamar('misPrestamos', { token: sesion.token });
  if (!r.ok) {
    if (r.codigo === 401) { cerrarSesion(false); return pedirSesion('?vista=gestion'); }
    return mostrar(`<h1>Panel del laboratorio</h1><p class="error">${esc(r.error)}</p>`);
  }
  const g = r.gestion;
  if (!g) return mostrar('<h1>Panel del laboratorio</h1><p class="entrada">Su usuario no es responsable de ningún laboratorio. El administrador lo puede asignar en la hoja «Laboratorios».</p>');
  const vencidos = g.activos.filter(p => p.vencido);
  const quien = p => `<span class="detalle">${esc(p.nombre)} · <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></span>`;
  const movimiento = p => {
    const devuelto = p.estado === 'devuelto';
    return `<li>
      <a href="?e=${esc(p.equipo_id)}" class="titulo-prestamo">${esc(p.equipo_nombre)}</a>
      <span class="etiqueta etiqueta-${devuelto ? 'devuelto' : 'activo'}">${devuelto ? 'Devuelto' : 'Salió'}</span>
      <span class="detalle">${esc(p.nombre)} · ${fecha(devuelto ? p.fecha_devolucion : p.fecha_salida)}${devuelto && p.condicion_devolucion && p.condicion_devolucion !== 'Bueno' ? ` · <strong>${esc(p.condicion_devolucion)}</strong>${p.obs_devolucion ? `: ${esc(p.obs_devolucion)}` : ''}` : ''}</span>
    </li>`;
  };
  const max = Math.max(1, ...Object.values(g.resumen.por_proposito));
  mostrar(`
    <h1>Panel del laboratorio</h1>
    <p class="entrada">${plural(g.activos.length, 'equipo prestado', 'equipos prestados')}${vencidos.length ? `, <strong>${plural(vencidos.length, 'vencido', 'vencidos')}</strong>` : ''}${g.incidencias.length ? ` y ${plural(g.incidencias.length, 'novedad abierta', 'novedades abiertas')}` : ''}.</p>
    ${vencidos.length ? `<h2>Vencidos</h2>${listaPrestamos(vencidos, quien)}` : ''}
    ${g.incidencias.length ? `<h2>Novedades abiertas</h2><ul class="prestamos">${g.incidencias.map(i => `
      <li data-incidencia="${esc(i.id)}"><a class="titulo-prestamo" href="?e=${esc(i.equipo_id)}">${esc(i.equipo_nombre)}</a>
      <span class="etiqueta etiqueta-incidencia">${esc(i.tipo)}</span>
      <span class="detalle">${esc(i.descripcion)}</span><span class="detalle tenue">${esc(i.email)} · ${fecha(i.fecha)}</span>
      <div class="acciones compactas"><button class="secundario" data-cerrar="${esc(i.id)}">Marcar resuelta</button></div></li>`).join('')}</ul>` : ''}
    <h2>En préstamo</h2>
    ${g.activos.length ? porSalida(g.activos).map(sal => bloqueSalida(sal, false, quien)).join('') : '<p class="vacio">No hay equipos prestados.</p>'}
    <h2>Movimientos de los últimos 7 días</h2>
    ${g.movimientos?.length ? `<ul class="prestamos">${g.movimientos.map(movimiento).join('')}</ul>` : '<p class="vacio">Sin préstamos ni devoluciones esta semana.</p>'}
    <h2>Últimos 30 días</h2>
    <p>${plural(g.resumen.prestamos_30_dias, 'préstamo', 'préstamos')}.</p>
    ${Object.keys(g.resumen.por_proposito).length ? `<table class="barras"><caption>Préstamos por propósito</caption><tbody>${Object.entries(g.resumen.por_proposito).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
      <tr><th scope="row">${esc(k)}</th><td><span class="barra" style="width:${Math.round(v / max * 100)}%"></span>${v}</td></tr>`).join('')}</tbody></table>` : ''}
    ${g.resumen.equipos_mas_usados.length ? `<h3>Equipos más usados</h3><ol class="ranking">${g.resumen.equipos_mas_usados.map(e => `<li><a href="?e=${esc(e.equipo_id)}">${esc(e.nombre)}</a> — ${e.prestamos}</li>`).join('')}</ol>` : ''}
  `);
  raiz.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', async () => {
    const solucion = prompt('¿Cómo se resolvió?');
    if (solucion === null) return;
    const disponible = confirm('¿El equipo queda disponible para préstamo?');
    b.disabled = true;
    const c = await llamar('cerrarIncidencia', { token: sesion.token, incidencia_id: b.dataset.cerrar, solucion, equipo_disponible: disponible });
    if (!c.ok) alert(c.error);
    cacheCatalogo = null;
    vistaGestion();
  }));
}

// ─── Catálogo de equipos ────────────────────────────────────────────────────

let cacheCatalogo = null;
const filtrosCatalogo = { texto: '', categoria: '', laboratorio: '', disponibles: false };

async function vistaCatalogo() {
  const reciente = cacheCatalogo && Date.now() - cacheCatalogo.hora < 60e3;
  if (!reciente) cargando('Cargando equipos…');
  const r = reciente ? cacheCatalogo.datos : await llamar('catalogo');
  if (!r.ok) {
    const viejo = /acci[oó]n no v[aá]lida/i.test(r.error || '');
    return mostrar(`<h1>Equipos del observatorio</h1><p class="error">${viejo
      ? 'El servidor todavía tiene una versión anterior del sistema. El administrador debe actualizar el código de Apps Script (ver apps-script/README.md).'
      : esc(r.error)}</p>`);
  }
  cacheCatalogo = { hora: Date.now(), datos: r };
  const equipos = r.equipos;
  const categorias = [...new Set(equipos.map(e => e.categoria).filter(Boolean))];
  const disponibles = equipos.filter(e => e.estado === 'disponible').length;
  const situacion = e => e.estado === 'disponible' ? 'Disponible'
    : e.estado === 'prestado' && e.disponible_desde ? `Prestado hasta el ${formatoDiaCorto.format(new Date(e.disponible_desde))}`
    : (ESTADOS_EQUIPO[e.estado] || e.estado);

  if (!equipos.length) {
    mostrar(`<h1>Equipos del observatorio</h1>
      <p class="vacio">Todavía no hay equipos registrados. El administrador los agrega en la pestaña Equipos de la hoja de cálculo.</p>`);
    return;
  }
  mostrar(`
    <h1>Equipos del observatorio</h1>
    <p class="entrada">${plural(equipos.length, 'equipo', 'equipos')}, ${plural(disponibles, 'disponible', 'disponibles')} ahora. Toque uno para ver su ficha, o agréguelo a su salida para pedir varios a la vez.</p>
    <div class="filtros">
      <label class="oculto" for="f-texto">Buscar equipos</label>
      <input id="f-texto" type="search" placeholder="Buscar por nombre, código, marca o uso" value="${esc(filtrosCatalogo.texto)}" autocomplete="off">
      <div class="chips" role="group" aria-label="Categoría">
        ${['', ...categorias].map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${filtrosCatalogo.categoria === c}">${esc(c || 'Todos')}</button>`).join('')}
      </div>
      <div class="fila-filtros">
        <label class="casilla-linea"><input type="checkbox" id="f-disp"${filtrosCatalogo.disponibles ? ' checked' : ''}> Solo disponibles</label>
        <label class="oculto" for="f-lab">Laboratorio</label>
        <select id="f-lab"><option value="">Todos los laboratorios</option>${r.laboratorios.map(l => `<option value="${esc(l.nombre)}"${filtrosCatalogo.laboratorio === l.nombre ? ' selected' : ''}>${esc(l.nombre)}</option>`).join('')}</select>
      </div>
    </div>
    <p class="conteo" id="conteo" role="status"></p>
    <ul class="catalogo">
      ${equipos.map(e => `<li class="tarjeta" data-id="${esc(e.id)}" data-cat="${esc(e.categoria)}" data-lab="${esc(e.laboratorio)}" data-disp="${e.estado === 'disponible'}"
          data-texto="${esc(sinTildes([e.id, e.nombre, e.marca, e.modelo, e.categoria, e.descripcion].join(' ')))}">
        <a class="tarjeta-enlace" href="?e=${esc(e.id)}">
          <span class="tarjeta-foto">${fotoDe(e)}</span>
          <span class="tarjeta-cuerpo">
            <span class="tarjeta-codigo">${esc(e.id).replace(/-/g, '\u2011')}</span>
            <span class="tarjeta-nombre">${esc(e.nombre)}</span>
            ${e.marca || e.modelo ? `<span class="tarjeta-modelo">${esc([e.marca, e.modelo].filter(Boolean).join(' · '))}</span>` : ''}
            ${e.descripcion ? `<span class="tarjeta-desc">${esc(e.descripcion)}</span>` : ''}
          </span>
        </a>
        <div class="tarjeta-pie">
          <span class="estado-mini estado-${esc(e.estado)}"><span class="punto" aria-hidden="true"></span>${esc(situacion(e))}</span>
          ${e.estado === 'disponible' ? botonAgregar(e) : ''}
        </div>
      </li>`).join('')}
    </ul>
    <p class="vacio" id="sin-resultados" hidden>Ningún equipo coincide con la búsqueda.</p>
    <div class="barra-salida" id="barra-salida" hidden></div>`);

  const tarjetas = [...raiz.querySelectorAll('.tarjeta')];
  const filtrar = () => {
    const q = sinTildes(filtrosCatalogo.texto).trim().split(/\s+/).filter(Boolean);
    let visibles = 0;
    tarjetas.forEach(t => {
      const ok = (!filtrosCatalogo.categoria || t.dataset.cat === filtrosCatalogo.categoria)
        && (!filtrosCatalogo.laboratorio || t.dataset.lab === filtrosCatalogo.laboratorio)
        && (!filtrosCatalogo.disponibles || t.dataset.disp === 'true')
        && q.every(p => t.dataset.texto.includes(p));
      t.hidden = !ok;
      if (ok) visibles++;
    });
    document.getElementById('conteo').textContent = visibles === equipos.length ? '' : `Mostrando ${plural(visibles, 'equipo', 'equipos')} de ${equipos.length}.`;
    document.getElementById('sin-resultados').hidden = visibles > 0;
  };
  document.getElementById('f-texto').addEventListener('input', ev => { filtrosCatalogo.texto = ev.target.value; filtrar(); });
  document.getElementById('f-disp').addEventListener('change', ev => { filtrosCatalogo.disponibles = ev.target.checked; filtrar(); });
  document.getElementById('f-lab').addEventListener('change', ev => { filtrosCatalogo.laboratorio = ev.target.value; filtrar(); });
  raiz.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    filtrosCatalogo.categoria = b.dataset.cat;
    raiz.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    filtrar();
  }));
  raiz.querySelector('.catalogo').addEventListener('click', ev => {
    const b = ev.target.closest('[data-agregar]');
    if (!b) return;
    const eq = equipos.find(e => e.id === b.dataset.agregar);
    salida.agregar(eq);
    b.outerHTML = botonAgregar(eq);
    pintarCabecera();
    pintarBarraSalida();
  });
  filtrar();
  pintarBarraSalida();
}

function botonAgregar(eq) {
  return salida.tiene(eq.id)
    ? '<span class="en-salida">En su salida</span>'
    : `<button type="button" class="mini" data-agregar="${esc(eq.id)}" aria-label="Agregar ${esc(eq.nombre)} a la salida">Agregar a la salida</button>`;
}

function pintarBarraSalida() {
  const barra = document.getElementById('barra-salida');
  if (!barra) return;
  const n = salida.equipos().length;
  barra.hidden = n === 0;
  barra.innerHTML = n ? `<span>Su salida: <strong>${plural(n, 'equipo', 'equipos')}</strong></span><a class="boton principal" href="?vista=salida">Continuar con el préstamo</a>` : '';
}

// ─── Enrutador ──────────────────────────────────────────────────────────────

function enrutar() {
  const p = new URLSearchParams(location.search);
  const equipo = p.get('e');
  const vista = p.get('vista');
  pintarCabecera();
  document.body.classList.toggle('vista-ancha', !equipo && vista === 'catalogo');
  if (equipo) return vistaEquipo(equipo);
  if (vista === 'catalogo') return vistaCatalogo();
  if (vista === 'salida') return vistaSalida();
  if (vista === 'mis') return vistaMisPrestamos();
  if (vista === 'gestion') return vistaGestion();
  if (vista === 'entrar') return sesion ? ir('?vista=mis', true) : pedirSesion('?vista=mis');
  vistaInicio();
}

document.addEventListener('click', ev => {
  const a = ev.target.closest('a[href]');
  if (!a || a.target || ev.metaKey || ev.ctrlKey || a.href.startsWith('mailto:')) return;
  const url = new URL(a.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname && a.getAttribute('href') !== './') return;
  ev.preventDefault();
  ir(a.getAttribute('href') === './' ? location.pathname : url.search);
});
window.addEventListener('popstate', enrutar);

document.getElementById('nocturno').addEventListener('click', () => {
  const activo = document.documentElement.dataset.nocturno !== 'si';
  aplicarNocturno(activo);
  almacen.escribir('oan-nocturno', activo);
});

if (MODO_DEMO) document.getElementById('banda-demo').hidden = false;
aplicarNocturno(almacen.leer('oan-nocturno') === true);
enrutar();
