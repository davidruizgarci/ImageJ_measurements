# Abre este proyecto en RStudio y ejecuta source("ejecutar.R").
source(file.path("R", "roi_pipeline.R"), encoding = "UTF-8")
source(file.path("R", "export.R"), encoding = "UTF-8")
config_path <- Sys.getenv("IMAGEJ_CONFIG", "config/individuo.R")
if (!file.exists(config_path)) stop(
  "Copia config/individuo.example.R a config/individuo.R y configura tus archivos.")
source(config_path, encoding = "UTF-8")
resultado <- run_specimen(config)
