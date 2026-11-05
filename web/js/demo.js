// Modo demostración: imita el backend (apps-script/Code.gs) guardando todo en el navegador.
// Sirve para probar la web y capacitar al personal antes de conectar la hoja de cálculo.
import { CATALOGOS, EQUIPOS_DEMO, LABORATORIOS_DEMO } from './catalogos.js';

const CLAVE = 'oan-equipos-demo-v3';
const ABIERTOS = ['pendiente', 'activo', 'por_verificar'];

class ErrorDemo extends Error {
  constructor(mensaje, codigo = 400) { super(mensaje); this.codigo = codigo; }
}

function inicial() {
  return {
    equipos: EQUIPOS_DEMO.map(e => ({ ...e, componentes: [...e.componentes] })),
    laboratorios: LABORATORIOS_DEMO.map(l => ({ ...l })),
    usuarios: [{ email: 'tecnico@unal.edu.co', nombre: 'Técnico de laboratorio (demo)', tipo: 'Personal técnico o administrativo', dependencia: 'OAN', telefono: '', rol: 'responsable' }],
    prestamos: [], incidencias: [], codigos: {}
  };
}

function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    if (d && d.equipos) return d;
  } catch (e) { /* almacenamiento no disponible */ }
  return memoria || (memoria = inicial());
}
let memoria = null;

function guardar(db) {
  memoria = db;
  try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch (e) { /* solo en memoria */ }
}

export function reiniciarDemo() {
  memoria = inicial();
  try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
}

const interno = email => email === 'oan.unal@gmail.com' || /@(.+\.)?unal\.edu\.co$/.test(email);
const normal = v => String(v || '').trim().toLowerCase();
const texto = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const nuevoId = p => `${p}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const vencido = p => p.estado === 'activo' && new Date(p.fecha_prevista) < new Date();

function enLista(v, lista, nombre) {
  if (!lista.includes(v)) throw new ErrorDemo(`Seleccione ${nombre}.`);
  return v;
}

function sesion(db, token) {
  if (!String(token || '').startsWith('demo.')) throw new ErrorDemo('Debe iniciar sesión.', 401);
  const email = token.slice(5);
  return { email, usuario: db.usuarios.find(u => u.email === email) || null };
}

function gestiona(db, email, usuario) {
  if (usuario?.rol === 'admin') return db.laboratorios.map(l => l.id);
  return db.laboratorios.filter(l => l.responsable_email.split(/[,;\s]+/).includes(email)).map(l => l.id);
}

function usuarioPublico(db, email, u) {
  return {
    email, registrado: !!u, interno: interno(email), nombre: u?.nombre || '', tipo: u?.tipo || (interno(email) ? '' : 'Externo'),
    dependencia: u?.dependencia || '', telefono: u?.telefono || '', rol: u?.rol || 'usuario', gestiona: gestiona(db, email, u)
  };
}

function equipo(db, id) {
  const eq = db.equipos.find(e => e.id === normal(id).toUpperCase());
  if (!eq) throw new ErrorDemo(`No existe un equipo con el código ${String(id).toUpperCase()}.`, 404);
  return eq;
}

const abierto = (db, id) => db.prestamos.find(p => p.equipo_id === id && ABIERTOS.includes(p.estado)) || null;
const laboratorio = (db, id) => db.laboratorios.find(l => l.id === id) || { id, nombre: id, ubicacion: '' };
const esGestor = (db, s, eq) => gestiona(db, s.email, s.usuario).includes(eq.laboratorio_id);

function ids(valor) {
  const lista = [...new Set((Array.isArray(valor) ? valor : [valor]).map(v => normal(v).toUpperCase()).filter(Boolean))];
  if (!lista.length) throw new ErrorDemo('Agregue al menos un equipo.');
  if (lista.length > 30) throw new ErrorDemo('Máximo 30 equipos por salida.');
  return lista;
}

function objetivo(db, d) {
  if (d.lote_id) return db.prestamos.filter(p => (p.lote_id || p.id) === d.lote_id);
  const p = db.prestamos.find(x => x.id === d.prestamo_id);
  if (!p) throw new ErrorDemo('No existe el préstamo.', 404);
  return [p];
}

function atendibles(db, s, lista, estado, siNoHay) {
  const enEstado = lista.filter(p => p.estado === estado);
  if (!enEstado.length) throw new ErrorDemo(siNoHay, 409);
  const propios = enEstado.filter(p => esGestor(db, s, equipo(db, p.equipo_id)));
  if (!propios.length) throw new ErrorDemo('Solo el responsable del laboratorio puede hacer esta acción.', 403);
  return propios;
}

function pub(db, p) {
  const eq = db.equipos.find(e => e.id === p.equipo_id);
  return { ...p, equipo_nombre: eq?.nombre || p.equipo_id, vencido: vencido(p) };
}

function guardarPerfil(db, email, perfil) {
  const nombre = texto(perfil.nombre, 120);
  if (nombre.length < 3) throw new ErrorDemo('Escriba su nombre completo.');
  const tipo = interno(email) ? perfil.tipo : 'Externo';
  if (!CATALOGOS.tipos_usuario.includes(tipo) || (interno(email) && tipo === 'Externo')) throw new ErrorDemo('Seleccione el tipo de usuario.');
  let u = db.usuarios.find(x => x.email === email);
  if (!u && perfil.acepta_datos !== true) throw new ErrorDemo('Debe aceptar la política de tratamiento de datos personales.');
  const datos = { nombre, tipo, dependencia: texto(perfil.dependencia, 120), telefono: texto(perfil.telefono, 30) };
  if (u) Object.assign(u, datos);
  else db.usuarios.push(u = { email, rol: 'usuario', acepta_datos: new Date().toISOString(), ...datos });
  return u;
}

const ACCIONES = {
  catalogos: () => ({ catalogos: CATALOGOS }),

  solicitarCodigo(db, d) {
    const email = normal(d.email);
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) throw new ErrorDemo('Escriba un correo electrónico válido.');
    const codigo = String(100000 + Math.floor(Math.random() * 900000));
    db.codigos[email] = codigo;
    return { enviado: true, minutos: 10, codigo_demo: codigo };
  },

  verificarCodigo(db, d) {
    const email = normal(d.email);
    if (!db.codigos[email]) throw new ErrorDemo('El código venció o no existe. Solicite uno nuevo.', 401);
    if (db.codigos[email] !== String(d.codigo || '').trim()) throw new ErrorDemo('Código incorrecto.', 401);
    delete db.codigos[email];
    return { token: 'demo.' + email, usuario: usuarioPublico(db, email, db.usuarios.find(u => u.email === email)) };
  },

  perfil(db, d) {
    const s = sesion(db, d.token);
    const u = guardarPerfil(db, s.email, d.perfil || {});
    return { usuario: usuarioPublico(db, s.email, u) };
  },

  equipo(db, d) {
    const eq = equipo(db, d.id);
    let s = null;
    try { s = d.token ? sesion(db, d.token) : null; } catch (e) { s = null; }
    const gestor = !!s && esGestor(db, s, eq);
    const p = abierto(db, eq.id);
    let prestamo = null;
    if (p) {
      const mio = !!s && p.email === s.email;
      prestamo = { estado: p.estado, fecha_prevista: p.fecha_prevista, vencido: vencido(p), es_mio: mio };
      if (mio || gestor) Object.assign(prestamo, pub(db, p));
      if (mio) prestamo.activos_en_salida = db.prestamos.filter(x => x.lote_id === p.lote_id && x.email === s.email && x.estado === 'activo').length;
    }
    const lab = laboratorio(db, eq.laboratorio_id);
    return {
      equipo: { ...eq, laboratorio: lab.nombre, ubicacion: lab.ubicacion },
      prestamo, puede_gestionar: gestor, catalogos: CATALOGOS
    };
  },

  catalogo(db) {
    const labs = Object.fromEntries(db.laboratorios.map(l => [l.id, l]));
    return {
      equipos: db.equipos.filter(e => e.estado !== 'baja').map(e => {
        const p = abierto(db, e.id);
        return {
          ...e, laboratorio: labs[e.laboratorio_id]?.nombre || '', ubicacion: labs[e.laboratorio_id]?.ubicacion || '',
          ...(p && p.estado === 'activo' ? { disponible_desde: p.fecha_prevista } : {})
        };
      }),
      laboratorios: db.laboratorios.map(({ id, nombre, ubicacion }) => ({ id, nombre, ubicacion }))
    };
  },

  equipos(db, d) {
    return {
      equipos: ids(d.ids).map(id => {
        try {
          const eq = equipo(db, id);
          const lab = laboratorio(db, eq.laboratorio_id);
          return { ...eq, laboratorio: lab.nombre, ubicacion: lab.ubicacion };
        } catch (e) { return { id, error: e.message }; }
      })
    };
  },

  prestar(db, d) {
    const s = sesion(db, d.token);
    let usuario = s.usuario;
    if (d.perfil) usuario = guardarPerfil(db, s.email, d.perfil);
    if (!usuario) throw new ErrorDemo('Complete su perfil antes de solicitar un préstamo.');
    const eqs = ids(d.equipos || d.equipo_id).map(id => equipo(db, id));
    const ocupados = eqs.filter(e => e.estado !== 'disponible');
    if (ocupados.length) throw new ErrorDemo(`No están disponibles: ${ocupados.map(e => `${e.id} (${e.estado.replace('_', ' ')})`).join(', ')}. Quítelos de la lista.`, 409);
    const proposito = enLista(d.proposito, CATALOGOS.propositos, 'el propósito');
    const lugar = enLista(d.lugar_uso, CATALOGOS.lugares, 'el lugar de uso');
    const descripcion = texto(d.descripcion, 500);
    if (descripcion.length < 5) throw new ErrorDemo('Describa brevemente para qué usará los equipos.');
    const ahora = new Date();
    const prevista = new Date(d.fecha_prevista);
    const maxDias = Math.min(...eqs.map(e => e.max_dias || 7));
    if (isNaN(prevista) || prevista <= ahora) throw new ErrorDemo('Indique una fecha y hora de devolución posterior al momento actual.');
    if (prevista - ahora > maxDias * 864e5 + 36e5) throw new ErrorDemo(eqs.length > 1 ? `Con estos equipos el plazo máximo es de ${maxDias} día(s).` : `Este equipo se presta máximo ${maxDias} día(s).`);
    const externo = usuario.tipo === 'Externo';
    const avalista = externo ? normal(d.avalista_email) : '';
    if (externo && !interno(avalista)) throw new ErrorDemo('Los usuarios externos necesitan un avalista con correo institucional.');
    const general = externo || lugar === 'Fuera del campus';
    const lote = nuevoId('L');
    const creados = eqs.map(eq => {
      const requiere = general || eq.nivel_control === 'restringido';
      const p = {
        id: nuevoId('P'), lote_id: lote, equipo_id: eq.id, email: s.email, nombre: usuario.nombre, tipo_usuario: usuario.tipo,
        proposito, descripcion, curso_proyecto: texto(d.curso_proyecto, 150), lugar_uso: lugar, avalista_email: avalista,
        fecha_solicitud: ahora.toISOString(), fecha_salida: requiere ? '' : ahora.toISOString(),
        fecha_prevista: prevista.toISOString(), fecha_devolucion: '', estado: requiere ? 'pendiente' : 'activo',
        condicion_salida: texto(d.condicion_salida, 300) || 'Bueno'
      };
      db.prestamos.push(p);
      eq.estado = requiere ? 'reservado' : 'prestado';
      return p;
    });
    const pub_ = creados.map(p => pub(db, p));
    return { lote_id: lote, prestamos: pub_, prestamo: pub_[0], requiere_aprobacion: creados.some(p => p.estado === 'pendiente') };
  },

  cancelar(db, d) {
    const s = sesion(db, d.token);
    const lista = objetivo(db, d).filter(p => p.estado === 'pendiente' && p.email === s.email);
    if (!lista.length) throw new ErrorDemo('No hay solicitudes pendientes suyas para cancelar.', 409);
    lista.forEach(p => {
      p.estado = 'cancelado';
      const eq = equipo(db, p.equipo_id);
      if (eq.estado === 'reservado') eq.estado = 'disponible';
    });
    return { cancelados: lista.length };
  },

  aprobar(db, d) {
    const s = sesion(db, d.token);
    const lista = atendibles(db, s, objetivo(db, d), 'pendiente', 'No hay solicitudes pendientes para atender.');
    const motivo = texto(d.motivo, 300);
    if (!d.aprobar && motivo.length < 3) throw new ErrorDemo('Indique el motivo del rechazo.');
    lista.forEach(p => {
      const eq = equipo(db, p.equipo_id);
      if (d.aprobar) {
        Object.assign(p, { estado: 'activo', fecha_salida: new Date().toISOString(), aprobado_por: s.email });
        eq.estado = 'prestado';
      } else {
        Object.assign(p, { estado: 'rechazado', aprobado_por: s.email, motivo_rechazo: motivo });
        eq.estado = 'disponible';
      }
    });
    const r = lista.map(p => pub(db, p));
    return { prestamos: r, prestamo: r[0] };
  },

  devolver(db, d) {
    const s = sesion(db, d.token);
    const pedidos = Array.isArray(d.devoluciones) ? d.devoluciones : [d];
    if (!pedidos.length) throw new ErrorDemo('No indicó qué equipos devuelve.');
    const vistos = new Set();
    const items = pedidos.map(x => {
      const eq = equipo(db, x.equipo_id);
      if (vistos.has(eq.id)) throw new ErrorDemo(`El equipo ${eq.id} está repetido.`);
      vistos.add(eq.id);
      const p = abierto(db, eq.id);
      if (!p || p.estado !== 'activo') throw new ErrorDemo(`${eq.id} no tiene un préstamo activo.`, 409);
      const gestor = esGestor(db, s, eq);
      if (p.email !== s.email && !gestor) throw new ErrorDemo(`Solo quien tiene el préstamo de ${eq.id} o un responsable del laboratorio puede registrar la devolución.`, 403);
      const condicion = enLista(x.condicion, CATALOGOS.condiciones, `el estado de ${eq.id}`);
      const componentesOk = x.componentes_ok !== false && condicion !== 'Incompleto';
      const obs = texto(x.observaciones, 500);
      const problema = condicion === 'Dañado' || !componentesOk;
      if (problema && obs.length < 5) throw new ErrorDemo(`Describa el daño o el faltante de ${eq.id}.`);
      return { eq, p, gestor, condicion, componentesOk, obs, problema };
    });
    const ahora = new Date().toISOString();
    items.forEach(i => {
      i.verificar = !i.gestor && (i.eq.nivel_control !== 'libre' || i.problema);
      Object.assign(i.p, {
        fecha_devolucion: ahora, condicion_devolucion: i.condicion, obs_devolucion: i.obs, componentes_ok: i.componentesOk,
        devuelto_por: s.email, estado: i.verificar ? 'por_verificar' : 'devuelto'
      });
      i.eq.estado = i.verificar ? 'en_revision' : (i.problema ? 'mantenimiento' : 'disponible');
      if (i.problema) db.incidencias.push({ id: nuevoId('I'), equipo_id: i.eq.id, prestamo_id: i.p.id, email: s.email, tipo: i.condicion === 'Dañado' ? 'Daño' : 'Faltante', descripcion: i.obs, fecha: ahora, estado: 'abierta' });
    });
    const r = items.map(i => ({ ...pub(db, i.p), estado_equipo: i.eq.estado, requiere_verificacion: i.verificar }));
    return { prestamos: r, prestamo: r[0], estado_equipo: items[0].eq.estado, requiere_verificacion: items.some(i => i.verificar) };
  },

  verificar(db, d) {
    const s = sesion(db, d.token);
    const lista = atendibles(db, s, objetivo(db, d), 'por_verificar', 'No hay devoluciones por verificar.');
    lista.forEach(p => {
      Object.assign(p, { estado: 'devuelto', verificado_por: s.email, fecha_verificacion: new Date().toISOString() });
      equipo(db, p.equipo_id).estado = d.enviar_mantenimiento ? 'mantenimiento' : 'disponible';
    });
    const r = lista.map(p => pub(db, p));
    return { prestamos: r, prestamo: r[0] };
  },

  reportar(db, d) {
    const s = sesion(db, d.token);
    const eq = equipo(db, d.equipo_id);
    const tipo = enLista(d.tipo, CATALOGOS.tipos_incidencia, 'el tipo de novedad');
    const descripcion = texto(d.descripcion, 500);
    if (descripcion.length < 5) throw new ErrorDemo('Describa la novedad.');
    const inc = { id: nuevoId('I'), equipo_id: eq.id, prestamo_id: abierto(db, eq.id)?.id || '', email: s.email, tipo, descripcion, fecha: new Date().toISOString(), estado: 'abierta' };
    db.incidencias.push(inc);
    return { incidencia: { id: inc.id, tipo, estado: inc.estado } };
  },

  cerrarIncidencia(db, d) {
    const s = sesion(db, d.token);
    const inc = db.incidencias.find(i => i.id === d.incidencia_id);
    if (!inc) throw new ErrorDemo('No existe la incidencia.', 404);
    const eq = equipo(db, inc.equipo_id);
    if (!esGestor(db, s, eq)) throw new ErrorDemo('Solo el responsable del laboratorio puede hacer esta acción.', 403);
    Object.assign(inc, { estado: 'cerrada', resuelto_por: s.email, solucion: texto(d.solucion, 500), fecha_cierre: new Date().toISOString() });
    if (d.equipo_disponible && eq.estado === 'mantenimiento') eq.estado = 'disponible';
    return { incidencia: { id: inc.id, estado: 'cerrada' } };
  },

  misPrestamos(db, d) {
    const s = sesion(db, d.token);
    const orden = (a, b) => b.fecha_solicitud.localeCompare(a.fecha_solicitud);
    const mios = db.prestamos.filter(p => p.email === s.email).sort(orden).slice(0, 30).map(p => pub(db, p));
    const labs = gestiona(db, s.email, s.usuario);
    let gestion = null;
    if (labs.length) {
      const eqs = Object.fromEntries(db.equipos.map(e => [e.id, e]));
      const delLab = p => labs.includes(eqs[p.equipo_id]?.laboratorio_id);
      const ps = db.prestamos.filter(delLab);
      const hace30 = Date.now() - 30 * 864e5;
      const recientes = ps.filter(p => new Date(p.fecha_solicitud) >= hace30 && ['activo', 'por_verificar', 'devuelto'].includes(p.estado));
      const contar = (lista, f) => lista.reduce((o, x) => (o[f(x)] = (o[f(x)] || 0) + 1, o), {});
      gestion = {
        laboratorios: labs,
        pendientes: ps.filter(p => p.estado === 'pendiente').sort(orden).map(p => pub(db, p)),
        por_verificar: ps.filter(p => p.estado === 'por_verificar').sort(orden).map(p => pub(db, p)),
        activos: ps.filter(p => p.estado === 'activo').sort((a, b) => a.fecha_prevista.localeCompare(b.fecha_prevista)).map(p => pub(db, p)),
        incidencias: db.incidencias.filter(i => i.estado === 'abierta' && labs.includes(eqs[i.equipo_id]?.laboratorio_id))
          .map(i => ({ ...i, equipo_nombre: eqs[i.equipo_id].nombre })),
        resumen: {
          prestamos_30_dias: recientes.length,
          por_proposito: contar(recientes, p => p.proposito),
          equipos_mas_usados: Object.entries(contar(recientes, p => p.equipo_id)).sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([id, n]) => ({ equipo_id: id, nombre: eqs[id].nombre, prestamos: n })),
          equipos_por_estado: contar(db.equipos.filter(e => labs.includes(e.laboratorio_id)), e => e.estado)
        }
      };
    }
    return { usuario: usuarioPublico(db, s.email, s.usuario), prestamos: mios, gestion };
  }
};

export async function llamarDemo(accion, datos) {
  await new Promise(r => setTimeout(r, 200));
  const fn = ACCIONES[accion];
  if (!fn) return { ok: false, error: 'Acción no válida', codigo: 400 };
  const db = cargar();
  try {
    const r = fn(db, datos || {});
    guardar(db);
    return { ok: true, ...JSON.parse(JSON.stringify(r)) };
  } catch (e) {
    if (!(e instanceof ErrorDemo)) console.error(e);
    return { ok: false, error: e.message, codigo: e.codigo || 500 };
  }
}
