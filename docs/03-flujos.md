# 3. Flujos de uso

Todo empieza igual: la persona escanea el QR de un equipo con la cámara del celular, o lo elige en el catálogo, y se abre la ficha del equipo con su estado actual. **No hay aprobaciones ni verificaciones**: el préstamo y la devolución quedan registrados en el momento, y el laboratorio recibe el aviso.

## Préstamo y devolución

```mermaid
flowchart TD
    A([Escanea el QR o elige en el catálogo]) --> B[Ficha del equipo:<br/>foto, estado, qué incluye]
    B --> C{¿Estado del equipo?}
    C -- Disponible --> D{¿Tiene sesión<br/>en este celular?}
    D -- No --> E[Escribe su correo y<br/>el código que le llega]
    E --> F
    D -- Sí --> F[Formulario:<br/>equipos, quién es, tipo de actividad,<br/>dónde se usará, día de devolución]
    F --> G[Préstamo activo<br/>se guarda la hora de salida]
    G --> H([Comprobante en pantalla<br/>y aviso al laboratorio])

    C -- Prestado a esta persona --> M[Devolución:<br/>estado de cada equipo]
    M --> N{¿Dañado o<br/>incompleto?}
    N -- No --> O([Devuelto · disponible<br/>aviso al laboratorio])
    N -- Sí --> R([Devuelto · en mantenimiento<br/>novedad abierta y aviso])

    C -- Prestado a otra persona --> S([Muestra hasta qué día está prestado,<br/>sin datos personales])
```

## Varios equipos para una misma actividad (salida)

Para una práctica o una noche de observación normalmente salen varios equipos juntos. La persona arma una **salida**: una lista de equipos con los datos de la actividad escritos una sola vez.

```mermaid
flowchart TD
    A([Primer equipo: QR o catálogo]) --> C[Formulario de la salida]
    C --> D{¿Falta algún equipo?}
    D -- Sí --> E[Escanear otro QR, escribir el código<br/>o agregarlo desde el catálogo]
    E --> F{¿Está disponible?}
    F -- Sí --> G[Se agrega a la lista]
    F -- No --> H[Aviso: no se agrega]
    G --> D
    H --> D
    D -- No --> I[Registrar préstamo de N equipos]
    I --> J([Un registro por equipo con el mismo número de salida,<br/>un comprobante y un aviso por laboratorio])
```

- El lector de QR dentro de la página **escanea seguido**: se apunta a un equipo, vibra al leerlo, y se apunta al siguiente.
- Lo escrito en el formulario se conserva mientras se agregan equipos.
- **Devolución:** desde «Mis préstamos» o desde el QR de cualquiera de los equipos se puede devolver **toda la salida** en un formulario, o **solo algunos** equipos; los demás siguen prestados.
- Cada equipo conserva su propio registro, así que el historial y las estadísticas por equipo siguen siendo exactos.

## Plazo: días calendario

- La persona elige el **día de devolución**: hoy, mañana o cualquier día hasta **7 días calendario** después (con atajos «Hoy», «Mañana», «En 3 días», «En una semana»).
- Cuentan todos los días, también fines de semana y festivos.
- El préstamo vence al **final de ese día** (11:59 p. m., hora de Colombia). Esa mañana llega un recordatorio; si pasa el día sin devolución, queda **vencido** y empiezan los avisos diarios.

## Estados de un préstamo

```mermaid
stateDiagram-v2
    [*] --> activo: se registra el préstamo
    activo --> devuelto: se registra la devolución
    devuelto --> [*]

    note right of activo
        Pasado el día de devolución se marca como vencido
        y se envían avisos diarios a la persona y al laboratorio.
    end note
```

## Estados de un equipo

| Estado | Significado | Se puede prestar |
| --- | --- | --- |
| `disponible` | En su lugar, listo para usar | Sí |
| `prestado` | Alguien lo tiene | No |
| `mantenimiento` | Se devolvió dañado o incompleto, o está en reparación o calibración | No |
| `baja` | Retirado del inventario (no aparece en el catálogo ni se imprimen etiquetas) | No |

El estado cambia solo con los préstamos y devoluciones. Cuando el responsable marca como resuelta una novedad, puede dejar el equipo disponible otra vez. El administrador también puede cambiar el estado a mano en la hoja `Equipos`.

## Qué pasa por detrás al prestar

```mermaid
sequenceDiagram
    actor U as Usuario
    participant W as Web (GitHub Pages)
    participant S as Apps Script
    participant H as Hoja de Google
    participant C as Correo

    U->>W: Abre ?e=OAN-TEL-0001 desde el QR
    W->>S: equipo(id, token)
    S->>H: Lee Equipos, Laboratorios, Prestamos
    S-->>W: Ficha del equipo y su préstamo (si lo hay)
    U->>W: Llena el formulario y confirma
    W->>S: prestar(token, equipos, datos)
    S->>S: Valida sesión, disponibilidad<br/>y día de devolución (≤ 7 días)
    S->>H: Agrega una fila por equipo en Prestamos,<br/>los marca prestados, anota en Bitacora
    S->>C: Comprobante al usuario<br/>y aviso a los responsables del laboratorio
    S-->>W: Préstamo registrado
    W-->>U: Comprobante con fecha, hora y día de devolución
```

## Inicio de sesión

No se usan contraseñas. La primera vez, la persona escribe su correo, recibe un código de 6 dígitos y lo escribe en la página. Con eso el celular queda con una sesión firmada válida por 30 días. Los detalles están en [arquitectura y seguridad](09-arquitectura-y-seguridad.md).

## Situaciones especiales

| Situación | Cómo se resuelve |
| --- | --- |
| Alguien devuelve un equipo por otra persona | El responsable del laboratorio puede registrar la devolución desde la ficha del equipo; queda anotado quién la registró (`devuelto_por`) |
| El equipo se daña durante el préstamo | Se devuelve marcando «Dañado» y describiendo el daño; queda en mantenimiento y se abre una novedad |
| Faltan piezas | Se marca «Incompleto» y se describe lo que falta; queda en mantenimiento y se abre una novedad |
| Un equipo disponible tiene una falla | Cualquiera con sesión puede usar «Reportar un daño o falla» desde la ficha; el responsable recibe un correo |
| Se necesita más tiempo | Se devuelve y se vuelve a prestar, o el responsable ajusta la `fecha_prevista` en la hoja |
| La etiqueta está dañada | En la página de inicio se puede escribir el código impreso, o buscar el equipo en el catálogo |
| Sin señal en la terraza de observación | La ficha necesita conexión. Se recomienda registrar la salida dentro del edificio, donde hay red |
