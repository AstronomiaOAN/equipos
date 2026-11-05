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
  CORREOS_INTERNOS: ['oan.unal@gmail.com'], // cuentas fuera de esos dominios que también son del OAN
  PERMITIR_EXTERNOS: true,                // ¿pueden iniciar sesión correos no institucionales?
  APROBAR_FUERA_DEL_CAMPUS: true,         // préstamos fuera del campus requieren aprobación
  DIAS_TOKEN: 30,                         // vigencia de la sesión en el celular
  MINUTOS_CODIGO: 10,                     // vigencia del código enviado por correo
  MAX_INTENTOS_CODIGO: 5,
  MAX_ENVIOS_CODIGO: 3,                   // por correo cada 10 minutos
  HORAS_RECORDATORIO: 24,                 // aviso antes del vencimiento
  MAX_DIAS_POR_DEFECTO: 7,
  MAX_EQUIPOS_POR_SALIDA: 30,
  CORREO_COPIA_ALERTAS: '',               // opcional: correo que recibe copia de las alertas
  // Una cuenta @gmail.com puede enviar unos 100 correos al día. Si se agota, desactive los
  // comprobantes (la web ya los muestra en pantalla); los avisos al laboratorio se mantienen.
  CORREO_COMPROBANTES: true
};

const HOJAS = {
  Equipos: ['id', 'nombre', 'categoria', 'laboratorio_id', 'marca', 'modelo', 'serie',
    'nivel_control', 'estado', 'max_dias', 'componentes', 'notas',
    'descripcion', 'especificaciones', 'foto', 'credito_foto'],
  Laboratorios: ['id', 'nombre', 'ubicacion', 'responsable_email'],
  Usuarios: ['email', 'nombre', 'tipo', 'dependencia', 'telefono', 'rol', 'activo',
    'acepta_datos', 'fecha_registro'],
  Prestamos: ['id', 'equipo_id', 'email', 'nombre', 'tipo_usuario', 'proposito', 'descripcion',
    'curso_proyecto', 'lugar_uso', 'avalista_email', 'fecha_solicitud', 'fecha_salida',
    'fecha_prevista', 'fecha_devolucion', 'estado', 'condicion_salida', 'condicion_devolucion',
    'obs_devolucion', 'componentes_ok', 'devuelto_por', 'aprobado_por', 'motivo_rechazo',
    'verificado_por', 'fecha_verificacion', 'recordatorio_enviado', 'lote_id'],
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
  equipos: accionEquipos_,
  catalogo: accionCatalogo_,
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
    if (mio && abierto.lote_id) {
      prestamo.activos_en_salida = leer_('Prestamos').filter(x => x.lote_id === abierto.lote_id &&
        x.email === email && x.estado === 'activo').length;
    }
  }
  return {
    equipo: equipoPublico_(eq, lab),
    prestamo: prestamo,
    puede_gestionar: gestor,
    catalogos: CATALOGOS
  };
}

// ─── Varios equipos a la vez (para armar una salida) ────────────────────────

/** Ficha corta de varios equipos, para validar la lista antes de prestar. */
function accionEquipos_(d) {
  const ids = idsDe_(d.ids);
  const labs = indice_(leer_('Laboratorios'));
  const equipos = ids.map(id => {
    try {
      const eq = buscarEquipo_(id);
      return equipoPublico_(eq, labs[eq.laboratorio_id] || buscarLaboratorio_(eq.laboratorio_id));
    } catch (err) {
      return { id: id, error: err.message };
    }
  });
  return { equipos: equipos };
}

/** Todos los equipos (menos los dados de baja) para el catálogo público. Sin datos personales. */
function accionCatalogo_() {
  const labs = indice_(leer_('Laboratorios'));
  const abiertos = {};
  leer_('Prestamos').filter(p => ESTADOS_ABIERTOS.indexOf(p.estado) >= 0)
    .forEach(p => { abiertos[String(p.equipo_id)] = p; });
  const equipos = leer_('Equipos')
    .filter(e => String(e.id || '').trim() && String(e.estado || '').trim().toLowerCase() !== 'baja')
    .map(e => {
      e.id = String(e.id).trim();
      e.estado = String(e.estado || 'disponible').trim().toLowerCase();
      e.nivel_control = String(e.nivel_control || 'libre').trim().toLowerCase();
      const pub = equipoPublico_(e, labs[e.laboratorio_id] || { nombre: e.laboratorio_id || '', ubicacion: '' });
      const p = abiertos[e.id];
      if (p && p.estado === 'activo') pub.disponible_desde = iso_(p.fecha_prevista);
      return pub;
    });
  return {
    equipos: equipos,
    laboratorios: Object.keys(labs).map(k => ({ id: k, nombre: labs[k].nombre, ubicacion: labs[k].ubicacion }))
  };
}

// ─── Préstamo (uno o varios equipos para una misma actividad) ───────────────

function accionPrestar_(d) {
  const s = sesion_(d.token);
  let usuario = s.usuario;
  if (d.perfil) usuario = guardarPerfil_(s.email, d.perfil);
  if (!usuario) throw new ErrorApp('Complete su perfil antes de solicitar un préstamo.');

  const equipos = idsDe_(d.equipos || d.equipo_id).map(buscarEquipo_);
  const ocupados = equipos.filter(e => e.estado !== 'disponible');
  if (ocupados.length) {
    throw new ErrorApp('No están disponibles: ' +
      ocupados.map(e => e.id + ' (' + e.estado.replace('_', ' ') + ')').join(', ') + '. Quítelos de la lista.', 409);
  }
  const proposito = enLista_(d.proposito, CATALOGOS.propositos, 'el propósito');
  const lugar = enLista_(d.lugar_uso, CATALOGOS.lugares, 'el lugar de uso');
  const descripcion = texto_(d.descripcion, 500);
  if (descripcion.length < 5) throw new ErrorApp('Describa brevemente para qué usará los equipos.');

  const ahora = new Date();
  const prevista = new Date(d.fecha_prevista);
  const maxDias = Math.min.apply(null, equipos.map(e => Number(e.max_dias) || CONFIG.MAX_DIAS_POR_DEFECTO));
  if (isNaN(prevista.getTime()) || prevista <= ahora) {
    throw new ErrorApp('Indique una fecha y hora de devolución posterior al momento actual.');
  }
  if (prevista.getTime() - ahora.getTime() > maxDias * 864e5 + 36e5) {
    throw new ErrorApp(equipos.length > 1
      ? 'Con estos equipos el plazo máximo es de ' + maxDias + ' día(s).'
      : 'Este equipo se presta máximo ' + maxDias + ' día(s).');
  }

  const externo = usuario.tipo === 'Externo';
  let avalista = '';
  if (externo) {
    avalista = normalizarEmail_(d.avalista_email);
    if (!esInterno_(avalista)) {
      throw new ErrorApp('Los usuarios externos necesitan un avalista con correo institucional.');
    }
  }
  const aprobacionGeneral = externo || (CONFIG.APROBAR_FUERA_DEL_CAMPUS && lugar === 'Fuera del campus');
  const loteId = nuevoId_('L');
  const condicion = texto_(d.condicion_salida, 300) || 'Bueno';

  // Todo validado: se registra cada equipo con los datos comunes de la actividad.
  const items = equipos.map(eq => {
    const requiere = aprobacionGeneral || eq.nivel_control === 'restringido';
    const p = {
      id: nuevoId_('P'), lote_id: loteId, equipo_id: eq.id, email: s.email, nombre: usuario.nombre,
      tipo_usuario: usuario.tipo, proposito: proposito, descripcion: descripcion,
      curso_proyecto: texto_(d.curso_proyecto, 150), lugar_uso: lugar, avalista_email: avalista,
      fecha_solicitud: ahora, fecha_salida: requiere ? '' : ahora, fecha_prevista: prevista,
      estado: requiere ? 'pendiente' : 'activo', condicion_salida: condicion
    };
    agregar_('Prestamos', p);
    actualizar_('Equipos', eq, { estado: requiere ? 'reservado' : 'prestado' });
    return { p: p, eq: eq, requiere: requiere };
  });
  bitacora_(s.email, 'prestamo', loteId + ': ' + items.map(i => i.eq.id + (i.requiere ? ' (pendiente)' : '')).join(', '));

  porLaboratorio_(items).forEach(grupo => {
    const pendientes = grupo.items.filter(i => i.requiere);
    const supervisados = grupo.items.filter(i => !i.requiere && i.eq.nivel_control === 'supervisado');
    if (pendientes.length) {
      avisarResponsables_(grupo.lab, 'Solicitud por aprobar: ' + resumenEquipos_(pendientes),
        ['<b>' + esc_(usuario.nombre) + '</b> solicita ' + (pendientes.length > 1 ? 'estos equipos' : 'este equipo') +
          '. Apruebe o rechace en la web.', detalleSalida_(pendientes)]
          .concat([enlace_('?vista=gestion', 'Abrir panel del laboratorio')]), avalista);
    }
    if (supervisados.length) {
      avisarResponsables_(grupo.lab, 'Salida de equipo supervisado: ' + resumenEquipos_(supervisados),
        [detalleSalida_(supervisados)]);
    }
  });
  const algunoPendiente = items.some(i => i.requiere);
  if (algunoPendiente || CONFIG.CORREO_COMPROBANTES) enviarCorreo_(s.email, (algunoPendiente ? 'Solicitud recibida: ' : 'Comprobante de préstamo: ') + resumenEquipos_(items), [
    algunoPendiente
      ? 'Los equipos marcados como «pendiente» esperan la aprobación del responsable del laboratorio.'
      : 'Quedó registrado el préstamo. Recuerde escanear el QR de cada equipo al devolverlo.',
    detalleSalida_(items)
  ]);
  return {
    lote_id: loteId,
    prestamos: items.map(i => prestamoPublico_(i.p, i.eq)),
    requiere_aprobacion: algunoPendiente,
    prestamo: prestamoPublico_(items[0].p, items[0].eq)
  };
}

function accionCancelar_(d) {
  const s = sesion_(d.token);
  const lista = prestamosObjetivo_(d).filter(p => p.estado === 'pendiente' && p.email === s.email);
  if (!lista.length) throw new ErrorApp('No hay solicitudes pendientes suyas para cancelar.', 409);
  lista.forEach(p => {
    actualizar_('Prestamos', p, { estado: 'cancelado' });
    const eq = buscarEquipo_(p.equipo_id);
    if (eq.estado === 'reservado') actualizar_('Equipos', eq, { estado: 'disponible' });
  });
  bitacora_(s.email, 'cancelacion', lista.map(p => p.id).join(', '));
  return { cancelados: lista.length };
}

// ─── Aprobación (equipos restringidos, externos, fuera del campus) ──────────

function accionAprobar_(d) {
  const s = sesion_(d.token);
  const items = atendibles_(s, prestamosObjetivo_(d), 'pendiente', 'No hay solicitudes pendientes para atender.');
  const motivo = texto_(d.motivo, 300);
  if (!d.aprobar && motivo.length < 3) throw new ErrorApp('Indique el motivo del rechazo.');

  items.forEach(i => {
    if (d.aprobar) {
      actualizar_('Prestamos', i.p, { estado: 'activo', fecha_salida: new Date(), aprobado_por: s.email });
      actualizar_('Equipos', i.eq, { estado: 'prestado' });
    } else {
      actualizar_('Prestamos', i.p, { estado: 'rechazado', aprobado_por: s.email, motivo_rechazo: motivo });
      actualizar_('Equipos', i.eq, { estado: 'disponible' });
    }
  });
  const p0 = items[0].p;
  enviarCorreo_(p0.email, (d.aprobar ? 'Préstamo aprobado: ' : 'Solicitud no aprobada: ') + resumenEquipos_(items),
    d.aprobar
      ? ['Su solicitud fue aprobada y los equipos quedaron entregados a su nombre.', detalleSalida_(items)]
      : ['Su solicitud no fue aprobada. Motivo: ' + esc_(motivo), detalleSalida_(items)]);
  bitacora_(s.email, d.aprobar ? 'aprobacion' : 'rechazo', items.map(i => i.p.id).join(', '));
  const pub = items.map(i => prestamoPublico_(i.p, i.eq));
  return { prestamos: pub, prestamo: pub[0] };
}

// ─── Devolución (uno o varios equipos) ──────────────────────────────────────

function accionDevolver_(d) {
  const s = sesion_(d.token);
  const pedidos = Array.isArray(d.devoluciones) ? d.devoluciones : [d];
  if (!pedidos.length) throw new ErrorApp('No indicó qué equipos devuelve.');
  if (pedidos.length > CONFIG.MAX_EQUIPOS_POR_SALIDA) throw new ErrorApp('Demasiados equipos en una sola devolución.');

  // Primero se valida todo; si algo falla no se registra nada.
  const vistos = {};
  const items = pedidos.map(pedido => {
    const eq = buscarEquipo_(pedido.equipo_id);
    if (vistos[eq.id]) throw new ErrorApp('El equipo ' + eq.id + ' está repetido.');
    vistos[eq.id] = true;
    const p = prestamoAbiertoDe_(eq.id);
    if (!p || p.estado !== 'activo') throw new ErrorApp(eq.id + ' no tiene un préstamo activo.', 409);
    const gestor = esResponsable_(s.email, eq.laboratorio_id, s.usuario);
    if (p.email !== s.email && !gestor) {
      throw new ErrorApp('Solo quien tiene el préstamo de ' + eq.id + ' o un responsable del laboratorio puede registrar la devolución.', 403);
    }
    const condicion = enLista_(pedido.condicion, CATALOGOS.condiciones, 'el estado de ' + eq.id);
    const componentesOk = pedido.componentes_ok !== false && condicion !== 'Incompleto';
    const obs = texto_(pedido.observaciones, 500);
    const problema = condicion === 'Dañado' || !componentesOk;
    if (problema && obs.length < 5) throw new ErrorApp('Describa el daño o el faltante de ' + eq.id + '.');
    return { eq: eq, p: p, gestor: gestor, condicion: condicion, componentesOk: componentesOk, obs: obs, problema: problema };
  });

  const ahora = new Date();
  items.forEach(i => {
    i.verificar = !i.gestor && (i.eq.nivel_control !== 'libre' || i.problema);
    const cambios = {
      fecha_devolucion: ahora, condicion_devolucion: i.condicion, obs_devolucion: i.obs,
      componentes_ok: i.componentesOk ? 'SÍ' : 'NO', devuelto_por: s.email,
      estado: i.verificar ? 'por_verificar' : 'devuelto'
    };
    if (i.gestor) Object.assign(cambios, { verificado_por: s.email, fecha_verificacion: ahora });
    actualizar_('Prestamos', i.p, cambios);
    i.estadoEquipo = i.verificar ? 'en_revision' : (i.problema ? 'mantenimiento' : 'disponible');
    actualizar_('Equipos', i.eq, { estado: i.estadoEquipo });
    if (i.problema) {
      agregar_('Incidencias', {
        id: nuevoId_('I'), equipo_id: i.eq.id, prestamo_id: i.p.id, email: s.email,
        tipo: i.condicion === 'Dañado' ? 'Daño' : 'Faltante', descripcion: i.obs, fecha: ahora, estado: 'abierta'
      });
    }
  });
  bitacora_(s.email, 'devolucion', items.map(i => i.p.id + ' ' + i.condicion).join(', '));

  porLaboratorio_(items.filter(i => i.verificar)).forEach(grupo => {
    const conNovedad = grupo.items.some(i => i.problema);
    avisarResponsables_(grupo.lab, (conNovedad ? 'Devolución con novedad: ' : 'Devolución por verificar: ') +
      resumenEquipos_(grupo.items), [detalleSalida_(grupo.items, true), enlace_('?vista=gestion', 'Verificar en el panel')]);
  });
  const titular = items[0].p.email;
  if (CONFIG.CORREO_COMPROBANTES) enviarCorreo_(titular, 'Comprobante de devolución: ' + resumenEquipos_(items),
    ['Quedó registrada la devolución.', detalleSalida_(items, true)]);

  const pub = items.map(i => Object.assign(prestamoPublico_(i.p, i.eq),
    { estado_equipo: i.estadoEquipo, requiere_verificacion: i.verificar }));
  return {
    prestamos: pub,
    requiere_verificacion: items.some(i => i.verificar),
    // Compatibilidad con la devolución de un solo equipo
    prestamo: pub[0], estado_equipo: items[0].estadoEquipo
  };
}

function accionVerificar_(d) {
  const s = sesion_(d.token);
  const items = atendibles_(s, prestamosObjetivo_(d), 'por_verificar', 'No hay devoluciones por verificar.');
  const obs = texto_(d.observaciones, 500);
  const estado = d.enviar_mantenimiento ? 'mantenimiento' : 'disponible';
  items.forEach(i => {
    actualizar_('Prestamos', i.p, {
      estado: 'devuelto', verificado_por: s.email, fecha_verificacion: new Date(),
      obs_devolucion: [i.p.obs_devolucion, obs ? 'Verificación: ' + obs : ''].filter(String).join(' · ')
    });
    actualizar_('Equipos', i.eq, { estado: estado });
  });
  bitacora_(s.email, 'verificacion', items.map(i => i.p.id).join(', ') + ' → ' + estado);
  const pub = items.map(i => prestamoPublico_(i.p, i.eq));
  return { prestamos: pub, prestamo: pub[0], estado_equipo: estado };
}

/** Préstamos en el estado dado que el responsable puede atender. */
function atendibles_(s, prestamos, estado, siNoHay) {
  const enEstado = conEquipo_(prestamos.filter(p => p.estado === estado));
  if (!enEstado.length) throw new ErrorApp(siNoHay, 409);
  const propios = enEstado.filter(i => esResponsable_(s.email, i.eq.laboratorio_id, s.usuario));
  if (!propios.length) throw new ErrorApp('Solo el responsable del laboratorio puede hacer esta acción.', 403);
  return propios;
}

/** Préstamos indicados por prestamo_id o por lote_id (todos los de esa salida). */
function prestamosObjetivo_(d) {
  if (d.lote_id) {
    // Préstamos registrados antes de existir las salidas usan su propio id como lote.
    return leer_('Prestamos').filter(p => (p.lote_id || p.id) === d.lote_id);
  }
  if (d.prestamo_id) return [buscarPrestamo_(d.prestamo_id)];
  throw new ErrorApp('Falta indicar el préstamo.');
}

function conEquipo_(prestamos) {
  const equipos = indice_(leer_('Equipos'));
  return prestamos.filter(p => equipos[p.equipo_id]).map(p => {
    const eq = equipos[p.equipo_id];
    eq.estado = String(eq.estado || '').trim().toLowerCase();
    eq.nivel_control = String(eq.nivel_control || 'libre').trim().toLowerCase();
    return { p: p, eq: eq };
  });
}

function idsDe_(valor) {
  const lista = (Array.isArray(valor) ? valor : [valor])
    .map(v => String(v || '').trim().toUpperCase()).filter(String);
  const unicos = lista.filter((v, i) => lista.indexOf(v) === i);
  if (!unicos.length) throw new ErrorApp('Agregue al menos un equipo.');
  if (unicos.length > CONFIG.MAX_EQUIPOS_POR_SALIDA) {
    throw new ErrorApp('Máximo ' + CONFIG.MAX_EQUIPOS_POR_SALIDA + ' equipos por salida.');
  }
  return unicos;
}

function porLaboratorio_(items) {
  const grupos = {};
  items.forEach(i => {
    const id = i.eq.laboratorio_id;
    (grupos[id] = grupos[id] || { lab: buscarLaboratorio_(id), items: [] }).items.push(i);
  });
  return Object.keys(grupos).map(k => grupos[k]);
}

function resumenEquipos_(items) {
  return items.length === 1 ? items[0].eq.nombre : items.length + ' equipos';
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
  const vencidosPorPersona = {};
  const proximosPorPersona = {};
  const vencidosPorLab = {};
  leer_('Prestamos').filter(p => p.estado === 'activo').forEach(p => {
    const eq = equipos[p.equipo_id] || { id: p.equipo_id, nombre: p.equipo_id, laboratorio_id: '' };
    const restante = fechaNum_(p.fecha_prevista) - ahora.getTime();
    const item = { p: p, eq: eq };
    if (restante < 0) {
      (vencidosPorPersona[p.email] = vencidosPorPersona[p.email] || []).push(item);
      (vencidosPorLab[eq.laboratorio_id] = vencidosPorLab[eq.laboratorio_id] || []).push(item);
    } else if (restante < CONFIG.HORAS_RECORDATORIO * 36e5 && !p.recordatorio_enviado) {
      (proximosPorPersona[p.email] = proximosPorPersona[p.email] || []).push(item);
    }
  });
  // Un solo correo por persona, aunque tenga varios equipos.
  Object.keys(vencidosPorPersona).forEach(email => {
    const items = vencidosPorPersona[email];
    const avalistas = items.map(i => i.p.avalista_email).filter(String).filter((v, i, a) => a.indexOf(v) === i);
    enviarCorreo_(email, 'Préstamo vencido: ' + resumenEquipos_(items), [
      'Ya pasó la fecha de devolución de ' + (items.length > 1 ? 'estos equipos' : 'este equipo') + '.',
      lista_(items.map(i => i.eq.nombre + ' (' + i.eq.id + '), vencía ' + fechaTexto_(i.p.fecha_prevista))),
      'Devuélvalo(s) y escanee el QR, o comuníquese con el laboratorio para ampliar el plazo.'
    ], { copia: avalistas.join(',') });
  });
  Object.keys(proximosPorPersona).forEach(email => {
    const items = proximosPorPersona[email];
    enviarCorreo_(email, 'Recordatorio de devolución: ' + resumenEquipos_(items), [
      'Su préstamo vence pronto:',
      lista_(items.map(i => i.eq.nombre + ' (' + i.eq.id + '): ' + fechaTexto_(i.p.fecha_prevista)))
    ]);
    items.forEach(i => actualizar_('Prestamos', i.p, { recordatorio_enviado: ahora }));
  });
  leer_('Laboratorios').forEach(lab => {
    const items = vencidosPorLab[lab.id] || [];
    if (!items.length) return;
    avisarResponsables_(lab, items.length + ' préstamo(s) vencido(s) en ' + lab.nombre, [lista_(items.map(i =>
      i.eq.nombre + ' (' + i.eq.id + ') — ' + i.p.nombre + ', ' + i.p.email + ', vencía ' + fechaTexto_(i.p.fecha_prevista)))]);
  });
}

function lista_(lineas) {
  return '<ul>' + lineas.map(l => '<li>' + esc_(l) + '</li>').join('') + '</ul>';
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
  cargarDatosIniciales_(libro);
  const equipos = libro.getSheetByName('Equipos');
  validarColumna_(equipos, 'nivel_control', NIVELES);
  validarColumna_(equipos, 'estado', ESTADOS_EQUIPO);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRETO_TOKEN')) {
    props.setProperty('SECRETO_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  }
}

/**
 * Llena una hoja recién creada con la cuenta del OAN como administradora, laboratorios
 * y equipos de ejemplo, y una pestaña de instrucciones. Solo actúa sobre pestañas vacías,
 * así que nunca toca datos reales.
 */
function cargarDatosIniciales_(libro) {
  const vacia = nombre => libro.getSheetByName(nombre).getLastRow() <= 1;
  const admin = CONFIG.CORREOS_INTERNOS[0];
  if (vacia('Laboratorios') || vacia('Equipos')) cargarEjemplos_(admin);
  if (vacia('Usuarios') && admin) {
    agregar_('Usuarios', { email: admin, nombre: 'Observatorio Astronómico Nacional', tipo: 'Personal técnico o administrativo',
      dependencia: 'OAN', rol: 'admin', activo: 'SÍ', acepta_datos: new Date(), fecha_registro: new Date() });
  }
  let ins = libro.getSheetByName('Instrucciones');
  if (!ins) {
    ins = libro.insertSheet('Instrucciones', 0);
    [
      ['Base de datos del sistema de préstamo de equipos · Observatorio Astronómico Nacional'],
      ['Web: ' + CONFIG.URL_WEB],
      ['Diseño y manual: https://github.com/AstronomiaOAN/equipos'],
      [''],
      ['Se edita a mano:'],
      ['• Equipos: el inventario. Los equipos marcados EJEMPLO deben reemplazarse por los reales.'],
      ['• Laboratorios: nombre, ubicación y correos de los responsables (varios, separados por coma).'],
      ['• Usuarios: «rol» = admin para acceso total; «activo» = NO para bloquear a alguien.'],
      [''],
      ['Lo llena el sistema (no editar salvo correcciones): Prestamos, Incidencias, Bitacora.'],
      ['Esta hoja contiene datos personales (Ley 1581 de 2012): compártala solo con los responsables de laboratorio.']
    ].forEach((fila, i) => ins.getRange(i + 1, 1).setValue(fila[0]));
    ins.getRange(1, 1).setFontWeight('bold').setFontSize(13);
    ins.setColumnWidth(1, 900);
  }
  const sobrante = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1') || libro.getSheetByName('Hoja1');
  if (sobrante && sobrante.getLastRow() === 0 && libro.getSheets().length > 1) libro.deleteSheet(sobrante);
}

/**
 * Carga o actualiza el catálogo de ejemplo (20 equipos con foto, descripción y características).
 * - Equipos de ejemplo que ya existen: actualiza su información y respeta su estado y número de serie.
 * - Los que faltan: los agrega como disponibles.
 * - No borra ni modifica ningún otro equipo, ni los responsables de laboratorios existentes.
 * Se puede ejecutar desde el editor o desde el menú «Préstamos OAN».
 */
function cargarCatalogoDeEjemplo() {
  configurar();
  const r = cargarEjemplos_(CONFIG.CORREOS_INTERNOS[0]);
  const mensaje = 'Catálogo de ejemplo: ' + r.agregados + ' equipo(s) agregado(s), ' + r.actualizados +
    ' actualizado(s), ' + r.laboratorios + ' laboratorio(s) agregado(s).';
  console.log(mensaje);
  try { SpreadsheetApp.getActive().toast(mensaje, 'Préstamos OAN', 8); } catch (err) { /* sin interfaz */ }
  return mensaje;
}

function cargarEjemplos_(admin) {
  const resultado = { agregados: 0, actualizados: 0, laboratorios: 0 };
  const labs = indice_(leer_('Laboratorios'));
  EJEMPLOS.laboratorios.forEach(l => {
    if (labs[l.id]) return;
    agregar_('Laboratorios', Object.assign({ responsable_email: admin || '' }, l));
    resultado.laboratorios++;
  });
  const hoja = hoja_('Equipos');
  const cab = encabezados_(hoja);
  const existentes = indice_(leer_('Equipos'));
  const descriptivas = ['nombre', 'categoria', 'laboratorio_id', 'marca', 'modelo', 'nivel_control', 'max_dias',
    'componentes', 'notas', 'descripcion', 'especificaciones', 'foto', 'credito_foto'];
  EJEMPLOS.equipos.forEach(e => {
    const actual = existentes[e.id];
    if (actual) {
      const fila = cab.map(c => descriptivas.indexOf(c) >= 0 ? celda_(e[c]) : (actual[c] === undefined ? '' : actual[c]));
      hoja.getRange(actual._fila, 1, 1, cab.length).setValues([fila]);
      resultado.actualizados++;
    } else {
      agregar_('Equipos', Object.assign({}, e, { estado: 'disponible' }));
      resultado.agregados++;
    }
  });
  return resultado;
}

// <ejemplos> Generado por herramientas/sincronizar_ejemplos.py a partir de datos/*.csv. No editar a mano.
const EJEMPLOS = {
  laboratorios: [
    {
      "id": "LAB-OPT",
      "nombre": "Laboratorio de Óptica e Instrumentación",
      "ubicacion": "Edificio del OAN, primer piso"
    },
    {
      "id": "LAB-OBS",
      "nombre": "Plataforma de observación",
      "ubicacion": "Terraza del OAN"
    },
    {
      "id": "LAB-DIV",
      "nombre": "Sala de divulgación",
      "ubicacion": "Planetario del campus"
    }
  ],
  equipos: [
    {
      "id": "OAN-TEL-0001",
      "nombre": "Telescopio Schmidt-Cassegrain 8\"",
      "categoria": "Telescopios",
      "laboratorio_id": "LAB-OBS",
      "marca": "Celestron",
      "modelo": "C8",
      "serie": "",
      "nivel_control": "supervisado",
      "estado": "disponible",
      "max_dias": 2,
      "componentes": "Tubo óptico; Buscador 8×50; Diagonal 1¼\"; Tapa frontal",
      "notas": "Dejar aclimatar 30 minutos antes de observar.",
      "descripcion": "Telescopio catadióptrico compacto y versátil. Es el caballito de batalla para planetas, Luna y estrellas dobles en las noches de observación pública, y sirve para astrofotografía con reductor de focal.",
      "especificaciones": "Apertura: 203 mm; Distancia focal: 2032 mm (f/10); Aumento máximo útil: 400×; Peso del tubo: 5,7 kg",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Celestron_C8_Teleskop_%28freigestellt%29.JPG?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Celestron_C8_Teleskop_%28freigestellt%29.JPG"
    },
    {
      "id": "OAN-TEL-0002",
      "nombre": "Telescopio newtoniano 8\" con montura GoTo",
      "categoria": "Telescopios",
      "laboratorio_id": "LAB-OBS",
      "marca": "Orion / Celestron",
      "modelo": "Newtoniano 8\" en CGEM",
      "serie": "",
      "nivel_control": "supervisado",
      "estado": "disponible",
      "max_dias": 2,
      "componentes": "Tubo óptico; Montura computarizada; Trípode; Contrapesos (2); Mando; Cable de alimentación",
      "notas": "Requiere colimación periódica del espejo.",
      "descripcion": "Reflector newtoniano luminoso sobre montura ecuatorial computarizada que localiza y sigue los objetos automáticamente. Ideal para cielo profundo y para iniciar en astrofotografía.",
      "especificaciones": "Apertura: 203 mm; Distancia focal: 1000 mm (f/4,9); Montura: ecuatorial GoTo; Alimentación: 12 V",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Orion_8%22_Newtonian_on_Celestron_CGEM_Mount.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Orion_8%22_Newtonian_on_Celestron_CGEM_Mount.jpg"
    },
    {
      "id": "OAN-TEL-0003",
      "nombre": "Telescopio dobsoniano 10\"",
      "categoria": "Telescopios",
      "laboratorio_id": "LAB-OBS",
      "marca": "Sky-Watcher",
      "modelo": "Dobson 10\"",
      "serie": "",
      "nivel_control": "supervisado",
      "estado": "disponible",
      "max_dias": 3,
      "componentes": "Tubo óptico; Base dobsoniana; Buscador; Ocular 25 mm",
      "notas": "Se transporta en dos partes: tubo y base.",
      "descripcion": "Gran abertura con montaje sencillo de mover a mano. Muestra galaxias, nebulosas y cúmulos con mucho detalle; es el favorito de los estudiantes en las salidas a cielo oscuro.",
      "especificaciones": "Apertura: 254 mm; Distancia focal: 1200 mm (f/4,7); Montura: dobsoniana altazimutal; Peso total: 22 kg",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Dobson-mount.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Dobson-mount.jpg"
    },
    {
      "id": "OAN-TEL-0004",
      "nombre": "Telescopio Maksutov-Cassegrain 150 mm",
      "categoria": "Telescopios",
      "laboratorio_id": "LAB-OBS",
      "marca": "Sky-Watcher",
      "modelo": "Skymax 150",
      "serie": "",
      "nivel_control": "libre",
      "estado": "disponible",
      "max_dias": 3,
      "componentes": "Tubo óptico; Buscador; Diagonal; Ocular 28 mm",
      "notas": "",
      "descripcion": "Telescopio de gran distancia focal y alto contraste, muy estable en colimación. Excelente para planetas, Luna y estrellas dobles; liviano para llevar a colegios.",
      "especificaciones": "Apertura: 150 mm; Distancia focal: 1800 mm (f/12); Peso del tubo: 5,2 kg",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Maksutov_150mm.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Maksutov_150mm.jpg"
    },
    {
      "id": "OAN-TEL-0005",
      "nombre": "Telescopio solar H-alfa 40 mm",
      "categoria": "Telescopios",
      "laboratorio_id": "LAB-OBS",
      "marca": "Coronado",
      "modelo": "PST",
      "serie": "",
      "nivel_control": "restringido",
      "estado": "disponible",
      "max_dias": 1,
      "componentes": "Telescopio solar; Ocular 20 mm; Estuche",
      "notas": "Solo personal capacitado. Nunca reemplazar el ocular ni el filtro durante la observación.",
      "descripcion": "Telescopio dedicado a observar el Sol en la línea H-alfa: muestra protuberancias, filamentos y fáculas de forma segura. Se usa en jornadas diurnas de divulgación. La foto es una imagen del Sol tomada con un filtro H-alfa.",
      "especificaciones": "Apertura: 40 mm; Distancia focal: 400 mm; Filtro: H-alfa 656,3 nm, ancho de banda < 1 Å",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Sonne_Wasserstoff-alpha-Filter.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Sonne_Wasserstoff-alpha-Filter.jpg"
    },
    {
      "id": "OAN-MON-0001",
      "nombre": "Montura ecuatorial alemana",
      "categoria": "Monturas",
      "laboratorio_id": "LAB-OBS",
      "marca": "Vixen",
      "modelo": "GP-DX",
      "serie": "",
      "nivel_control": "supervisado",
      "estado": "disponible",
      "max_dias": 2,
      "componentes": "Cabezal; Trípode; Contrapesos (2); Motor de seguimiento; Controlador",
      "notas": "Alinear con el polo celeste antes de usar.",
      "descripcion": "Montura ecuatorial con seguimiento motorizado para tubos medianos. Permite seguir los objetos durante la observación y hacer astrofotografía de exposición corta.",
      "especificaciones": "Capacidad de carga: aprox. 10 kg; Seguimiento: motor en ascensión recta; Alimentación: 12 V",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Vixen_GP-DX_equatorial_mount.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Vixen_GP-DX_equatorial_mount.jpg"
    },
    {
      "id": "OAN-MON-0002",
      "nombre": "Trípode fotográfico",
      "categoria": "Monturas",
      "laboratorio_id": "LAB-OPT",
      "marca": "Velbon",
      "modelo": "Sherpa 600R",
      "serie": "",
      "nivel_control": "libre",
      "estado": "disponible",
      "max_dias": 5,
      "componentes": "Trípode; Rótula; Zapata",
      "notas": "",
      "descripcion": "Trípode para cámaras y binoculares. Útil para fotografía de paisaje nocturno, lluvias de meteoros y timelapses del cielo.",
      "especificaciones": "Altura máxima: 160 cm; Carga máxima: 3 kg",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Velbon_Sherpa_600R_camera_tripod.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Velbon_Sherpa_600R_camera_tripod.jpg"
    },
    {
      "id": "OAN-CAM-0001",
      "nombre": "Cámara CCD científica",
      "categoria": "Cámaras",
      "laboratorio_id": "LAB-OPT",
      "marca": "",
      "modelo": "CCD monocromática refrigerada",
      "serie": "",
      "nivel_control": "restringido",
      "estado": "disponible",
      "max_dias": 2,
      "componentes": "Cámara; Cable USB; Fuente 12 V; Rueda de filtros; Estuche",
      "notas": "Guardar con desecante.",
      "descripcion": "Cámara de investigación para fotometría y astrometría con filtros. Su sensor se refrigera para reducir el ruido térmico. Uso en prácticas avanzadas y proyectos de grado. La foto muestra un sensor CCD de referencia.",
      "especificaciones": "Sensor: CCD monocromático; Refrigeración: hasta 30 °C bajo el ambiente; Interfaz: USB 2.0; Filtros: B, V, R, I, H-alfa",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Orthogonal-transfer-array-ccd.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Orthogonal-transfer-array-ccd.jpg"
    },
    {
      "id": "OAN-CAM-0002",
      "nombre": "Cámara réflex digital",
      "categoria": "Cámaras",
      "laboratorio_id": "LAB-OPT",
      "marca": "Canon",
      "modelo": "EOS 7D",
      "serie": "",
      "nivel_control": "supervisado",
      "estado": "disponible",
      "max_dias": 3,
      "componentes": "Cuerpo; Batería (2); Cargador; Tarjeta SD; Adaptador T2; Disparador",
      "notas": "",
      "descripcion": "Cámara réflex para astrofotografía de gran campo y, con adaptador T2, a foco primo del telescopio. También se usa para registrar eventos de divulgación.",
      "especificaciones": "Sensor: APS-C de 18 MP; ISO: 100–6400; Montura: Canon EF",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Canon_EOS_7D_DSLR_body_front.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Canon_EOS_7D_DSLR_body_front.jpg"
    },
    {
      "id": "OAN-CAM-0003",
      "nombre": "Cámara planetaria",
      "categoria": "Cámaras",
      "laboratorio_id": "LAB-OPT",
      "marca": "",
      "modelo": "Webcam adaptada",
      "serie": "",
      "nivel_control": "supervisado",
      "estado": "disponible",
      "max_dias": 3,
      "componentes": "Cámara; Adaptador 1¼\"; Cable USB",
      "notas": "",
      "descripcion": "Cámara de video para planetas y Luna: graba miles de cuadros que luego se apilan para obtener imágenes nítidas. Ideal para prácticas de procesamiento de imágenes.",
      "especificaciones": "Resolución: 640 × 480; Cuadros por segundo: hasta 60; Conexión: USB",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Webcam_astrophotography_2007_09_15.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Webcam_astrophotography_2007_09_15.jpg"
    },
    {
      "id": "OAN-ESP-0001",
      "nombre": "Red de difracción para espectroscopía",
      "categoria": "Espectrógrafos",
      "laboratorio_id": "LAB-OPT",
      "marca": "",
      "modelo": "Red de 100 líneas/mm",
      "serie": "",
      "nivel_control": "restringido",
      "estado": "disponible",
      "max_dias": 3,
      "componentes": "Red de difracción en montura 1¼\"; Estuche",
      "notas": "No tocar la superficie de la red.",
      "descripcion": "Red de difracción que se enrosca como un filtro delante de la cámara y produce el espectro de estrellas brillantes. Permite clasificar estrellas e identificar líneas de absorción en prácticas de astrofísica.",
      "especificaciones": "Densidad: 100 líneas/mm; Montura: rosca de filtro 1¼\"",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Diffraction_Grating.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Diffraction_Grating.jpg"
    },
    {
      "id": "OAN-OCU-0001",
      "nombre": "Estuche de oculares y filtros",
      "categoria": "Oculares y filtros",
      "laboratorio_id": "LAB-OBS",
      "marca": "Varias",
      "modelo": "",
      "serie": "",
      "nivel_control": "libre",
      "estado": "disponible",
      "max_dias": 3,
      "componentes": "Ocular 32 mm; Ocular 25 mm; Ocular 10 mm; Ocular 6 mm; Barlow 2×; Filtro lunar; Filtros de color (4)",
      "notas": "Contar los oculares al devolver el estuche.",
      "descripcion": "Juego de oculares para obtener distintos aumentos con cualquier telescopio del observatorio, con lente Barlow y filtros para Luna y planetas.",
      "especificaciones": "Formato: 1¼\"; Oculares: 32, 25, 10 y 6 mm",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Okulare.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Okulare.jpg"
    },
    {
      "id": "OAN-INS-0001",
      "nombre": "Binoculares 15×70",
      "categoria": "Instrumentos",
      "laboratorio_id": "LAB-OBS",
      "marca": "Celestron",
      "modelo": "SkyMaster 15×70",
      "serie": "",
      "nivel_control": "libre",
      "estado": "disponible",
      "max_dias": 3,
      "componentes": "Binoculares; Adaptador para trípode; Tapas; Estuche",
      "notas": "",
      "descripcion": "Binoculares de gran apertura para recorrer la Vía Láctea, cúmulos y cometas. Con el adaptador se montan en el trípode fotográfico.",
      "especificaciones": "Aumento: 15×; Objetivos: 70 mm; Campo de visión: 4,4°; Peso: 1,4 kg",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Porro_binocular.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Porro_binocular.jpg"
    },
    {
      "id": "OAN-INS-0002",
      "nombre": "Puntero láser verde",
      "categoria": "Instrumentos",
      "laboratorio_id": "LAB-DIV",
      "marca": "",
      "modelo": "Láser 532 nm",
      "serie": "",
      "nivel_control": "supervisado",
      "estado": "disponible",
      "max_dias": 1,
      "componentes": "Puntero; Baterías (2)",
      "notas": "Uso exclusivo de monitores capacitados. Nunca apuntar a personas, vehículos ni aeronaves.",
      "descripcion": "Puntero para señalar estrellas y constelaciones durante las charlas al aire libre.",
      "especificaciones": "Longitud de onda: 532 nm; Potencia: < 5 mW",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Green_laser_pointer_100mW_night.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Green_laser_pointer_100mW_night.jpg"
    },
    {
      "id": "OAN-CMP-0001",
      "nombre": "Portátil de adquisición",
      "categoria": "Computadores",
      "laboratorio_id": "LAB-OPT",
      "marca": "Lenovo",
      "modelo": "ThinkPad T430",
      "serie": "",
      "nivel_control": "supervisado",
      "estado": "disponible",
      "max_dias": 5,
      "componentes": "Portátil; Cargador; Mouse",
      "notas": "No instalar programas sin autorización del laboratorio.",
      "descripcion": "Computador con el software de control de telescopios, cámaras y procesamiento de imágenes instalado y probado con los equipos del observatorio.",
      "especificaciones": "Pantalla: 14\"; Software: control de montura, captura y procesamiento de imágenes",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Lenovo_ThinkPad_T430.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Lenovo_ThinkPad_T430.jpg"
    },
    {
      "id": "OAN-DIV-0001",
      "nombre": "Planetario mecánico (orrery)",
      "categoria": "Divulgación",
      "laboratorio_id": "LAB-DIV",
      "marca": "",
      "modelo": "",
      "serie": "",
      "nivel_control": "libre",
      "estado": "disponible",
      "max_dias": 7,
      "componentes": "Planetario mecánico; Manivela; Guía del monitor",
      "notas": "",
      "descripcion": "Modelo mecánico del sistema solar que muestra el movimiento de los planetas alrededor del Sol. Muy usado en visitas de colegios para explicar años, estaciones y órbitas.",
      "especificaciones": "Planetas: Mercurio a Saturno; Accionamiento: manual",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Orrery_small.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Orrery_small.jpg"
    },
    {
      "id": "OAN-DIV-0002",
      "nombre": "Planisferios celestes (lote de 15)",
      "categoria": "Divulgación",
      "laboratorio_id": "LAB-DIV",
      "marca": "Philips",
      "modelo": "",
      "serie": "",
      "nivel_control": "libre",
      "estado": "disponible",
      "max_dias": 7,
      "componentes": "Planisferios (15); Guía de uso",
      "notas": "Contar las unidades al devolver.",
      "descripcion": "Mapas giratorios del cielo para aprender a reconocer constelaciones en cualquier fecha y hora. Se entregan a los participantes en talleres de observación.",
      "especificaciones": "Cantidad: 15 unidades",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Philips_Planisphere.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Philips_Planisphere.jpg"
    },
    {
      "id": "OAN-DIV-0003",
      "nombre": "Globo celeste",
      "categoria": "Divulgación",
      "laboratorio_id": "LAB-DIV",
      "marca": "",
      "modelo": "",
      "serie": "",
      "nivel_control": "libre",
      "estado": "disponible",
      "max_dias": 7,
      "componentes": "Globo; Base",
      "notas": "",
      "descripcion": "Esfera con las constelaciones, la eclíptica y el ecuador celeste. Ayuda a explicar coordenadas celestes y el movimiento aparente del cielo.",
      "especificaciones": "Diámetro: aprox. 30 cm",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Celestial_globe.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Celestial_globe.jpg"
    },
    {
      "id": "OAN-DIV-0004",
      "nombre": "Gafas para eclipses (lote de 50)",
      "categoria": "Divulgación",
      "laboratorio_id": "LAB-DIV",
      "marca": "",
      "modelo": "Norma ISO 12312-2",
      "serie": "",
      "nivel_control": "libre",
      "estado": "disponible",
      "max_dias": 7,
      "componentes": "Gafas (50); Caja",
      "notas": "Revisar que no tengan rayones ni agujeros antes de cada uso.",
      "descripcion": "Gafas con filtro solar certificado para observar eclipses y manchas solares a simple vista de forma segura en jornadas de divulgación.",
      "especificaciones": "Cantidad: 50 unidades; Norma: ISO 12312-2",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/Eclipsbrilletje.JPG?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:Eclipsbrilletje.JPG"
    },
    {
      "id": "OAN-DIV-0005",
      "nombre": "Colección didáctica de meteoritos",
      "categoria": "Divulgación",
      "laboratorio_id": "LAB-DIV",
      "marca": "",
      "modelo": "",
      "serie": "",
      "nivel_control": "restringido",
      "estado": "disponible",
      "max_dias": 2,
      "componentes": "Estuche; Muestras (6); Lupa; Fichas descriptivas",
      "notas": "Manipular con guantes. Contar las muestras al devolver.",
      "descripcion": "Muestras reales de meteoritos (condritas, hierros y un fragmento de Cheliábinsk) para exposiciones y clases sobre el origen del sistema solar.",
      "especificaciones": "Muestras: 6; Tipos: condritas, sideritos, fragmento de Cheliábinsk",
      "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/2_Cheljabinsk_meteorite_fragment.jpg?width=800",
      "credito_foto": "https://commons.wikimedia.org/wiki/File:2_Cheljabinsk_meteorite_fragment.jpg"
    }
  ]
};
// </ejemplos>

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
    .addItem('Ver correos disponibles hoy', 'mostrarCuotaCorreo')
    .addItem('Cargar catálogo de ejemplo (20 equipos)', 'cargarCatalogoDeEjemplo')
    .addSeparator()
    .addItem('Cerrar todas las sesiones', 'cerrarTodasLasSesiones')
    .addToUi();
}

function mostrarCuotaCorreo() {
  SpreadsheetApp.getUi().alert('Correos que todavía se pueden enviar hoy: ' + MailApp.getRemainingDailyQuota());
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
    componentes: String(eq.componentes || '').split(/\s*[;\n]\s*/).filter(String), notas: eq.notas || '',
    descripcion: String(eq.descripcion || ''), especificaciones: String(eq.especificaciones || ''),
    foto: urlFoto_(eq.foto), credito_foto: String(eq.credito_foto || '')
  };
}

/**
 * Acepta en la columna «foto» una dirección web de imagen o el enlace para compartir de un
 * archivo de Google Drive («Cualquier persona con el enlace»), y devuelve una URL que el
 * navegador puede mostrar directamente.
 */
function urlFoto_(valor) {
  const v = String(valor || '').trim();
  const drive = v.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
  if (drive) return 'https://lh3.googleusercontent.com/d/' + drive[1] + '=w800';
  return /^https:\/\//.test(v) ? v : '';
}

function prestamoPublico_(p, eq) {
  return {
    id: p.id, lote_id: p.lote_id || p.id, equipo_id: p.equipo_id, equipo_nombre: eq ? eq.nombre : p.equipo_id,
    nombre: p.nombre, email: p.email, proposito: p.proposito, descripcion: p.descripcion,
    curso_proyecto: p.curso_proyecto, lugar_uso: p.lugar_uso, avalista_email: p.avalista_email,
    fecha_solicitud: iso_(p.fecha_solicitud), fecha_salida: iso_(p.fecha_salida),
    fecha_prevista: iso_(p.fecha_prevista), fecha_devolucion: iso_(p.fecha_devolucion),
    estado: p.estado, vencido: estaVencido_(p), condicion_devolucion: p.condicion_devolucion || '',
    obs_devolucion: p.obs_devolucion || '', motivo_rechazo: p.motivo_rechazo || ''
  };
}

/** Tabla HTML para correos: datos comunes de la actividad y la lista de equipos. */
function detalleSalida_(items, devolucion) {
  const p = items[0].p;
  const fila = (k, v) => v ? '<tr><td style="color:#666;padding:3px 12px 3px 0">' + k + '</td><td>' + esc_(v) + '</td></tr>' : '';
  const datos = '<table style="border-collapse:collapse;margin-bottom:12px">' +
    fila('Responsable', p.nombre + ' · ' + p.email) + fila('Propósito', p.proposito) +
    fila('Actividad', p.descripcion) + fila('Curso / proyecto', p.curso_proyecto) + fila('Lugar de uso', p.lugar_uso) +
    fila('Devolución prevista', fechaTexto_(p.fecha_prevista)) + fila('Salida', p.lote_id) + '</table>';
  const celda = 'style="border-bottom:1px solid #ddd;padding:4px 10px 4px 0;text-align:left"';
  const equipos = '<table style="border-collapse:collapse"><tr><th ' + celda + '>Equipo</th><th ' + celda + '>Código</th><th ' +
    celda + '>' + (devolucion ? 'Estado entregado' : 'Situación') + '</th></tr>' +
    items.map(i => '<tr><td ' + celda + '>' + esc_(i.eq.nombre) + '</td><td ' + celda + '>' + esc_(i.eq.id) + '</td><td ' + celda + '>' +
      esc_(devolucion ? i.p.condicion_devolucion + (i.p.obs_devolucion ? ' — ' + i.p.obs_devolucion : '')
        : (i.p.estado === 'pendiente' ? 'pendiente de aprobación' : 'salió ' + fechaTexto_(i.p.fecha_salida))) +
      '</td></tr>').join('') + '</table>';
  return datos + equipos;
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
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
        '<img src="' + CONFIG.URL_WEB + 'img/logo-claro.png" alt="Observatorio Astronómico Nacional" height="72" style="display:block;margin-bottom:16px">' +
        cuerpo +
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
  if (CONFIG.CORREOS_INTERNOS.indexOf(String(email).toLowerCase()) >= 0) return true;
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
