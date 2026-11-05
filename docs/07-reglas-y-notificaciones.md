# 7. Reglas y notificaciones

## Reglas de préstamo

| Regla | Dónde se cambia |
| --- | --- |
| Solo se presta un equipo en estado `disponible` | — |
| La devolución prevista debe ser futura y no superar `max_dias` del equipo (7 si está vacío). En una salida de varios equipos manda el plazo más corto | Columna `max_dias` de `Equipos` |
| Una salida tiene máximo 30 equipos; si alguno no está disponible no se registra ninguno y se indica cuál quitar | `MAX_EQUIPOS_POR_SALIDA` |
| Requieren aprobación: equipos `restringido`, usuarios externos y préstamos para uso fuera del campus | `APROBAR_FUERA_DEL_CAMPUS` en `Code.gs` |
| Los usuarios externos deben indicar un avalista con correo institucional, que recibe copia de los avisos de vencimiento | `DOMINIOS_INTERNOS`, `PERMITIR_EXTERNOS` |
| La primera vez hay que aceptar la política de tratamiento de datos | — |
| Solo quien tiene el préstamo o un responsable del laboratorio puede registrar la devolución | — |
| Devolver «Dañado», «Incompleto» o con componentes faltantes exige describir el problema y crea un reporte | — |
| Las devoluciones de equipos `supervisado` o `restringido`, o con novedades, quedan `por_verificar` hasta que el responsable revisa | — |
| Si el propio responsable registra la devolución, queda verificada en el acto | — |
| Un usuario con `activo = NO` en `Usuarios` no puede iniciar sesión | Hoja `Usuarios` |

## Notificaciones por correo

| Cuándo | A quién | Contenido |
| --- | --- | --- |
| Inicio de sesión | Usuario | Código de 6 dígitos, válido 10 minutos |
| Préstamo directo | Usuario | Comprobante con la lista de equipos de la salida, propósito y devolución prevista (uno solo por salida) |
| Préstamo de equipo supervisado | Responsables del laboratorio | Aviso de salida con los datos del préstamo |
| Solicitud que requiere aprobación | Responsables (y avalista, si es externo) | Datos de la solicitud y enlace al panel |
| Solicitud recibida | Usuario | Confirmación de que quedó pendiente |
| Aprobación o rechazo | Usuario | Resultado y motivo del rechazo |
| Devolución | Usuario | Comprobante de devolución |
| Devolución por verificar o con novedad | Responsables | Datos y enlace al panel |
| Reporte de daño o falla | Responsables | Tipo, descripción y quién reporta |
| 24 horas antes del vencimiento | Usuario | Recordatorio (una sola vez) |
| Préstamo vencido (cada día a las 7 a. m.) | Usuario y avalista | Aviso de vencimiento |
| Préstamos vencidos (cada día a las 7 a. m.) | Responsables | Resumen por laboratorio |

Los correos salen de **oan.unal@gmail.com**, la cuenta dueña del Apps Script. Una cuenta @gmail.com puede enviar **unos 100 correos al día**. Para no agotarlos, el sistema manda **un solo correo por salida** (no uno por equipo) y agrupa los avisos de vencimiento por persona. El menú *Préstamos OAN → Ver correos disponibles hoy* muestra cuántos quedan. Si se agotan, se puede poner `CORREO_COMPROBANTES: false` (la web ya muestra el comprobante en pantalla) y se mantienen los códigos de acceso y los avisos al laboratorio. Si falla un correo, el préstamo igual queda registrado.

## Parámetros

Todos están al inicio de [`apps-script/Code.gs`](../apps-script/Code.gs), en `CONFIG`:

| Parámetro | Valor inicial |
| --- | --- |
| `DOMINIOS_INTERNOS` | `unal.edu.co` |
| `CORREOS_INTERNOS` | `oan.unal@gmail.com` (cuentas del OAN fuera del dominio institucional) |
| `MAX_EQUIPOS_POR_SALIDA` | 30 |
| `CORREO_COMPROBANTES` | `true` |
| `PERMITIR_EXTERNOS` | `true` |
| `APROBAR_FUERA_DEL_CAMPUS` | `true` |
| `DIAS_TOKEN` (duración de la sesión) | 30 días |
| `MINUTOS_CODIGO` | 10 |
| `MAX_INTENTOS_CODIGO` | 5 |
| `HORAS_RECORDATORIO` | 24 |
| `MAX_DIAS_POR_DEFECTO` | 7 |
| `CORREO_COPIA_ALERTAS` | vacío (opcional: un buzón del OAN que reciba copia de todas las alertas) |

Las listas de propósitos, lugares, tipos de usuario, condiciones y tipos de daño están en `CATALOGOS`. Si se cambian, hay que cambiarlas también en [`web/js/catalogos.js`](../web/js/catalogos.js) para el modo demostración (con el servidor conectado, la web usa las del servidor).
