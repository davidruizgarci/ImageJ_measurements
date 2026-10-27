# Ejecutar una sola vez en la consola de RStudio.
paquetes <- c("openxlsx", "magick")
faltan <- paquetes[!vapply(paquetes, requireNamespace, logical(1), quietly = TRUE)]
if (length(faltan)) install.packages(faltan, repos = "https://cloud.r-project.org")
message("Dependencias disponibles. Ejecuta source('ejecutar.R').")
