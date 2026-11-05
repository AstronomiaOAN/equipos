# Web (GitHub Pages)

Página estática, sin dependencias ni paso de compilación: HTML, CSS y módulos de JavaScript.

| Archivo | Contenido |
| --- | --- |
| `index.html` | Estructura de la página |
| `css/estilos.css` | Estilos, incluido el modo de luz roja |
| `js/app.js` | Pantallas y navegación |
| `js/api.js` | Conexión con el backend |
| `js/escaner.js` | Lector de QR dentro de la página, para agregar varios equipos seguidos |
| `img/` | Logo del OAN (versión clara y oscura) e íconos |
| `js/config.js` | **URL del backend** (`API_URL`) |
| `js/demo.js` | Backend simulado para el modo demostración |
| `js/catalogos.js` | Listas, textos de estados y equipos de ejemplo |

## Modo demostración

Mientras `API_URL` esté vacía, la página funciona sola con equipos de ejemplo y guarda todo en el navegador. Sirve para mostrar el sistema y capacitar al personal antes de instalar el backend. El código de inicio de sesión aparece en pantalla, y con el correo `tecnico@unal.edu.co` se ve el panel del laboratorio.

## Probar en el computador

```bash
cd web
python3 -m http.server 8000
```

y abrir <http://localhost:8000/?e=OAN-TEL-0001>.

## Publicación

El flujo `.github/workflows/pages.yml` publica esta carpeta en GitHub Pages cada vez que cambia en la rama `main`. En el repositorio, **Settings → Pages → Source** debe estar en **GitHub Actions**. La dirección queda en `https://astronomiaoan.github.io/equipos/`, que es la que llevan los QR.
