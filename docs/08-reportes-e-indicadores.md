# 8. Reportes e indicadores

## En el panel del laboratorio (incluido)

Cada responsable ve en la web, para sus laboratorios: solicitudes por aprobar, devoluciones por verificar, préstamos vencidos y en curso, reportes de daño abiertos, préstamos de los últimos 30 días por propósito y los cinco equipos más usados.

## En la hoja de cálculo

Como los datos están en una hoja de Google, cualquier análisis se hace con tablas dinámicas o con **Looker Studio** (gratuito, se conecta directamente a la hoja y permite tableros que se actualizan solos).

| Indicador | Para qué sirve | Cómo se calcula |
| --- | --- | --- |
| Préstamos por mes y por propósito | Mostrar el aporte del OAN a docencia, investigación y divulgación en informes de gestión | Tabla dinámica de `Prestamos`: filas = mes de `fecha_salida`, columnas = `proposito` |
| Horas de uso por equipo | Decidir qué equipos reponer o comprar, y cuáles no se usan | Suma de `fecha_devolucion − fecha_salida` por `equipo_id` |
| Préstamos por curso o proyecto | Saber qué asignaturas dependen de qué equipos | Agrupar por `curso_proyecto` |
| Tasa de devolución a tiempo | Medir el cumplimiento y ajustar plazos (`max_dias`) | Devueltos con `fecha_devolucion ≤ fecha_prevista` ÷ devueltos |
| Préstamos vencidos hoy | Seguimiento diario | `estado = activo` y `fecha_prevista < hoy` (también llega por correo) |
| Incidencias por equipo | Detectar equipos frágiles o mal usados; programar mantenimiento | Conteo de `Incidencias` por `equipo_id` y `tipo` |
| Tiempo de resolución de daños | Medir la respuesta del laboratorio | `fecha_cierre − fecha` en `Incidencias` |
| Usuarios por tipo | Conocer la población atendida (pregrado, posgrado, externos) | `Prestamos` agrupado por `tipo_usuario` |
| Uso en observación nocturna | Planear turnos de la plataforma de observación | Préstamos con propósito «Observación astronómica» por día de la semana y hora de salida |

## Fórmulas listas para pegar

En una pestaña nueva de la hoja:

```text
Préstamos activos:   =CONTAR.SI(Prestamos!O:O; "activo")
Vencidos:            =CONTAR.SI.CONJUNTO(Prestamos!O:O; "activo"; Prestamos!M:M; "<"&AHORA())
Equipos disponibles: =CONTAR.SI(Equipos!I:I; "disponible")
Préstamos del mes:   =CONTAR.SI.CONJUNTO(Prestamos!L:L; ">="&FIN.MES(HOY();-1)+1; Prestamos!L:L; "<"&FIN.MES(HOY();0)+1)
```

Las letras de columna corresponden al orden creado por `configurar()` (`L` = `fecha_salida`, `M` = `fecha_prevista`, `O` = `estado` en `Prestamos`; `I` = `estado` en `Equipos`). Si la hoja está en inglés, use `COUNTIF`, `COUNTIFS`, `NOW`, `EOMONTH`, `TODAY` y comas.

## En la fase 3

[`db/schema.sql`](../db/schema.sql) ya trae las vistas `prestamos_vencidos`, `uso_por_equipo` y `uso_por_proposito_mes`.
