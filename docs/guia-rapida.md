# Guía rápida

## Para quien presta un equipo

**Sacar un equipo**

1. Escanee el QR del equipo con la cámara del celular.
2. Toque **Prestar este equipo**.
3. La primera vez: escriba su correo, copie el código que le llega y complete sus datos.
4. Diga para qué lo va a usar y cuándo lo devuelve, revise que esté completo y toque **Registrar préstamo**.
5. Le llega el comprobante por correo.

**Sacar varios equipos para una misma actividad**

1. Escanee el QR del primero y toque **Prestar este equipo**.
2. En el formulario toque **Escanear otro QR** y apunte la cámara a cada equipo, uno tras otro. También puede escribir el código.
3. Llene una sola vez los datos de la actividad y toque **Registrar préstamo**.

**Devolverlo**

1. Escanee el mismo QR.
2. Toque **Devolver este equipo**, chequee las piezas y diga en qué estado lo entrega.
3. Si algo se dañó o falta, descríbalo. Es mejor reportarlo que dejar que lo descubra el siguiente usuario.
4. Si sacó varios equipos juntos, toque **Devolver los N equipos de esta salida** (o use «Mis préstamos») para devolverlos en un solo formulario. Puede devolver solo algunos.

**Bueno saber**

- Equipos marcados como «Requiere aprobación»: su solicitud la aprueba el responsable del laboratorio cuando le entrega el equipo.
- Si viene de otra institución, necesitará el correo de un docente o funcionario de la universidad que sea su avalista.
- Durante la observación, active **Luz roja** (botón de la luna) para no perder la adaptación a la oscuridad.
- En «Mis préstamos» ve lo que tiene a su cargo y su historial.
- En **Equipos** está el catálogo completo con fotos, características y disponibilidad. Desde ahí también puede agregar equipos a su salida.

## Para el responsable del laboratorio

- Recibe un correo cuando alguien solicita un equipo restringido, cuando sale un equipo supervisado, cuando devuelven algo que debe revisar y cuando reportan un daño. Cada mañana recibe la lista de préstamos vencidos.
- Desde **Panel** (arriba, al iniciar sesión) aprueba o rechaza solicitudes, verifica devoluciones y cierra reportes de daño. Los equipos de una misma salida aparecen juntos y se aprueban o verifican con un solo botón.
- Si alguien le entrega un equipo en la mano, escanee el QR y toque **Registrar la devolución**: queda verificada en el acto.
- Para enviar un equipo a mantenimiento o darlo de baja, cambie su `estado` en la hoja `Equipos`.

## Para el administrador

- **Agregar un equipo:** nueva fila en `Equipos` con un código que no se haya usado, su descripción, características y foto, y luego imprimir su etiqueta (`--solo OAN-XXX-0000`).
- **Fotos:** súbalas al Drive (carpeta *Fotos de equipos*), compártalas como «Cualquier persona con el enlace» y pegue el enlace en la columna `foto` ([detalle](04-codigos-qr-y-etiquetas.md#fotos-de-los-equipos)).
- **Asignar responsables:** columna `responsable_email` de `Laboratorios` (varios correos separados por coma).
- **Dar acceso total:** `rol = admin` en `Usuarios`.
- **Bloquear a alguien:** `activo = NO` en `Usuarios`.
- **Si se pierde un celular con sesión abierta o hay sospecha de abuso:** menú *Préstamos OAN → Cerrar todas las sesiones*.
