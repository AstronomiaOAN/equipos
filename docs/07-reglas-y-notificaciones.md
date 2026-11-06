# 7. Reglas y notificaciones

## Reglas de préstamo

| Regla | Dónde se cambia |
| --- | --- |
| El préstamo y la devolución **quedan registrados de inmediato**, sin aprobación ni verificación; el laboratorio recibe el aviso | — |
| Solo se presta un equipo en estado `disponible` | — |
| El día de devolución va de hoy a **7 días calendario** después; vence a las 11:59 p. m. de ese día | `DIAS_MAX_PRESTAMO` en `Code.gs` y en `web/js/catalogos.js` |
| Una salida tiene máximo 30 equipos; si alguno no está disponible no se registra ninguno y se indica cuál quitar | `MAX_EQUIPOS_POR_SALIDA` |
| Los usuarios externos (correo no institucional) indican un **avalista** con correo institucional, que recibe copia de los avisos | `DOMINIOS_INTERNOS`, `PERMITIR_EXTERNOS` |
| La primera vez hay que aceptar la política de tratamiento de datos | — |
| Solo quien tiene el préstamo o un responsable del laboratorio puede registrar la devolución | — |
| Devolver «Dañado» o «Incompleto» exige describir el problema, deja el equipo en `mantenimiento` y abre una novedad | — |
| Un usuario con `activo = NO` en `Usuarios` no puede iniciar sesión | Hoja `Usuarios` |

## Qué se le pide a la persona

| Cuándo | Datos |
| --- | --- |
| Solo la primera vez | Nombre completo, vinculación con la universidad (estudiante, docente, investigador, personal), autorización de datos |
| En cada préstamo | Para qué (lista), la actividad en pocas palabras y el día de devolución; avalista solo si es externo |
| En cada devolución | El estado de cada equipo (Bueno por defecto); la descripción solo si está dañado o incompleto |

No hay campos opcionales.

## Notificaciones por correo

| Cuándo | A quién | Contenido |
| --- | --- | --- |
| Inicio de sesión | Usuario | Código de 6 dígitos, válido 10 minutos |
| Préstamo | **Responsables del laboratorio** (y avalista, si es externo) | Quién, para qué, lista de equipos y día de devolución |
| Préstamo | Usuario | Comprobante (uno por salida) |
| Devolución | **Responsables del laboratorio** | Lista de equipos y su estado; resaltado si hay daño o faltante |
| Devolución | Usuario | Comprobante |
| Reporte de daño o falla | Responsables | Tipo, descripción y quién reporta |
| Mañana del día de devolución | Usuario | Recordatorio (una sola vez) |
| Préstamo vencido (cada día a las 7 a. m.) | Usuario y avalista | Aviso de vencimiento |
| Préstamos vencidos (cada día a las 7 a. m.) | Responsables | Resumen por laboratorio |

Si una salida tiene equipos de varios laboratorios, cada laboratorio recibe un aviso con sus equipos.

Los correos salen de **oan.unal@gmail.com**, que puede enviar **unos 100 correos al día**. Un préstamo con su devolución usa unos 4 correos (aviso y comprobante en cada paso), así que alcanza para unos 20 préstamos diarios además de los códigos de acceso. El menú *Préstamos OAN → Ver correos disponibles hoy* muestra cuántos quedan. Si no alcanzan, se puede poner `CORREO_COMPROBANTES: false` (la web ya muestra el comprobante en pantalla) o mover el sistema a una cuenta institucional de Google Workspace (unos 1.500 al día). Si falla un correo, el préstamo igual queda registrado.

## Parámetros

Todos están al inicio de [`apps-script/Code.gs`](../apps-script/Code.gs), en `CONFIG`:

| Parámetro | Valor inicial |
| --- | --- |
| `DIAS_MAX_PRESTAMO` | 7 días calendario |
| `AVISAR_RESPONSABLES` | `true` (aviso al laboratorio en cada préstamo y devolución) |
| `CORREO_COMPROBANTES` | `true` (comprobante por correo al usuario) |
| `DOMINIOS_INTERNOS` | `unal.edu.co` |
| `CORREOS_INTERNOS` | `oan.unal@gmail.com` (cuentas del OAN fuera del dominio institucional) |
| `PERMITIR_EXTERNOS` | `true` |
| `MAX_EQUIPOS_POR_SALIDA` | 30 |
| `DIAS_TOKEN` (duración de la sesión) | 30 días |
| `MINUTOS_CODIGO` | 10 |
| `MAX_INTENTOS_CODIGO` | 5 |
| `HORAS_RECORDATORIO` | 24 |
| `CORREO_COPIA_ALERTAS` | vacío (opcional: un buzón del OAN que reciba copia de todos los avisos) |

Las listas de propósitos, tipos de usuario, condiciones y tipos de daño están en `CATALOGOS`. Si se cambian, hay que cambiarlas también en [`web/js/catalogos.js`](../web/js/catalogos.js) para el modo demostración (con el servidor conectado, la web usa las del servidor).
