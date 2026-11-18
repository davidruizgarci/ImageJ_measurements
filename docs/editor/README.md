# Raja radula · Browser measurement editor

[Abrir la web / Open the editor](https://davidruizgarci.github.io/ImageJ_measurements/editor/)

Static, browser-local editor. No backend, accounts, analytics or remote image uploads. The complete source and pinned dependencies are in this folder. No specimen photographs are distributed with the site. The built-in example is an explicitly labelled schematic.

## Español

1. Elige Español / English en la barra superior. La preferencia se guarda en este navegador; no cambia los ID ni los nombres de Measurements.xlsx.
2. Indica ejemplar y sexo. En **cada vista**, carga la foto exacta (JPG, PNG o TIFF de una sola imagen) y su ZIP de ROI de ImageJ. Para los paquetes anteriores, utiliza el TIFF de trabajo. No uses el preview como foto.
3. Carga `Calibracion.roi` e introduce su distancia real en cm. Puedes volver a dibujar la referencia con dos clics. Cada vista tiene su propia escala. Si la regla está en otro plano, documenta esa incertidumbre.
4. Selecciona una medida. Arrastra sus vértices, dibuja una recta con dos clics o un trayecto con varios clics y **Terminar trayecto**. Rueda para zoom; arrastra el fondo para desplazar. **Añadir vértice** inserta un punto en el segmento más cercano; selecciona un punto y **Quitar vértice** para eliminarlo. Las ediciones vuelven a estado Propuesta. Deshacer/Rehacer restaura los datos.
5. Revisa y documenta cada medida. Las alturas R38/R40/R42/R44 requieren vista lateral y deben permanecer sin valor. Para hembras, R33 queda vacía. El CSV de observaciones de los paquetes anteriores puede importarse: columnas `id`, `note` y opcionalmente `view`.
6. Elige la vista que aporta R03, referencia común de %TL. Si hay un ID en las dos vistas, selecciona explícitamente cuál entra en el combinado. No se promedian. Sin TL válida, los cm pueden exportarse pero los %TL quedan vacíos.
7. **Descargar resultados** genera un ZIP con Excel dorsal, ventral y combinado; ROI de ambas vistas; calibraciones; previews; CSV auditable; y proyecto con fotos. **Guardar proyecto** permite guardar el trabajo aunque aún falten escalas. Reabre cualquiera de estos ZIP con **Abrir proyecto**. No cierres sin descargar: no hay guardado automático.
8. En el combinado, copia **Copiar_dataset!B3:C51** y pega solo valores. Son 49 filas, con huecos conservados y dos columnas: cm y %TL (0–100). El nombre original `Total length (mm)` se conserva para corresponder con la plantilla; los valores de la columna cm están en centímetros.

Los ZIP de ROI incluyen también las líneas descartadas para mantenerlas editables. Sus estados y notas se conservan en el proyecto y CSV, no en el formato de ImageJ. Fiji y el exportador R anterior no interpretan estos estados: para conservar esas exclusiones, genera el Excel desde esta web. Los números se calculan a precisión completa y se muestran con dos decimales.

## English

Choose **English** in the top bar. Load the exact photograph and ROI ZIP for each view, then load or draw its calibration line and enter the known length in centimetres. Use the working TIFF from previous packages, not the annotated preview. Select a measurement, drag its landmarks or draw a straight/segmented line. Record uncertainties and mark measurements reviewed or excluded. R03 from the selected reference view supplies the common %TL denominator. Duplicate IDs across views require an explicit choice. Female clasper measurements and unsupported heights remain blank.

**Download results** produces separate dorsal/ventral workbooks and a combined workbook, editable ImageJ ROIs, calibration lines, PNG previews, auditable CSV and a resumable project with the exact original image bytes. **Save project** works before calibration is complete. Reopen either ZIP with **Open project**. There is no automatic server storage. Copy **Copiar_dataset!B3:C51** from the combined workbook and paste values only into your dataset. These 49 rows follow the original dataset order. Output units are cm and %TL (0–100), displayed with two decimals. Original measurement labels and sheet names remain stable across UI languages.

Paths sum straight segments; Fit Spline is rejected. This method is recorded and must not be confused with a direct-distance protocol. Excluded ROI geometry remains in the ZIP for editing; exclusion statuses live in the project/CSV and are honoured by this web exporter, not by Fiji or the earlier R exporter.

## Development and checks

No build or package installation is required. Serve this directory over HTTP (ES modules cannot reliably be opened with `file://`):

```sh
python -m http.server 8766 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8766`. For repository tests:

```sh
node tests/web-core.test.mjs
# Optional real ROI compatibility tests (local files, never committed):
node tests/web-core.test.mjs /path/to/ROIs_Dorsal.zip /path/to/ROIs_Ventral.zip
```

GitHub Pages serves `/docs` on `main`; `/docs/index.html` links to this editor. Plain HTML/CSS/JS also works on any static host, including Sites when available.

Dependencies are vendored and MIT licensed: fflate 0.8.2 (ZIP), UTIF 3.1.0 + pako 1.0.11 (TIFF). Excel generation is a small OOXML writer using only numeric values and inline strings, no formulas, external links, drawings or printer settings. Limits: 60 MP per image, 350 MB decompressed project ZIP, single-image TIFF with explicit orientation; ordinary ImageJ line types 3/4/5 without spline or specialised subtypes. Original JPEG EXIF orientation is applied for display; ROI alignment must be visually checked. Source files are included byte-for-byte when saved.


## Definitions and source figures

Selecting any of the 49 dataset rows shows a bilingual definition, anatomical endpoints,
measurement method, required view/examination and photographic limitations. Definitions
are paraphrases of Last, White, Pogonoski & Gledhill (2008), Table 1, pp. 3–4.
Paper character numbers are separate from dataset IDs. R16–R18, R47 and R49–R51 are
explicitly marked as dataset adaptations. Last & Séret (2016), Table 1, provide an
additional reference for interdorsal distance; its exact endpoints still require confirmation.

Figure 2 (p. 6) is included from the previously supplied paper, with panel thumbnails
and an accessible full-figure dialog. Figure 1 (p. 5) uses the dorsal and ventral panels supplied by the user on 18 November 2026.
Both open locally in the illustration dialog. The supplied higher-resolution anteroventral
panel also replaces the previous Figure 2B thumbnail. These three supplied files are
retained byte-for-byte; source numbering and credits remain unchanged.
R27 and R28 have no specific source illustration. No substitute diagrams are presented
as originals. All figure credits retain CSIRO / Last et al. (2008).

Each result workbook appends `Diccionario_medidas`, with all 49 definitions in Spanish
and English and their source references. Existing data sheets, ROI coordinates and
specimen observations retain their original meaning. The dictionary is independent
of the UI language and does not mark a specimen measurement as reviewed.
