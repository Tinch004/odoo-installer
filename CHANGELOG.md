# Changelog

## v1.1 - Refactor del instalador

### Mejoras

- Agregado chequeo previo del sistema antes de instalar.
- Verificacion de Ubuntu 22.04/24.04, arquitectura, RAM, espacio libre, Internet, Git, Python, PostgreSQL y WSL.
- Agregados perfiles de instalacion:
  - Minima: dependencias esenciales para ejecutar y desarrollar Odoo.
  - Completa: herramientas opcionales como `wkhtmltopdf`, `npm`, `node-less` y `rtlcss`.
- Agregado modo de clonado:
  - Rapido con `--depth 1`.
  - Completo con historial Git.
- Agregada validacion de espacio libre antes de descargar Odoo.
- Advertencia con menos de 8 GB libres.
- Cancelacion con menos de 5 GB libres.
- Mejorada deteccion de WSL sin cancelar la instalacion.
- Mejorada deteccion de home del usuario que ejecuta `sudo`.
- Agregada limpieza automatica al finalizar:
  - `apt autoremove -y`
  - `apt clean`
  - `pip cache purge`
- Agregada numeracion y hora en los pasos principales.
- Mejorados mensajes de error con comando, linea y recomendaciones.
- Mejorada idempotencia de servicios y configuracion.
- Mejorado comportamiento cuando systemd no esta disponible.

### Mantenimiento

- Dependencias separadas en listas minima y completa.
- Rutas y comandos nuevos centralizados en `lib/config.sh`.
- Reutilizacion de helpers existentes para systemd, PostgreSQL y validaciones.
- README actualizado con requisitos, perfiles, WSL, estructura, comandos y FAQ.
