// Listas compartidas. Deben coincidir con CATALOGOS en apps-script/Code.gs.
// Con el backend conectado, la web usa las listas que envía el servidor.
export const CATALOGOS = {
  propositos: ['Docencia (clase)', 'Práctica de laboratorio', 'Investigación / tesis',
    'Observación astronómica', 'Divulgación / evento público', 'Mantenimiento o calibración', 'Otro'],
  lugares: ['En el OAN', 'En el campus de la UNAL', 'Fuera del campus'],
  tipos_usuario: ['Estudiante de pregrado', 'Estudiante de posgrado', 'Docente', 'Investigador',
    'Personal técnico o administrativo', 'Externo'],
  condiciones: ['Bueno', 'Con detalles menores', 'Dañado', 'Incompleto'],
  tipos_incidencia: ['Daño', 'Faltante', 'Falla de funcionamiento', 'Requiere calibración', 'Otro']
};

// Plazo máximo de un préstamo en días calendario. Debe coincidir con DIAS_MAX_PRESTAMO en Code.gs.
export const DIAS_MAX_PRESTAMO = 7;

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
  activo: 'Prestado',
  por_verificar: 'Devuelto, por verificar',
  devuelto: 'Devuelto',
  rechazado: 'No aprobado',
  cancelado: 'Cancelado'
};

// ─── Datos de ejemplo para el modo demostración ─────────────────────────────
// No corresponden al inventario real del OAN. Las fotos son de referencia (Wikimedia Commons).

// <ejemplos> Generado por herramientas/sincronizar_ejemplos.py a partir de datos/*.csv. No editar a mano.
export const LABORATORIOS_DEMO = [
  {
    "id": "LAB-OPT",
    "nombre": "Laboratorio de Óptica e Instrumentación",
    "ubicacion": "Edificio del OAN, primer piso",
    "responsable_email": "tecnico@unal.edu.co"
  },
  {
    "id": "LAB-OBS",
    "nombre": "Plataforma de observación",
    "ubicacion": "Terraza del OAN",
    "responsable_email": "tecnico@unal.edu.co"
  },
  {
    "id": "LAB-DIV",
    "nombre": "Sala de divulgación",
    "ubicacion": "Planetario del campus",
    "responsable_email": "tecnico@unal.edu.co"
  }
];

export const EQUIPOS_DEMO = [
  {
    "id": "OAN-TEL-0001",
    "nombre": "Telescopio Schmidt-Cassegrain 8\"",
    "categoria": "Telescopios",
    "laboratorio_id": "LAB-OBS",
    "marca": "Celestron",
    "modelo": "C8",
    "serie": "",
    "estado": "disponible",
    "componentes": [
      "Tubo óptico",
      "Buscador 8×50",
      "Diagonal 1¼\"",
      "Tapa frontal"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Tubo óptico",
      "Montura computarizada",
      "Trípode",
      "Contrapesos (2)",
      "Mando",
      "Cable de alimentación"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Tubo óptico",
      "Base dobsoniana",
      "Buscador",
      "Ocular 25 mm"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Tubo óptico",
      "Buscador",
      "Diagonal",
      "Ocular 28 mm"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Telescopio solar",
      "Ocular 20 mm",
      "Estuche"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Cabezal",
      "Trípode",
      "Contrapesos (2)",
      "Motor de seguimiento",
      "Controlador"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Trípode",
      "Rótula",
      "Zapata"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Cámara",
      "Cable USB",
      "Fuente 12 V",
      "Rueda de filtros",
      "Estuche"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Cuerpo",
      "Batería (2)",
      "Cargador",
      "Tarjeta SD",
      "Adaptador T2",
      "Disparador"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Cámara",
      "Adaptador 1¼\"",
      "Cable USB"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Red de difracción en montura 1¼\"",
      "Estuche"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Ocular 32 mm",
      "Ocular 25 mm",
      "Ocular 10 mm",
      "Ocular 6 mm",
      "Barlow 2×",
      "Filtro lunar",
      "Filtros de color (4)"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Binoculares",
      "Adaptador para trípode",
      "Tapas",
      "Estuche"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Puntero",
      "Baterías (2)"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Portátil",
      "Cargador",
      "Mouse"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Planetario mecánico",
      "Manivela",
      "Guía del monitor"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Planisferios (15)",
      "Guía de uso"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Globo",
      "Base"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Gafas (50)",
      "Caja"
    ],
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
    "estado": "disponible",
    "componentes": [
      "Estuche",
      "Muestras (6)",
      "Lupa",
      "Fichas descriptivas"
    ],
    "notas": "Manipular con guantes. Contar las muestras al devolver.",
    "descripcion": "Muestras reales de meteoritos (condritas, hierros y un fragmento de Cheliábinsk) para exposiciones y clases sobre el origen del sistema solar.",
    "especificaciones": "Muestras: 6; Tipos: condritas, sideritos, fragmento de Cheliábinsk",
    "foto": "https://commons.wikimedia.org/wiki/Special:FilePath/2_Cheljabinsk_meteorite_fragment.jpg?width=800",
    "credito_foto": "https://commons.wikimedia.org/wiki/File:2_Cheljabinsk_meteorite_fragment.jpg"
  }
];
// </ejemplos>
