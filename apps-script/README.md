# Activación del backend (Google Apps Script)

Tiempo: unos 15 minutos. Todo se hace con la cuenta **oan.unal@gmail.com**, dueña de la base de datos.

La hoja ya está creada en su Drive:

- Carpeta: **Sistema de préstamo de equipos OAN**
- Hoja: **Préstamo de equipos OAN - Base de datos**

Está vacía; el paso 2 crea las pestañas y los datos iniciales.

## 1. Pegar el código

1. Abra la hoja con la cuenta oan.unal@gmail.com.
2. **Extensiones → Apps Script**.
3. Borre el contenido de `Código.gs` y pegue todo [`Code.gs`](Code.gs). Guarde (ícono de disquete).
4. En **Configuración del proyecto** (engranaje): zona horaria `(GMT-05:00) Bogotá`.

## 2. Preparar las pestañas

1. En el editor, elija la función **`configurar`** en la lista de arriba y presione **Ejecutar**.
2. Google pide permisos. Como el script es propio y no está publicado, muestra «Google no ha verificado esta app»: toque **Configuración avanzada → Ir a … (no seguro) → Permitir**. Los permisos son para editar la hoja, enviar correo como oan.unal@gmail.com y programar la alerta diaria.
3. Vuelva a la hoja. Ya tiene:
   - las pestañas `Instrucciones`, `Equipos`, `Laboratorios`, `Usuarios`, `Prestamos`, `Incidencias` y `Bitacora`, y el menú **Préstamos OAN**;
   - oan.unal@gmail.com como administradora en `Usuarios`;
   - 3 laboratorios y 8 equipos **de ejemplo**, marcados «EJEMPLO» en `notas`, para probar de inmediato. Reemplácelos por el inventario real antes de imprimir etiquetas.

`configurar()` se puede ejecutar de nuevo cuando se quiera: solo agrega lo que falte y nunca borra datos.

## 3. Publicar como aplicación web

1. En el editor: **Implementar → Nueva implementación → ⚙ → Aplicación web**.
2. **Ejecutar como:** Yo (oan.unal@gmail.com). **Quién tiene acceso:** Cualquier usuario.
3. **Implementar** y copie la **URL de la aplicación web** (termina en `/exec`).
4. En GitHub, edite [`web/js/config.js`](../web/js/config.js) y pegue la URL en `API_URL`. Al guardar, la web se vuelve a publicar sola en un minuto y deja el modo demostración.

> **Por qué «Cualquier usuario».** La web llama al script desde el navegador de cada persona, sin sesión de Google. Esto no expone la hoja: el script solo responde a las acciones definidas en el código, y toda acción que escribe exige el token que obtiene la persona al verificar su correo.

## 4. Activar las alertas diarias

En la hoja: **Préstamos OAN → Instalar alerta diaria (7 a. m.)**.

## 5. Probar

1. Abra <https://astronomiaoan.github.io/equipos/?e=OAN-TEL-0001> e inicie sesión con su correo.
2. Preste dos o tres equipos juntos (botón «Escanear otro QR» o escribiendo los códigos) y devuélvalos.
3. Revise que aparezcan las filas en `Prestamos` y `Bitacora` y que lleguen los correos.

## Correo: límite de una cuenta @gmail.com

Google permite a una cuenta @gmail.com enviar unos **100 correos al día** desde Apps Script. El sistema manda un solo correo por salida (aunque sean varios equipos) y agrupa los avisos de vencimiento por persona. Para ver cuántos quedan: **Préstamos OAN → Ver correos disponibles hoy**. Si se agotan con frecuencia, ponga `CORREO_COMPROBANTES: false` en `CONFIG` o mueva el sistema a una cuenta institucional de Google Workspace (unos 1.500 al día).

## Actualizar el código

Después de cambiar `Code.gs`: **Implementar → Gestionar implementaciones → Editar (lápiz) → Versión: Nueva versión → Implementar**. La URL `/exec` se mantiene y no hay que tocar la web.

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
| No llegan los códigos | Revisar correo no deseado; ver **Ejecuciones** en el editor; revisar el límite diario de correos |
| Los cambios del código no se ven | Falta crear una **nueva versión** de la implementación |
| Un responsable no ve el panel | Su correo no está en `responsable_email` de `Laboratorios`, o tiene espacios de más |
