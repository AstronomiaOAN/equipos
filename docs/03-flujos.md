# 3. Flujos de uso

Todo empieza igual: la persona escanea el QR del equipo con la cámara del celular y se abre la ficha del equipo con su estado actual. Lo que puede hacer depende de ese estado y de quién es.

## Préstamo y devolución

```mermaid
flowchart TD
    A([Escanea el QR del equipo]) --> B[Se abre la ficha:<br/>código, nombre, estado, qué incluye]
    B --> C{¿Estado del equipo?}
    C -- Disponible --> D{¿Tiene sesión<br/>en este celular?}
    D -- No --> E[Escribe su correo y<br/>el código que le llega]
    E --> F
    D -- Sí --> F[Formulario de préstamo:<br/>propósito, actividad, curso,<br/>lugar, fecha de devolución,<br/>estado al recibirlo]
    F --> G{¿Requiere aprobación?<br/>restringido, externo o<br/>fuera del campus}
    G -- No --> H[Préstamo activo<br/>se guarda la hora de salida]
    G -- Sí --> I[Solicitud pendiente<br/>el equipo queda reservado]
    I --> J{El responsable<br/>decide}
    J -- Aprueba al entregar --> H
    J -- Rechaza con motivo --> K([Equipo disponible de nuevo])
    H --> L([Comprobante en pantalla y por correo])

    C -- En préstamo, y es suyo --> M[Formulario de devolución:<br/>lista de componentes,<br/>estado, observaciones]
    M --> N{¿Equipo libre y<br/>en buen estado?}
    N -- Sí --> O([Devuelto · disponible])
    N -- No --> P[Devuelto · en revisión<br/>aviso al responsable]
    P --> Q{El responsable revisa}
    Q -- Todo bien --> O
    Q -- Necesita arreglo --> R([En mantenimiento])

    C -- En préstamo, de otra persona --> S([Muestra hasta cuándo está prestado<br/>sin datos personales])
```

## Estados de un préstamo

```mermaid
stateDiagram-v2
    [*] --> pendiente: solicitud que requiere aprobación
    [*] --> activo: préstamo directo
    pendiente --> activo: el responsable aprueba y entrega
    pendiente --> rechazado: el responsable rechaza
    pendiente --> cancelado: el usuario cancela
    activo --> devuelto: equipo libre, sin novedades
    activo --> por_verificar: supervisado, restringido o con novedad
    por_verificar --> devuelto: el responsable verifica
    devuelto --> [*]
    rechazado --> [*]
    cancelado --> [*]

    note right of activo
        Si pasa la fecha prevista se marca como vencido
        y se envían avisos diarios.
    end note
```

## Estados de un equipo

| Estado | Significado | Se puede prestar |
| --- | --- | --- |
| `disponible` | En su lugar, listo para usar | Sí |
| `reservado` | Hay una solicitud esperando aprobación | No |
| `prestado` | Alguien lo tiene | No |
| `en_revision` | Fue devuelto y el responsable debe revisarlo | No |
| `mantenimiento` | En reparación o calibración | No |
| `baja` | Retirado del inventario (no se imprimen etiquetas) | No |

El estado cambia solo con los movimientos. El administrador puede cambiarlo a mano en la hoja `Equipos` (por ejemplo, enviar a mantenimiento o dar de baja).

## Qué pasa por detrás al escanear

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
    S-->>W: Ficha del equipo y préstamo abierto (si lo hay)
    U->>W: Llena el formulario y confirma
    W->>S: prestar(token, datos)
    S->>S: Valida sesión, estado del equipo,<br/>plazo máximo y reglas
    S->>H: Agrega fila en Prestamos,<br/>cambia estado en Equipos,<br/>anota en Bitacora
    S->>C: Comprobante al usuario<br/>y aviso al responsable si aplica
    S-->>W: Préstamo registrado
    W-->>U: Comprobante con fecha y hora
```

## Inicio de sesión

No se usan contraseñas. La primera vez, la persona escribe su correo, recibe un código de 6 dígitos y lo escribe en la página. Con eso el celular queda con una sesión firmada válida por 30 días. Así se confirma que el correo es suyo sin crear cuentas ni recordar claves. Los detalles están en [arquitectura y seguridad](09-arquitectura-y-seguridad.md).

## Situaciones especiales

| Situación | Cómo se resuelve |
| --- | --- |
| Alguien devuelve un equipo por otra persona | El responsable del laboratorio puede registrar la devolución desde la ficha del equipo; queda anotado quién la registró (`devuelto_por`) |
| El equipo se daña durante el préstamo | Se devuelve marcando «Dañado» y describiendo el daño; se crea un reporte y el equipo queda en revisión |
| Faltan piezas de un kit | Se desmarcan en la lista de componentes al devolver; se crea un reporte de faltante |
| Un equipo disponible tiene una falla | Cualquiera con sesión puede usar «Reportar un daño o falla» desde la ficha; el responsable recibe un correo |
| Se necesita más tiempo | El usuario devuelve y vuelve a prestar, o el responsable ajusta la `fecha_prevista` en la hoja |
| La etiqueta está dañada | En la página de inicio se puede escribir el código impreso; el administrador reimprime la etiqueta |
| Sin señal en la terraza de observación | La ficha necesita conexión. Se recomienda registrar la salida dentro del edificio, donde hay red |
