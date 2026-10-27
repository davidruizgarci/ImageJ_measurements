# Copiar como config/individuo.R (excluido de Git).
# Rutas absolutas con /; no hace falta instalar paquetes de lectura de ROI.
carpeta <- "C:/ruta/al/individuo"
config <- list(
  specimen_id = "Individuo_001",
  catalog = "config/medidas.csv",
  template = "C:/ruta/al/Measurements.xlsx",  # NULL permite usar solo el catalogo
  template_sheet = 1,
  output_dir = file.path(carpeta, "exportaciones"),
  tl_source = list(view = "Dorsal", id = "R03"),
  # Si una medida aparece en ambas vistas, elegir explicitamente. No se promedia.
  preferred_views = c(R03 = "Dorsal"),
  notes = character(),
  views = list(
    list(name = "Dorsal",
      image = file.path(carpeta, "dorsal.tif"),
      rois = file.path(carpeta, "dorsal_ROIs.zip"),
      calibration = file.path(carpeta, "dorsal_14cm.roi"),
      known_cm = 14, width = 1536, height = 2048),
    list(name = "Ventral",
      image = file.path(carpeta, "ventral.tif"),
      rois = file.path(carpeta, "ventral_ROIs.zip"),
      calibration = file.path(carpeta, "ventral_14cm.roi"),
      known_cm = 14, width = 3000, height = 4000)
  )
)
