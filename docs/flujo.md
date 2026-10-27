# Flujo de trabajo en Fiji y RStudio

## Primera vez

1. Abre la imagen de trabajo TIFF en Fiji.
2. ROI Manager > More > Open: ZIP de medidas de esa vista.
3. Abre por separado el ROI de calibracion, confirma extremos y distancia.
4. Completa rutas, known_cm, width y height en la configuracion R.
5. Ejecuta el exportador y revisa los previews.

## Cuando ajustas medidas

1. Selecciona la linea en ROI Manager.
2. Mueve sus extremos y pulsa **Update**.
3. More > Save: guarda el ZIP en la misma ruta configurada.
4. Si cambias la escala, guarda la linea en su archivo .roi independiente.
5. En RStudio ejecuta source("ejecutar.R").
6. Comprueba las nuevas imagenes y copia B3:C51 de Copiar_dataset del combinado.

R lee los pixeles de la linea guardada y la distancia known_cm. Si tambien quieres
medir dentro de Fiji, actualiza Analyze > Set Scale alli; cambiar la escala de
Fiji por si solo no afecta al exportador.

## Lo que debes mantener estable

- Identificadores R03, R04, etc.; puedes cambiar el texto que sigue al ID.
- La imagen exacta sobre la que se trazaron los ROI.
- La correspondencia del catalogo con la plantilla final.

Las exportaciones son historicas; una nueva ejecucion crea otra carpeta.
El dataset original no se escribe: tu decides donde pegar el bloque.

## Copiar sin perder huecos

Usa el bloque de Excel **B3:C51 completo**, con **Pegar solo valores**.
No filtres filas ni copies solo celdas rellenas. No actives "omitir blancos":
si pegas encima de un individuo existente, los huecos deben borrar datos antiguos.
No copies desde un visor CSV que suprima lineas vacias.

En el TSV se usan punto decimal y tabuladores; Excel puede interpretarlo segun
la configuracion regional. El XLSX contiene numeros reales y evita ese problema.
