# 8. Reportes e indicadores

## En el panel del laboratorio (incluido)

Cada responsable ve en la web, para sus laboratorios: préstamos vencidos y en curso, novedades abiertas, los movimientos de los últimos 7 días, préstamos de los últimos 30 días por propósito y los cinco equipos más usados.

## En la hoja de cálculo

Como los datos están en una hoja de Google, cualquier análisis se hace con tablas dinámicas o con **Looker Studio** (gratuito, se conecta directamente a la hoja y permite tableros que se actualizan solos).

| Indicador | Para qué sirve | Cómo se calcula |
| --- | --- | --- |
| Préstamos por mes y por propósito | Mostrar el aporte del OAN a docencia, investigación y divulgación en informes de gestión | Tabla dinámica de `Prestamos`: filas = mes de `fecha_salida`, columnas = `proposito` |
| Horas de uso por equipo | Decidir qué equipos reponer o comprar, y cuáles no se usan | Suma de `fecha_devolucion − fecha_salida` por `equipo_id` |
| Préstamos por actividad | Saber qué cursos y eventos dependen de qué equipos | Agrupar por `descripcion` |
| Tasa de devolución a tiempo | Medir el cumplimiento del plazo de 7 días | Devueltos con `fecha_devolucion ≤ fecha_prevista` ÷ devueltos |
| Préstamos vencidos hoy | Seguimiento diario | `estado = activo` y `fecha_prevista < hoy` (también llega por correo) |
| Incidencias por equipo | Detectar equipos frágiles o mal usados; programar mantenimiento | Conteo de `Incidencias` por `equipo_id` y `tipo` |
| Tiempo de resolución de daños | Medir la respuesta del laboratorio | `fecha_cierre − fecha` en `Incidencias` |
| Usuarios por tipo | Conocer la población atendida (pregrado, posgrado, externos) | `Prestamos` agrupado por `tipo_usuario` |
| Uso en observación nocturna | Planear turnos de la plataforma de observación | Préstamos con propósito «Observación astronómica» por día de la semana y hora de salida |

## Fórmulas listas para pegar

En una pestaña nueva de la hoja (en una hoja creada con esta versión, en `Prestamos` la columna `K` es `fecha_salida`, `L` es `fecha_prevista` y `N` es `estado`; en `Equipos`, `H` es `estado`; si su hoja viene de una versión anterior, revise las letras):

```text
Préstamos activos:   =CONTAR.SI(Prestamos!N:N; "activo")
Vencidos:            =CONTAR.SI.CONJUNTO(Prestamos!N:N; "activo"; Prestamos!L:L; "<"&AHORA())
Equipos disponibles: =CONTAR.SI(Equipos!H:H; "disponible")
Préstamos del mes:   =CONTAR.SI.CONJUNTO(Prestamos!K:K; ">="&FIN.MES(HOY();-1)+1; Prestamos!K:K; "<"&FIN.MES(HOY();0)+1)
```

Si la hoja está en inglés, use `COUNTIF`, `COUNTIFS`, `NOW`, `EOMONTH`, `TODAY` y comas.

## En la fase 3

[`db/schema.sql`](../db/schema.sql) ya trae las vistas `prestamos_vencidos`, `uso_por_equipo` y `uso_por_proposito_mes`.
