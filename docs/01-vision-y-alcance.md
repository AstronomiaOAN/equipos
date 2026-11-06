# 1. Visión y alcance

## Problema

Los laboratorios del Observatorio Astronómico Nacional (OAN) prestan telescopios, monturas, cámaras, espectrógrafos, computadores y material de divulgación a estudiantes, docentes, investigadores y personal de divulgación. Hoy no hay un registro único que diga **quién tiene cada equipo, para qué lo usa, desde cuándo y cuándo lo devuelve**. Eso dificulta encontrar equipos, detectar daños a tiempo, justificar compras y planear mantenimiento.

## Propuesta

Cada equipo lleva una **etiqueta con un código QR**. Quien lo saca escanea el QR con la cámara del celular, se identifica con su correo y llena un formulario corto. Como para una práctica o una noche de observación casi siempre salen varios equipos juntos (telescopio, montura, oculares, cámara…), el formulario permite **agregar todos los equipos de la actividad escaneándolos uno tras otro**, y los datos de la actividad se escriben **una sola vez**. El sistema guarda automáticamente la **fecha y hora de salida**. Al devolverlo, escanea el mismo QR, indica en qué estado lo entrega y el sistema guarda la **fecha y hora de devolución**. Todo alimenta una base de datos central que el responsable de cada laboratorio consulta desde el celular o el computador.

## Objetivos

1. Saber en todo momento dónde está cada equipo y quién responde por él.
2. Registrar para qué se usa (docencia, práctica, investigación, observación, divulgación, mantenimiento) y la actividad.
3. Detectar préstamos vencidos y equipos con daños o faltantes, y avisar automáticamente.
4. Tener el historial de uso de cada equipo para planear mantenimiento, calibración y compras.
5. Que registrar un préstamo tome **menos de un minuto**; si es engorroso, la gente no lo hará.

## Qué cubre

- Equipos y materiales inventariables de los laboratorios del OAN: telescopios y tubos ópticos, monturas, cámaras, espectrógrafos y fotómetros, oculares y filtros, computadores, instrumentos de medición, kits de divulgación.
- Préstamo y devolución de uno o varios equipos a la vez («salidas»), **inmediatos y sin aprobación**, con aviso al laboratorio, y reporte de daños.
- Un **catálogo público de equipos** con foto, descripción, características y disponibilidad, para que estudiantes y docentes sepan qué hay antes de pedirlo.
- Alertas por correo y un panel para los responsables.

## Qué no cubre (por ahora)

- Consumibles sin retorno (papel, baterías desechables). Si se quiere, se pueden registrar como salidas sin devolución.
- Reservas anticipadas por fecha (por ejemplo, un telescopio para la noche del viernes). Están previstas para la fase 3; ver [plan de implementación](10-plan-de-implementacion.md).
- Inventario contable de la universidad. El sistema puede guardar la placa de inventario, pero no reemplaza el sistema de bienes.

## Usuarios y roles

| Rol | Quién | Qué puede hacer |
| --- | --- | --- |
| Usuario | Estudiantes, docentes, investigadores, personal de divulgación (correo `@unal.edu.co`) | Escanear un QR, prestar y devolver, reportar daños, ver sus préstamos |
| Usuario externo | Visitantes o colaboradores de otras instituciones (correo personal) | Lo mismo, indicando un **avalista** con correo institucional |
| Responsable de laboratorio | Técnico o docente a cargo de un laboratorio | Recibir los avisos de préstamos y devoluciones, registrar devoluciones que le entreguen en mano, cerrar reportes de daño, ver el panel de su laboratorio |
| Administrador | Coordinación del OAN o encargado de inventario | Todo lo anterior en todos los laboratorios; dar de alta equipos, imprimir etiquetas, asignar responsables |

## Reglas básicas

- **Sin aprobaciones:** el préstamo queda activo en el momento en que se registra, y la devolución también; los responsables del laboratorio reciben un aviso por correo y lo ven en su panel.
- **Plazo:** de hoy hasta **7 días calendario**; el equipo se devuelve a más tardar el día elegido.
- **Pocos datos:** nombre y vinculación (solo la primera vez), para qué se usa, la actividad y el día de devolución.
- Si un equipo se devuelve dañado o incompleto, queda en mantenimiento hasta que el responsable resuelva la novedad.
