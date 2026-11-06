/**
 * Pruebas del backend (Code.gs) con el simulador.
 * Ejecutar desde la raíz del repositorio:  node --test 'apps-script/pruebas/*.test.js'
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./simulador');

/** Día calendario en Colombia, n días después de hoy (AAAA-MM-DD). */
const dia = n => new Date(Date.now() - 5 * 36e5 + n * 864e5).toISOString().slice(0, 10);
const PERFIL = { nombre: 'Ana Pérez', tipo: 'Estudiante de pregrado', acepta_datos: true };
const SOLICITUD = { proposito: 'Práctica de laboratorio', descripcion: 'Práctica de fotometría', lugar_uso: 'En el OAN' };

function preparar() {
  const e = crearEntorno();
  e.api.configurar();
  // configurar() deja datos de ejemplo; las pruebas usan los suyos.
  ['Laboratorios', 'Equipos', 'Usuarios'].forEach(n => e.hojas[n].filas.splice(1));
  e.llenar('Laboratorios', [
    { id: 'LAB-OPT', nombre: 'Laboratorio de Óptica', ubicacion: 'Edificio OAN', responsable_email: 'tecnico@unal.edu.co' },
    { id: 'LAB-DIV', nombre: 'Divulgación', ubicacion: 'Planetario', responsable_email: 'divulga@unal.edu.co' }
  ]);
  e.llenar('Equipos', [
    { id: 'OAN-TEL-0001', nombre: 'Telescopio 8"', categoria: 'Telescopios', laboratorio_id: 'LAB-OPT', estado: 'disponible', componentes: 'Tubo; Buscador; Tapa' },
    { id: 'OAN-CAM-0001', nombre: 'Cámara CCD', categoria: 'Cámaras', laboratorio_id: 'LAB-OPT', estado: 'disponible' },
    { id: 'OAN-MON-0001', nombre: 'Montura ecuatorial', categoria: 'Monturas', laboratorio_id: 'LAB-OPT', estado: 'disponible' },
    { id: 'OAN-DIV-0001', nombre: 'Planisferios', categoria: 'Divulgación', laboratorio_id: 'LAB-DIV', estado: 'disponible' }
  ]);
  return e;
}

const estados = e => Object.fromEntries(e.leer('Equipos').map(x => [x.id, x.estado]));
const prestar = (e, token, equipos, extra = {}) =>
  e.llamar({ accion: 'prestar', token, equipos, perfil: PERFIL, ...SOLICITUD, fecha_devolucion: dia(2), ...extra });

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
  assert.equal(e.leer('Equipos').length, 20);
  assert.ok(e.leer('Equipos').every(x => x.foto.startsWith('https://') && x.descripcion.length > 20));
  assert.equal(e.leer('Laboratorios').length, 3);
  const admin = e.leer('Usuarios');
  assert.equal(admin.length, 1);
  assert.equal(admin[0].rol, 'admin');
  const s = e.iniciarSesion('oan.unal@gmail.com');
  assert.equal(s.usuario.interno, true);
  assert.equal(s.usuario.gestiona.length, 3);
});

test('inicio de sesión: código incorrecto y correcto', () => {
  const e = preparar();
  assert.equal(e.llamar({ accion: 'solicitarCodigo', email: 'ana@unal.edu.co' }).ok, true);
  assert.equal(e.llamar({ accion: 'verificarCodigo', email: 'ana@unal.edu.co', codigo: '000000' }).ok, false);
  const codigo = e.correos.at(-1).subject.match(/\d{6}/)[0];
  const bueno = e.llamar({ accion: 'verificarCodigo', email: 'ana@unal.edu.co', codigo });
  assert.equal(bueno.ok, true);
  assert.equal(bueno.usuario.registrado, false);
});

test('token alterado es rechazado', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  const r = e.llamar({ accion: 'misPrestamos', token: token.slice(0, -2) + 'xx' });
  assert.equal(r.codigo, 401);
});

test('el perfil solo pide nombre y vinculación', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  const r = prestar(e, token, ['OAN-TEL-0001']);
  assert.equal(r.ok, true, r.error);
  const u = e.leer('Usuarios')[0];
  assert.equal(u.nombre, 'Ana Pérez');
  assert.equal(u.tipo, 'Estudiante de pregrado');
  assert.ok(u.acepta_datos);
});

test('préstamo directo sin aprobación y aviso al laboratorio', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  const antes = e.correos.length;
  const r = prestar(e, token, ['OAN-TEL-0001', 'OAN-CAM-0001', 'OAN-DIV-0001']);
  assert.equal(r.ok, true, r.error);
  assert.ok(r.prestamos.every(p => p.estado === 'activo' && p.fecha_salida));
  assert.equal(new Set(r.prestamos.map(p => p.lote_id)).size, 1);
  assert.equal(estados(e)['OAN-TEL-0001'], 'prestado');
  assert.equal(estados(e)['OAN-DIV-0001'], 'prestado');
  const nuevos = e.correos.slice(antes);
  assert.ok(nuevos.some(c => c.to === 'tecnico@unal.edu.co' && /Préstamo: 2 equipos/.test(c.subject)), 'aviso al laboratorio de óptica');
  assert.ok(nuevos.some(c => c.to === 'divulga@unal.edu.co' && /Planisferios/.test(c.subject)), 'aviso al laboratorio de divulgación');
  assert.equal(nuevos.filter(c => c.to === 'ana@unal.edu.co').length, 1, 'un comprobante por salida');
});

test('plazo en días calendario: hoy hasta 7 días', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  assert.match(prestar(e, token, ['OAN-TEL-0001'], { fecha_devolucion: dia(8) }).error, /7 días calendario/);
  assert.match(prestar(e, token, ['OAN-TEL-0001'], { fecha_devolucion: dia(-1) }).error, /anterior a hoy/);
  const hoy = prestar(e, token, ['OAN-TEL-0001'], { fecha_devolucion: dia(0) });
  assert.equal(hoy.ok, true, hoy.error);
  const semana = prestar(e, token, ['OAN-CAM-0001'], { fecha_devolucion: dia(7) });
  assert.equal(semana.ok, true, semana.error);
  // Vence al final del día elegido (23:59 en Colombia)
  assert.equal(semana.prestamo.fecha_prevista, new Date(dia(7) + 'T23:59:00-05:00').toISOString());
});

test('acepta la fecha en el formato anterior (fecha y hora)', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  const r = prestar(e, token, ['OAN-TEL-0001'], { fecha_devolucion: undefined, fecha_prevista: new Date(Date.now() + 2 * 864e5).toISOString() });
  assert.equal(r.ok, true, r.error);
});

test('si un equipo no está disponible no se registra ninguno', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  prestar(e, token, ['OAN-TEL-0001']);
  const r = prestar(e, token, ['OAN-MON-0001', 'OAN-TEL-0001']);
  assert.equal(r.codigo, 409);
  assert.match(r.error, /OAN-TEL-0001/);
  assert.equal(e.leer('Prestamos').length, 1);
  assert.equal(estados(e)['OAN-MON-0001'], 'disponible');
});

test('devolución directa: queda disponible y avisa al laboratorio', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  prestar(e, token, ['OAN-TEL-0001', 'OAN-CAM-0001']);
  const antes = e.correos.length;
  const r = e.llamar({ accion: 'devolver', token, devoluciones: [
    { equipo_id: 'OAN-TEL-0001', condicion: 'Bueno' }, { equipo_id: 'OAN-CAM-0001' }] });
  assert.equal(r.ok, true, r.error);
  assert.ok(e.leer('Prestamos').every(p => p.estado === 'devuelto' && p.fecha_devolucion));
  assert.equal(estados(e)['OAN-TEL-0001'], 'disponible');
  assert.equal(estados(e)['OAN-CAM-0001'], 'disponible');
  assert.ok(e.correos.slice(antes).some(c => c.to === 'tecnico@unal.edu.co' && /^\[OAN\] Devolución: 2 equipos/.test(c.subject)));
});

test('devolución con daño: novedad, mantenimiento y aviso', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  prestar(e, token, ['OAN-TEL-0001']);
  assert.equal(e.llamar({ accion: 'devolver', token, equipo_id: 'OAN-TEL-0001', condicion: 'Dañado' }).ok, false, 'exige describir');
  const antes = e.correos.length;
  const r = e.llamar({ accion: 'devolver', token, equipo_id: 'OAN-TEL-0001', condicion: 'Dañado', observaciones: 'Se rayó el espejo secundario' });
  assert.equal(r.ok, true, r.error);
  assert.equal(e.leer('Incidencias').length, 1);
  assert.equal(estados(e)['OAN-TEL-0001'], 'mantenimiento');
  assert.ok(e.correos.slice(antes).some(c => /Devolución con novedad/.test(c.subject)));
  // El responsable cierra la novedad y el equipo vuelve a estar disponible
  const tec = e.iniciarSesion('tecnico@unal.edu.co');
  const inc = e.leer('Incidencias')[0];
  const c = e.llamar({ accion: 'cerrarIncidencia', token: tec.token, incidencia_id: inc.id, solucion: 'Se cambió', equipo_disponible: true });
  assert.equal(c.ok, true, c.error);
  assert.equal(estados(e)['OAN-TEL-0001'], 'disponible');
});

test('devolución parcial y permisos', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  prestar(e, ana.token, ['OAN-TEL-0001', 'OAN-MON-0001']);
  const luis = e.iniciarSesion('luis@unal.edu.co');
  assert.equal(e.llamar({ accion: 'devolver', token: luis.token, equipo_id: 'OAN-TEL-0001' }).codigo, 403);
  // La consulta pública no expone datos personales
  const pub = e.llamar({ accion: 'equipo', id: 'OAN-TEL-0001', token: luis.token });
  assert.equal(pub.prestamo.email, undefined);
  // El responsable sí puede registrar la devolución de alguien más
  const tec = e.iniciarSesion('tecnico@unal.edu.co');
  assert.equal(e.llamar({ accion: 'devolver', token: tec.token, equipo_id: 'OAN-TEL-0001' }).ok, true);
  const p = Object.fromEntries(e.leer('Prestamos').map(x => [x.equipo_id, x.estado]));
  assert.equal(p['OAN-TEL-0001'], 'devuelto');
  assert.equal(p['OAN-MON-0001'], 'activo');
});

test('usuario externo necesita avalista, pero no aprobación', () => {
  const e = preparar();
  const ext = e.iniciarSesion('visitante@gmail.com');
  const perfil = { nombre: 'Visitante Externo', tipo: 'Externo a la UNAL', acepta_datos: true };
  assert.equal(prestar(e, ext.token, ['OAN-TEL-0001'], { perfil }).ok, false);
  const r = prestar(e, ext.token, ['OAN-TEL-0001'], { perfil, avalista_email: 'profe@unal.edu.co' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.prestamo.estado, 'activo');
});

test('panel del responsable: movimientos, activos y vencidos', () => {
  const e = preparar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  prestar(e, ana.token, ['OAN-TEL-0001', 'OAN-CAM-0001']);
  e.llamar({ accion: 'devolver', token: ana.token, equipo_id: 'OAN-CAM-0001' });
  const tec = e.iniciarSesion('tecnico@unal.edu.co');
  const g = e.llamar({ accion: 'misPrestamos', token: tec.token }).gestion;
  assert.equal(g.movimientos.length, 2);
  assert.equal(g.activos.length, 1);
  assert.equal(g.pendientes, undefined);
});

test('textos que parecen fórmulas se guardan como texto', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  prestar(e, token, ['OAN-TEL-0001'], { descripcion: '=IMPORTXML("http://x")' });
  assert.ok(e.leer('Prestamos')[0].descripcion.startsWith("'="));
});

test('un solo aviso de vencimiento por persona aunque tenga varios equipos', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  prestar(e, token, ['OAN-TEL-0001', 'OAN-MON-0001']);
  const h = e.hojas.Prestamos;
  const col = h.filas[0].indexOf('fecha_prevista');
  h.filas.slice(1).forEach(f => { f[col] = new Date(Date.now() - 36e5); });
  const antes = e.correos.length;
  e.api.revisarVencimientos();
  const nuevos = e.correos.slice(antes);
  const aAna = nuevos.filter(c => c.to === 'ana@unal.edu.co');
  assert.equal(aAna.length, 1);
  assert.match(aAna[0].subject, /2 equipos/);
  assert.ok(nuevos.some(c => c.to.includes('tecnico@unal.edu.co')));
});

test('consulta de varios equipos a la vez', () => {
  const e = preparar();
  const r = e.llamar({ accion: 'equipos', ids: ['oan-tel-0001', 'OAN-XXX-9999'] });
  assert.equal(r.equipos[0].nombre, 'Telescopio 8"');
  assert.equal(r.equipos[0].dias_max, 7);
  assert.match(r.equipos[1].error, /No existe/);
});

test('catálogo público: fotos, descripción y sin datos personales', () => {
  const e = crearEntorno();
  e.api.configurar();
  const ana = e.iniciarSesion('ana@unal.edu.co');
  prestar(e, ana.token, ['OAN-TEL-0001']);
  const h = e.hojas.Equipos; const col = h.filas[0].indexOf('estado');
  h.filas.find(f => f[0] === 'OAN-DIV-0005')[col] = 'baja';
  const r = e.llamar({ accion: 'catalogo' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.equipos.length, 19);
  const tel = r.equipos.find(x => x.id === 'OAN-TEL-0001');
  assert.equal(tel.estado, 'prestado');
  assert.ok(tel.disponible_desde);
  assert.ok(tel.foto.includes('commons.wikimedia.org'));
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes('ana@unal.edu.co') && !texto.includes('Ana Pérez'));
});

test('cargarCatalogoDeEjemplo actualiza sin borrar ni cambiar estados', () => {
  const e = crearEntorno();
  e.api.configurar();
  const h = e.hojas.Equipos; const cab = h.filas[0];
  const fila = h.filas.find(f => f[0] === 'OAN-TEL-0001');
  fila[cab.indexOf('estado')] = 'prestado';
  fila[cab.indexOf('foto')] = '';
  fila[cab.indexOf('serie')] = 'SN-123';
  e.llenar('Equipos', [{ id: 'OAN-TEL-0099', nombre: 'Telescopio real', estado: 'disponible' }]);
  h.filas.splice(h.filas.findIndex(f => f[0] === 'OAN-DIV-0004'), 1);
  assert.match(e.api.cargarCatalogoDeEjemplo(), /1 equipo\(s\) agregado\(s\), 19 actualizado/);
  const equipos = e.leer('Equipos');
  assert.equal(equipos.length, 21);
  const tel = equipos.find(x => x.id === 'OAN-TEL-0001');
  assert.equal(tel.estado, 'prestado');
  assert.equal(tel.serie, 'SN-123');
  assert.ok(tel.foto.startsWith('https://'));
});

test('fotos de Google Drive se convierten en imagen directa', () => {
  const e = preparar();
  const h = e.hojas.Equipos; const cab = h.filas[0];
  h.filas[1][cab.indexOf('foto')] = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing';
  h.filas[2][cab.indexOf('foto')] = 'no es una url';
  const r = e.llamar({ accion: 'catalogo' });
  assert.equal(r.equipos[0].foto, 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345=w800');
  assert.equal(r.equipos[1].foto, '');
});

test('acciones de aprobación ya no existen', () => {
  const e = preparar();
  for (const accion of ['aprobar', 'verificar', 'cancelar']) {
    assert.match(e.llamar({ accion }).error, /Acción no válida/);
  }
});

test('cada préstamo registra vinculación, tipo de actividad y lugar de uso', () => {
  const e = preparar();
  const { token } = e.iniciarSesion('ana@unal.edu.co');
  assert.match(prestar(e, token, ['OAN-TEL-0001'], { lugar_uso: '' }).error, /dónde se usarán/);
  assert.equal(prestar(e, token, ['OAN-TEL-0001'], { lugar_uso: 'Fuera del campus' }).ok, true);
  let p = e.leer('Prestamos')[0];
  assert.equal(p.lugar_uso, 'Fuera del campus');
  assert.equal(p.tipo_usuario, 'Estudiante de pregrado');
  // En el siguiente préstamo la persona actualiza su vinculación
  const r = e.llamar({ accion: 'prestar', token, equipos: ['OAN-CAM-0001'], ...SOLICITUD, lugar_uso: 'En el campus de la UNAL',
    tipo_usuario: 'Estudiante de posgrado', fecha_devolucion: dia(1) });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.prestamo.tipo_usuario, 'Estudiante de posgrado');
  assert.equal(e.leer('Usuarios')[0].tipo, 'Estudiante de posgrado');
  assert.ok(e.correos.some(c => c.to === 'tecnico@unal.edu.co' && c.htmlBody.includes('En el campus de la UNAL')));
  assert.equal(e.llamar({ accion: 'prestar', token, equipos: ['OAN-MON-0001'], ...SOLICITUD, tipo_usuario: 'Investigador', fecha_devolucion: dia(1) }).ok, false);
  // Con correo de la UNAL también puede declararse externo, y entonces necesita avalista
  assert.equal(e.llamar({ accion: 'prestar', token, equipos: ['OAN-MON-0001'], ...SOLICITUD, tipo_usuario: 'Externo a la UNAL', fecha_devolucion: dia(1) }).ok, false);
  const x = e.llamar({ accion: 'prestar', token, equipos: ['OAN-MON-0001'], ...SOLICITUD, tipo_usuario: 'Externo a la UNAL',
    avalista_email: 'profe@unal.edu.co', fecha_devolucion: dia(1) });
  assert.equal(x.ok, true, x.error);
  assert.equal(x.prestamo.tipo_usuario, 'Externo a la UNAL');
});
