# Odoo Installer

Instalador y CLI de administracion para Odoo en Ubuntu 22.04 y Ubuntu 24.04.

La version 1.1 mejora el instalador existente: chequeos previos, perfiles de dependencias, clonado rapido, mejor soporte WSL, limpieza automatica e instalacion mas liviana.

## Requisitos

- Ubuntu 22.04 o Ubuntu 24.04
- Usuario con `sudo`
- Conexion a Internet
- 5 GB libres como minimo
- 8 GB libres recomendados
- 2 GB RAM como minimo practico

El instalador verifica sistema operativo, arquitectura, RAM, disco, Internet, Git, Python, PostgreSQL y WSL antes de comenzar.

## Instalacion

```bash
git clone https://github.com/Tinch004/odoo-installer.git
cd odoo-installer
sudo bash install.sh
```

Durante la instalacion se pregunta:

```text
Seleccione la version
1) Odoo 18
2) Odoo 19

Instalacion
1) Minima (recomendada)
2) Completa

Clonado
1) Rapido (depth=1)
2) Completo
```

## Instalacion minima

Es la opcion recomendada. Instala solo lo necesario para ejecutar y desarrollar Odoo:

- Python, pip y venv
- PostgreSQL
- Git
- Librerias de compilacion necesarias para `requirements.txt`
- Librerias base usadas por dependencias Python de Odoo

## Instalacion completa

Incluye todo lo anterior y agrega herramientas opcionales:

- `wkhtmltopdf`
- `npm`
- `node-less`
- `rtlcss`
- utilidades adicionales como `unzip`, `wget`, `xz-utils`

Usa esta opcion si necesitas reportes PDF, assets avanzados o herramientas extra del entorno Odoo.

## Clonado

El modo rapido usa:

```bash
git clone --depth 1 --branch VERSION https://github.com/odoo/odoo.git /opt/odoo
```

El modo completo conserva todo el historial Git:

```bash
git clone --branch VERSION https://github.com/odoo/odoo.git /opt/odoo
```

## WSL

El instalador detecta WSL automaticamente. No cancela la instalacion, pero muestra una advertencia porque algunas funciones de `systemd` pueden requerir configuracion adicional.

Si systemd no esta disponible, el instalador crea los archivos necesarios y omite las acciones de `systemctl` que no pueden ejecutarse.

## Estructura del proyecto

```text
odoo-installer/
install.sh
README.md
CHANGELOG.md
LICENSE
.gitignore

lib/
    colors.sh
    utils.sh
    dependencies.sh
    odoo.sh
    postgres.sh
    config.sh
    service.sh
    cli.sh
    tunnel.sh
    nginx.sh
    ssl.sh
    modules.sh
    doctor.sh
    backup.sh
    info.sh

templates/
    odoo.conf
    odoo.service
```

## Estructura generada

```text
/opt/odoo
addons
odoo
odoo-bin
requirements.txt
setup.py
...
sources
venv
data
backups
```

Tambien se crean:

```text
/etc/odoo.conf
/etc/systemd/system/odoo.service
/var/log/odoo/odoo.log
/usr/local/bin/odoo
/usr/local/lib/odoo-installer/
```

## Instalacion existente

Si ya existe `/opt/odoo/odoo-bin`, el instalador ofrece:

```text
1) Actualizar
2) Reinstalar
3) Cancelar
```

Actualizar ejecuta `git pull` y reinstala `requirements.txt`.

Reinstalar elimina solamente `/opt/odoo` y vuelve a instalar.

## Limpieza automatica

Al finalizar se ejecuta:

```bash
apt autoremove -y
apt clean
pip cache purge
```

Tambien se eliminan temporales propios del instalador.

## Comandos disponibles

Despues de instalar, usa:

```bash
odoo help
```

Comandos principales:

```bash
odoo start
odoo stop
odoo restart
odoo status
odoo logs
odoo shell
odoo config
odoo version
odoo info
odoo update
odoo update-module sale
odoo backup
odoo backup schedule
odoo backup list
odoo backup clean
odoo backup restore
odoo restore
odoo git
odoo service
odoo fix-permissions
odoo doctor
odoo doctor --fix
odoo install-module https://github.com/OCA/web.git
odoo list-modules
```

La CLI conserva comandos opcionales existentes para Nginx, SSL y Cloudflare Tunnel, pero la release 1.1 se enfoca en mejorar el instalador base.

## Preguntas frecuentes

### Que perfil debo usar?

Usa `Minima` salvo que necesites herramientas opcionales como `wkhtmltopdf`, `npm`, `node-less` o `rtlcss`.

### Que clonado debo usar?

Usa `Rapido` para instalaciones normales. Usa `Completo` si necesitas historial Git completo.

### Puedo ejecutar el instalador mas de una vez?

Si. La instalacion es idempotente: detecta una instalacion existente, evita duplicar reglas de PostgreSQL y reemplaza archivos de servicio/configuracion de forma controlada.

### Que pasa con poco espacio libre?

Con menos de 8 GB muestra advertencia. Con menos de 5 GB cancela antes de descargar Odoo.

### Funciona en WSL?

Puede funcionar, pero systemd debe estar habilitado para usar el servicio `odoo` con normalidad. Si systemd no esta disponible, el instalador informa la situacion y omite esas acciones.

### Donde estan los logs?

```text
/var/log/odoo/odoo.log
```

Tambien puedes verlos con:

```bash
odoo logs
```
