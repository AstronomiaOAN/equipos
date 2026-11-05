-- ============================================================================
-- Sistema de préstamo de equipos · Observatorio Astronómico Nacional (OAN)
-- Esquema PostgreSQL (≥ 13) para la fase 3 (aplicación propia o Supabase).
-- Replica el modelo de la hoja de cálculo de la fase 1 (ver docs/05-modelo-de-datos.md)
-- para que la migración sea una importación de CSV por tabla.
-- ============================================================================

CREATE TYPE nivel_control    AS ENUM ('libre', 'supervisado', 'restringido');
CREATE TYPE estado_equipo    AS ENUM ('disponible', 'reservado', 'prestado', 'en_revision', 'mantenimiento', 'baja');
CREATE TYPE estado_prestamo  AS ENUM ('pendiente', 'activo', 'por_verificar', 'devuelto', 'rechazado', 'cancelado');
CREATE TYPE rol_usuario      AS ENUM ('usuario', 'responsable', 'admin');
CREATE TYPE estado_incidencia AS ENUM ('abierta', 'cerrada');

CREATE TABLE laboratorios (
    id          text PRIMARY KEY,                -- p. ej. LAB-OPT
    nombre      text NOT NULL,
    ubicacion   text
);

CREATE TABLE usuarios (
    email          text PRIMARY KEY CHECK (email = lower(email)),
    nombre         text NOT NULL,
    tipo           text NOT NULL,                -- Estudiante de pregrado, Docente, Externo…
    dependencia    text,
    telefono       text,
    rol            rol_usuario NOT NULL DEFAULT 'usuario',
    activo         boolean NOT NULL DEFAULT true,
    acepta_datos   timestamptz NOT NULL,         -- fecha de aceptación (Ley 1581 de 2012)
    fecha_registro timestamptz NOT NULL DEFAULT now()
);

-- Un laboratorio puede tener varios responsables y una persona varios laboratorios.
CREATE TABLE responsables_laboratorio (
    laboratorio_id text REFERENCES laboratorios(id) ON DELETE CASCADE,
    email          text REFERENCES usuarios(email) ON DELETE CASCADE,
    PRIMARY KEY (laboratorio_id, email)
);

CREATE TABLE equipos (
    id             text PRIMARY KEY CHECK (id ~ '^OAN-[A-Z]{3}-[0-9]{4}$'),  -- texto del QR
    nombre         text NOT NULL,
    categoria      text NOT NULL,
    laboratorio_id text NOT NULL REFERENCES laboratorios(id),
    marca          text,
    modelo         text,
    serie          text,
    placa_inventario text,                       -- número de inventario de la universidad
    nivel_control  nivel_control NOT NULL DEFAULT 'libre',
    estado         estado_equipo NOT NULL DEFAULT 'disponible',
    max_dias       integer NOT NULL DEFAULT 7 CHECK (max_dias BETWEEN 1 AND 180),
    componentes    text[] NOT NULL DEFAULT '{}',
    notas          text,
    fecha_alta     date NOT NULL DEFAULT current_date
);

CREATE TABLE prestamos (
    id                   text PRIMARY KEY,       -- P-AAMMDD-XXXXXX
    equipo_id            text NOT NULL REFERENCES equipos(id),
    email                text NOT NULL REFERENCES usuarios(email),
    nombre               text NOT NULL,          -- copia histórica del nombre
    tipo_usuario         text NOT NULL,
    proposito            text NOT NULL,
    descripcion          text NOT NULL,
    curso_proyecto       text,
    lugar_uso            text NOT NULL,
    avalista_email       text,
    fecha_solicitud      timestamptz NOT NULL DEFAULT now(),
    fecha_salida         timestamptz,
    fecha_prevista       timestamptz NOT NULL,
    fecha_devolucion     timestamptz,
    estado               estado_prestamo NOT NULL,
    condicion_salida     text,
    condicion_devolucion text,
    obs_devolucion       text,
    componentes_ok       boolean,
    devuelto_por         text,
    aprobado_por         text,
    motivo_rechazo       text,
    verificado_por       text,
    fecha_verificacion   timestamptz,
    recordatorio_enviado timestamptz,
    CHECK (fecha_prevista > fecha_solicitud),
    CHECK (estado <> 'activo' OR fecha_salida IS NOT NULL),
    CHECK (estado NOT IN ('por_verificar', 'devuelto') OR fecha_devolucion IS NOT NULL)
);

-- Un equipo no puede tener dos préstamos abiertos al mismo tiempo.
CREATE UNIQUE INDEX un_prestamo_abierto_por_equipo
    ON prestamos (equipo_id) WHERE estado IN ('pendiente', 'activo', 'por_verificar');
CREATE INDEX prestamos_por_usuario ON prestamos (email, fecha_solicitud DESC);
CREATE INDEX prestamos_activos_por_vencer ON prestamos (fecha_prevista) WHERE estado = 'activo';

-- Fase 3: reservas anticipadas (p. ej. telescopios por noche de observación).
CREATE TABLE reservas (
    id          bigserial PRIMARY KEY,
    equipo_id   text NOT NULL REFERENCES equipos(id),
    email       text NOT NULL REFERENCES usuarios(email),
    desde       timestamptz NOT NULL,
    hasta       timestamptz NOT NULL,
    proposito   text NOT NULL,
    estado      text NOT NULL DEFAULT 'confirmada',
    prestamo_id text REFERENCES prestamos(id),
    CHECK (hasta > desde)
);
-- Requiere: CREATE EXTENSION btree_gist;  evita reservas que se crucen para el mismo equipo.
-- ALTER TABLE reservas ADD CONSTRAINT sin_cruces
--     EXCLUDE USING gist (equipo_id WITH =, tstzrange(desde, hasta) WITH &&) WHERE (estado = 'confirmada');

CREATE TABLE incidencias (
    id           text PRIMARY KEY,               -- I-AAMMDD-XXXXXX
    equipo_id    text NOT NULL REFERENCES equipos(id),
    prestamo_id  text REFERENCES prestamos(id),
    email        text NOT NULL,
    tipo         text NOT NULL,
    descripcion  text NOT NULL,
    fecha        timestamptz NOT NULL DEFAULT now(),
    estado       estado_incidencia NOT NULL DEFAULT 'abierta',
    resuelto_por text,
    fecha_cierre timestamptz,
    solucion     text
);

CREATE TABLE mantenimientos (
    id          bigserial PRIMARY KEY,
    equipo_id   text NOT NULL REFERENCES equipos(id),
    tipo        text NOT NULL,                   -- preventivo, correctivo, calibración
    fecha       date NOT NULL,
    realizado_por text,
    descripcion text,
    proxima_fecha date
);

CREATE TABLE bitacora (
    id      bigserial PRIMARY KEY,
    fecha   timestamptz NOT NULL DEFAULT now(),
    email   text,
    accion  text NOT NULL,
    detalle text
);

-- ─── Vistas para reportes ───────────────────────────────────────────────────

CREATE VIEW prestamos_vencidos AS
SELECT p.id, p.equipo_id, e.nombre AS equipo, e.laboratorio_id, p.nombre, p.email,
       p.fecha_prevista, now() - p.fecha_prevista AS retraso
FROM prestamos p JOIN equipos e ON e.id = p.equipo_id
WHERE p.estado = 'activo' AND p.fecha_prevista < now();

CREATE VIEW uso_por_equipo AS
SELECT e.id, e.nombre, e.categoria, e.laboratorio_id,
       count(p.id) AS prestamos,
       round(sum(EXTRACT(epoch FROM coalesce(p.fecha_devolucion, now()) - p.fecha_salida)) / 3600.0, 1) AS horas_uso,
       max(p.fecha_salida) AS ultimo_uso
FROM equipos e LEFT JOIN prestamos p ON p.equipo_id = e.id AND p.fecha_salida IS NOT NULL
GROUP BY e.id;

CREATE VIEW uso_por_proposito_mes AS
SELECT date_trunc('month', fecha_salida)::date AS mes, proposito, count(*) AS prestamos
FROM prestamos WHERE fecha_salida IS NOT NULL
GROUP BY 1, 2;
