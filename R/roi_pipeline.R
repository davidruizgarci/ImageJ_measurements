# ImageJ straight and segmented/freehand line ROI -> reproducible morphometrics.
# All distances are derived from saved coordinates, never Results.csv.
require_tools <- function() {
  missing <- c("openxlsx", "magick")[!vapply(c("openxlsx", "magick"),
    requireNamespace, logical(1), quietly = TRUE)]
  if (length(missing)) stop("Instala primero: install.packages(c(",
    paste(sprintf('"%s"', missing), collapse = ", "), "))", call. = FALSE)
}

read_line_roi <- function(bytes, filename = "selection.roi") {
  if (is.character(bytes)) {
    con <- file(bytes, "rb"); on.exit(close(con))
    bytes <- readBin(con, "raw", n = file.info(bytes)$size)
  }
  if (!is.raw(bytes) || length(bytes) < 64 ||
      !identical(rawToChar(bytes[1:4]), "Iout"))
    stop("ROI corrupto o incompleto: ", filename, call. = FALSE)
  number <- function(offset, size, what = "integer", signed = TRUE) {
    if (offset + size > length(bytes)) stop("Cabecera ROI truncada: ", filename)
    readBin(bytes[(offset + 1):(offset + size)], what, n = 1,
      size = size, endian = "big", signed = signed)
  }
  type <- as.integer(bytes[7])
  if (number(4, 2, signed = FALSE) < 217 || !type %in% c(3L,4L,5L))
    stop("Solo se admiten ROI de LINEA (recta, segmentada o libre) modernos: ",
      filename, ". No usar areas ni angulos.", call. = FALSE)
  # Composite and specialized line subtypes must not be mistaken for distances.
  if (number(48, 2, signed = FALSE) != 0)
    stop("Subtipo ROI no admitido: ", filename, call. = FALSE)
  options <- number(50,2,signed=FALSE)
  if (type != 3L && bitwAnd(options,1L) != 0L)
    stop("Spline Fit no admitido: guardar linea segmentada sin suavizado: ",filename)
  if (type == 3L) {
    xy <- vapply(c(18,22,26,30),function(o) number(o,4,"numeric"),numeric(1))
    pts <- data.frame(x=xy[c(1,3)],y=xy[c(2,4)])
  } else {
    npts <- number(16,2,signed=FALSE)
    if (npts < 2 || npts > 65535 || 64+4*npts > length(bytes))
      stop("Coordenadas de trayectoria incompletas: ",filename)
    if (bitwAnd(options,128L) != 0L) {
      if (64+12*npts > length(bytes)) stop("Trayectoria subpixel truncada: ",filename)
      xx <- vapply(seq_len(npts),function(i) number(64+4*npts+4*(i-1),4,"numeric"),numeric(1))
      yy <- vapply(seq_len(npts),function(i) number(64+8*npts+4*(i-1),4,"numeric"),numeric(1))
    } else {
      xx <- vapply(seq_len(npts),function(i) number(64+2*(i-1),2,signed=FALSE),numeric(1))+number(10,2)
      yy <- vapply(seq_len(npts),function(i) number(64+2*npts+2*(i-1),2,signed=FALSE),numeric(1))+number(8,2)
    }
    pts <- data.frame(x=xx,y=yy)
    xy <- c(xx[1],yy[1],tail(xx,1),tail(yy,1))
  }
  if (any(!is.finite(as.matrix(pts)))) stop("Coordenadas ROI invalidas: ",filename)
  name <- tools::file_path_sans_ext(basename(filename))
  h2 <- number(60, 4)
  if (is.finite(h2) && h2 >= 64 && h2 + 24 <= length(bytes)) {
    pos <- number(h2 + 16, 4); n <- number(h2 + 20, 4)
    if (n > 0 && pos >= 64 && n <= 10000 && pos + n * 2 <= length(bytes)) {
      codes <- readBin(bytes[(pos + 1):(pos + n * 2)], "integer", n = n,
        size = 2, endian = "big", signed = FALSE)
      if (!any(codes >= 55296 & codes <= 57343)) name <- intToUtf8(codes)
    }
  }
  list(name = name, filename = filename, x1 = xy[1], y1 = xy[2],
    x2 = xy[3], y2 = xy[4], points=pts,type=type,
    geometry=if(type==3L) "Recta" else "Trayecto segmentado/libre sin spline",
    length_px = sum(sqrt(diff(pts$x)^2+diff(pts$y)^2)))
}

read_roi_zip <- function(path) {
  if (!file.exists(path)) stop("No existe ZIP: ", path, call. = FALSE)
  entries <- utils::unzip(path, list = TRUE)
  names <- entries$Name[grepl("\\.roi$", entries$Name, ignore.case = TRUE) &
    !grepl("(^|/)__MACOSX/", entries$Name)]
  if (!length(names)) stop("El ZIP no contiene ROI: ", path)
  if (anyDuplicated(names)) stop("Entradas duplicadas en ZIP: ", path)
  # Read members directly; no extraction, zip-slip or path traversal.
  result <- lapply(names, function(n) {
    size <- entries$Length[match(n, entries$Name)]
    if (size < 64 || size > 1e6) stop("Tamano ROI no valido: ", n)
    con <- unz(path, n, open = "rb"); on.exit(close(con))
    read_line_roi(readBin(con, "raw", n = size), n)
  })
  names(result) <- names
  result
}

roi_id <- function(name) {
  if (!grepl("^R[0-9]{2}($|[_ .-])", name))
    stop("ROI sin identificador Rxx valido: ", name, call. = FALSE)
  substr(name, 1, 3)
}

validate_geometry <- function(rois, width, height) {
  for (r in rois) {
    if (r$length_px <= 0) stop("Linea de longitud cero: ", r$name)
    if (any(r$points$x < 0 | r$points$x >= width) ||
        any(r$points$y < 0 | r$points$y >= height))
      stop("ROI fuera de la imagen: ", r$name, call. = FALSE)
  }
  invisible(TRUE)
}

read_view <- function(view, catalog) {
  needed <- c("name", "image", "rois", "calibration", "known_cm", "width", "height")
  if (!all(needed %in% names(view))) stop("Configuracion de vista incompleta")
  for (p in c(view$image, view$rois, view$calibration))
    if (!file.exists(p)) stop("No existe archivo: ", p, call. = FALSE)
  if (length(view$known_cm) != 1 || !is.finite(view$known_cm) || view$known_cm <= 0)
    stop("known_cm debe ser una distancia positiva confirmada")
  image <- magick::image_read(view$image)
  info <- magick::image_info(image)
  if (nrow(info) != 1) stop("Se requiere imagen unica, no pila: ", view$image)
  if (info$width != view$width || info$height != view$height)
    stop("Tamano/orientacion incorrectos para ", view$name, ": imagen ",
      info$width, "x", info$height, "; configurado ", view$width, "x", view$height)
  rois <- read_roi_zip(view$rois)
  cal <- read_line_roi(view$calibration, basename(view$calibration))
  if (cal$type != 3L) stop("La calibracion debe ser una linea recta.")
  validate_geometry(c(rois, list(cal)), view$width, view$height)
  ids <- vapply(rois, function(r) roi_id(r$name), character(1))
  if (anyDuplicated(ids)) stop("ID repetido en ", view$name, ": ",
    paste(unique(ids[duplicated(ids)]), collapse = ", "))
  if (any(!ids %in% catalog$id)) stop("ID desconocido: ",
    paste(ids[!ids %in% catalog$id], collapse = ", "))
  scale <- cal$length_px / view$known_cm
  rows <- data.frame(id = ids, view = view$name,
    roi = vapply(rois, function(r) r$name, character(1)),
    length_px = vapply(rois, function(r) r$length_px, numeric(1)),
    length_cm = vapply(rois, function(r) r$length_px / scale, numeric(1)),
    geometry = vapply(rois, function(r) r$geometry, character(1)),
    stringsAsFactors = FALSE)
  list(config = view, image = image, rois = rois, calibration = cal,
    px_per_cm = scale, rows = rows)
}

read_catalog <- function(path, template = NULL, sheet = 1) {
  catalog <- utils::read.csv(path, stringsAsFactors = FALSE,
    encoding = "UTF-8", check.names = FALSE)
  if (!all(c("id", "template_row", "measurement", "note") %in% names(catalog)) ||
      anyDuplicated(catalog$id) || anyDuplicated(catalog$template_row) ||
      !all(grepl("^R[0-9]{2}$", catalog$id)))
    stop("Catalogo invalido o con ID/filas duplicados")
  catalog <- catalog[order(catalog$template_row), ]
  if (!is.null(template)) {
    if (!file.exists(template)) stop("No existe plantilla: ", template)
    labels <- openxlsx::read.xlsx(template, sheet = sheet, cols = 1,
      rows = catalog$template_row, colNames = FALSE,
      skipEmptyRows = FALSE, skipEmptyCols = FALSE)
    if (nrow(labels) != nrow(catalog) ||
        !identical(enc2utf8(trimws(as.character(labels[[1]]))),
          enc2utf8(trimws(catalog$measurement))))
      stop("El orden/nombres de la plantilla no coincide con el catalogo. ",
        "Actualizar el catalogo explicitamente; no pegar resultados desplazados.")
  }
  catalog
}

merge_views <- function(views, catalog, tl_source, preferences = character()) {
  all <- do.call(rbind, lapply(views, function(v) v$rows))
  selected <- all[FALSE, ]
  for (id in unique(all$id)) {
    candidates <- all[all$id == id, ]
    if (nrow(candidates) > 1) {
      chosen <- unname(preferences[id])
      if (length(chosen) != 1 || is.na(chosen) || sum(candidates$view == chosen) != 1)
        stop("Medida ", id, " en varias vistas. Define preferred_views['", id,
          "'] explicitamente; no se promedian medidas.")
      candidates <- candidates[candidates$view == chosen, ]
    }
    selected <- rbind(selected, candidates)
  }
  tl <- all[all$id == tl_source$id & all$view == tl_source$view, "length_cm"]
  if (length(tl) != 1 || !is.finite(tl) || tl <= 0)
    stop("Falta longitud total de referencia ", tl_source$view, "/", tl_source$id)
  format_rows <- function(obs) {
    m <- match(catalog$id, obs$id)
    note <- catalog$note
    available <- !is.na(m)
    note[available] <- paste0(note[available],
      ifelse(nzchar(note[available])," | ",""),"Metodo: ",obs$geometry[m[available]])
    data.frame(id = catalog$id, measurement = catalog$measurement,
      view = obs$view[m], length_cm = obs$length_cm[m],
      percent_TL = obs$length_cm[m] / tl * 100,
      length_px = obs$length_px[m], note = note,
      stringsAsFactors = FALSE)
  }
  list(all = all, combined = format_rows(selected),
    separate = lapply(views, function(v) format_rows(v$rows)), tl_cm = tl)
}

draw_preview <- function(view, directory) {
  cfg <- view$config; w <- cfg$width; h <- cfg$height
  size <- max(14, round(w / 100)); ids <- view$rows$id
  # Original image pixels remain at their original (x,y); add a legend to the right.
  panel <- round(w * 0.55)
  canvas <- magick::image_extent(view$image, paste0(w + panel, "x", h),
    gravity = "west", color = "white")
  draw <- magick::image_draw(canvas, pointsize = size)
  tryCatch({
    graphics::text(w + 25, h * .035, cfg$name, adj = c(0, .5), col = "#273E50")
    ys <- seq(h * .09, h * .88, length.out = length(view$rois))
    for (i in seq_along(view$rois)) {
      r <- view$rois[[i]]
      graphics::lines(r$points$x, r$points$y, col = "#00FFFF", lwd = 2)
      graphics::points(c(r$x1, r$x2), c(r$y1, r$y2),
        pch = 16, col = "#00FFFF", cex = .45)
      mx <- (r$x1 + r$x2) / 2; my <- (r$y1 + r$y2) / 2
      if(nrow(r$points)>2) {
        j<-ceiling(nrow(r$points)/2);mx<-r$points$x[j];my<-r$points$y[j]
      }
      graphics::segments(mx, my, w + 20, ys[i], col = "#AAAAAA", lwd = .5)
      label <- paste(ids[i], gsub("_", " ",
        sub("^R[0-9]{2}[_ .-]*", "", r$name)))
      label <- gsub("\\b(REVIEW|VISIBLE)\\b *", "", label)
      if(r$type!=3L) label<-paste(label,"(trayecto)")
      label <- paste(strwrap(label, width = 43), collapse = "\n")
      graphics::text(w + 30, ys[i], label, adj = c(0, .5), col = "#17374D")
    }
    graphics::text(w + 25, h * .95, sprintf("%.6f px/cm; ROI guardados", view$px_per_cm),
      adj = c(0, .5), col = "#555555")
  }, finally = grDevices::dev.off())
  magick::image_write(draw, file.path(directory, paste0(cfg$name, "_preview.png")),
    format = "png")
  cal_draw <- magick::image_draw(view$image, pointsize = size)
  tryCatch({
    r <- view$calibration
    graphics::segments(r$x1, r$y1, r$x2, r$y2, col = "#00FFFF", lwd = 3)
    graphics::points(c(r$x1, r$x2), c(r$y1, r$y2), pch = 16, col = "red")
    graphics::text(20, h * .035,
      sprintf("Referencia: %.8f px = %.2f cm", r$length_px, cfg$known_cm),
      adj = c(0, .5), col = "#00FFFF")
  }, finally = grDevices::dev.off())
  magick::image_write(cal_draw, file.path(directory,
    paste0(cfg$name, "_calibracion.png")), format = "png")
}
