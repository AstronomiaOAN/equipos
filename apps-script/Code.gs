/**
 * Sistema de préstamo de equipos · Observatorio Astronómico Nacional (OAN)
 * -------------------------------------------------------------------------
 * Backend en Google Apps Script sobre una hoja de cálculo de Google.
 * La web (carpeta /web, publicada en GitHub Pages) llama a este script
 * mediante POST con un cuerpo JSON en texto plano.
 *
 * Instalación: ver apps-script/README.md
 * Diseño:      ver docs/
 */

// ─── Configuración ──────────────────────────────────────────────────────────

const CONFIG = {
  NOMBRE_SISTEMA: 'Préstamo de equipos · OAN',
  URL_WEB: 'https://astronomiaoan.github.io/equipos/',
  DOMINIOS_INTERNOS: ['unal.edu.co'],     // correos considerados institucionales
  PERMITIR_EXTERNOS: true,                // ¿pueden iniciar sesión correos no institucionales?
  APROBAR_FUERA_DEL_CAMPUS: true,         // préstamos fuera del campus requieren aprobación
  DIAS_TOKEN: 30,                         // vigencia de la sesión en el celular
  MINUTOS_CODIGO: 10,                     // vigencia del código enviado por correo
  MAX_INTENTOS_CODIGO: 5,
  MAX_ENVIOS_CODIGO: 3,                   // por correo cada 10 minutos
  HORAS_RECORDATORIO: 24,                 // aviso antes del vencimiento
  MAX_DIAS_POR_DEFECTO: 7,
  CORREO_COPIA_ALERTAS: ''                // opcional: correo que recibe copia de las alertas
};

const HOJAS = {
  Equipos: ['id', 'nombre', 'categoria', 'laboratorio_id', 'marca', 'modelo', 'serie',
    'nivel_control', 'estado', 'max_dias', 'componentes', 'notas'],
  Laboratorios: ['id', 'nombre', 'ubicacion', 'responsable_email'],
  Usuarios: ['email', 'nombre', 'tipo', 'dependencia', 'telefono', 'rol', 'activo',
    'acepta_datos', 'fecha_registro'],
  Prestamos: ['id', 'equipo_id', 'email', 'nombre', 'tipo_usuario', 'proposito', 'descripcion',
    'curso_proyecto', 'lugar_uso', 'avalista_email', 'fecha_solicitud', 'fecha_salida',
    'fecha_prevista', 'fecha_devolucion', 'estado', 'condicion_salida', 'condicion_devolucion',
    'obs_devolucion', 'componentes_ok', 'devuelto_por', 'aprobado_por', 'motivo_rechazo',
    'verificado_por', 'fecha_verificacion', 'recordatorio_enviado'],
  Incidencias: ['id', 'equipo_id', 'prestamo_id', 'email', 'tipo', 'descripcion', 'fecha',
    'estado', 'resuelto_por', 'fecha_cierre', 'solucion'],
  Bitacora: ['fecha', 'email', 'accion', 'detalle']
};

const CATALOGOS = {
  propositos: ['Docencia (clase)', 'Práctica de laboratorio', 'Investigación / tesis',
    'Observación astronómica', 'Divulgación / evento público', 'Mantenimiento o calibración', 'Otro'],
  lugares: ['Dentro del OAN', 'Campus universitario', 'Fuera del campus'],
  tipos_usuario: ['Estudiante de pregrado', 'Estudiante de posgrado', 'Docente', 'Investigador',
    'Personal técnico o administrativo', 'Externo'],
  condiciones: ['Bueno', 'Con detalles menores', 'Dañado', 'Incompleto'],
  tipos_incidencia: ['Daño', 'Faltante', 'Falla de funcionamiento', 'Requiere calibración', 'Otro']
};

const NIVELES = ['libre', 'supervisado', 'restringido'];
const ESTADOS_EQUIPO = ['disponible', 'reservado', 'prestado', 'en_revision', 'mantenimiento', 'baja'];
const ESTADOS_ABIERTOS = ['pendiente', 'activo', 'por_verificar'];

class ErrorApp extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo || 400;
  }
}

// ─── Puntos de entrada web ──────────────────────────────────────────────────

function doGet(e) {
  return manejar_(() => {
    const p = (e && e.parameter) || {};
    if (p.accion === 'ping') return { sistema: CONFIG.NOMBRE_SISTEMA, hora: new Date().toISOString() };
    if (p.accion === 'catalogos') return { catalogos: CATALOGOS };
    throw new ErrorApp('Acción no válida');
  });
}

function doPost(e) {
  return manejar_(() => {
    let datos;
    try {
      datos = JSON.parse(e.postData.contents);
    } catch (err) {
      throw new ErrorApp('Solicitud mal formada');
    }
    const accion = ACCIONES[datos && datos.accion];
    if (!accion) throw new ErrorApp('Acción no válida');
    return accion(datos);
  });
}

const ACCIONES = {
  catalogos: () => ({ catalogos: CATALOGOS }),
  solicitarCodigo: accionSolicitarCodigo_,
  verificarCodigo: accionVerificarCodigo_,
  perfil: accionPerfil_,
  equipo: accionEquipo_,
  prestar: conBloqueo_(accionPrestar_),
  devolver: conBloqueo_(accionDevolver_),
  cancelar: conBloqueo_(accionCancelar_),
  aprobar: conBloqueo_(accionAprobar_),
  verificar: conBloqueo_(accionVerificar_),
  reportar: conBloqueo_(accionReportar_),
  cerrarIncidencia: conBloqueo_(accionCerrarIncidencia_),
  misPrestamos: accionMisPrestamos_
};

function manejar_(fn) {
  let salida;
  try {
    salida = Object.assign({ ok: true }, fn());
  } catch (err) {
    const conocido = err instanceof ErrorApp;
    if (!conocido) console.error(err && err.stack ? err.stack : err);
    salida = {
      ok: false,
      error: conocido ? err.message : 'Error interno del servidor. Avise al administrador.',
      codigo: conocido ? err.codigo : 500
    };
  }
  return ContentService.createTextOutput(JSON.stringify(salida))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Evita que dos personas presten el mismo equipo al mismo tiempo. */
function conBloqueo_(fn) {
  return datos => {
    const bloqueo = LockService.getScriptLock();
    if (!bloqueo.tryLock(20000)) throw new ErrorApp('El sistema está ocupado, intente de nuevo.', 503);
    try {
      return fn(datos);
    } finally {
      bloqueo.releaseLock();
    }
  };
}

// ─── Autenticación por código enviado al correo ─────────────────────────────

function accionSolicitarCodigo_(d) {
  const email = normalizarEmail_(d.email);
  if (!esInterno_(email) && !CONFIG.PERMITIR_EXTERNOS) {
    throw new ErrorApp('Use su correo institucional (' + CONFIG.DOMINIOS_INTERNOS.join(', ') + ').', 403);
  }
  const usuario = buscarUsuario_(email);
  if (usuario && String(usuario.activo).toUpperCase() === 'NO') {
    throw new ErrorApp('Su usuario está desactivado. Comuníquese con el laboratorio.', 403);
  }
  const cache = CacheService.getScriptCache();
  const envios = Number(cache.get('env_' + email) || 0);
  if (envios >= CONFIG.MAX_ENVIOS_CODIGO) {
    throw new ErrorApp('Ya se enviaron varios códigos. Espere 10 minutos e intente de nuevo.', 429);
  }
  cache.put('env_' + email, String(envios + 1), 600);

  const codigo = String(100000 + Math.floor(Math.random() * 900000));
  cache.put('cod_' + email, resumen_(codigo + '|' + email), CONFIG.MINUTOS_CODIGO * 60);
  cache.remove('int_' + email);

  enviarCorreo_(email, 'Su código de acceso: ' + codigo, [
    'Su código para el sistema de préstamo de equipos del OAN es:',
    '<p style="font-size:28px;letter-spacing:6px;font-weight:bold">' + codigo + '</p>',
    'Vence en ' + CONFIG.MINUTOS_CODIGO + ' minutos. Si usted no lo solicitó, ignore este mensaje.'
  ]);
  return { enviado: true, minutos: CONFIG.MINUTOS_CODIGO };
}

function accionVerificarCodigo_(d) {
  const email = normalizarEmail_(d.email);
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('cod_' + email);
  if (!guardado) throw new ErrorApp('El código venció o no existe. Solicite uno nuevo.', 401);
  const intentos = Number(cache.get('int_' + email) || 0);
  if (intentos >= CONFIG.MAX_INTENTOS_CODIGO) {
    cache.remove('cod_' + email);
    throw new ErrorApp('Demasiados intentos. Solicite un código nuevo.', 429);
  }
  if (resumen_(String(d.codigo || '').trim() + '|' + email) !== guardado) {
    cache.put('int_' + email, String(intentos + 1), 600);
    throw new ErrorApp('Código incorrecto.', 401);
  }
  cache.remove('cod_' + email);
  cache.remove('int_' + email);
  bitacora_(email, 'inicio_sesion', '');
  return { token: crearToken_(email), usuario: usuarioPublico_(email, buscarUsuario_(email)) };
}

function crearToken_(email) {
  const vence = Date.now() + CONFIG.DIAS_TOKEN * 864e5;
  const carga = Utilities.base64EncodeWebSafe(email).replace(/=+$/, '') + '.' + vence;
  return carga + '.' + firmar_(carga);
}

function firmar_(texto) {
  const firma = Utilities.computeHmacSha256Signature(texto, secreto_());
  return Utilities.base64EncodeWebSafe(firma).replace(/=+$/, '');
}

/** Devuelve { email, usuario } o lanza error si el token no es válido. */
function sesion_(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw new ErrorApp('Debe iniciar sesión.', 401);
  const carga = partes[0] + '.' + partes[1];
  if (firmar_(carga) !== partes[2]) throw new ErrorApp('Sesión no válida. Inicie sesión de nuevo.', 401);
  if (Number(partes[1]) < Date.now()) throw new ErrorApp('Su sesión venció. Inicie sesión de nuevo.', 401);
  const b64 = partes[0] + '==='.slice((partes[0].length + 3) % 4);
  const email = Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString();
  const usuario = buscarUsuario_(email);
  if (usuario && String(usuario.activo).toUpperCase() === 'NO') {
    throw new ErrorApp('Su usuario está desactivado.', 403);
  }
  return { email: email, usuario: usuario };
}

function secreto_() {
  const s = PropertiesService.getScriptProperties().getProperty('SECRETO_TOKEN');
  if (!s) throw new Error('Falta SECRETO_TOKEN: ejecute configurar() en el editor de Apps Script.');
  return s;
}

// ─── Perfil de usuario ──────────────────────────────────────────────────────

function accionPerfil_(d) {
  const s = sesion_(d.token);
  const usuario = guardarPerfil_(s.email, d.perfil || {});
  return { usuario: usuarioPublico_(s.email, usuario) };
}

function guardarPerfil_(email, perfil) {
  const nombre = texto_(perfil.nombre, 120);
  if (nombre.length < 3) throw new ErrorApp('Escriba su nombre completo.');
  // Un correo no institucional siempre es "Externo"; uno institucional no puede declararse externo.
  const tipo = esInterno_(email) ? perfil.tipo : 'Externo';
  if (CATALOGOS.tipos_usuario.indexOf(tipo) < 0 || (esInterno_(email) && tipo === 'Externo')) {
    throw new ErrorApp('Seleccione el tipo de usuario.');
  }
  const existente = buscarUsuario_(email);
  if (!existente && perfil.acepta_datos !== true) {
    throw new ErrorApp('Debe aceptar la política de tratamiento de datos personales.');
  }
  const datos = {
    nombre: nombre,
    tipo: tipo,
    dependencia: texto_(perfil.dependencia, 120),
    telefono: texto_(perfil.telefono, 30)
  };
  if (existente) {
    actualizar_('Usuarios', existente, datos);
    return existente;
  }
  const nuevo = Object.assign({ email: email, rol: 'usuario', activo: 'SÍ',
    acepta_datos: new Date(), fecha_registro: new Date() }, datos);
  agregar_('Usuarios', nuevo);
  bitacora_(email, 'registro', tipo);
  return nuevo;
}

function usuarioPublico_(email, u) {
  return {
    email: email,
    registrado: !!u,
    interno: esInterno_(email),
    nombre: u ? u.nombre : '',
    tipo: u ? u.tipo : (esInterno_(email) ? '' : 'Externo'),
    dependencia: u ? u.dependencia : '',
    telefono: u ? String(u.telefono || '') : '',
    rol: u ? (u.rol || 'usuario') : 'usuario',
    gestiona: laboratoriosQueGestiona_(email, u).map(l => l.id)
  };
}

// ─── Consulta de un equipo (lo que abre el QR) ──────────────────────────────

function accionEquipo_(d) {
  const eq = buscarEquipo_(d.id);
  let email = '';
  let usuario = null;
  if (d.token) {
    try {
      const s = sesion_(d.token);
      email = s.email;
      usuario = s.usuario;
    } catch (err) { /* sesión inválida: se responde como visitante */ }
  }
  const lab = buscarLaboratorio_(eq.laboratorio_id);
  const gestor = !!email && esResponsable_(email, eq.laboratorio_id, usuario);
  const abierto = prestamoAbiertoDe_(eq.id);
  let prestamo = null;
  if (abierto) {
    const mio = abierto.email === email;
    prestamo = {
      estado: abierto.estado,
      fecha_prevista: iso_(abierto.fecha_prevista),
      vencido: estaVencido_(abierto),
      es_mio: mio
    };
    if (mio || gestor) Object.assign(prestamo, prestamoPublico_(abierto, eq));
  }
  return {
    equipo: equipoPublico_(eq, lab),
    prestamo: prestamo,
    puede_gestionar: gestor,
    catalogos: CATALOGOS
  };
}

// ─── Préstamo ───────────────────────────────────────────────────────────────

function accionPrestar_(d) {
  const s = sesion_(d.token);
  let usuario = s.usuario;
  if (d.perfil) usuario = guardarPerfil_(s.email, d.perfil);
  if (!usuario) throw new ErrorApp('Complete su perfil antes de solicitar un préstamo.');

  const eq = buscarEquipo_(d.equipo_id);
  if (eq.estado !== 'disponible') {
    throw new ErrorApp('El equipo no está disponible (estado: ' + eq.estado.replace('_', ' ') + ').', 409);
  }
  const proposito = enLista_(d.proposito, CATALOGOS.propositos, 'el propósito');
  const lugar = enLista_(d.lugar_uso, CATALOGOS.lugares, 'el lugar de uso');
  const descripcion = texto_(d.descripcion, 500);
  if (descripcion.length < 5) throw new ErrorApp('Describa brevemente para qué usará el equipo.');

  const ahora = new Date();
  const prevista = new Date(d.fecha_prevista);
  const maxDias = Number(eq.max_dias) || CONFIG.MAX_DIAS_POR_DEFECTO;
  if (isNaN(prevista.getTime()) || prevista <= ahora) {
    throw new ErrorApp('Indique una fecha y hora de devolución posterior al momento actual.');
  }
  if (prevista.getTime() - ahora.getTime() > maxDias * 864e5 + 36e5) {
    throw new ErrorApp('Este equipo se presta máximo ' + maxDias + ' día(s).');
  }

  const externo = usuario.tipo === 'Externo';
  let avalista = '';
  if (externo) {
    avalista = normalizarEmail_(d.avalista_email);
    if (!esInterno_(avalista)) {
      throw new ErrorApp('Los usuarios externos necesitan un avalista con correo institucional.');
    }
  }
  const requiereAprobacion = eq.nivel_control === 'restringido' || externo ||
    (CONFIG.APROBAR_FUERA_DEL_CAMPUS && lugar === 'Fuera del campus');

  const p = {
    id: nuevoId_('P'),
    equipo_id: eq.id,
    email: s.email,
    nombre: usuario.nombre,
    tipo_usuario: usuario.tipo,
    proposito: proposito,
    descripcion: descripcion,
    curso_proyecto: texto_(d.curso_proyecto, 150),
    lugar_uso: lugar,
    avalista_email: avalista,
    fecha_solicitud: ahora,
    fecha_salida: requiereAprobacion ? '' : ahora,
    fecha_prevista: prevista,
    estado: requiereAprobacion ? 'pendiente' : 'activo',
    condicion_salida: texto_(d.condicion_salida, 300) || 'Bueno'
  };
  agregar_('Prestamos', p);
  actualizar_('Equipos', eq, { estado: requiereAprobacion ? 'reservado' : 'prestado' });
  bitacora_(s.email, requiereAprobacion ? 'solicitud_prestamo' : 'prestamo', p.id + ' ' + eq.id);

  const lab = buscarLaboratorio_(eq.laboratorio_id);
  const detalle = detallePrestamo_(p, eq);
  if (requiereAprobacion) {
    avisarResponsables_(lab, 'Solicitud de préstamo por aprobar: ' + eq.nombre,
      ['<b>' + esc_(p.nombre) + '</b> solicita el equipo. Apruébela o recházela en la web.']
        .concat(detalle).concat([enlace_('?vista=gestion', 'Abrir panel del laboratorio')]), avalista);
    enviarCorreo_(s.email, 'Solicitud recibida: ' + eq.nombre,
      ['Su solicitud quedó pendiente de aprobación por el responsable del laboratorio.'].concat(detalle));
  } else {
    if (eq.nivel_control === 'supervisado') {
      avisarResponsables_(lab, 'Salida de equipo supervisado: ' + eq.nombre, detalle);
    }
    enviarCorreo_(s.email, 'Comprobante de préstamo: ' + eq.nombre,
      ['Quedó registrado el préstamo. Recuerde devolverlo a tiempo y escanear el QR al entregarlo.']
        .concat(detalle));
  }
  return { prestamo: prestamoPublico_(p, eq), requiere_aprobacion: requiereAprobacion };
}

function accionCancelar_(d) {
  const s = sesion_(d.token);
  const p = buscarPrestamo_(d.prestamo_id);
  if (p.email !== s.email) throw new ErrorApp('Solo puede cancelar sus propias solicitudes.', 403);
  if (p.estado !== 'pendiente') throw new ErrorApp('Solo se pueden cancelar solicitudes pendientes.', 409);
  actualizar_('Prestamos', p, { estado: 'cancelado' });
  const eq = buscarEquipo_(p.equipo_id);
  if (eq.estado === 'reservado') actualizar_('Equipos', eq, { estado: 'disponible' });
  bitacora_(s.email, 'cancelacion', p.id);
  return { prestamo: prestamoPublico_(p, eq) };
}

// ─── Aprobación (equipos restringidos, externos, fuera del campus) ──────────

function accionAprobar_(d) {
  const s = sesion_(d.token);
  const p = buscarPrestamo_(d.prestamo_id);
  const eq = buscarEquipo_(p.equipo_id);
  exigirResponsable_(s, eq);
  if (p.estado !== 'pendiente') throw new ErrorApp('La solicitud ya fue atendida.', 409);

  if (d.aprobar) {
    actualizar_('Prestamos', p, { estado: 'activo', fecha_salida: new Date(), aprobado_por: s.email });
    actualizar_('Equipos', eq, { estado: 'prestado' });
    enviarCorreo_(p.email, 'Préstamo aprobado: ' + eq.nombre,
      ['Su solicitud fue aprobada y el equipo quedó entregado a su nombre.'].concat(detallePrestamo_(p, eq)));
  } else {
    const motivo = texto_(d.motivo, 300);
    if (motivo.length < 3) throw new ErrorApp('Indique el motivo del rechazo.');
    actualizar_('Prestamos', p, { estado: 'rechazado', aprobado_por: s.email, motivo_rechazo: motivo });
    actualizar_('Equipos', eq, { estado: 'disponible' });
    enviarCorreo_(p.email, 'Solicitud no aprobada: ' + eq.nombre,
      ['Su solicitud no fue aprobada. Motivo: ' + esc_(motivo)]);
  }
  bitacora_(s.email, d.aprobar ? 'aprobacion' : 'rechazo', p.id);
  return { prestamo: prestamoPublico_(p, eq) };
}

// ─── Devolución ─────────────────────────────────────────────────────────────

function accionDevolver_(d) {
  const s = sesion_(d.token);
  const eq = buscarEquipo_(d.equipo_id);
  const p = prestamoAbiertoDe_(eq.id);
  if (!p || p.estado !== 'activo') throw new ErrorApp('Este equipo no tiene un préstamo activo.', 409);
  const gestor = esResponsable_(s.email, eq.laboratorio_id, s.usuario);
  if (p.email !== s.email && !gestor) {
    throw new ErrorApp('Solo quien tiene el préstamo o un responsable del laboratorio puede registrar la devolución.', 403);
  }
  const condicion = enLista_(d.condicion, CATALOGOS.condiciones, 'el estado del equipo');
  const componentesOk = d.componentes_ok !== false;
  const obs = texto_(d.observaciones, 500);
  const problema = condicion === 'Dañado' || condicion === 'Incompleto' || !componentesOk;
  if (problema && obs.length < 5) throw new ErrorApp('Describa el daño o el faltante en las observaciones.');

  // Si devuelve el propio responsable, la verificación queda hecha en el acto.
  const requiereVerificacion = !gestor && (eq.nivel_control !== 'libre' || problema);
  const ahora = new Date();
  const cambios = {
    fecha_devolucion: ahora,
    condicion_devolucion: condicion,
    obs_devolucion: obs,
    componentes_ok: componentesOk ? 'SÍ' : 'NO',
    devuelto_por: s.email,
    estado: requiereVerificacion ? 'por_verificar' : 'devuelto'
  };
  if (gestor) Object.assign(cambios, { verificado_por: s.email, fecha_verificacion: ahora });
  actualizar_('Prestamos', p, cambios);

  const estadoEquipo = requiereVerificacion ? 'en_revision' : (problema ? 'mantenimiento' : 'disponible');
  actualizar_('Equipos', eq, { estado: estadoEquipo });

  if (problema) {
    agregar_('Incidencias', {
      id: nuevoId_('I'), equipo_id: eq.id, prestamo_id: p.id, email: s.email,
      tipo: condicion === 'Dañado' ? 'Daño' : 'Faltante', descripcion: obs, fecha: ahora, estado: 'abierta'
    });
  }
  bitacora_(s.email, 'devolucion', p.id + ' ' + condicion);

  const lab = buscarLaboratorio_(eq.laboratorio_id);
  const detalle = detallePrestamo_(p, eq);
  if (requiereVerificacion) {
    avisarResponsables_(lab, (problema ? 'Devolución con novedad: ' : 'Devolución por verificar: ') + eq.nombre,
      detalle.concat([enlace_('?vista=gestion', 'Verificar en el panel')]));
  }
  enviarCorreo_(p.email, 'Comprobante de devolución: ' + eq.nombre,
    ['Quedó registrada la devolución (' + esc_(condicion) + ').'].concat(detalle));
  return { prestamo: prestamoPublico_(p, eq), estado_equipo: estadoEquipo, requiere_verificacion: requiereVerificacion };
}

function accionVerificar_(d) {
  const s = sesion_(d.token);
  const p = buscarPrestamo_(d.prestamo_id);
  const eq = buscarEquipo_(p.equipo_id);
  exigirResponsable_(s, eq);
  if (p.estado !== 'por_verificar') throw new ErrorApp('Esta devolución no está pendiente de verificación.', 409);
  const obs = texto_(d.observaciones, 500);
  actualizar_('Prestamos', p, {
    estado: 'devuelto', verificado_por: s.email, fecha_verificacion: new Date(),
    obs_devolucion: [p.obs_devolucion, obs ? 'Verificación: ' + obs : ''].filter(String).join(' · ')
  });
  const estado = d.enviar_mantenimiento ? 'mantenimiento' : 'disponible';
  actualizar_('Equipos', eq, { estado: estado });
  bitacora_(s.email, 'verificacion', p.id + ' → ' + estado);
  return { prestamo: prestamoPublico_(p, eq), estado_equipo: estado };
}

// ─── Incidencias ────────────────────────────────────────────────────────────

function accionReportar_(d) {
  const s = sesion_(d.token);
  const eq = buscarEquipo_(d.equipo_id);
  const tipo = enLista_(d.tipo, CATALOGOS.tipos_incidencia, 'el tipo de novedad');
  const descripcion = texto_(d.descripcion, 500);
  if (descripcion.length < 5) throw new ErrorApp('Describa la novedad.');
  const abierto = prestamoAbiertoDe_(eq.id);
  const inc = {
    id: nuevoId_('I'), equipo_id: eq.id, prestamo_id: abierto ? abierto.id : '', email: s.email,
    tipo: tipo, descripcion: descripcion, fecha: new Date(), estado: 'abierta'
  };
  agregar_('Incidencias', inc);
  bitacora_(s.email, 'incidencia', inc.id + ' ' + eq.id);
  avisarResponsables_(buscarLaboratorio_(eq.laboratorio_id), 'Novedad reportada: ' + eq.nombre, [
    '<b>' + esc_(tipo) + '</b> reportado por ' + esc_(s.email) + ':', esc_(descripcion)
  ]);
  return { incidencia: { id: inc.id, tipo: tipo, estado: inc.estado } };
}

function accionCerrarIncidencia_(d) {
  const s = sesion_(d.token);
  const inc = leer_('Incidencias').filter(i => i.id === d.incidencia_id)[0];
  if (!inc) throw new ErrorApp('No existe la incidencia.', 404);
  const eq = buscarEquipo_(inc.equipo_id);
  exigirResponsable_(s, eq);
  actualizar_('Incidencias', inc, {
    estado: 'cerrada', resuelto_por: s.email, fecha_cierre: new Date(), solucion: texto_(d.solucion, 500)
  });
  if (d.equipo_disponible && eq.estado === 'mantenimiento') actualizar_('Equipos', eq, { estado: 'disponible' });
  bitacora_(s.email, 'cierre_incidencia', inc.id);
  return { incidencia: { id: inc.id, estado: 'cerrada' } };
}

// ─── Mis préstamos y panel del responsable ──────────────────────────────────

function accionMisPrestamos_(d) {
  const s = sesion_(d.token);
  const prestamos = leer_('Prestamos');
  const equipos = indice_(leer_('Equipos'));
  const porFecha = (a, b) => fechaNum_(b.fecha_solicitud) - fechaNum_(a.fecha_solicitud);

  const mios = prestamos.filter(p => p.email === s.email).sort(porFecha).slice(0, 30)
    .map(p => prestamoPublico_(p, equipos[p.equipo_id]));

  let gestion = null;
  const labs = laboratoriosQueGestiona_(s.email, s.usuario).map(l => l.id);
  if (labs.length) {
    const delLab = p => equipos[p.equipo_id] && labs.indexOf(equipos[p.equipo_id].laboratorio_id) >= 0;
    const mios_labs = prestamos.filter(delLab);
    const pub = p => prestamoPublico_(p, equipos[p.equipo_id]);
    const hace30 = Date.now() - 30 * 864e5;
    const recientes = mios_labs.filter(p => fechaNum_(p.fecha_solicitud) >= hace30 &&
      ['activo', 'por_verificar', 'devuelto'].indexOf(p.estado) >= 0);
    gestion = {
      laboratorios: labs,
      pendientes: mios_labs.filter(p => p.estado === 'pendiente').sort(porFecha).map(pub),
      por_verificar: mios_labs.filter(p => p.estado === 'por_verificar').sort(porFecha).map(pub),
      activos: mios_labs.filter(p => p.estado === 'activo')
        .sort((a, b) => fechaNum_(a.fecha_prevista) - fechaNum_(b.fecha_prevista)).map(pub),
      incidencias: leer_('Incidencias')
        .filter(i => i.estado === 'abierta' && equipos[i.equipo_id] &&
          labs.indexOf(equipos[i.equipo_id].laboratorio_id) >= 0)
        .map(i => ({ id: i.id, equipo_id: i.equipo_id, equipo_nombre: equipos[i.equipo_id].nombre,
          tipo: i.tipo, descripcion: i.descripcion, email: i.email, fecha: iso_(i.fecha) })),
      resumen: {
        prestamos_30_dias: recientes.length,
        por_proposito: contar_(recientes, 'proposito'),
        equipos_mas_usados: Object.entries(contar_(recientes, 'equipo_id'))
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(e => ({ equipo_id: e[0], nombre: equipos[e[0]] ? equipos[e[0]].nombre : e[0], prestamos: e[1] })),
        equipos_por_estado: contar_(Object.keys(equipos).map(k => equipos[k])
          .filter(e => labs.indexOf(e.laboratorio_id) >= 0), 'estado')
      }
    };
  }
  return { usuario: usuarioPublico_(s.email, s.usuario), prestamos: mios, gestion: gestion };
}

// ─── Alertas automáticas (activador diario) ─────────────────────────────────

function revisarVencimientos() {
  const ahora = new Date();
  const equipos = indice_(leer_('Equipos'));
  const porLab = {};
  leer_('Prestamos').filter(p => p.estado === 'activo').forEach(p => {
    const eq = equipos[p.equipo_id] || { nombre: p.equipo_id, laboratorio_id: '' };
    const restante = fechaNum_(p.fecha_prevista) - ahora.getTime();
    if (restante < 0) {
      (porLab[eq.laboratorio_id] = porLab[eq.laboratorio_id] || []).push(p);
      enviarCorreo_(p.email, 'Préstamo vencido: ' + eq.nombre, [
        'El plazo de devolución venció el ' + fechaTexto_(p.fecha_prevista) + '.',
        'Por favor devuelva el equipo y escanee su QR, o comuníquese con el laboratorio para ampliar el plazo.'
      ], { copia: p.avalista_email });
    } else if (restante < CONFIG.HORAS_RECORDATORIO * 36e5 && !p.recordatorio_enviado) {
      enviarCorreo_(p.email, 'Recordatorio de devolución: ' + eq.nombre, [
        'Su préstamo vence el ' + fechaTexto_(p.fecha_prevista) + '.'
      ]);
      actualizar_('Prestamos', p, { recordatorio_enviado: ahora });
    }
  });
  leer_('Laboratorios').forEach(lab => {
    const vencidos = porLab[lab.id] || [];
    if (!vencidos.length) return;
    avisarResponsables_(lab, vencidos.length + ' préstamo(s) vencido(s) en ' + lab.nombre,
      vencidos.map(p => '• ' + esc_((equipos[p.equipo_id] || {}).nombre || p.equipo_id) + ' — ' +
        esc_(p.nombre) + ' (' + esc_(p.email) + '), vencía ' + fechaTexto_(p.fecha_prevista)));
  });
}

// ─── Instalación y menú ─────────────────────────────────────────────────────

/** Crea las hojas que falten, sus encabezados, validaciones y la clave secreta. Se puede repetir. */
function configurar() {
  const libro = SpreadsheetApp.getActive();
  Object.keys(HOJAS).forEach(nombre => {
    let h = libro.getSheetByName(nombre);
    if (!h) h = libro.insertSheet(nombre);
    const cab = HOJAS[nombre];
    const actual = h.getLastColumn() ? h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0] : [];
    const faltan = cab.filter(c => actual.indexOf(c) < 0);
    if (faltan.length) {
      h.getRange(1, actual.filter(String).length + 1, 1, faltan.length).setValues([faltan]);
    }
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, h.getLastColumn()).setFontWeight('bold');
  });
  const equipos = libro.getSheetByName('Equipos');
  validarColumna_(equipos, 'nivel_control', NIVELES);
  validarColumna_(equipos, 'estado', ESTADOS_EQUIPO);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRETO_TOKEN')) {
    props.setProperty('SECRETO_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  }
}

function instalarAlertaDiaria() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'revisarVencimientos')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarVencimientos').timeBased().everyDays(1).atHour(7).create();
}

/** Cierra la sesión de todos los usuarios cambiando la clave secreta. */
function cerrarTodasLasSesiones() {
  PropertiesService.getScriptProperties()
    .setProperty('SECRETO_TOKEN', Utilities.getUuid() + Utilities.getUuid());
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Préstamos OAN')
    .addItem('Configurar hojas', 'configurar')
    .addItem('Instalar alerta diaria (7 a. m.)', 'instalarAlertaDiaria')
    .addItem('Revisar vencimientos ahora', 'revisarVencimientos')
    .addSeparator()
    .addItem('Cerrar todas las sesiones', 'cerrarTodasLasSesiones')
    .addToUi();
}

function validarColumna_(hoja, columna, valores) {
  const cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const col = cab.indexOf(columna) + 1;
  if (!col) return;
  const regla = SpreadsheetApp.newDataValidation().requireValueInList(valores, true).build();
  hoja.getRange(2, col, Math.max(hoja.getMaxRows() - 1, 1), 1).setDataValidation(regla);
}

// ─── Acceso a datos ─────────────────────────────────────────────────────────

function hoja_(nombre) {
  const h = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!h) throw new Error('Falta la hoja "' + nombre + '". Ejecute configurar().');
  return h;
}

function encabezados_(h) {
  return h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
}

/** Lee una hoja como lista de objetos; cada objeto recuerda su fila en _fila. */
function leer_(nombre) {
  const valores = hoja_(nombre).getDataRange().getValues();
  const cab = (valores.shift() || []).map(String);
  const filas = [];
  valores.forEach((fila, i) => {
    if (fila.every(v => v === '' || v === null)) return;
    const o = { _fila: i + 2 };
    cab.forEach((c, j) => { if (c) o[c] = fila[j]; });
    filas.push(o);
  });
  return filas;
}

function agregar_(nombre, obj) {
  const h = hoja_(nombre);
  h.appendRow(encabezados_(h).map(c => celda_(obj[c])));
  obj._fila = h.getLastRow();
}

function actualizar_(nombre, registro, cambios) {
  const h = hoja_(nombre);
  const cab = encabezados_(h);
  Object.keys(cambios).forEach(k => {
    const col = cab.indexOf(k);
    if (col < 0) throw new Error('La hoja ' + nombre + ' no tiene la columna ' + k);
    h.getRange(registro._fila, col + 1).setValue(celda_(cambios[k]));
    registro[k] = cambios[k];
  });
}

function bitacora_(email, accion, detalle) {
  agregar_('Bitacora', { fecha: new Date(), email: email, accion: accion, detalle: detalle });
}

function buscarEquipo_(id) {
  const codigo = String(id || '').trim().toUpperCase();
  if (!codigo) throw new ErrorApp('Falta el código del equipo.');
  const eq = leer_('Equipos').filter(e => String(e.id).trim().toUpperCase() === codigo)[0];
  if (!eq) throw new ErrorApp('No existe un equipo con el código ' + codigo + '.', 404);
  eq.id = String(eq.id).trim();
  eq.estado = String(eq.estado || 'disponible').trim().toLowerCase();
  eq.nivel_control = String(eq.nivel_control || 'libre').trim().toLowerCase();
  return eq;
}

function buscarLaboratorio_(id) {
  return leer_('Laboratorios').filter(l => String(l.id) === String(id))[0] ||
    { id: id, nombre: id || 'Sin laboratorio', ubicacion: '', responsable_email: '' };
}

function buscarUsuario_(email) {
  return leer_('Usuarios').filter(u => normalizarEmail_(u.email, true) === email)[0] || null;
}

function buscarPrestamo_(id) {
  const p = leer_('Prestamos').filter(x => x.id === id)[0];
  if (!p) throw new ErrorApp('No existe el préstamo ' + id + '.', 404);
  return p;
}

function prestamoAbiertoDe_(equipoId) {
  return leer_('Prestamos').filter(p => String(p.equipo_id) === equipoId &&
    ESTADOS_ABIERTOS.indexOf(p.estado) >= 0)[0] || null;
}

// ─── Roles ──────────────────────────────────────────────────────────────────

function esAdmin_(usuario) {
  return !!usuario && String(usuario.rol).toLowerCase() === 'admin';
}

function responsablesDe_(lab) {
  return String(lab.responsable_email || '').split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(String);
}

function laboratoriosQueGestiona_(email, usuario) {
  const labs = leer_('Laboratorios');
  if (esAdmin_(usuario)) return labs;
  return labs.filter(l => responsablesDe_(l).indexOf(email) >= 0);
}

function esResponsable_(email, labId, usuario) {
  if (esAdmin_(usuario)) return true;
  return responsablesDe_(buscarLaboratorio_(labId)).indexOf(email) >= 0;
}

function exigirResponsable_(s, eq) {
  if (!esResponsable_(s.email, eq.laboratorio_id, s.usuario)) {
    throw new ErrorApp('Solo el responsable del laboratorio puede hacer esta acción.', 403);
  }
}

// ─── Formato de salida ──────────────────────────────────────────────────────

function equipoPublico_(eq, lab) {
  return {
    id: eq.id, nombre: eq.nombre, categoria: eq.categoria, marca: eq.marca, modelo: eq.modelo,
    laboratorio: lab.nombre, ubicacion: lab.ubicacion, nivel_control: eq.nivel_control,
    estado: eq.estado, max_dias: Number(eq.max_dias) || CONFIG.MAX_DIAS_POR_DEFECTO,
    componentes: String(eq.componentes || '').split(/\s*[;\n]\s*/).filter(String), notas: eq.notas || ''
  };
}

function prestamoPublico_(p, eq) {
  return {
    id: p.id, equipo_id: p.equipo_id, equipo_nombre: eq ? eq.nombre : p.equipo_id,
    nombre: p.nombre, email: p.email, proposito: p.proposito, descripcion: p.descripcion,
    curso_proyecto: p.curso_proyecto, lugar_uso: p.lugar_uso, avalista_email: p.avalista_email,
    fecha_solicitud: iso_(p.fecha_solicitud), fecha_salida: iso_(p.fecha_salida),
    fecha_prevista: iso_(p.fecha_prevista), fecha_devolucion: iso_(p.fecha_devolucion),
    estado: p.estado, vencido: estaVencido_(p), condicion_devolucion: p.condicion_devolucion || '',
    obs_devolucion: p.obs_devolucion || '', motivo_rechazo: p.motivo_rechazo || ''
  };
}

function detallePrestamo_(p, eq) {
  return [
    '<table cellpadding="4" style="border-collapse:collapse">' +
    [['Equipo', eq.nombre + ' (' + eq.id + ')'], ['Responsable', p.nombre + ' · ' + p.email],
      ['Propósito', p.proposito], ['Descripción', p.descripcion], ['Curso / proyecto', p.curso_proyecto],
      ['Lugar de uso', p.lugar_uso], ['Salida', fechaTexto_(p.fecha_salida) || 'pendiente'],
      ['Devolución prevista', fechaTexto_(p.fecha_prevista)], ['Préstamo', p.id]]
      .filter(f => f[1])
      .map(f => '<tr><td style="color:#666">' + f[0] + '</td><td>' + esc_(f[1]) + '</td></tr>').join('') +
    '</table>'
  ];
}

// ─── Correo ─────────────────────────────────────────────────────────────────

function enviarCorreo_(para, asunto, lineas, opciones) {
  opciones = opciones || {};
  if (!para) return;
  // Las líneas ya vienen con los datos de usuario escapados (esc_); aquí solo se envuelven en párrafos.
  const cuerpo = lineas.map(l => /^</.test(l) ? l : '<p>' + l + '</p>').join('\n');
  try {
    MailApp.sendEmail({
      to: para,
      cc: opciones.copia || '',
      subject: '[OAN] ' + asunto,
      name: CONFIG.NOMBRE_SISTEMA,
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' + cuerpo +
        '<hr><p style="color:#888;font-size:12px">' + CONFIG.NOMBRE_SISTEMA + ' · ' +
        '<a href="' + CONFIG.URL_WEB + '">' + CONFIG.URL_WEB + '</a></p></div>'
    });
  } catch (err) {
    console.error('No se pudo enviar correo a ' + para + ': ' + err);
  }
}

function avisarResponsables_(lab, asunto, lineas, copia) {
  const destino = responsablesDe_(lab).concat(CONFIG.CORREO_COPIA_ALERTAS ? [CONFIG.CORREO_COPIA_ALERTAS] : []);
  if (!destino.length) return;
  enviarCorreo_(destino.join(','), asunto, lineas, { copia: copia });
}

function enlace_(ruta, texto) {
  return '<p><a href="' + CONFIG.URL_WEB + ruta + '">' + texto + '</a></p>';
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

function normalizarEmail_(v, silencioso) {
  const email = String(v || '').trim().toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/.test(email)) {
    if (silencioso) return email;
    throw new ErrorApp('Escriba un correo electrónico válido.');
  }
  return email;
}

function esInterno_(email) {
  const dominio = String(email).split('@')[1] || '';
  return CONFIG.DOMINIOS_INTERNOS.some(d => dominio === d || dominio.endsWith('.' + d));
}

function texto_(v, max) {
  return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

function enLista_(v, lista, nombre) {
  if (lista.indexOf(v) < 0) throw new ErrorApp('Seleccione ' + nombre + '.');
  return v;
}

/** Evita que un texto escrito por un usuario se interprete como fórmula en la hoja. */
function celda_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

function esc_(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resumen_(texto) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto));
}

function nuevoId_(prefijo) {
  const fecha = Utilities.formatDate(new Date(), 'America/Bogota', 'yyMMdd');
  return prefijo + '-' + fecha + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function fechaNum_(v) {
  if (!v) return 0;
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  return isNaN(t) ? 0 : t;
}

function iso_(v) {
  const t = fechaNum_(v);
  return t ? new Date(t).toISOString() : '';
}

function fechaTexto_(v) {
  const t = fechaNum_(v);
  return t ? Utilities.formatDate(new Date(t), 'America/Bogota', "dd/MM/yyyy 'a las' h:mm a") : '';
}

function estaVencido_(p) {
  return p.estado === 'activo' && fechaNum_(p.fecha_prevista) > 0 && fechaNum_(p.fecha_prevista) < Date.now();
}

function indice_(lista) {
  const o = {};
  lista.forEach(x => { o[String(x.id).trim()] = x; });
  return o;
}

function contar_(lista, campo) {
  const o = {};
  lista.forEach(x => { const k = x[campo] || '(sin dato)'; o[k] = (o[k] || 0) + 1; });
  return o;
}
