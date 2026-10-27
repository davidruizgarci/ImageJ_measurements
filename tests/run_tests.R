source("R/roi_pipeline.R", encoding = "UTF-8")
source("R/export.R", encoding = "UTF-8")
require_tools()
tmp <- tempfile("roi_tests_"); dir.create(tmp)
expect_error <- function(expr, pattern) {
  e <- tryCatch({ force(expr); NULL }, error = identity)
  stopifnot(inherits(e, "error"), grepl(pattern, conditionMessage(e)))
}
# Synthetic ROIs use ImageJ's documented big-endian header. No specimen data.
make_roi <- function(path, xy, type = 3L) {
  b <- raw(64); b[1:4] <- charToRaw("Iout")
  put <- function(offset, value, size, numeric = FALSE) {
    con <- rawConnection(raw(), "wb")
    writeBin(if (numeric) as.double(value) else as.integer(value), con,
      size = size, endian = "big")
    value_raw <- rawConnectionValue(con); close(con)
    b[(offset + 1):(offset + length(value_raw))] <<- value_raw
  }
  put(4, 228, 2); b[7] <- as.raw(type)
  for (i in 1:4) put(c(18,22,26,30)[i], xy[i], 4, TRUE)
  writeBin(b, path); invisible(path)
}
# openxlsx depends on zip, which supplies the portable ZIP writer.
zip_rois <- function(path, roi_paths) {
  zip::zipr(zipfile = path, files = roi_paths, root = dirname(roi_paths[1]))
}
a <- make_roi(file.path(tmp, "R03_Total_length.roi"), c(10.5,20.25,70.5,100.25))
b <- make_roi(file.path(tmp, "R20_Preoral.roi"), c(20,30,32,46))
cal <- make_roi(file.path(tmp, "calibration.roi"), c(10,10,70,90))
stopifnot(abs(read_line_roi(a)$length_px - 100) < 1e-10)
stopifnot(read_line_roi(a)$x1 == 10.5)
expect_error(read_line_roi(raw(10)), "corrupto")
bad <- make_roi(file.path(tmp, "polygon.roi"), c(1,1,2,2), 0L)
expect_error(read_line_roi(bad), "LINEA")
zero <- make_roi(file.path(tmp, "zero.roi"), c(1,1,1,1))
expect_error(validate_geometry(list(read_line_roi(zero)), 120,120), "longitud cero")
expect_error(validate_geometry(list(read_line_roi(a)), 40,40), "fuera")
za <- file.path(tmp, "dorsal.zip"); zip_rois(za, a)
zb <- file.path(tmp, "ventral.zip"); zip_rois(zb, b)
dup_dir <- file.path(tmp, "dup"); dir.create(dup_dir)
a2 <- file.copy(a, file.path(dup_dir, "R03_second.roi"))
dupzip <- file.path(tmp, "duplicates.zip")
zip::zipr(dupzip, c(a, file.path(dup_dir, "R03_second.roi")), root = tmp)
image <- file.path(tmp, "image.png")
magick::image_write(magick::image_blank(120,120,"#DDDDDD"), image)
catalog <- read_catalog("config/medidas.csv")
v <- list(name = "Dorsal", image = image, rois = za,
  calibration = cal, known_cm = 10, width = 120, height = 120)
vv <- v; vv$name <- "Ventral"; vv$rois <- zb
view <- read_view(v, catalog); stopifnot(view$px_per_cm == 10)
wrong <- v; wrong$width <- 121
expect_error(read_view(wrong, catalog), "Tamano/orientacion")
wrong <- v; wrong$rois <- dupzip
expect_error(read_view(wrong, catalog), "ID repetido")
cfg <- list(specimen_id = "Synthetic", catalog = "config/medidas.csv",
  template = NULL, template_sheet = 1, output_dir = file.path(tmp,"exports"),
  tl_source = list(view = "Dorsal", id = "R03"), preferred_views = character(),
  notes = character(), views = list(v, vv))
out <- run_specimen(cfg)
stopifnot(nrow(out$rows) == 49, out$rows$length_cm[1] == 10,
  out$rows$percent_TL[1] == 100)
j <- match("R20", out$rows$id)
stopifnot(out$rows$length_cm[j] == 2, out$rows$percent_TL[j] == 20,
  is.na(out$rows$length_cm[2]))
xlsx <- file.path(out$directory,"Synthetic_combinado.xlsx")
parts <- utils::unzip(xlsx,list=TRUE)$Name
stopifnot(!any(grepl("printerSettings.*\\.bin$",parts)))
stopifnot(!any(grepl("xl/worksheets/_rels/",parts,fixed=TRUE)))
stopifnot(!any(grepl("/$",parts)))
block <- openxlsx::read.xlsx(xlsx, sheet = "Copiar_dataset",
  rows = 3:51, cols = 1:3, colNames = FALSE, skipEmptyRows = FALSE)
stopifnot(nrow(block) == 49, block[[2]][1] == 10, block[[3]][1] == 100,
  block[[2]][j] == 2, is.na(block[[2]][2]),
  identical(as.character(block[[1]]), catalog$measurement))
tsv <- readLines(file.path(out$directory,"pegar_dataset.tsv"))
stopifnot(length(tsv) == 49, tsv[2] == "\t", tsv[1] == "10.00\t100.00")
stopifnot(all(file.exists(file.path(out$directory, c(
  "Synthetic_Dorsal.xlsx", "Synthetic_Ventral.xlsx",
  "Dorsal_preview.png", "Ventral_preview.png", "manifest_entradas.csv")))))
info <- magick::image_info(magick::image_read(file.path(out$directory,"Dorsal_preview.png")))
stopifnot(info$width > 120, info$height == 120)
png_signature <- readBin(file.path(out$directory,"Dorsal_preview.png"),"raw",8)
stopifnot(identical(png_signature,as.raw(c(137,80,78,71,13,10,26,10))))
# Changing calibration doubles all lengths, not percentages.
v$known_cm <- 20; cfg$views <- list(v,vv)
out2 <- run_specimen(cfg)
stopifnot(out2$rows$length_cm[1] == 20, out2$rows$percent_TL[1] == 100,
  out2$rows$length_cm[j] == 2, out2$rows$percent_TL[j] == 10)
# Duplicate across views requires explicit choice, never averages.
same <- read_view(v,catalog); same$config$name <- "Other"
same$rows$view <- "Other"
expect_error(merge_views(list(view,same),catalog,cfg$tl_source), "varias vistas")
ok <- merge_views(list(view,same),catalog,cfg$tl_source,c(R03="Dorsal"))
stopifnot(ok$combined$length_cm[1] == 10)
# Unknown measurement IDs, wrong template order and absent TL are rejected.
unknown <- make_roi(file.path(tmp,"R99_unknown.roi"), c(1,1,5,5))
uz <- file.path(tmp,"unknown.zip"); zip_rois(uz,unknown)
wrong <- v; wrong$rois <- uz
expect_error(read_view(wrong,catalog), "ID desconocido")
bad_template <- file.path(tmp,"wrong_template.xlsx")
openxlsx::write.xlsx(data.frame(V1=rev(catalog$measurement)),bad_template,
  startRow=3,colNames=FALSE)
expect_error(read_catalog("config/medidas.csv",bad_template), "no coincide")
expect_error(merge_views(list(read_view(vv,catalog)),catalog,cfg$tl_source), "Falta longitud total")
make_poly <- function(path, points, subpixel=FALSE, spline=FALSE) {
  n <- nrow(points); h2 <- 64+if(subpixel)12*n else 4*n
  buf <- raw(h2)
  put <- function(offset,value,size,numeric=FALSE) {
    con<-rawConnection(raw(),"wb");writeBin(if(numeric)as.double(value) else as.integer(value),
      con,size=size,endian="big");r<-rawConnectionValue(con);close(con)
    buf[(offset+1):(offset+length(r))]<<-r
  }
  buf[1:4]<-charToRaw("Iout");put(4,228,2);buf[7]<-as.raw(5)
  left<-floor(min(points[,1]));top<-floor(min(points[,2]))
  put(8,top,2);put(10,left,2);put(16,n,2)
  put(50,if(subpixel)128+as.integer(spline) else as.integer(spline),2)
  put(64,floor(points[,1])-left,2);put(64+2*n,floor(points[,2])-top,2)
  if(subpixel){put(64+4*n,points[,1],4,TRUE);put(64+8*n,points[,2],4,TRUE)}
  writeBin(buf,path);path
}
pts<-rbind(c(10.5,20.25),c(40.5,20.25),c(40.5,60.25))
poly<-make_poly(file.path(tmp,"R20_segmented.roi"),pts,TRUE)
pr<-read_line_roi(poly)
stopifnot(pr$length_px==70,nrow(pr$points)==3,pr$points$x[1]==10.5)
freebytes<-readBin(poly,"raw",file.info(poly)$size);freebytes[7]<-as.raw(4)
stopifnot(read_line_roi(freebytes,"R20_freehand.roi")$length_px==70)
integer_poly<-make_poly(file.path(tmp,"R20_integer.roi"),round(pts))
stopifnot(read_line_roi(integer_poly)$length_px==70)
smooth<-make_poly(file.path(tmp,"R20_smooth.roi"),pts,TRUE,TRUE)
expect_error(read_line_roi(smooth),"Spline Fit")
outside<-make_poly(file.path(tmp,"R20_outside.roi"),rbind(c(1,1),c(130,1),c(2,2)))
expect_error(validate_geometry(list(read_line_roi(outside)),120,120),"fuera")
pz<-file.path(tmp,"poly.zip");zip_rois(pz,poly)
polyview<-vv;polyview$rois<-pz
pv<-read_view(polyview,catalog)
stopifnot(pv$rows$length_cm==7)
wrongcal<-v;wrongcal$calibration<-poly
expect_error(read_view(wrongcal,catalog),"calibracion debe")
merged_poly<-merge_views(list(view,pv),catalog,cfg$tl_source)
stopifnot(merged_poly$combined$length_cm[j]==7,
  merged_poly$combined$percent_TL[j]==70,
  grepl("Trayecto",merged_poly$combined$note[j]))
message("Todas las pruebas sinteticas han pasado. Salidas de prueba: ",tmp)
