import { CONFIG } from './config.js';
import { llamar, MODO_DEMO } from './api.js';
import { reiniciarDemo } from './demo.js';
import { abrirEscaner, camaraDisponible, codigoDe } from './escaner.js';
import { CATALOGOS as CATALOGOS_LOCALES, NIVELES, ESTADOS_EQUIPO, ESTADOS_PRESTAMO, EQUIPOS_DEMO } from './catalogos.js';

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
    lista.push({ id: eq.id, nombre: eq.nombre, max_dias: eq.max_dias, nivel_control: eq.nivel_control, componentes: eq.componentes || [], laboratorio: eq.laboratorio });
    this.guardar(lista);
  },
  quitar(id) { this.guardar(this.equipos().filter(x => x.id !== id)); },
  tiene(id) { return this.equipos().some(x => x.id === id); },
  vaciar() { almacen.borrar('oan-salida'); almacen.borrar('oan-borrador'); }
};

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const opciones = (lista, elegido) => lista.map(o => `<option${o === elegido ? ' selected' : ''}>${esc(o)}</option>`).join('');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const formatoFecha = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
const fecha = v => v ? formatoFecha.format(new Date(v)) : '—';

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
  if (r.ok) return alTerminar(r);
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
  zona.innerHTML = (n ? `<a href="?vista=salida" class="enlace-salida">Mi salida (${n})</a>` : '') + (sesion
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
  if (r.catalogos) catalogos = r.catalogos;
  const { equipo: eq, prestamo: p, puede_gestionar: gestor } = r;
  const enSalida = salida.equipos();

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
  } else if (eq.estado === 'reservado' && p) {
    accion = p.es_mio
      ? `<div class="aviso-estado"><p>Su solicitud espera la aprobación del responsable del laboratorio. Le llegará un correo con la respuesta.</p></div>
         <button class="secundario" id="b-cancelar">Cancelar mi solicitud</button>`
      : gestor ? bloqueAprobacion(p) : `<p class="aviso-estado">Hay una solicitud de préstamo en trámite para este equipo.</p>`;
  } else if (eq.estado === 'prestado' && p) {
    const plazo = `${p.vencido ? 'Debía devolverse' : 'Se devuelve'} el <strong>${fecha(p.fecha_prevista)}</strong>`;
    const varios = p.es_mio && p.activos_en_salida > 1;
    accion = p.es_mio || gestor
      ? `${gestor && !p.es_mio ? datosSolicitante(p) : ''}
         <div class="aviso-estado ${p.vencido ? 'vencido' : ''}"><p>${p.es_mio ? 'Usted tiene este equipo. ' : ''}${plazo}.</p></div>
         <button class="principal" id="b-devolver">${p.es_mio ? 'Devolver este equipo' : 'Registrar la devolución'}</button>
         ${varios ? `<button class="secundario ancho" id="b-devolver-todo">Devolver los ${p.activos_en_salida} equipos de esta salida</button>` : ''}`
      : `<p class="aviso-estado ${p.vencido ? 'vencido' : ''}">${plazo}.</p>`;
  } else if (eq.estado === 'en_revision') {
    accion = gestor && p ? bloqueVerificacion(p) : `<p class="aviso-estado">El equipo fue devuelto y el laboratorio lo está revisando.</p>`;
  } else {
    accion = `<p class="aviso-estado">Este equipo no se puede prestar en este momento (${esc(ESTADOS_EQUIPO[eq.estado] || eq.estado).toLowerCase()}).</p>`;
  }

  mostrar(`
    <article class="equipo">
      <p class="codigo-equipo">${esc(eq.id).replace(/-/g, '‑')}</p>
      <h1>${esc(eq.nombre)}</h1>
      <p class="estado estado-${esc(eq.estado)}"><span class="punto" aria-hidden="true"></span>${esc(ESTADOS_EQUIPO[eq.estado] || eq.estado)}</p>
      <dl class="ficha">
        <div><dt>Laboratorio</dt><dd>${esc(eq.laboratorio)}${eq.ubicacion ? `<br><span class="tenue">${esc(eq.ubicacion)}</span>` : ''}</dd></div>
        ${eq.marca || eq.modelo ? `<div><dt>Modelo</dt><dd>${esc([eq.marca, eq.modelo].filter(Boolean).join(' '))}</dd></div>` : ''}
        <div><dt>Préstamo</dt><dd>${esc(NIVELES[eq.nivel_control] || eq.nivel_control)}. Máximo ${esc(eq.max_dias)} día${eq.max_dias == 1 ? '' : 's'}.</dd></div>
        ${eq.componentes?.length ? `<div><dt>Incluye</dt><dd><ul class="componentes">${eq.componentes.map(c => `<li>${esc(c)}</li>`).join('')}</ul></dd></div>` : ''}
        ${eq.notas ? `<div><dt>Notas</dt><dd>${esc(eq.notas)}</dd></div>` : ''}
      </dl>
      <div class="zona-accion">${accion}</div>
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
  document.getElementById('b-cancelar')?.addEventListener('click', async ev => {
    if (!confirm('¿Cancelar la solicitud de préstamo de este equipo?')) return;
    ev.target.disabled = true;
    const c = await llamar('cancelar', { token: sesion.token, prestamo_id: p.id });
    if (!c.ok) alert(c.error);
    vistaEquipo(eq.id);
  });
  conectarGestion(raiz, () => vistaEquipo(eq.id));
}

function datosSolicitante(p) {
  return `<dl class="ficha solicitante">
    <div><dt>Responsable</dt><dd>${esc(p.nombre)}<br><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd></div>
    <div><dt>Propósito</dt><dd>${esc(p.proposito)}${p.curso_proyecto ? ` · ${esc(p.curso_proyecto)}` : ''}<br><span class="tenue">${esc(p.descripcion)}</span></dd></div>
    <div><dt>Lugar de uso</dt><dd>${esc(p.lugar_uso)}</dd></div>
    ${p.avalista_email ? `<div><dt>Avalista</dt><dd>${esc(p.avalista_email)}</dd></div>` : ''}
    <div><dt>Plazo</dt><dd>${p.fecha_salida ? `Salió el ${fecha(p.fecha_salida)}<br>` : `Solicitado el ${fecha(p.fecha_solicitud)}<br>`}Devolución: ${fecha(p.fecha_prevista)}</dd></div>
  </dl>`;
}

function bloqueAprobacion(p) {
  return `<section class="gestion-item" data-lote="${esc(p.lote_id)}">
    <h3>Solicitud por aprobar</h3>
    ${datosSolicitante(p)}
    <p class="ayuda">Al aprobar se entregan todos los equipos pendientes de esta solicitud.</p>
    <div class="acciones">
      <button class="principal" data-accion="aprobar">Aprobar y entregar</button>
      <button class="secundario" data-accion="rechazar">Rechazar</button>
    </div>
  </section>`;
}

function bloqueVerificacion(p) {
  return `<section class="gestion-item" data-prestamo="${esc(p.id)}">
    <h3>Devolución por verificar</h3>
    ${datosSolicitante(p)}
    <p>Estado reportado: <strong>${esc(p.condicion_devolucion)}</strong>${p.obs_devolucion ? ` — ${esc(p.obs_devolucion)}` : ''}</p>
    <div class="acciones">
      <button class="principal" data-accion="verificar">Revisado: queda disponible</button>
      <button class="secundario" data-accion="mantenimiento">Enviar a mantenimiento</button>
    </div>
  </section>`;
}

/** Botones de aprobar, rechazar y verificar; actúan sobre un préstamo o sobre toda una salida. */
function conectarGestion(contenedor, despues) {
  contenedor.querySelectorAll('[data-accion]').forEach(boton => {
    boton.addEventListener('click', async () => {
      const caja = boton.closest('[data-prestamo], [data-lote]');
      const objetivo = caja.dataset.lote ? { lote_id: caja.dataset.lote } : { prestamo_id: caja.dataset.prestamo };
      const accion = boton.dataset.accion;
      const datos = { token: sesion.token, ...objetivo };
      let nombre = 'aprobar';
      if (accion === 'aprobar') datos.aprobar = true;
      if (accion === 'rechazar') {
        const motivo = prompt('Motivo del rechazo (le llegará a quien lo solicitó):');
        if (!motivo) return;
        Object.assign(datos, { aprobar: false, motivo });
      }
      if (accion === 'verificar' || accion === 'mantenimiento') {
        nombre = 'verificar';
        datos.enviar_mantenimiento = accion === 'mantenimiento';
      }
      boton.disabled = true;
      const r = await llamar(nombre, datos);
      if (!r.ok) alert(r.error);
      despues();
    });
  });
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
    return mostrar(`<h1>Mi salida</h1>
      <p class="entrada">No hay equipos en la lista. Escanee el QR del primer equipo que va a sacar.</p>
      <div class="acciones">${camaraDisponible() ? '<button class="principal" id="b-escanear">Escanear QR</button>' : ''}
      <a class="boton secundario" href="./">Escribir un código</a></div>`)
      || document.getElementById('b-escanear')?.addEventListener('click', escanearYVolver);
  }
  const u = sesion.usuario || {};
  const externo = !u.interno;
  const ahora = new Date();
  const maxDias = Math.min(...equipos.map(e => Number(e.max_dias) || 7));
  const maximo = new Date(ahora.getTime() + maxDias * 864e5);
  const sugerida = new Date(Math.min(ahora.getTime() + 864e5, maximo.getTime()));
  const conAprobacion = equipos.filter(e => e.nivel_control === 'restringido');

  const perfil = u.registrado ? '' : `
    <fieldset>
      <legend>Sus datos</legend>
      <p class="ayuda">Solo se piden la primera vez.</p>
      <label for="nombre">Nombre completo</label>
      <input id="nombre" name="nombre" autocomplete="name" required>
      ${externo
        ? '<input type="hidden" name="tipo" value="Externo">'
        : `<label for="tipo">Vinculación con la universidad</label>
           <select id="tipo" name="tipo" required><option value="">Seleccione…</option>${opciones(catalogos.tipos_usuario.filter(t => t !== 'Externo'))}</select>`}
      <label for="dependencia">${externo ? 'Institución' : 'Programa, grupo o dependencia'}</label>
      <input id="dependencia" name="dependencia" autocomplete="organization">
      <label for="telefono">Celular <span class="opcional">(opcional)</span></label>
      <input id="telefono" name="telefono" type="tel" inputmode="tel" autocomplete="tel">
      <label class="casilla"><input type="checkbox" name="acepta_datos" required>
        <span>Autorizo el tratamiento de mis datos personales para gestionar el préstamo, según la <a href="${esc(CONFIG.URL_POLITICA_DATOS)}" target="_blank" rel="noopener">política de datos</a> (Ley 1581 de 2012).</span></label>
    </fieldset>`;

  mostrar(`
    <h1>${equipos.length > 1 ? `Préstamo de ${equipos.length} equipos` : `Prestar ${esc(equipos[0].nombre)}`}</h1>
    <p class="entrada">Los datos de la actividad se escriben una sola vez para todos los equipos.</p>
    <form id="f-prestamo" novalidate>
      <fieldset>
        <legend>Equipos</legend>
        <ul class="lista-salida">
          ${equipos.map(e => `<li>
            <span><strong>${esc(e.nombre)}</strong><br><span class="tenue">${esc(e.id)}${e.nivel_control === 'restringido' ? ' · requiere aprobación' : ''}</span></span>
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
        <legend>Actividad</legend>
        <label for="proposito">¿Para qué ${equipos.length > 1 ? 'los' : 'lo'} va a usar?</label>
        <select id="proposito" name="proposito" required><option value="">Seleccione…</option>${opciones(catalogos.propositos)}</select>
        <label for="descripcion">Describa la actividad</label>
        <textarea id="descripcion" name="descripcion" rows="2" maxlength="500" placeholder="Ej.: noche de observación pública del cúmulo de las Pléyades" required></textarea>
        <label for="curso">Curso, proyecto o evento <span class="opcional">(opcional)</span></label>
        <input id="curso" name="curso_proyecto" maxlength="150">
        <label for="lugar">¿Dónde ${equipos.length > 1 ? 'los' : 'lo'} va a usar?</label>
        <select id="lugar" name="lugar_uso" required>${opciones(catalogos.lugares, 'Dentro del OAN')}</select>
        <label for="prevista">Devolución prevista</label>
        <input id="prevista" name="fecha_prevista" type="datetime-local" min="${valorLocal(ahora)}" max="${valorLocal(maximo)}" value="${valorLocal(sugerida)}" required>
        <p class="ayuda">Máximo ${plural(maxDias, 'día', 'días')} (hasta el ${fecha(maximo)})${equipos.length > 1 ? ', según el equipo de plazo más corto' : ''}</p>
        ${externo ? `<label for="avalista">Correo institucional de su avalista</label>
          <input id="avalista" name="avalista_email" type="email" inputmode="email" placeholder="docente@unal.edu.co" required>
          <p class="ayuda">Docente o funcionario que responde por el préstamo.</p>` : ''}
      </fieldset>
      <fieldset>
        <legend>Estado al recibir${equipos.length > 1 ? 'los' : 'lo'}</legend>
        <label class="casilla"><input type="radio" name="estado_salida" value="Bueno" checked><span>${equipos.length > 1 ? 'Están completos y en buen estado' : 'Está completo y en buen estado'}</span></label>
        <label class="casilla"><input type="radio" name="estado_salida" value="obs"><span>Hay observaciones</span></label>
        <textarea name="obs_salida" rows="2" maxlength="300" placeholder="Indique el equipo y la novedad: rayones, piezas faltantes…" hidden></textarea>
        <label class="casilla compromiso"><input type="checkbox" name="compromiso" required>
          <span>Recibo ${equipos.length > 1 ? 'los equipos' : 'el equipo'} y me comprometo a cuidar${equipos.length > 1 ? 'los' : 'lo'} y devolver${equipos.length > 1 ? 'los' : 'lo'} a tiempo.</span></label>
      </fieldset>
      <p class="ayuda" id="nota-aprobacion" hidden></p>
      <div class="acciones">
        <button type="submit" class="principal">Registrar préstamo</button>
        <button type="button" class="secundario" id="b-vaciar">Cancelar</button>
      </div>
    </form>`);

  const form = document.getElementById('f-prestamo');
  restaurarBorrador(form);
  const actualizar = () => {
    const todos = externo || form.lugar_uso.value === 'Fuera del campus';
    const nota = document.getElementById('nota-aprobacion');
    const n = todos ? equipos.length : conAprobacion.length;
    nota.hidden = n === 0;
    nota.textContent = todos
      ? 'Esta solicitud la debe aprobar el responsable del laboratorio antes de la entrega.'
      : `${n === equipos.length ? 'Estos equipos requieren' : `${plural(n, 'equipo requiere', 'equipos requieren')}`} aprobación del responsable; ${n === equipos.length ? '' : 'los demás salen de inmediato.'}`;
    form.querySelector('button[type=submit]').textContent = n === equipos.length ? 'Enviar solicitud' : (equipos.length > 1 ? `Registrar préstamo de ${equipos.length} equipos` : 'Registrar préstamo');
    form.obs_salida.hidden = form.estado_salida.value !== 'obs';
  };
  form.addEventListener('change', () => { actualizar(); guardarBorrador(form); });
  form.addEventListener('input', () => guardarBorrador(form));
  actualizar();

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

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (form.nombre && form.nombre.value.trim().length < 3) return aviso(form, 'Escriba su nombre completo.');
    if (form.acepta_datos && !form.acepta_datos.checked) return aviso(form, 'Debe autorizar el tratamiento de datos para registrar el préstamo.');
    if (!form.proposito.value) return aviso(form, 'Seleccione para qué va a usar los equipos.');
    if (!form.compromiso.checked) return aviso(form, 'Marque la casilla de compromiso para continuar.');
    if (!form.fecha_prevista.value) return aviso(form, 'Indique la fecha y hora de devolución.');
    const datos = {
      equipos: equipos.map(e => e.id),
      proposito: form.proposito.value,
      descripcion: form.descripcion.value,
      curso_proyecto: form.curso_proyecto.value,
      lugar_uso: form.lugar_uso.value,
      fecha_prevista: new Date(form.fecha_prevista.value).toISOString(),
      avalista_email: form.avalista_email?.value || '',
      condicion_salida: form.estado_salida.value === 'obs' ? 'Con observaciones: ' + form.obs_salida.value : 'Bueno'
    };
    if (form.nombre) {
      datos.perfil = {
        nombre: form.nombre.value, tipo: form.tipo.value, dependencia: form.dependencia.value,
        telefono: form.telefono.value, acepta_datos: form.acepta_datos.checked
      };
    }
    enviar(form, 'prestar', datos, r => {
      if (datos.perfil) {
        sesion.usuario = { ...sesion.usuario, registrado: true, nombre: datos.perfil.nombre, tipo: datos.perfil.tipo };
        almacen.escribir('oan-sesion', sesion);
      }
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
  if (!r.ok) return mostrar(`<p class="error">${esc(r.error)}</p>`);
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
    <p class="entrada">Revise cada equipo y lo que incluye.${varios ? ' Desmarque los que todavía no devuelve.' : ''}</p>
    <form id="f-devolucion" novalidate>
      ${items.map((p, i) => {
        const comps = fichas[p.equipo_id]?.componentes || [];
        return `<fieldset class="item-devolucion" data-equipo="${esc(p.equipo_id)}">
          <legend>${varios ? `<label class="casilla-titulo"><input type="checkbox" name="incluir" value="${esc(p.equipo_id)}" checked> ` : ''}${esc(p.equipo_nombre)}${varios ? '</label>' : ''}</legend>
          <p class="tenue codigo-linea">${esc(p.equipo_id)}${comps.length ? ` · Incluye: ${esc(comps.join(', '))}` : ''}</p>
          <label for="cond-${i}">Estado en que lo entrega</label>
          <select id="cond-${i}" name="condicion">${opciones(catalogos.condiciones, 'Bueno')}</select>
          <label for="obs-${i}" class="obs-etiqueta">Observaciones <span class="opcional">(opcional)</span></label>
          <textarea id="obs-${i}" name="observaciones" rows="2" maxlength="500" placeholder="Qué pasó o qué falta"></textarea>
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
      b.querySelector('.obs-etiqueta .opcional').textContent = problema ? '(obligatorio: describa el problema)' : '(opcional)';
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
      observaciones: b.querySelector('[name=observaciones]').value
    }));
    if (!devoluciones.length) return aviso(form, 'Marque al menos un equipo para devolver.');
    const sinDescribir = devoluciones.find(d => ['Dañado', 'Incompleto'].includes(d.condicion) && d.observaciones.trim().length < 5);
    if (sinDescribir) return aviso(form, `Describa el daño o lo que falta de ${sinDescribir.equipo_id}.`);
    enviar(form, 'devolver', { devoluciones }, r => comprobante(r.prestamos || [r.prestamo], r.requiere_verificacion ? 'devolucion-revision' : 'devolucion'));
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
  const devolucion = tipo.startsWith('devolucion');
  const pendientes = prestamos.filter(x => x.estado === 'pendiente').length;
  const titulo = devolucion ? 'Devolución registrada'
    : pendientes === prestamos.length ? 'Solicitud enviada'
    : 'Préstamo registrado';
  const hora = devolucion ? p.fecha_devolucion : (p.fecha_salida || p.fecha_solicitud);
  const mensaje = devolucion
    ? (tipo === 'devolucion-revision' ? 'Deje los equipos en su lugar; el responsable del laboratorio los revisará.' : 'Gracias por devolver a tiempo.')
    : pendientes ? 'Los equipos pendientes los aprueba el responsable del laboratorio; le llegará un correo con la respuesta.'
    : 'Al devolver, escanee de nuevo el QR de cualquiera de los equipos.';
  mostrar(`
    <section class="comprobante">
      <h1>${titulo}</h1>
      <p class="hora-grande">${fecha(hora)}</p>
      <ul class="prestamos">${prestamos.map(x => `
        <li><span class="titulo-prestamo">${esc(x.equipo_nombre)}</span>
        <span class="etiqueta etiqueta-${esc(x.estado)}">${esc(ESTADOS_PRESTAMO[x.estado] || x.estado)}</span>
        <span class="detalle">${esc(x.equipo_id)}${devolucion ? ` · ${esc(x.condicion_devolucion)}` : ''}</span></li>`).join('')}</ul>
      <dl class="ficha">
        <div><dt>Responsable</dt><dd>${esc(p.nombre)}</dd></div>
        ${devolucion ? '' : `<div><dt>Propósito</dt><dd>${esc(p.proposito)}</dd></div><div><dt>Devolución prevista</dt><dd>${fecha(p.fecha_prevista)}</dd></div>`}
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
  const abiertos = r.prestamos.filter(p => ['pendiente', 'activo', 'por_verificar'].includes(p.estado));
  const historial = r.prestamos.filter(p => !abiertos.includes(p));
  mostrar(`
    <h1>Mis préstamos</h1>
    <p class="entrada">${esc(r.usuario.nombre || r.usuario.email)}</p>
    <h2>Ahora</h2>
    ${abiertos.length ? porSalida(abiertos).map(g => bloqueSalida(g, true)).join('') : '<p class="vacio">No tiene equipos a su cargo. Para prestar uno, escanee su código QR.</p>'}
    ${historial.length ? `<h2>Historial</h2>${listaPrestamos(historial)}` : ''}
    <p class="pie-sesion">${esc(r.usuario.email)} · <button class="enlace" id="salir">Cerrar sesión</button></p>`);
  document.getElementById('salir').addEventListener('click', () => cerrarSesion());
  raiz.querySelectorAll('[data-devolver-lote]').forEach(b => b.addEventListener('click', () => {
    formularioDevolucion(abiertos.filter(p => p.lote_id === b.dataset.devolverLote && p.estado === 'activo'));
  }));
  raiz.querySelectorAll('[data-cancelar-lote]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Cancelar las solicitudes pendientes de esta salida?')) return;
    b.disabled = true;
    const c = await llamar('cancelar', { token: sesion.token, lote_id: b.dataset.cancelarLote });
    if (!c.ok) alert(c.error);
    vistaMisPrestamos();
  }));
}

/** Una salida (varios equipos para una actividad) con sus acciones. */
function bloqueSalida({ lote, items }, propio) {
  const p = items[0];
  const activos = items.filter(x => x.estado === 'activo').length;
  const pendientes = items.filter(x => x.estado === 'pendiente').length;
  return `<section class="salida">
    <p class="salida-titulo"><strong>${esc(p.proposito)}</strong>${p.curso_proyecto ? ` · ${esc(p.curso_proyecto)}` : ''}<br>
      <span class="tenue">${esc(p.descripcion)} · devolver el ${fecha(p.fecha_prevista)}</span></p>
    ${listaPrestamos(items)}
    ${propio && (activos || pendientes) ? `<div class="acciones compactas">
      ${activos ? `<button class="principal" data-devolver-lote="${esc(lote)}">${activos > 1 ? `Devolver ${activos} equipos` : 'Devolver'}</button>` : ''}
      ${pendientes ? `<button class="secundario" data-cancelar-lote="${esc(lote)}">Cancelar solicitud</button>` : ''}
    </div>` : ''}
  </section>`;
}

function listaPrestamos(lista, extra = () => '') {
  return `<ul class="prestamos">${lista.map(p => `
    <li class="${p.vencido ? 'vencido' : ''}" data-prestamo="${esc(p.id)}">
      <a href="?e=${esc(p.equipo_id)}" class="titulo-prestamo">${esc(p.equipo_nombre)}</a>
      <span class="etiqueta etiqueta-${esc(p.estado)}">${p.vencido ? 'Vencido' : esc(ESTADOS_PRESTAMO[p.estado] || p.estado)}</span>
      <span class="detalle">${p.estado === 'activo' ? `Devolver: ${fecha(p.fecha_prevista)}` :
        p.fecha_devolucion ? `Devuelto: ${fecha(p.fecha_devolucion)}` : `Solicitado: ${fecha(p.fecha_solicitud)}`}</span>
      ${extra(p)}
    </li>`).join('')}</ul>`;
}

async function vistaGestion() {
  if (!sesion) return pedirSesion('?vista=gestion');
  cargando();
  const r = await llamar('misPrestamos', { token: sesion.token });
  if (!r.ok) return mostrar(`<h1>Panel del laboratorio</h1><p class="error">${esc(r.error)}</p>`);
  const g = r.gestion;
  if (!g) return mostrar('<h1>Panel del laboratorio</h1><p class="entrada">Su usuario no es responsable de ningún laboratorio. El administrador lo puede asignar en la hoja «Laboratorios».</p>');
  const quien = p => `<span class="detalle">${esc(p.nombre)} · <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></span>`;
  const vencidos = g.activos.filter(p => p.vencido);
  const max = Math.max(1, ...Object.values(g.resumen.por_proposito));
  const pendientes = porSalida(g.pendientes);
  const porVerificar = porSalida(g.por_verificar);
  mostrar(`
    <h1>Panel del laboratorio</h1>
    <p class="entrada">${pendientes.length + porVerificar.length ? `Tiene ${plural(pendientes.length + porVerificar.length, 'asunto', 'asuntos')} por atender.` : 'No hay nada pendiente por atender.'}</p>
    ${pendientes.length ? `<h2>Por aprobar</h2>${pendientes.map(s => `
      <section class="salida" data-lote="${esc(s.lote)}">
        <p class="salida-titulo"><strong>${esc(s.items[0].nombre)}</strong> · ${esc(s.items[0].proposito)}<br>
        <span class="tenue">${esc(s.items[0].descripcion)} · ${esc(s.items[0].lugar_uso)} · hasta el ${fecha(s.items[0].fecha_prevista)}</span></p>
        ${listaPrestamos(s.items)}
        <div class="acciones compactas"><button class="principal" data-accion="aprobar">Aprobar y entregar${s.items.length > 1 ? ` (${s.items.length})` : ''}</button><button class="secundario" data-accion="rechazar">Rechazar</button></div>
      </section>`).join('')}` : ''}
    ${porVerificar.length ? `<h2>Devoluciones por verificar</h2>${porVerificar.map(s => `
      <section class="salida" data-lote="${esc(s.lote)}">
        <p class="salida-titulo"><strong>${esc(s.items[0].nombre)}</strong> · devuelto el ${fecha(s.items[0].fecha_devolucion)}</p>
        ${listaPrestamos(s.items, p => `<span class="detalle">Entregado: ${esc(p.condicion_devolucion)}${p.obs_devolucion ? ` — ${esc(p.obs_devolucion)}` : ''}</span>
          <div class="acciones compactas" data-prestamo="${esc(p.id)}"><button class="secundario" data-accion="mantenimiento">Enviar a mantenimiento</button></div>`)}
        <div class="acciones compactas"><button class="principal" data-accion="verificar">${s.items.length > 1 ? `Todo en orden (${s.items.length})` : 'Revisado: disponible'}</button></div>
      </section>`).join('')}` : ''}
    ${vencidos.length ? `<h2>Vencidos</h2>${listaPrestamos(vencidos, quien)}` : ''}
    <h2>En préstamo</h2>
    ${g.activos.some(p => !p.vencido) ? listaPrestamos(g.activos.filter(p => !p.vencido), quien) : '<p class="vacio">No hay otros equipos prestados.</p>'}
    ${g.incidencias.length ? `<h2>Novedades abiertas</h2><ul class="prestamos">${g.incidencias.map(i => `
      <li data-incidencia="${esc(i.id)}"><a class="titulo-prestamo" href="?e=${esc(i.equipo_id)}">${esc(i.equipo_nombre)}</a>
      <span class="etiqueta etiqueta-incidencia">${esc(i.tipo)}</span>
      <span class="detalle">${esc(i.descripcion)}</span><span class="detalle tenue">${esc(i.email)} · ${fecha(i.fecha)}</span>
      <div class="acciones compactas"><button class="secundario" data-cerrar="${esc(i.id)}">Marcar resuelta</button></div></li>`).join('')}</ul>` : ''}
    <h2>Últimos 30 días</h2>
    <p>${plural(g.resumen.prestamos_30_dias, 'préstamo', 'préstamos')}.</p>
    ${Object.keys(g.resumen.por_proposito).length ? `<table class="barras"><caption>Préstamos por propósito</caption><tbody>${Object.entries(g.resumen.por_proposito).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
      <tr><th scope="row">${esc(k)}</th><td><span class="barra" style="width:${Math.round(v / max * 100)}%"></span>${v}</td></tr>`).join('')}</tbody></table>` : ''}
    ${g.resumen.equipos_mas_usados.length ? `<h3>Equipos más usados</h3><ol class="ranking">${g.resumen.equipos_mas_usados.map(e => `<li><a href="?e=${esc(e.equipo_id)}">${esc(e.nombre)}</a> — ${e.prestamos}</li>`).join('')}</ol>` : ''}
  `);
  conectarGestion(raiz, vistaGestion);
  raiz.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', async () => {
    const solucion = prompt('¿Cómo se resolvió?');
    if (solucion === null) return;
    const disponible = confirm('¿El equipo queda disponible para préstamo?');
    b.disabled = true;
    const c = await llamar('cerrarIncidencia', { token: sesion.token, incidencia_id: b.dataset.cerrar, solucion, equipo_disponible: disponible });
    if (!c.ok) alert(c.error);
    vistaGestion();
  }));
}

// ─── Enrutador ──────────────────────────────────────────────────────────────

function enrutar() {
  const p = new URLSearchParams(location.search);
  const equipo = p.get('e');
  const vista = p.get('vista');
  pintarCabecera();
  if (equipo) return vistaEquipo(equipo);
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
