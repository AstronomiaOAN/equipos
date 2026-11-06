#!/usr/bin/env python3
"""
Copia los datos de ejemplo de datos/*.csv dentro del backend (apps-script/Code.gs) y del
modo demostración de la web (web/js/catalogos.js), para que los tres digan lo mismo.

Uso, desde la raíz del repositorio, después de editar los CSV de ejemplo:
    python3 herramientas/sincronizar_ejemplos.py

Reemplaza el texto entre las marcas «<ejemplos>» y «</ejemplos>» de cada archivo.
"""
import csv
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def leer(nombre):
    with open(os.path.join(RAIZ, 'datos', nombre), newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def equipos():
    salida = []
    for e in leer('equipos_ejemplo.csv'):
        e = {k: (v or '').strip() for k, v in e.items()}
        salida.append(e)
    return salida


def laboratorios():
    return [{k: (v or '').strip() for k, v in l.items() if k != 'responsable_email'} for l in leer('laboratorios_ejemplo.csv')]


def reemplazar(ruta, bloque):
    ruta = os.path.join(RAIZ, ruta)
    texto = open(ruta, encoding='utf-8').read()
    patron = re.compile(r'(// <ejemplos>[^\n]*\n).*?(// </ejemplos>)', re.S)
    if not patron.search(texto):
        sys.exit(f'No se encontraron las marcas <ejemplos> en {ruta}')
    texto = patron.sub(lambda m: m.group(1) + bloque + '\n' + m.group(2), texto)
    open(ruta, 'w', encoding='utf-8').write(texto)


def js(valor):
    return json.dumps(valor, ensure_ascii=False, indent=2)


def main():
    eqs, labs = equipos(), laboratorios()
    reemplazar('apps-script/Code.gs',
               'const EJEMPLOS = {\n  laboratorios: ' + js(labs).replace('\n', '\n  ') +
               ',\n  equipos: ' + js(eqs).replace('\n', '\n  ') + '\n};')
    demo = []
    for e in eqs:
        d = dict(e)
        d['componentes'] = [c.strip() for c in e['componentes'].split(';') if c.strip()]
        demo.append(d)
    reemplazar('web/js/catalogos.js',
               'export const LABORATORIOS_DEMO = ' + js([dict(l, responsable_email='tecnico@unal.edu.co') for l in labs]) +
               ';\n\nexport const EQUIPOS_DEMO = ' + js(demo) + ';')
    print(f'{len(eqs)} equipos y {len(labs)} laboratorios copiados a Code.gs y catalogos.js')


if __name__ == '__main__':
    main()
