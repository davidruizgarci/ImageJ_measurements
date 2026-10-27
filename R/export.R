# Public entry point: run_specimen(config).
# Some openxlsx versions emit relationships to absent, unused drawing parts.
# These freshly authored workbooks contain no drawings: strip those empty
# declarations so Excel and strict XLSX readers see a self-consistent archive.
clean_unused_drawings <- function(path) {
  directory <- tempfile("xlsx_parts_"); dir.create(directory)
  on.exit(unlink(directory, recursive = TRUE))
  utils::unzip(path, exdir = directory)
  rels <- list.files(file.path(directory,"xl","worksheets","_rels"),
    pattern = "\\.rels$", full.names = TRUE)
  for (p in rels) {
    txt <- paste(readLines(p, warn = FALSE, encoding = "UTF-8"), collapse = "")
    txt <- gsub('<Relationship[^>]*Type="[^"]*/(drawing|vmlDrawing)"[^>]*/>',
      "", txt, perl = TRUE)
    writeLines(txt, p, useBytes = TRUE)
  }
  p <- file.path(directory,"[Content_Types].xml")
  txt <- paste(readLines(p, warn = FALSE, encoding = "UTF-8"), collapse = "")
  txt <- gsub('<Override PartName="/xl/drawings/[^"]*"[^>]*/>', "", txt, perl = TRUE)
  writeLines(txt, p, useBytes = TRUE)
  target <- tempfile(fileext = ".xlsx")
  zip::zipr(target, list.files(directory, full.names = TRUE, all.files = TRUE,
    no.. = TRUE), root = directory)
  if (!file.copy(target,path,overwrite=TRUE)) stop("No se pudo finalizar XLSX")
  unlink(target)
}
write_measurement_excel <- function(path, rows, views, specimen_id, tl_cm) {
  wb <- openxlsx::createWorkbook(creator = "ImageJ_measurements")
  dark <- openxlsx::createStyle(fontName = "Arial", fontSize = 10,
    fontColour = "white", fgFill = "#273E50", textDecoration = "bold",
    halign = "center", valign = "center")
  title <- openxlsx::createStyle(fontName = "Arial", fontSize = 15,
    textDecoration = "bold")
  num <- openxlsx::createStyle(numFmt = "0.00", halign = "right")
  px <- openxlsx::createStyle(numFmt = "0.000", halign = "right")
  body <- openxlsx::createStyle(fontName = "Arial", fontSize = 10,
    valign = "center")
  openxlsx::addWorksheet(wb, "Medidas", gridLines = FALSE)
  openxlsx::writeData(wb, "Medidas", paste(specimen_id, "- Morfometria"),
    startRow = 2, colNames = FALSE)
  openxlsx::addStyle(wb, "Medidas", title, rows = 2, cols = 1)
  openxlsx::writeData(wb, "Medidas",
    sprintf("cm y %%TL; TL de referencia = %.2f cm. Reejecutar R tras guardar cambios de ROI.", tl_cm),
    startRow = 3, colNames = FALSE)
  headers <- c("ID", "Medida", "Vista", "Longitud (cm)", "% TL", "Longitud (px)",
    "Observaciones")
  names(rows) <- headers
  openxlsx::writeData(wb, "Medidas", rows, startRow = 5, keepNA = FALSE)
  n <- nrow(rows)
  openxlsx::addStyle(wb, "Medidas", body, rows = 6:(5 + n),
    cols = 1:7, gridExpand = TRUE)
  openxlsx::addStyle(wb, "Medidas", dark, rows = 5, cols = 1:7, gridExpand = TRUE)
  openxlsx::addStyle(wb, "Medidas", num, rows = 6:(5 + n), cols = 4:5,
    gridExpand = TRUE, stack = TRUE)
  openxlsx::addStyle(wb, "Medidas", px, rows = 6:(5 + n), cols = 6,
    gridExpand = TRUE, stack = TRUE)
  openxlsx::setColWidths(wb, "Medidas", 1:7, c(8, 43, 13, 18, 12, 18, 78))
  wrap <- openxlsx::createStyle(wrapText = TRUE, valign = "center")
  openxlsx::addStyle(wb, "Medidas", wrap, rows = 6:(5 + n), cols = 7, stack = TRUE)
  openxlsx::setRowHeights(wb, "Medidas", 6:(5 + n),
    ifelse(nchar(ifelse(is.na(rows[[7]]), "", rows[[7]])) > 70, 42, 23))
  openxlsx::freezePane(wb, "Medidas", firstActiveRow = 6)

  # Exactly the original template order: row 3..51, columns B:C, no compressed gaps.
  openxlsx::addWorksheet(wb, "Copiar_dataset", gridLines = FALSE)
  openxlsx::writeData(wb, "Copiar_dataset", matrix(c("", specimen_id, specimen_id,
    "Medida", "cm", "%TL"), nrow = 2, byrow = TRUE), colNames = FALSE)
  block <- data.frame(Medida = rows[[2]], cm = round(rows[[4]], 2),
    percent = round(rows[[5]], 2))
  openxlsx::writeData(wb, "Copiar_dataset", block, startRow = 3,
    colNames = FALSE, keepNA = FALSE)
  openxlsx::addStyle(wb, "Copiar_dataset", dark, rows = 1:2, cols = 1:3,
    gridExpand = TRUE)
  openxlsx::addStyle(wb, "Copiar_dataset", num, rows = 3:(n + 2), cols = 2:3,
    gridExpand = TRUE)
  openxlsx::setColWidths(wb, "Copiar_dataset", 1:3, c(46, 18, 18))
  openxlsx::freezePane(wb, "Copiar_dataset", firstActiveRow = 3)

  openxlsx::addWorksheet(wb, "Calibracion", gridLines = FALSE)
  cal <- do.call(rbind, lapply(views, function(v) data.frame(
    Vista = v$config$name, Imagen = basename(v$config$image),
    Referencia_px = v$calibration$length_px, Referencia_cm = v$config$known_cm,
    Escala_px_por_cm = v$px_per_cm, Anchura_px = v$config$width,
    Altura_px = v$config$height)))
  openxlsx::writeData(wb, "Calibracion", cal, startRow = 4)
  openxlsx::addStyle(wb, "Calibracion", dark, rows = 4, cols = 1:7,
    gridExpand = TRUE)
  openxlsx::addStyle(wb, "Calibracion",
    openxlsx::createStyle(numFmt = "0.000000"), rows = 5:(4 + nrow(cal)),
    cols = c(3, 5), gridExpand = TRUE)
  openxlsx::setColWidths(wb, "Calibracion", 1:7, c(14, 48, 22, 22, 24, 18, 18))
  notes <- data.frame(
    Campo = c("Pegado", "Porcentajes", "Orden y unidades", "Ausencias",
      "Fuente unica", "Precision", "Vista ventral"),
    Explicacion = c(
      sprintf("Copiar_dataset!B3:C%d -> pegar solo valores desde fila 3 del dataset.", n + 2),
      "%TL usa numeros 0-100: 100.00 representa 100%, igual que Measurements.xlsx.",
      "Etiquetas y orden de la plantilla; unidades cm en cabecera, aunque la primera etiqueta original diga mm.",
      "Medidas no disponibles quedan vacias, nunca cero. No borrar sus filas.",
      "Solo coordenadas guardadas en ZIP y calibracion ROI. Results.csv no se utiliza.",
      "Sin redondeo intermedio; bloque para pegar redondeado a dos decimales.",
      "Comparte la TL dorsal de referencia; usa su propia escala en cm."))
  openxlsx::writeData(wb, "Calibracion", notes, startRow = 10)
  openxlsx::addStyle(wb, "Calibracion", wrap, rows = 11:17, cols = 2)
  openxlsx::setRowHeights(wb, "Calibracion", 11:17, 42)
  openxlsx::saveWorkbook(wb, path, overwrite = FALSE)
  clean_unused_drawings(path)
}

run_specimen <- function(config) {
  require_tools()
  if (!grepl("^[A-Za-z0-9][A-Za-z0-9_.-]*$", config$specimen_id))
    stop("specimen_id: usar letras, numeros, punto, guion o guion bajo")
  catalog <- read_catalog(config$catalog, config$template, config$template_sheet)
  if (!is.null(config$notes)) {
    if (any(!names(config$notes) %in% catalog$id)) stop("ID desconocido en notes")
    catalog$note[match(names(config$notes), catalog$id)] <- unname(config$notes)
  }
  if (!length(config$views)) stop("Configura al menos una vista")
  view_names <- vapply(config$views, function(v) v$name, character(1))
  if (anyDuplicated(view_names) || any(!grepl("^[A-Za-z][A-Za-z0-9_-]*$", view_names)))
    stop("Nombres de vista invalidos o repetidos")
  views <- lapply(config$views, read_view, catalog = catalog)
  merged <- merge_views(views, catalog, config$tl_source, config$preferred_views)
  # All validation happens before outputs are created.
  dir.create(config$output_dir, recursive = TRUE, showWarnings = FALSE)
  stamp <- format(Sys.time(), "%Y%m%d_%H%M%S")
  directory <- file.path(config$output_dir, paste0(config$specimen_id, "_", stamp))
  if (dir.exists(directory)) directory <- tempfile(paste0(config$specimen_id, "_"), config$output_dir)
  dir.create(directory)
  write_measurement_excel(file.path(directory, paste0(config$specimen_id, "_combinado.xlsx")),
    merged$combined, views, config$specimen_id, merged$tl_cm)
  for (i in seq_along(views)) {
    v <- views[[i]]
    write_measurement_excel(file.path(directory,
      paste0(config$specimen_id, "_", v$config$name, ".xlsx")),
      merged$separate[[i]], views, config$specimen_id, merged$tl_cm)
    draw_preview(v, directory)
    # Copy the exact ROI inputs and calibration used for this export.
    file.copy(v$config$rois, file.path(directory,
      paste0(v$config$name, "_ROIs_utilizados.zip")), overwrite = FALSE)
    file.copy(v$config$calibration, file.path(directory,
      paste0(v$config$name, "_calibracion_utilizada.roi")), overwrite = FALSE)
  }
  utils::write.csv(merged$combined, file.path(directory, "medidas_auditables.csv"),
    row.names = FALSE, na = "", fileEncoding = "UTF-8")
  # A header-free TSV preserves all 49 rows including completely blank pairs.
  block <- merged$combined[c("length_cm", "percent_TL")]
  block[] <- lapply(block, function(x) ifelse(is.na(x), "", sprintf("%.2f", x)))
  utils::write.table(block, file.path(directory, "pegar_dataset.tsv"),
    sep = "\t", row.names = FALSE, col.names = FALSE, quote = FALSE,
    fileEncoding = "UTF-8", eol = "\n")
  input_files <- unique(c(config$catalog, config$template, unlist(lapply(
    config$views, function(v) c(v$image, v$rois, v$calibration)))))
  input_files <- input_files[!is.na(input_files) & nzchar(input_files)]
  manifest <- data.frame(archivo = normalizePath(input_files, winslash = "/"),
    md5 = unname(tools::md5sum(input_files)))
  utils::write.csv(manifest, file.path(directory, "manifest_entradas.csv"),
    row.names = FALSE, fileEncoding = "UTF-8")
  dput(config, file.path(directory, "configuracion_utilizada.R"))
  writeLines(capture.output(utils::sessionInfo()), file.path(directory, "sessionInfo.txt"))
  message("Exportacion terminada: ", normalizePath(directory, winslash = "/"),
    "\nCopiar desde Copiar_dataset!B3:C", nrow(catalog) + 2,
    " del Excel combinado y pegar solo valores.")
  invisible(list(directory = directory, rows = merged$combined, views = views))
}
