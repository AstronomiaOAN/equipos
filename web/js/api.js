import { CONFIG } from './config.js';
import { llamarDemo } from './demo.js';

export const MODO_DEMO = !CONFIG.API_URL;

/**
 * Llama una acción del backend. Siempre resuelve con { ok, ... } o { ok:false, error }.
 * Se envía como text/plain para que el navegador no haga la consulta previa CORS,
 * que Apps Script no admite.
 */
export async function llamar(accion, datos = {}) {
  if (MODO_DEMO) return llamarDemo(accion, datos);
  try {
    const respuesta = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion, ...datos }),
      redirect: 'follow'
    });
    return await respuesta.json();
  } catch (err) {
    return { ok: false, codigo: 0, error: 'No hay conexión con el servidor. Revise su conexión a internet e intente de nuevo.' };
  }
}
