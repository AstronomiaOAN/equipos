import { CONFIG } from './config.js';
import { llamar, MODO_DEMO } from './api.js';
import { reiniciarDemo } from './demo.js';
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

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const opciones = (lista, elegido) => lista.map(o => `<option${o === elegido ? ' selected' : ''}>${esc(o)}</option>`).join('');

const formatoFecha = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
const fecha = v => v ? formatoFecha.format(new Date(v)) : '—';

/** Valor para un <input type="datetime-local"> en la hora del dispositivo. */
function valorLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
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
  zona.innerHTML = sesion
    ? `<a href="?vista=mis">Mis préstamos</a>${sesion.usuario?.gestiona?.length ? '<a href="?vista=gestion">Panel</a>' : ''}`
    : '<a href="?vista=entrar">Iniciar sesión</a>';
}

// ─── Modo nocturno (luz roja para no perder la adaptación a la oscuridad) ───

function aplicarNocturno(activo) {
  document.documentElement.dataset.nocturno = activo ? 'si' : 'no';
  const boton = document.getElementById('nocturno');
  boton.setAttribute('aria-pressed', String(activo));
  boton.querySelector('span').textContent = activo ? 'Luz roja activada' : 'Luz roja';
  document.querySelector('meta[name=theme-color]').content = activo ? '#140302' : '#f3f6f9';
}

// ─── Vistas ─────────────────────────────────────────────────────────────────

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
    <p class="entrada">Escanee con la cámara del celular el código QR pegado en el equipo. Si la etiqueta no se puede leer, escriba el código impreso debajo del QR.</p>
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
    const codigo = ev.target.codigo.value.trim().toUpperCase().replace(/\s+/g, '');
    if (codigo) ir('?e=' + encodeURIComponent(codigo));
  });
  document.getElementById('reiniciar')?.addEventListener('click', () => {
    reiniciarDemo();
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
      <div class="acciones"><button type="submit">Enviarme el código</button></div>
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
        <button type="submit">Entrar</button>
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

  let accion = '';
  if (eq.estado === 'disponible') {
    accion = `<button class="principal" id="b-prestar">Prestar este equipo</button>`;
  } else if (eq.estado === 'reservado' && p) {
    accion = p.es_mio
      ? `<div class="aviso-estado"><p>Su solicitud espera la aprobación del responsable del laboratorio. Le llegará un correo con la respuesta.</p></div>
         <button class="secundario" id="b-cancelar">Cancelar mi solicitud</button>`
      : gestor ? bloqueAprobacion(p) : `<p class="aviso-estado">Hay una solicitud de préstamo en trámite para este equipo.</p>`;
  } else if (eq.estado === 'prestado' && p) {
    const plazo = `${p.vencido ? 'Debía devolverse' : 'Se devuelve'} el <strong>${fecha(p.fecha_prevista)}</strong>`;
    accion = p.es_mio || gestor
      ? `${gestor && !p.es_mio ? datosSolicitante(p) : ''}
         <div class="aviso-estado ${p.vencido ? 'vencido' : ''}"><p>${p.es_mio ? 'Usted tiene este equipo. ' : ''}${plazo}</p></div>
         <button class="principal" id="b-devolver">${p.es_mio ? 'Devolver este equipo' : 'Registrar la devolución'}</button>`
      : `<p class="aviso-estado ${p.vencido ? 'vencido' : ''}">${plazo}</p>`;
  } else if (eq.estado === 'en_revision') {
    accion = gestor && p ? bloqueVerificacion(p) : `<p class="aviso-estado">El equipo fue devuelto y el laboratorio lo está revisando.</p>`;
  } else {
    accion = `<p class="aviso-estado">Este equipo no se puede prestar en este momento (${esc(ESTADOS_EQUIPO[eq.estado] || eq.estado).toLowerCase()}).</p>`;
  }

  mostrar(`
    <article class="equipo">
      <p class="codigo-equipo">${esc(eq.id).replace(/-/g, '\u2011')}</p>
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
  document.getElementById('b-prestar')?.addEventListener('click', requiereSesion(() => formularioPrestamo(eq)));
  document.getElementById('b-devolver')?.addEventListener('click', requiereSesion(() => formularioDevolucion(eq, p)));
  document.getElementById('b-reportar').addEventListener('click', requiereSesion(() => formularioReporte(eq)));
  document.getElementById('b-cancelar')?.addEventListener('click', async ev => {
    if (!confirm('¿Cancelar la solicitud de préstamo?')) return;
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
  return `<section class="gestion-item" data-prestamo="${esc(p.id)}">
    <h3>Solicitud por aprobar</h3>
    ${datosSolicitante(p)}
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

/** Botones de aprobar, rechazar y verificar, usados en la ficha del equipo y en el panel. */
function conectarGestion(contenedor, despues) {
  contenedor.querySelectorAll('[data-accion]').forEach(boton => {
    boton.addEventListener('click', async () => {
      const id = boton.closest('[data-prestamo]').dataset.prestamo;
      const accion = boton.dataset.accion;
      let datos = { token: sesion.token, prestamo_id: id };
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

function formularioPrestamo(eq) {
  const u = sesion.usuario || {};
  const externo = !u.interno;
  const ahora = new Date();
  const maximo = new Date(ahora.getTime() + eq.max_dias * 864e5);
  const sugerida = new Date(Math.min(ahora.getTime() + 864e5, maximo.getTime()));
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
    <p class="migas"><a href="?e=${esc(eq.id)}">${esc(eq.id)}</a></p>
    <h1>Prestar ${esc(eq.nombre)}</h1>
    <form id="f-prestamo" novalidate>
      ${perfil}
      <fieldset>
        <legend>Uso del equipo</legend>
        <label for="proposito">¿Para qué lo va a usar?</label>
        <select id="proposito" name="proposito" required><option value="">Seleccione…</option>${opciones(catalogos.propositos)}</select>
        <label for="descripcion">Describa la actividad</label>
        <textarea id="descripcion" name="descripcion" rows="2" maxlength="500" placeholder="Ej.: fotometría de estrellas variables para la práctica 4" required></textarea>
        <label for="curso">Curso, proyecto o evento <span class="opcional">(opcional)</span></label>
        <input id="curso" name="curso_proyecto" maxlength="150">
        <label for="lugar">¿Dónde lo va a usar?</label>
        <select id="lugar" name="lugar_uso" required>${opciones(catalogos.lugares, 'Dentro del OAN')}</select>
        <label for="prevista">Devolución prevista</label>
        <input id="prevista" name="fecha_prevista" type="datetime-local" min="${valorLocal(ahora)}" max="${valorLocal(maximo)}" value="${valorLocal(sugerida)}" required>
        <p class="ayuda">Máximo ${esc(eq.max_dias)} día${eq.max_dias == 1 ? '' : 's'} (hasta el ${fecha(maximo)})</p>
        ${externo ? `<label for="avalista">Correo institucional de su avalista</label>
          <input id="avalista" name="avalista_email" type="email" inputmode="email" placeholder="docente@unal.edu.co" required>
          <p class="ayuda">Docente o funcionario que responde por el préstamo.</p>` : ''}
      </fieldset>
      <fieldset>
        <legend>Estado al recibirlo</legend>
        <label class="casilla"><input type="radio" name="estado_salida" value="Bueno" checked><span>Está completo y en buen estado</span></label>
        <label class="casilla"><input type="radio" name="estado_salida" value="obs"><span>Tiene observaciones</span></label>
        <textarea name="obs_salida" rows="2" maxlength="300" placeholder="Describa rayones, piezas faltantes u otras novedades" hidden></textarea>
        <label class="casilla compromiso"><input type="checkbox" name="compromiso" required>
          <span>Recibo el equipo y me comprometo a cuidarlo y devolverlo a tiempo.</span></label>
      </fieldset>
      <p class="ayuda" id="nota-aprobacion" hidden>Esta solicitud la debe aprobar el responsable del laboratorio antes de la entrega.</p>
      <div class="acciones">
        <button type="submit" class="principal">Registrar préstamo</button>
        <a class="boton secundario" href="?e=${esc(eq.id)}">Cancelar</a>
      </div>
    </form>`);

  const form = document.getElementById('f-prestamo');
  const actualizar = () => {
    const requiere = eq.nivel_control === 'restringido' || externo || form.lugar_uso.value === 'Fuera del campus';
    document.getElementById('nota-aprobacion').hidden = !requiere;
    form.querySelector('button[type=submit]').textContent = requiere ? 'Enviar solicitud' : 'Registrar préstamo';
    form.obs_salida.hidden = form.estado_salida.value !== 'obs';
  };
  form.addEventListener('change', actualizar);
  actualizar();

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!form.compromiso.checked) return aviso(form, 'Marque la casilla de compromiso para continuar.');
    if (form.acepta_datos && !form.acepta_datos.checked) return aviso(form, 'Debe autorizar el tratamiento de datos para registrar el préstamo.');
    if (!form.fecha_prevista.value) return aviso(form, 'Indique la fecha y hora de devolución.');
    const datos = {
      equipo_id: eq.id,
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
      comprobante(eq, r.prestamo, r.requiere_aprobacion ? 'solicitud' : 'prestamo');
    });
  });
}

function formularioDevolucion(eq, p) {
  const comps = eq.componentes || [];
  mostrar(`
    <p class="migas"><a href="?e=${esc(eq.id)}">${esc(eq.id)}</a></p>
    <h1>Devolver ${esc(eq.nombre)}</h1>
    <form id="f-devolucion" novalidate>
      ${comps.length ? `<fieldset>
        <legend>Verifique que entrega todo</legend>
        ${comps.map((c, i) => `<label class="casilla"><input type="checkbox" name="comp" value="${i}" checked><span>${esc(c)}</span></label>`).join('')}
      </fieldset>` : ''}
      <fieldset>
        <legend>¿En qué estado lo entrega?</legend>
        ${catalogos.condiciones.map((c, i) => `<label class="casilla"><input type="radio" name="condicion" value="${esc(c)}"${i === 0 ? ' checked' : ''}><span>${esc(c)}</span></label>`).join('')}
        <label for="obs">Observaciones <span class="opcional" id="obs-req">(opcional)</span></label>
        <textarea id="obs" name="observaciones" rows="3" maxlength="500" placeholder="Ej.: el buscador quedó desalineado"></textarea>
      </fieldset>
      <div class="acciones">
        <button type="submit" class="principal">Registrar devolución</button>
        <a class="boton secundario" href="?e=${esc(eq.id)}">Cancelar</a>
      </div>
    </form>`);
  const form = document.getElementById('f-devolucion');
  const problema = () => ['Dañado', 'Incompleto'].includes(form.condicion.value) ||
    [...form.querySelectorAll('[name=comp]')].some(c => !c.checked);
  form.addEventListener('change', () => {
    document.getElementById('obs-req').textContent = problema() ? '(obligatorio: describa el problema)' : '(opcional)';
  });
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const faltan = [...form.querySelectorAll('[name=comp]')].filter(c => !c.checked).map(c => comps[c.value]);
    if (problema() && form.observaciones.value.trim().length < 5) {
      return aviso(form, 'Describa en las observaciones el daño o lo que falta.');
    }
    const obs = [faltan.length ? 'Faltan: ' + faltan.join(', ') + '.' : '', form.observaciones.value].filter(Boolean).join(' ');
    enviar(form, 'devolver', {
      equipo_id: eq.id, condicion: form.condicion.value, componentes_ok: faltan.length === 0, observaciones: obs
    }, r => comprobante(eq, r.prestamo, r.requiere_verificacion ? 'devolucion-revision' : 'devolucion'));
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

function comprobante(eq, p, tipo) {
  const textos = {
    prestamo: ['Préstamo registrado', 'Salida', p.fecha_salida, 'Recuerde escanear de nuevo el QR cuando lo devuelva.'],
    solicitud: ['Solicitud enviada', 'Solicitado', p.fecha_solicitud, 'El responsable del laboratorio la revisará. Le llegará un correo con la respuesta; recoja el equipo cuando esté aprobada.'],
    devolucion: ['Devolución registrada', 'Devuelto', p.fecha_devolucion, 'Gracias por devolver el equipo.'],
    'devolucion-revision': ['Devolución registrada', 'Devuelto', p.fecha_devolucion, 'Deje el equipo en su lugar; el responsable del laboratorio lo revisará.']
  }[tipo];
  mostrar(`
    <section class="comprobante">
      <h1>${textos[0]}</h1>
      <p class="hora-grande">${fecha(textos[2])}</p>
      <dl class="ficha">
        <div><dt>Equipo</dt><dd>${esc(eq.nombre)}<br><span class="tenue">${esc(eq.id)}</span></dd></div>
        <div><dt>Responsable</dt><dd>${esc(p.nombre)}</dd></div>
        ${tipo.startsWith('devolucion') ? `<div><dt>Estado</dt><dd>${esc(p.condicion_devolucion)}</dd></div>` : `<div><dt>Devolución prevista</dt><dd>${fecha(p.fecha_prevista)}</dd></div>`}
        <div><dt>Número</dt><dd>${esc(p.id)}</dd></div>
      </dl>
      <p>${textos[3]} ${MODO_DEMO ? '' : 'También le enviamos este comprobante por correo.'}</p>
      <div class="acciones"><a class="boton principal" href="?vista=mis">Ver mis préstamos</a><a class="boton secundario" href="./">Listo</a></div>
    </section>`);
}

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
    ${abiertos.length ? listaPrestamos(abiertos) : '<p class="vacio">No tiene equipos a su cargo. Para prestar uno, escanee su código QR.</p>'}
    ${historial.length ? `<h2>Historial</h2>${listaPrestamos(historial)}` : ''}
    <p class="pie-sesion">${esc(r.usuario.email)} · <button class="enlace" id="salir">Cerrar sesión</button></p>`);
  document.getElementById('salir').addEventListener('click', () => cerrarSesion());
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
  const quien = p => `<span class="detalle">${esc(p.nombre)} · ${esc(p.proposito)}</span>`;
  const vencidos = g.activos.filter(p => p.vencido);
  const max = Math.max(1, ...Object.values(g.resumen.por_proposito));
  mostrar(`
    <h1>Panel del laboratorio</h1>
    <p class="entrada">${g.pendientes.length + g.por_verificar.length ? `Tiene ${g.pendientes.length + g.por_verificar.length} asunto(s) por atender.` : 'No hay nada pendiente por atender.'}</p>
    ${g.pendientes.length ? `<h2>Por aprobar</h2>${listaPrestamos(g.pendientes, p => `${quien(p)}
      <div class="acciones compactas"><button class="principal" data-accion="aprobar">Aprobar</button><button class="secundario" data-accion="rechazar">Rechazar</button></div>`)}` : ''}
    ${g.por_verificar.length ? `<h2>Devoluciones por verificar</h2>${listaPrestamos(g.por_verificar, p => `${quien(p)}
      <span class="detalle">Entregado: ${esc(p.condicion_devolucion)}${p.obs_devolucion ? ` — ${esc(p.obs_devolucion)}` : ''}</span>
      <div class="acciones compactas"><button class="principal" data-accion="verificar">Disponible</button><button class="secundario" data-accion="mantenimiento">A mantenimiento</button></div>`)}` : ''}
    ${vencidos.length ? `<h2>Vencidos</h2>${listaPrestamos(vencidos, p => `${quien(p)}<a class="detalle" href="mailto:${esc(p.email)}">${esc(p.email)}</a>`)}` : ''}
    <h2>En préstamo</h2>
    ${g.activos.some(p => !p.vencido) ? listaPrestamos(g.activos.filter(p => !p.vencido), quien) : '<p class="vacio">No hay otros equipos prestados.</p>'}
    ${g.incidencias.length ? `<h2>Novedades abiertas</h2><ul class="prestamos">${g.incidencias.map(i => `
      <li data-incidencia="${esc(i.id)}"><a class="titulo-prestamo" href="?e=${esc(i.equipo_id)}">${esc(i.equipo_nombre)}</a>
      <span class="etiqueta etiqueta-incidencia">${esc(i.tipo)}</span>
      <span class="detalle">${esc(i.descripcion)}</span><span class="detalle tenue">${esc(i.email)} · ${fecha(i.fecha)}</span>
      <div class="acciones compactas"><button class="secundario" data-cerrar="${esc(i.id)}">Marcar resuelta</button></div></li>`).join('')}</ul>` : ''}
    <h2>Últimos 30 días</h2>
    <p>${g.resumen.prestamos_30_dias} préstamo(s).</p>
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
  if (equipo) return vistaEquipo(equipo);
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
pintarCabecera();
enrutar();
