# 2. Opciones de implementación

Hay cuatro caminos realistas. Difieren en costo, tiempo de puesta en marcha y cuánto control dan sobre los datos. Los costos son aproximados y deben confirmarse con la oficina de tecnología de la universidad.

| | A. Google Forms + Sheets | B. Web en GitHub Pages + Apps Script (**este repositorio**) | C. Snipe-IT (software libre de inventario) | D. Aplicación web a medida |
| --- | --- | --- | --- | --- |
| **Cómo funciona** | Cada QR abre un formulario con el código prellenado; las respuestas caen en una hoja | Cada QR abre una página que muestra el equipo y su estado, y permite prestar o devolver con un botón; los datos quedan en una hoja de Google con reglas en Apps Script | Sistema completo de gestión de activos con préstamo (*check-out/check-in*), QR, auditorías y mantenimientos, instalado en un servidor propio | Aplicación propia (por ejemplo Django o Laravel + PostgreSQL) con exactamente el flujo del OAN |
| **Puesta en marcha** | 1–2 semanas | 2–4 semanas (el código ya está aquí) | 3–6 semanas | 3–6 meses |
| **Costo** | Casi nulo con las cuentas institucionales | Casi nulo: GitHub Pages es gratuito y Apps Script usa la cuenta institucional | Servidor + tiempo de TI; el software es gratuito | Desarrollo (puede ser un proyecto de grado) + servidor |
| **Muestra el estado del equipo al escanear** | No | Sí | Sí | Sí |
| **Evita prestar un equipo ya prestado** | No | Sí | Sí | Sí |
| **Devolución con el mismo QR** | Parcial (un segundo formulario) | Sí | Sí | Sí |
| **Avisos al laboratorio en cada préstamo y devolución** | Con scripts adicionales | Sí | Sí | Sí |
| **Alertas de vencimiento** | Con scripts adicionales | Sí, diarias por correo | Sí | Sí |
| **Reservas por fecha** | No | No (fase 3) | Limitadas | Sí |
| **Límite práctico** | Unos pocos miles de registros | Decenas de miles de préstamos | Sin límite práctico | Sin límite práctico |
| **Mantenimiento** | Ninguno | Bajo: una persona que entienda la hoja | Medio: actualizaciones del servidor | Alto: requiere un equipo de desarrollo |

## Recomendación

Empezar con la **opción B**, que es la que implementa este repositorio:

- No necesita servidor ni licencias: la web se publica gratis en GitHub Pages y los datos quedan en una hoja de Google de la cuenta institucional del OAN, que el personal ya sabe usar.
- Cubre el flujo completo (préstamo, devolución, avisos, daños, vencimientos) desde el primer día.
- El modelo de datos es el mismo que el de la [fase 3](10-plan-de-implementacion.md) ([`db/schema.sql`](../db/schema.sql)): si el uso crece, la migración a PostgreSQL es exportar cada hoja a CSV e importarla, y la web solo cambia la URL del servidor.

La opción C (Snipe-IT) conviene si la universidad ya administra servidores y quiere unificar el inventario de todo el OAN, no solo los préstamos. La opción D tiene sentido cuando se necesiten reservas por noche de observación, integración con los cursos o autenticación con el directorio institucional.

## ¿Por qué no guardar los datos en GitHub?

GitHub aloja muy bien el **código**, la **documentación** y la **página web**. Pero los préstamos contienen datos personales (nombre, correo), y un repositorio no es una base de datos: no controla quién ve cada registro, no tiene bloqueos para que dos personas no presten el mismo equipo a la vez, y todo cambio queda en el historial público para siempre. Por eso los datos viven en una hoja de Google con acceso restringido, y la web pública solo muestra el estado del equipo.
