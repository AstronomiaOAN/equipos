# Instalación del backend (Google Apps Script)

Tiempo: una tarde. Se necesita una cuenta institucional de Google que será la «dueña» del sistema (idealmente una cuenta del OAN y no la personal de alguien, para que el sistema no dependa de una persona).

## 1. Crear la hoja

1. En Google Drive, con la cuenta del OAN: **Nuevo → Hojas de cálculo de Google**. Nómbrela «Préstamo de equipos OAN».
2. Compártala **solo** con los responsables de laboratorio y administradores. Los usuarios no necesitan acceso a la hoja.

## 2. Pegar el código

1. En la hoja: **Extensiones → Apps Script**.
2. Borre el contenido de `Código.gs` y pegue todo [`Code.gs`](Code.gs).
3. En **Configuración del proyecto** (engranaje): zona horaria `(GMT-05:00) Bogotá`. Opcional: active «Mostrar el archivo de manifiesto» y pegue [`appsscript.json`](appsscript.json).
4. Revise los parámetros de `CONFIG` al inicio del código (dominio institucional, URL de la web). Guarde.

## 3. Preparar las pestañas

1. En el editor, elija la función **`configurar`** y presione **Ejecutar**. Google pedirá permisos (hojas de cálculo, enviar correo, activadores): acéptelos.
2. Vuelva a la hoja: aparecen las pestañas `Equipos`, `Laboratorios`, `Usuarios`, `Prestamos`, `Incidencias` y `Bitacora`, y el menú **Préstamos OAN**.

## 4. Cargar laboratorios y equipos

- Llene `Laboratorios` y `Equipos` a mano, o copie las filas desde un CSV con las mismas columnas (ver [`datos/`](../datos) y el [modelo de datos](../docs/05-modelo-de-datos.md)). Los archivos de ejemplo **no** son el inventario real.
- Escriba su propio correo con `rol = admin` en `Usuarios` si quiere ver el panel de todos los laboratorios (o regístrese desde la web y luego cambie el rol).

## 5. Publicar como aplicación web

1. En el editor: **Implementar → Nueva implementación → Tipo: Aplicación web**.
2. **Ejecutar como:** Yo (la cuenta del OAN). **Quién tiene acceso:** Cualquier usuario.
3. Copie la URL que termina en `/exec`.
4. En el repositorio, edite [`web/js/config.js`](../web/js/config.js) y péguela en `API_URL`. Al guardar el cambio en GitHub, la página se vuelve a publicar sola y deja el modo demostración.

> **Por qué «Cualquier usuario».** La web la llama desde el navegador sin sesión de Google. Esto no expone la hoja: el script solo responde a las acciones definidas en el código, y cada acción que escribe exige el token del usuario. Si la administración de Google Workspace de la universidad no permite esa opción, pida que la habiliten para esta cuenta; con «Solo usuarios del dominio» el navegador no puede llamar al script desde GitHub Pages.

## 6. Activar las alertas diarias

En la hoja: **Préstamos OAN → Instalar alerta diaria (7 a. m.)**.

## 7. Probar

1. Abra la web, escanee o escriba el código de un equipo y haga un préstamo y una devolución.
2. Revise que aparezcan las filas en `Prestamos` y `Bitacora`, y que lleguen los correos.

## Actualizar el código

Después de cambiar `Code.gs`: **Implementar → Gestionar implementaciones → Editar (lápiz) → Versión: Nueva versión → Implementar**. Así la URL `/exec` se mantiene y no hay que tocar la web.

Para sincronizar con este repositorio desde la terminal se puede usar [`clasp`](https://github.com/google/clasp): `clasp clone <id-del-script>` en esta carpeta y luego `clasp push`.

## Pruebas automáticas

[`pruebas/`](pruebas) simula los servicios de Google para probar la lógica con Node.js 18 o superior, sin tocar la hoja real:

```bash
node --test 'apps-script/pruebas/*.test.js'
```

Se ejecutan solas en GitHub en cada cambio (`.github/workflows/pruebas.yml`).

## Problemas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| La web dice «No hay conexión con el servidor» | `API_URL` mal copiada, o la implementación no tiene acceso «Cualquier usuario» |
| «Falta SECRETO_TOKEN» o «Falta la hoja…» | No se ejecutó `configurar()` |
| No llegan los códigos | Revisar correo no deseado; ver **Ejecuciones** en el editor de Apps Script |
| Los cambios del código no se ven | Falta crear una **nueva versión** de la implementación |
| Un responsable no ve el panel | Su correo no está en `responsable_email` de `Laboratorios`, o tiene espacios de más |
