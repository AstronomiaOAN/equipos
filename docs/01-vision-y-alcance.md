# 1. Visión y alcance

## Problema

Los laboratorios del Observatorio Astronómico Nacional (OAN) prestan telescopios, monturas, cámaras, espectrógrafos, computadores y material de divulgación a estudiantes, docentes, investigadores y personal de divulgación. Hoy no hay un registro único que diga **quién tiene cada equipo, para qué lo usa, desde cuándo y cuándo lo devuelve**. Eso dificulta encontrar equipos, detectar daños a tiempo, justificar compras y planear mantenimiento.

## Propuesta

Cada equipo lleva una **etiqueta con un código QR**. Quien lo saca escanea el QR con la cámara del celular, se identifica con su correo y llena un formulario corto. Como para una práctica o una noche de observación casi siempre salen varios equipos juntos (telescopio, montura, oculares, cámara…), el formulario permite **agregar todos los equipos de la actividad escaneándolos uno tras otro**, y los datos de la actividad se escriben **una sola vez**. El sistema guarda automáticamente la **fecha y hora de salida**. Al devolverlo, escanea el mismo QR, indica en qué estado lo entrega y el sistema guarda la **fecha y hora de devolución**. Todo alimenta una base de datos central que el responsable de cada laboratorio consulta desde el celular o el computador.

## Objetivos

1. Saber en todo momento dónde está cada equipo y quién responde por él.
2. Registrar para qué se usa (docencia, práctica, investigación, observación, divulgación, mantenimiento) y asociarlo a un curso o proyecto.
3. Detectar préstamos vencidos y equipos con daños o faltantes, y avisar automáticamente.
4. Tener el historial de uso de cada equipo para planear mantenimiento, calibración y compras.
5. Que registrar un préstamo tome **menos de un minuto**; si es engorroso, la gente no lo hará.

## Qué cubre

- Equipos y materiales inventariables de los laboratorios del OAN: telescopios y tubos ópticos, monturas, cámaras, espectrógrafos y fotómetros, oculares y filtros, computadores, instrumentos de medición, kits de divulgación.
- Préstamo y devolución de uno o varios equipos a la vez («salidas»), aprobación, verificación y reporte de daños.
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
| Usuario externo | Visitantes o colaboradores de otras instituciones (correo personal) | Lo mismo, pero cada préstamo necesita un **avalista** con correo institucional y la **aprobación** del responsable |
| Responsable de laboratorio | Técnico o docente a cargo de un laboratorio | Aprobar o rechazar solicitudes, verificar devoluciones, cerrar reportes de daño, ver el panel de su laboratorio |
| Administrador | Coordinación del OAN o encargado de inventario | Todo lo anterior en todos los laboratorios; dar de alta equipos, imprimir etiquetas, asignar responsables |

## Nivel de control de cada equipo

No todos los equipos necesitan el mismo cuidado. Cada uno tiene un nivel:

| Nivel | Cómo funciona | Ejemplos |
| --- | --- | --- |
| **Libre** | Se presta y se devuelve solo con el QR | Kits de divulgación, oculares básicos, refractores pequeños |
| **Supervisado** | Se presta con el QR; el responsable recibe aviso de la salida y revisa la devolución antes de volver a prestarlo | Telescopios grandes, monturas, portátiles |
| **Restringido** | El QR crea una solicitud; el responsable la aprueba al entregar el equipo y revisa la devolución | Cámaras científicas, espectrógrafos, instrumentos calibrados |

En una salida con equipos de distintos niveles, cada equipo sigue su propia regla: los libres y supervisados salen de inmediato y los restringidos quedan esperando la aprobación, sin que la persona tenga que llenar dos formularios.

Además, **cualquier préstamo de un usuario externo o para usar fuera del campus requiere aprobación**, sin importar el nivel del equipo (esto se puede cambiar en la configuración).
