// Listas compartidas. Deben coincidir con CATALOGOS en apps-script/Code.gs.
// Con el backend conectado, la web usa las listas que envía el servidor.
export const CATALOGOS = {
  propositos: ['Docencia (clase)', 'Práctica de laboratorio', 'Investigación / tesis',
    'Observación astronómica', 'Divulgación / evento público', 'Mantenimiento o calibración', 'Otro'],
  lugares: ['Dentro del OAN', 'Campus universitario', 'Fuera del campus'],
  tipos_usuario: ['Estudiante de pregrado', 'Estudiante de posgrado', 'Docente', 'Investigador',
    'Personal técnico o administrativo', 'Externo'],
  condiciones: ['Bueno', 'Con detalles menores', 'Dañado', 'Incompleto'],
  tipos_incidencia: ['Daño', 'Faltante', 'Falla de funcionamiento', 'Requiere calibración', 'Otro']
};

export const NIVELES = {
  libre: 'Préstamo directo con el QR',
  supervisado: 'Préstamo directo; el laboratorio revisa la devolución',
  restringido: 'Requiere aprobación del responsable'
};

export const ESTADOS_EQUIPO = {
  disponible: 'Disponible',
  reservado: 'Solicitud en aprobación',
  prestado: 'En préstamo',
  en_revision: 'Devuelto, en revisión',
  mantenimiento: 'En mantenimiento',
  baja: 'Dado de baja'
};

export const ESTADOS_PRESTAMO = {
  pendiente: 'Pendiente de aprobación',
  activo: 'En curso',
  por_verificar: 'Devuelto, por verificar',
  devuelto: 'Devuelto',
  rechazado: 'No aprobado',
  cancelado: 'Cancelado'
};

// ─── Datos de ejemplo para el modo demostración ─────────────────────────────
// No corresponden al inventario real del OAN.

export const LABORATORIOS_DEMO = [
  { id: 'LAB-OPT', nombre: 'Laboratorio de Óptica e Instrumentación', ubicacion: 'Edificio del OAN, primer piso', responsable_email: 'tecnico@unal.edu.co' },
  { id: 'LAB-OBS', nombre: 'Plataforma de observación', ubicacion: 'Terraza del OAN', responsable_email: 'tecnico@unal.edu.co' },
  { id: 'LAB-DIV', nombre: 'Sala de divulgación', ubicacion: 'Planetario del campus', responsable_email: 'tecnico@unal.edu.co' }
];

export const EQUIPOS_DEMO = [
  { id: 'OAN-TEL-0001', nombre: 'Telescopio Schmidt-Cassegrain 8"', categoria: 'Telescopios', laboratorio_id: 'LAB-OBS', marca: 'Celestron', modelo: 'C8', nivel_control: 'supervisado', estado: 'disponible', max_dias: 2, componentes: ['Tubo óptico', 'Buscador 8×50', 'Diagonal 1¼"', 'Tapa frontal'] },
  { id: 'OAN-TEL-0002', nombre: 'Refractor apocromático 80 mm', categoria: 'Telescopios', laboratorio_id: 'LAB-OBS', marca: 'Sky-Watcher', modelo: 'Evostar 80ED', nivel_control: 'libre', estado: 'disponible', max_dias: 3, componentes: ['Tubo óptico', 'Anillos', 'Estuche'] },
  { id: 'OAN-MON-0001', nombre: 'Montura ecuatorial GoTo', categoria: 'Monturas', laboratorio_id: 'LAB-OBS', marca: 'Sky-Watcher', modelo: 'EQ6-R', nivel_control: 'supervisado', estado: 'disponible', max_dias: 2, componentes: ['Cabezal', 'Trípode', 'Contrapesos (2)', 'Mando SynScan', 'Cable de alimentación'] },
  { id: 'OAN-CAM-0001', nombre: 'Cámara CCD científica', categoria: 'Cámaras', laboratorio_id: 'LAB-OPT', marca: 'ZWO', modelo: 'ASI2600MM Pro', nivel_control: 'restringido', estado: 'disponible', max_dias: 2, componentes: ['Cámara', 'Cable USB 3.0', 'Fuente 12 V', 'Rueda de filtros'] },
  { id: 'OAN-ESP-0001', nombre: 'Espectrógrafo de baja resolución', categoria: 'Espectrógrafos', laboratorio_id: 'LAB-OPT', marca: 'Shelyak', modelo: 'Alpy 600', nivel_control: 'restringido', estado: 'disponible', max_dias: 3, componentes: ['Espectrógrafo', 'Módulo de calibración', 'Maletín'] },
  { id: 'OAN-OCU-0001', nombre: 'Estuche de oculares y filtros', categoria: 'Oculares y filtros', laboratorio_id: 'LAB-OBS', marca: 'Varias', modelo: '', nivel_control: 'libre', estado: 'disponible', max_dias: 3, componentes: ['Ocular 25 mm', 'Ocular 10 mm', 'Barlow 2×', 'Filtro lunar', 'Filtro solar de lámina'] },
  { id: 'OAN-CMP-0001', nombre: 'Portátil de adquisición', categoria: 'Computadores', laboratorio_id: 'LAB-OPT', marca: 'Lenovo', modelo: 'ThinkPad', nivel_control: 'supervisado', estado: 'disponible', max_dias: 5, componentes: ['Portátil', 'Cargador'] },
  { id: 'OAN-DIV-0001', nombre: 'Kit de divulgación: sistema solar', categoria: 'Divulgación', laboratorio_id: 'LAB-DIV', marca: '', modelo: '', nivel_control: 'libre', estado: 'disponible', max_dias: 7, componentes: ['Maqueta', 'Láminas (12)', 'Guía del monitor'] }
];
