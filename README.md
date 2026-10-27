# ImageJ_measurements

De ROI de Fiji/ImageJ a previews y Excel reproducibles, desde R/RStudio.

## Inicio rapido

1. Descarga o clona el repositorio y abre ImageJ_measurements.Rproj en RStudio.
2. Una sola vez: source("instalar_dependencias.R").
3. Copia config/individuo.example.R como config/individuo.R.
4. Indica tus imagenes, ZIP de ROI y linea de calibracion de cada vista.
5. Ejecuta source("ejecutar.R").

Tras ajustar algo en Fiji, pulsa **Update**, guarda el ZIP o la calibracion y vuelve
a ejecutar el paso 5. No se necesita exportar Results.csv, conexion a Internet ni
este chat para recalcular. Internet solo se necesita para instalar dependencias.

## Salidas por individuo

Cada ejecucion crea una carpeta nueva, sin sobrescribir las anteriores:

- Excel dorsal, ventral y combinado, conservando todas las filas del catalogo.
- Previews con lineas guardadas y leyenda, y previews de las calibraciones.
- pegar_dataset.tsv: bloque de 49 filas y dos columnas sin cabecera.
- CSV auditable, copias de los ROI, calibraciones, manifiesto MD5 y sessionInfo.

### Copiar al dataset final

En el Excel **combinado**, abre **Copiar_dataset**, copia **B3:C51** y pega
**solo valores** desde la fila 3 de las dos columnas del individuo en tu dataset.

El bloque sigue el orden de las 49 medidas, incluidas las tres branquias adicionales
al final. Conserva huecos para las ausentes, evitando desplazar filas.
La primera columna es **cm**, la segunda **%TL en escala 0-100**: 100.00 significa
100%, igual que tu plantilla. No se aplica formato porcentual de Excel a esos numeros.
El bloque se redondea a dos decimales; el detalle conserva precision para auditar.
La etiqueta original Total length (mm) se conserva por compatibilidad con el
dataset, pero las unidades de estos resultados son **cm**, indicadas en cabecera.
Puedes corregir esa etiqueta en la plantilla y catalogo conjuntamente.

config/medidas.csv contiene el orden y los ID. Si configuras template, el
programa comprueba los nombres de la columna A, filas 3-51, contra el catalogo:
se detiene si difieren, evitando pegar medidas desordenadas. La plantilla se
lee, pero **nunca se modifica** y no se copian los datos de otros individuos.

## Reglas de los ROI

- Cada nombre empieza por el ID, por ejemplo R03_Total_length o R43_D1_base.
  El resto del nombre es libre; no hace falta REVIEW/VISIBLE.
- Los ID corresponden a las filas de la plantilla original, no al numero de orden
  que muestra ROI Manager.
- Solo se aceptan **lineas rectas** modernas de ImageJ (version >=217).
  Polilineas, contornos, flechas y angulos producen un error explicito.
- La calibracion es un archivo .roi independiente, con distancia conocida **en cm**.
  No se incluye dentro del ZIP de medidas anatomicas.
- Las dimensiones deben coincidir exactamente con la imagen sobre la que se
  guardaron los ROI. El programa no gira, reduce ni adapta coordenadas.
- Usa el TIFF de trabajo que has abierto en Fiji: los JPEG de camara pueden tener
  orientacion EXIF interpretada de forma diferente por cada aplicacion.
  **No** basta con cambiar las dimensiones configuradas ante una imagen mal orientada.
- Cada vista usa su propia escala. Los metadatos del TIFF no se usan para medir:
  la linea de calibracion guardada es la fuente de verdad.
- Medidas repetidas entre vistas requieren una eleccion en preferred_views.
  No se promedian ni se elige automaticamente el ultimo archivo.
- %TL usa tl_source (habitualmente R03 de Dorsal) para ambas vistas.

## Revision anatomica

El programa mide coordenadas, no reconoce anatomia ni decide si un hito es correcto.
Las observaciones del catalogo y config$notes se conservan en la tabla.
Las medidas pendientes permanecen vacias, nunca se convierten en cero.
Al modificar una calibracion se recalculan todos los valores de esa vista.
Dos decimales son formato de presentacion, no una garantia de exactitud de 0.01 cm.
No se corrigen automaticamente perspectiva, curvatura ni relieve.

**R41 del primer individuo:** el ZIP recibido conserva una linea de 39 px, mientras
que una tabla anterior contenia 42.503 px. Este flujo usa **39 px** hasta que guardes
el ajuste real en el ZIP. No toma valores de Results.csv ni aplica correcciones ocultas.

## Otros individuos y mas vistas

Duplica la configuracion, cambia specimen_id y las rutas. Para ejecutar otra:

~~~r
Sys.setenv(IMAGEJ_CONFIG = "config/otro_individuo.R")
source("ejecutar.R")
~~~

Puedes configurar solo Dorsal, o anadir una vista Lateral. Debe existir la TL de
referencia configurada. Se generan Excel independientes para todas las vistas.
No crees ROI ficticios para completar celdas.

## Dependencias y pruebas

R >=4.3; openxlsx para Excel y magick para imagenes.
En Windows ambos se distribuyen como binarios en CRAN.

~~~r
source("tests/run_tests.R")
~~~

Las pruebas sinteticas comprueban subpixeles, calibracion, orden, ausencias,
duplicados, dimensiones, conflictos entre vistas y exportaciones.
No incluyen fotografias ni mediciones de ejemplares en GitHub.

## Referencias

- [Formato oficial ROI](https://imagej.net/ij/developer/source/ij/io/RoiDecoder.java.html)
- [ROI Manager y calibracion](https://imagej.net/ij/docs/guide/146-30.html)
- [openxlsx](https://ycphs.github.io/openxlsx/)
- [magick](https://docs.ropensci.org/magick/)

Licencia MIT; vease LICENSE.
