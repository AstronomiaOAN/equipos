/**
 * Pruebas del backend (Code.gs) con el simulador.
 * Ejecutar desde la raíz del repositorio:  node --test apps-script/pruebas/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./simulador');

const EN_DOS_DIAS = () => new Date(Date.now() + 2 * 864e5).toISOString();
const PERFIL = { nombre: 'Ana Pérez', tipo: 'Estudiante de pregrado', dependencia: 'Astronomía', acepta_datos: true };
const SOLICITUD = {
  proposito: 'Práctica de laboratorio', descripcion: 'Práctica de fotometría', curso_proyecto: 'Astronomía observacional',
  lugar_uso: 'Dentro del OAN'
};

function preparar() {
  const e = crearEntorno();
  e.api.configurar();
  // configurar() deja datos de ejemplo; las pruebas usan los suyos.
  ['Laboratorios', 'Equipos', 'Usuarios'].forEach(n => e.hojas[n].filas.splice(1));
  e.llenar('Laboratorios', [
    { id: 'LAB-OPT', nombre: 'Laboratorio de Óptica', ubicacion: 'Edificio OAN', responsable_email: 'tecnico@unal.edu.co' }
  ]);
  e.llenar('Equipos', [
    { id: 'OAN-TEL-0001', nombre: 'Telescopio 8"', categoria: 'Telescopios', laboratorio_id: 'LAB-OPT', nivel_control: 'libre', estado: 'disponible', max_dias: 3, componentes: 'Tubo; Buscador; Tapa' },
    { id: 'OAN-CAM-0001', nombre: 'Cámara CCD', categoria: 'Cámaras', laboratorio_id: 'LAB-OPT', nivel_control: 'restringido', estado: 'disponible', max_dias: 2 },
    { id: 'OAN-MON-0001', nombre: 'Montura ecuatorial', categoria: 'Monturas', laboratorio_id: 'LAB-OPT', nivel_control: 'supervisado', estado: 'disponible', max_dias: 3 }
  ]);
  return e;
}

test('configurar crea todas las hojas con encabezados', () => {
  const e = preparar();
  for (const nombre of Object.keys(e.api.HOJAS)) {
    assert.equal(JSON.stringify(e.hojas[nombre].filas[0]), JSON.stringify(e.api.HOJAS[nombre]));
  }
});

test('en una hoja nueva configurar carga datos iniciales una sola vez', () => {
  const e = crearEntorno();
  e.api.configurar();
  e.api.configurar();
  assert.ok(e.hojas.Instrucciones);
  assert.equal(e.leer('Equipos').length, 8);
  assert.equal(e.leer('Laboratorios').length, 3);
  const admin = e.leer('Usuarios');
  assert.equal(admin.length, 1);
  assert.equal(admin[0].rol, 'admin');
  // La cuenta del OAN entra como interna y gestiona todos los laboratorios
  const s = e.iniciarSesion('oan.unal@gmail.com');
  assert.equal(s.usuario.interno, true);
  assert.equal(s.usuario.gestiona.length, 3);
});

test('inicio de sesión: código incorrecto y correcto', () => {
  const e = preparar();
  assert.equal(e.llamar({ accion: 'solicitarCodigo', email: 'ana@unal.edu.co' }).ok, true);
  const malo = e.llamar({ accion: 'verificarCodigo', email: 'ana@unal.edu.co', codigo: '000000' });
  assert.equal(malo.ok, false);
  const codigo = e.correos.at(-1).subject.match(/\d{6}/)[0];
  const bueno = e.llamar({ accion: 'verificarCodigo', email: 'ana@unal.edu.co', codigo });
  assert.equal(bueno.ok, true);
  assert.equal(bueno.usuario.registrado, false);
  assert.ok(bueno.token.split('.').length === 3);
});

test('token alterado es rechazado', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  const falso = token.slice(0, -2) + 'xx';
  const r = e.llamar({ accion: 'misPrestamos', token: falso });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 401);
});

test('préstamo y devolución de equipo libre', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  const r = e.llamar({ accion: 'prestar', token, equipo_id: 'oan-tel-0001', perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.requiere_aprobacion, false);
  assert.equal(r.prestamo.estado, 'activo');
  assert.equal(e.leer('Equipos')[0].estado, 'prestado');
  assert.equal(e.leer('Usuarios')[0].nombre, 'Ana Pérez');

  // Otro usuario no puede prestarlo ni devolverlo
  const otro = e.iniciarSesion('luis@unal.edu.co');
  const r2 = e.llamar({ accion: 'prestar', token: otro.token, equipo_id: 'OAN-TEL-0001', perfil: { ...PERFIL, nombre: 'Luis' }, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  assert.equal(r2.codigo, 409);
  const r3 = e.llamar({ accion: 'devolver', token: otro.token, equipo_id: 'OAN-TEL-0001', condicion: 'Bueno' });
  assert.equal(r3.codigo, 403);

  // La consulta pública no expone datos personales
  const pub = e.llamar({ accion: 'equipo', id: 'OAN-TEL-0001', token: otro.token });
  assert.equal(pub.prestamo.es_mio, false);
  assert.equal(pub.prestamo.email, undefined);

  const dev = e.llamar({ accion: 'devolver', token, equipo_id: 'OAN-TEL-0001', condicion: 'Bueno', componentes_ok: true });
  assert.equal(dev.ok, true, dev.error);
  assert.equal(dev.prestamo.estado, 'devuelto');
  assert.equal(e.leer('Equipos')[0].estado, 'disponible');
});

test('plazo máximo y fecha pasada se validan', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  const lejos = new Date(Date.now() + 10 * 864e5).toISOString();
  assert.equal(e.llamar({ accion: 'prestar', token, equipo_id: 'OAN-TEL-0001', perfil: PERFIL, ...SOLICITUD, fecha_prevista: lejos }).ok, false);
  const pasada = new Date(Date.now() - 864e5).toISOString();
  assert.equal(e.llamar({ accion: 'prestar', token, equipo_id: 'OAN-TEL-0001', perfil: PERFIL, ...SOLICITUD, fecha_prevista: pasada }).ok, false);
});

test('equipo restringido: solicitud, aprobación, devolución y verificación', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  const sol = e.llamar({ accion: 'prestar', token: ana.token, equipo_id: 'OAN-CAM-0001', perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  assert.equal(sol.requiere_aprobacion, true);
  assert.equal(sol.prestamo.estado, 'pendiente');
  assert.equal(e.leer('Equipos')[1].estado, 'reservado');
  assert.ok(e.correos.some(c => c.to.includes('tecnico@unal.edu.co')));

  // Ana no puede aprobar su propia solicitud
  assert.equal(e.llamar({ accion: 'aprobar', token: ana.token, prestamo_id: sol.prestamo.id, aprobar: true }).codigo, 403);

  const tec = e.iniciarSesion('tecnico@unal.edu.co');
  assert.equal(JSON.stringify(tec.usuario.gestiona), '["LAB-OPT"]');
  const panel = e.llamar({ accion: 'misPrestamos', token: tec.token });
  assert.equal(panel.gestion.pendientes.length, 1);

  const ap = e.llamar({ accion: 'aprobar', token: tec.token, prestamo_id: sol.prestamo.id, aprobar: true });
  assert.equal(ap.prestamo.estado, 'activo');
  assert.equal(e.leer('Equipos')[1].estado, 'prestado');

  const dev = e.llamar({ accion: 'devolver', token: ana.token, equipo_id: 'OAN-CAM-0001', condicion: 'Bueno' });
  assert.equal(dev.requiere_verificacion, true);
  assert.equal(e.leer('Equipos')[1].estado, 'en_revision');

  const ver = e.llamar({ accion: 'verificar', token: tec.token, prestamo_id: sol.prestamo.id, observaciones: 'Todo en orden' });
  assert.equal(ver.prestamo.estado, 'devuelto');
  assert.equal(e.leer('Equipos')[1].estado, 'disponible');
});

test('rechazo exige motivo y libera el equipo', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  const sol = e.llamar({ accion: 'prestar', token: ana.token, equipo_id: 'OAN-CAM-0001', perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  const tec = e.iniciarSesion('tecnico@unal.edu.co');
  assert.equal(e.llamar({ accion: 'aprobar', token: tec.token, prestamo_id: sol.prestamo.id, aprobar: false }).ok, false);
  const r = e.llamar({ accion: 'aprobar', token: tec.token, prestamo_id: sol.prestamo.id, aprobar: false, motivo: 'Reservada para práctica' });
  assert.equal(r.prestamo.estado, 'rechazado');
  assert.equal(e.leer('Equipos')[1].estado, 'disponible');
});

test('devolución con daño crea incidencia y deja el equipo en revisión', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  e.llamar({ accion: 'prestar', token: ana.token, equipo_id: 'OAN-TEL-0001', perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  assert.equal(e.llamar({ accion: 'devolver', token: ana.token, equipo_id: 'OAN-TEL-0001', condicion: 'Dañado' }).ok, false, 'exige descripción');
  const r = e.llamar({ accion: 'devolver', token: ana.token, equipo_id: 'OAN-TEL-0001', condicion: 'Dañado', observaciones: 'Se rayó el espejo secundario' });
  assert.equal(r.ok, true, r.error);
  assert.equal(e.leer('Incidencias').length, 1);
  assert.equal(e.leer('Equipos')[0].estado, 'en_revision');
});

test('usuario externo necesita avalista institucional y aprobación', () => {
  const e = preparar();
  const ext = e.iniciarSesion('visitante@gmail.com');
  const perfil = { nombre: 'Visitante Externo', tipo: 'Externo', acepta_datos: true };
  const sin = e.llamar({ accion: 'prestar', token: ext.token, equipo_id: 'OAN-TEL-0001', perfil, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  assert.equal(sin.ok, false);
  const con = e.llamar({ accion: 'prestar', token: ext.token, equipo_id: 'OAN-TEL-0001', perfil, avalista_email: 'profe@unal.edu.co', ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  assert.equal(con.requiere_aprobacion, true);
});

test('textos que parecen fórmulas se guardan como texto', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  e.llamar({ accion: 'prestar', token: ana.token, equipo_id: 'OAN-TEL-0001', perfil: PERFIL, ...SOLICITUD, descripcion: '=IMPORTXML("http://x")', fecha_prevista: EN_DOS_DIAS() });
  assert.ok(e.leer('Prestamos')[0].descripcion.startsWith("'="));
});

test('revisarVencimientos avisa al usuario y al responsable', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  e.llamar({ accion: 'prestar', token: ana.token, equipo_id: 'OAN-TEL-0001', perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  // Forzar el vencimiento
  const h = e.hojas.Prestamos;
  h.filas[1][h.filas[0].indexOf('fecha_prevista')] = new Date(Date.now() - 36e5);
  const antes = e.correos.length;
  e.api.revisarVencimientos();
  const nuevos = e.correos.slice(antes);
  assert.ok(nuevos.some(c => c.to === 'ana@unal.edu.co' && /vencido/i.test(c.subject)));
  assert.ok(nuevos.some(c => c.to.includes('tecnico@unal.edu.co')));
});

// ─── Salidas con varios equipos ─────────────────────────────────────────────

test('salida con varios equipos: datos una vez, cada equipo con su registro', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  const antes = e.correos.length;
  const r = e.llamar({ accion: 'prestar', token: ana.token, equipos: ['OAN-TEL-0001', 'OAN-MON-0001', 'OAN-CAM-0001'],
    perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.prestamos.length, 3);
  assert.ok(r.lote_id.startsWith('L-'));
  const filas = e.leer('Prestamos');
  assert.equal(new Set(filas.map(f => f.lote_id)).size, 1, 'mismo lote');
  assert.ok(filas.every(f => f.proposito === SOLICITUD.proposito));
  const porEquipo = Object.fromEntries(filas.map(f => [f.equipo_id, f.estado]));
  assert.equal(porEquipo['OAN-TEL-0001'], 'activo');
  assert.equal(porEquipo['OAN-MON-0001'], 'activo');
  assert.equal(porEquipo['OAN-CAM-0001'], 'pendiente', 'el restringido espera aprobación');
  assert.equal(r.requiere_aprobacion, true);
  const alUsuario = e.correos.slice(antes).filter(c => c.to === 'ana@unal.edu.co');
  assert.equal(alUsuario.length, 1, 'un solo correo para toda la salida');
});

test('si un equipo no está disponible no se registra ninguno', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  e.llamar({ accion: 'prestar', token: ana.token, equipo_id: 'OAN-TEL-0001', perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  const r = e.llamar({ accion: 'prestar', token: ana.token, equipos: ['OAN-MON-0001', 'OAN-TEL-0001'], ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  assert.equal(r.codigo, 409);
  assert.match(r.error, /OAN-TEL-0001/);
  assert.equal(e.leer('Prestamos').length, 1);
  assert.equal(e.leer('Equipos')[2].estado, 'disponible');
});

test('el plazo de la salida lo fija el equipo con menor max_dias', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  const tres = new Date(Date.now() + 2.9 * 864e5).toISOString();
  // TEL-0001 permite 3 días, CAM-0001 solo 2
  const r = e.llamar({ accion: 'prestar', token: ana.token, equipos: ['OAN-TEL-0001', 'OAN-CAM-0001'], perfil: PERFIL, ...SOLICITUD, fecha_prevista: tres });
  assert.equal(r.ok, false);
  assert.match(r.error, /2 día/);
});

test('aprobar, devolver y verificar una salida completa', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  const r = e.llamar({ accion: 'prestar', token: ana.token, equipos: ['OAN-TEL-0001', 'OAN-MON-0001', 'OAN-CAM-0001'],
    perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  const tec = e.iniciarSesion('tecnico@unal.edu.co');
  const ap = e.llamar({ accion: 'aprobar', token: tec.token, lote_id: r.lote_id, aprobar: true });
  assert.equal(ap.prestamos.length, 1, 'solo había uno pendiente');
  assert.ok(e.leer('Prestamos').every(p => p.estado === 'activo'));

  // Una devolución con daño sin descripción no registra nada
  const mala = e.llamar({ accion: 'devolver', token: ana.token, devoluciones: [
    { equipo_id: 'OAN-TEL-0001', condicion: 'Bueno' }, { equipo_id: 'OAN-MON-0001', condicion: 'Dañado' }] });
  assert.equal(mala.ok, false);
  assert.ok(e.leer('Prestamos').every(p => p.estado === 'activo'));

  const dev = e.llamar({ accion: 'devolver', token: ana.token, devoluciones: [
    { equipo_id: 'OAN-TEL-0001', condicion: 'Bueno' },
    { equipo_id: 'OAN-MON-0001', condicion: 'Con detalles menores', observaciones: 'Rayón en el trípode' },
    { equipo_id: 'OAN-CAM-0001', condicion: 'Bueno' }] });
  assert.equal(dev.ok, true, dev.error);
  const estados = Object.fromEntries(e.leer('Equipos').map(x => [x.id, x.estado]));
  assert.equal(estados['OAN-TEL-0001'], 'disponible', 'libre y en buen estado');
  assert.equal(estados['OAN-MON-0001'], 'en_revision');
  assert.equal(estados['OAN-CAM-0001'], 'en_revision');

  const ver = e.llamar({ accion: 'verificar', token: tec.token, lote_id: r.lote_id });
  assert.equal(ver.prestamos.length, 2);
  assert.ok(e.leer('Equipos').every(x => x.estado === 'disponible'));
});

test('devolución parcial: se devuelve un equipo y el resto sigue prestado', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  e.llamar({ accion: 'prestar', token: ana.token, equipos: ['OAN-TEL-0001', 'OAN-MON-0001'], perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  const r = e.llamar({ accion: 'devolver', token: ana.token, equipo_id: 'OAN-TEL-0001', condicion: 'Bueno' });
  assert.equal(r.ok, true, r.error);
  const estados = Object.fromEntries(e.leer('Prestamos').map(p => [p.equipo_id, p.estado]));
  assert.equal(estados['OAN-TEL-0001'], 'devuelto');
  assert.equal(estados['OAN-MON-0001'], 'activo');
});

test('cancelar una solicitud de varios equipos libera todos', () => {
  const e = preparar();
  const ext = e.iniciarSesion('visitante@gmail.com');
  const r = e.llamar({ accion: 'prestar', token: ext.token, equipos: ['OAN-TEL-0001', 'OAN-MON-0001'],
    perfil: { nombre: 'Visitante Externo', tipo: 'Externo', acepta_datos: true }, avalista_email: 'profe@unal.edu.co',
    ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  assert.equal(r.prestamos.every(p => p.estado === 'pendiente'), true);
  const c = e.llamar({ accion: 'cancelar', token: ext.token, lote_id: r.lote_id });
  assert.equal(c.cancelados, 2);
  assert.ok(e.leer('Equipos').every(x => x.estado === 'disponible'));
});

test('consulta de varios equipos a la vez', () => {
  const e = preparar();
  const r = e.llamar({ accion: 'equipos', ids: ['oan-tel-0001', 'OAN-XXX-9999'] });
  assert.equal(r.equipos[0].nombre, 'Telescopio 8"');
  assert.match(r.equipos[1].error, /No existe/);
});

test('un solo aviso de vencimiento por persona aunque tenga varios equipos', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  e.llamar({ accion: 'prestar', token: ana.token, equipos: ['OAN-TEL-0001', 'OAN-MON-0001'], perfil: PERFIL, ...SOLICITUD, fecha_prevista: EN_DOS_DIAS() });
  const h = e.hojas.Prestamos;
  const col = h.filas[0].indexOf('fecha_prevista');
  h.filas.slice(1).forEach(f => { f[col] = new Date(Date.now() - 36e5); });
  const antes = e.correos.length;
  e.api.revisarVencimientos();
  const aAna = e.correos.slice(antes).filter(c => c.to === 'ana@unal.edu.co');
  assert.equal(aAna.length, 1);
  assert.match(aAna[0].subject, /2 equipos/);
});
