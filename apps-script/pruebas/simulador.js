/**
 * Simulador mínimo de los servicios de Google Apps Script para probar Code.gs con Node.
 * No reemplaza las pruebas en Google, pero detecta errores de lógica antes de desplegar.
 *   node --test apps-script/pruebas/
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function crearHoja(nombre) {
  const filas = [];
  const hoja = {
    nombre, filas,
    getLastRow: () => filas.length,
    getLastColumn: () => filas.reduce((m, f) => Math.max(m, f.length), 0),
    getMaxRows: () => Math.max(1000, filas.length),
    getDataRange: () => ({
      getValues: () => {
        const n = hoja.getLastColumn();
        return filas.map(f => Array.from({ length: n }, (_, i) => f[i] === undefined ? '' : f[i]));
      }
    }),
    appendRow: valores => { filas.push(valores.slice()); },
    getRange: (fila, col, nf = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nf }, (_, i) =>
        Array.from({ length: nc }, (_, j) => ((filas[fila - 1 + i] || [])[col - 1 + j]) ?? '')),
      setValues: vals => vals.forEach((v, i) => v.forEach((x, j) => {
        while (filas.length < fila + i) filas.push([]);
        filas[fila - 1 + i][col - 1 + j] = x;
      })),
      setValue: v => {
        while (filas.length < fila) filas.push([]);
        filas[fila - 1][col - 1] = v;
      },
      setFontWeight() { return this; },
      setFontSize() { return this; },
      setDataValidation: () => {}
    }),
    setFrozenRows: () => {},
    setColumnWidth: () => {}
  };
  return hoja;
}

function crearEntorno() {
  const hojas = {};
  const correos = [];
  const propiedades = {};
  const cache = {};
  const libro = {
    getSheetByName: n => hojas[n] || null,
    insertSheet: n => (hojas[n] = crearHoja(n)),
    getSheets: () => Object.values(hojas),
    deleteSheet: h => { delete hojas[h.nombre]; }
  };
  const b64 = buf => Buffer.from(buf).toString('base64');
  const b64ws = buf => b64(buf).replace(/\+/g, '-').replace(/\//g, '_');
  const contexto = {
    console,
    SpreadsheetApp: {
      getActive: () => Object.assign(libro, { toast: () => {} }),
      newDataValidation: () => ({ requireValueInList: () => ({ build: () => ({}) }) }),
      getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) })
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: texto => ({ texto, setMimeType() { return this; } })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: k => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = v; },
        remove: k => { delete cache[k]; }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => propiedades[k] || null,
        setProperty: (k, v) => { propiedades[k] = v; }
      })
    },
    MailApp: { sendEmail: m => correos.push(m) },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => ({ timeBased() { return this; }, everyDays() { return this; }, atHour() { return this; }, create() {} })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, texto) => crypto.createHash('sha256').update(texto).digest(),
      computeHmacSha256Signature: (texto, clave) => crypto.createHmac('sha256', clave).update(texto).digest(),
      base64Encode: b64,
      base64EncodeWebSafe: v => b64ws(typeof v === 'string' ? Buffer.from(v, 'utf8') : v),
      base64DecodeWebSafe: s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
      newBlob: buf => ({ getDataAsString: () => Buffer.from(buf).toString('utf8') }),
      getUuid: () => crypto.randomUUID(),
      // Hora de Colombia (UTC−5, sin horario de verano) con los patrones que usa Code.gs
      formatDate: (fecha, zona, formato) => {
        const b = new Date(fecha.getTime() - 5 * 36e5);
        const dos = n => String(n).padStart(2, '0');
        const Y = b.getUTCFullYear(), M = b.getUTCMonth() + 1, D = b.getUTCDate();
        if (formato === 'yyyy-MM-dd') return `${Y}-${dos(M)}-${dos(D)}`;
        if (formato === 'yyMMdd') return `${String(Y).slice(2)}${dos(M)}${dos(D)}`;
        if (formato === 'u-d-M') return `${b.getUTCDay() || 7}-${D}-${M}`;
        return b.toISOString().slice(0, 16);
      }
    }
  };
  vm.createContext(contexto);
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  // Exponer las declaraciones de nivel superior en el contexto.
  vm.runInContext(codigo + '\n;globalThis.__exports = { CONFIG, HOJAS, CATALOGOS, doGet, doPost, configurar, revisarVencimientos, cargarCatalogoDeEjemplo };', contexto);
  const api = contexto.__exports;

  const llamar = datos => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(datos) } }).texto);
  const llenar = (nombre, registros) => {
    const h = hojas[nombre];
    const cab = h.filas[0];
    registros.forEach(r => h.appendRow(cab.map(c => r[c] === undefined ? '' : r[c])));
  };
  const leer = nombre => {
    const [cab, ...resto] = hojas[nombre].filas;
    return resto.map(f => Object.fromEntries(cab.map((c, i) => [c, f[i] === undefined ? '' : f[i]])));
  };
  /** Inicia sesión leyendo el código del último correo enviado. */
  const iniciarSesion = email => {
    const r1 = llamar({ accion: 'solicitarCodigo', email });
    if (!r1.ok) throw new Error(r1.error);
    const codigo = correos.at(-1).subject.match(/\d{6}/)[0];
    const r2 = llamar({ accion: 'verificarCodigo', email, codigo });
    if (!r2.ok) throw new Error(r2.error);
    return r2;
  };
  return { api, hojas, correos, cache, llamar, llenar, leer, iniciarSesion };
}

module.exports = { crearEntorno };
