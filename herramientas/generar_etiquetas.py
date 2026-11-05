#!/usr/bin/env python3
"""
Genera un PDF con las etiquetas QR de los equipos, listo para imprimir.

Cada QR contiene solo la URL de la web con el código del equipo, por ejemplo
https://astronomiaoan.github.io/equipos/?e=OAN-TEL-0001 . No lleva datos personales.

Uso:
    pip install reportlab
    python herramientas/generar_etiquetas.py datos/equipos.csv
    python herramientas/generar_etiquetas.py datos/equipos.csv --formato grande --salida etiquetas.pdf
    python herramientas/generar_etiquetas.py datos/equipos.csv --solo OAN-CAM-0001 OAN-ESP-0001

El CSV necesita al menos las columnas «id» y «nombre» (como la hoja «Equipos»).
Para exportar la hoja: Archivo → Descargar → Valores separados por comas (.csv).
"""
import argparse
import csv
import os
import re
import sys

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import A4, LETTER
from reportlab.lib.utils import ImageReader
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

URL_BASE = 'https://astronomiaoan.github.io/equipos/'
ORGANIZACION = 'Observatorio Astronómico Nacional'

# Formatos compatibles con hojas de etiquetas adhesivas comunes en papel A4.
FORMATOS = {
    # nombre: (columnas, filas, ancho, alto, margen_sup, margen_izq, separación_h, separación_v)
    'mediana': (3, 7, 63.5 * mm, 38.1 * mm, 15.15 * mm, 7.2 * mm, 2.5 * mm, 0),        # 21 por hoja (tipo L7160)
    'grande': (2, 4, 99.1 * mm, 67.7 * mm, 13.0 * mm, 4.65 * mm, 2.5 * mm, 0),         # 8 por hoja (tipo L7165)
    'pequena': (4, 10, 48.5 * mm, 25.4 * mm, 21.5 * mm, 8.0 * mm, 0, 0),               # 40 por hoja, para estuches (sin textos fijos)
}

LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo-oan.png')
_logo = None


def logo():
    """Logo del OAN en su versión para fondo claro (las etiquetas se imprimen sobre blanco)."""
    global _logo
    if _logo is None and os.path.exists(LOGO):
        _logo = ImageReader(LOGO)
    return _logo


PATRON_ID = re.compile(r'^OAN-[A-Z]{3}-\d{4}$')


def leer_equipos(ruta, solo):
    with open(ruta, newline='', encoding='utf-8-sig') as f:
        filas = list(csv.DictReader(f))
    if not filas or 'id' not in filas[0] or 'nombre' not in filas[0]:
        sys.exit('El CSV debe tener las columnas «id» y «nombre».')
    equipos = []
    for fila in filas:
        codigo = (fila.get('id') or '').strip().upper()
        if not codigo:
            continue
        if not PATRON_ID.match(codigo):
            print(f'Aviso: el código «{codigo}» no sigue el formato OAN-XXX-0000.', file=sys.stderr)
        if (fila.get('estado') or '').strip().lower() == 'baja':
            continue
        if solo and codigo not in solo:
            continue
        equipos.append({'id': codigo, 'nombre': (fila.get('nombre') or '').strip()})
    return equipos


def recortar(texto, fuente, tam, ancho):
    """Recorta el texto con «…» para que quepa en el ancho dado."""
    if stringWidth(texto, fuente, tam) <= ancho:
        return texto
    while texto and stringWidth(texto + '…', fuente, tam) > ancho:
        texto = texto[:-1]
    return texto.rstrip() + '…'


def partir(texto, fuente, tam, ancho, max_lineas=2):
    palabras, lineas, actual = texto.split(), [], ''
    for p in palabras:
        prueba = (actual + ' ' + p).strip()
        if stringWidth(prueba, fuente, tam) <= ancho:
            actual = prueba
        else:
            if actual:
                lineas.append(actual)
            actual = p
    if actual:
        lineas.append(actual)
    if len(lineas) > max_lineas:
        lineas = lineas[:max_lineas]
        lineas[-1] = recortar(lineas[-1] + ' …', fuente, tam, ancho)
    return [recortar(l, fuente, tam, ancho) for l in lineas]


def dibujar_qr(c, url, x, y, lado):
    # Margen de 2 módulos: el borde blanco de la etiqueta completa la zona de silencio.
    widget = QrCodeWidget(url, barLevel='M', barBorder=2)
    x0, y0, x1, y1 = widget.getBounds()
    d = Drawing(lado, lado, transform=[lado / (x1 - x0), 0, 0, lado / (y1 - y0), 0, 0])
    d.add(widget)
    renderPDF.draw(d, c, x, y)


def etiqueta(c, eq, x, y, ancho, alto, url_base, bordes):
    if bordes:
        c.setStrokeGray(0.75)
        c.setLineWidth(0.3)
        c.roundRect(x, y, ancho, alto, 2 * mm)
    pad = 2.5 * mm
    url = f'{url_base}?e={eq["id"]}'
    if alto < 30 * mm:
        # Formato pequeño (estuches, piezas pequeñas): QR, código y nombre corto.
        lado = alto - 2 * pad + 1 * mm
        dibujar_qr(c, url, x + pad - 1 * mm, y + (alto - lado) / 2, lado)
        tx = x + pad + lado + 0.5 * mm
        disponible = x + ancho - pad - tx
        tam = 9.5
        while stringWidth(eq['id'], 'Helvetica-Bold', tam) > disponible and tam > 6:
            tam -= 0.25
        c.setFont('Helvetica-Bold', tam)
        c.drawString(tx, y + alto - pad - tam, eq['id'])
        c.setFont('Helvetica', 6.5)
        ly = y + alto - pad - tam - 3 * mm
        for linea in partir(eq['nombre'], 'Helvetica', 6.5, disponible, 3):
            c.drawString(tx, ly, linea)
            ly -= 7.5
        return

    lado = min(alto - 2 * pad, ancho * 0.42)
    dibujar_qr(c, url, x + pad - 1 * mm, y + (alto - lado) / 2, lado)
    tx = x + pad + lado + 0.5 * mm
    disponible = x + ancho - pad - tx
    escala = min(alto / (38.1 * mm), disponible / (29 * mm))
    arriba = y + alto - pad

    imagen = logo()
    if imagen:
        ancho_img, alto_img = imagen.getSize()
        alto_logo = 9.5 * mm * escala
        c.drawImage(imagen, tx, arriba - alto_logo, height=alto_logo, width=alto_logo * ancho_img / alto_img, mask='auto')
        arriba -= alto_logo + 0.4 * mm
    else:
        c.setFillGray(0.35)
        tam_org = 5.8 * escala
        c.setFont('Helvetica', tam_org)
        for linea in partir(ORGANIZACION, 'Helvetica', tam_org, disponible, 2):
            arriba -= tam_org
            c.drawString(tx, arriba, linea)
            arriba -= 0.8 * escala

    tam_codigo = 11.5 * escala
    while stringWidth(eq['id'], 'Helvetica-Bold', tam_codigo) > disponible and tam_codigo > 6:
        tam_codigo -= 0.25
    arriba -= tam_codigo + 1.2 * mm
    c.setFillGray(0)
    c.setFont('Helvetica-Bold', tam_codigo)
    c.drawString(tx, arriba, eq['id'])

    tam_nombre = 7.4 * escala
    c.setFont('Helvetica', tam_nombre)
    arriba -= 1.2 * mm
    for linea in partir(eq['nombre'], 'Helvetica', tam_nombre, disponible, 2):
        arriba -= tam_nombre * 1.15
        c.drawString(tx, arriba, linea)

    c.setFillGray(0.35)
    tam_pie = 5.8 * escala
    c.setFont('Helvetica-Oblique', tam_pie)
    pie = partir('Escanee para prestar o devolver', 'Helvetica-Oblique', tam_pie, disponible, 2)
    for i, linea in enumerate(reversed(pie)):
        c.drawString(tx, y + pad + i * tam_pie * 1.15, linea)
    c.setFillGray(0)


def main():
    ap = argparse.ArgumentParser(description='Genera etiquetas QR para los equipos del OAN.')
    ap.add_argument('csv', help='CSV de equipos (columnas id y nombre)')
    ap.add_argument('--salida', default='etiquetas_qr.pdf')
    ap.add_argument('--formato', choices=FORMATOS, default='mediana',
                    help='mediana: 21 por hoja (por defecto); grande: 8; pequena: 40 (QR, código y nombre)')
    ap.add_argument('--papel', choices=['a4', 'carta'], default='a4')
    ap.add_argument('--url', default=URL_BASE, help=f'URL de la web (por defecto {URL_BASE})')
    ap.add_argument('--solo', nargs='*', default=[], help='Imprimir solo estos códigos')
    ap.add_argument('--desde', type=int, default=1, help='Posición de la primera etiqueta libre en la hoja (para reutilizar hojas)')
    ap.add_argument('--sin-bordes', action='store_true', help='No dibujar el contorno (para hojas adhesivas precortadas)')
    args = ap.parse_args()

    url_base = args.url if args.url.endswith('/') else args.url + '/'
    equipos = leer_equipos(args.csv, {s.upper() for s in args.solo})
    if not equipos:
        sys.exit('No hay equipos para imprimir.')

    cols, filas, ancho, alto, msup, mizq, sep_h, sep_v = FORMATOS[args.formato]
    pagina = A4 if args.papel == 'a4' else LETTER
    c = canvas.Canvas(args.salida, pagesize=pagina)
    c.setTitle('Etiquetas QR · ' + ORGANIZACION)
    por_hoja = cols * filas
    posicion = max(args.desde, 1) - 1
    for eq in equipos:
        if posicion == por_hoja:
            c.showPage()
            posicion = 0
        col, fila = posicion % cols, posicion // cols
        x = mizq + col * (ancho + sep_h)
        y = pagina[1] - msup - (fila + 1) * alto - fila * sep_v
        etiqueta(c, eq, x, y, ancho, alto, url_base, not args.sin_bordes)
        posicion += 1
    c.save()
    hojas = (max(args.desde, 1) - 1 + len(equipos) + por_hoja - 1) // por_hoja
    print(f'{len(equipos)} etiqueta(s) en {hojas} hoja(s): {args.salida}')


if __name__ == '__main__':
    main()
