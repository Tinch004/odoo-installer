# Odoo Installer

Instalador y CLI de administracion para Odoo en Ubuntu 22.04 y Ubuntu 24.04.

El proyecto esta escrito completamente en Bash y mantiene una arquitectura modular: el instalador prepara Odoo y luego el servidor se administra con el comando `odoo`.

## Instalacion

```bash
git clone https://github.com/Tinch004/odoo-installer.git
cd odoo-installer
sudo bash install.sh
```

El instalador pregunta solamente la version:

```text
Seleccione la version
1) Odoo 18
2) Odoo 19
```

Si ya existe `/opt/odoo/odoo-bin`, permite actualizar, reinstalar o cancelar.

## Estructura del proyecto

```text
odoo-installer/
install.sh
README.md
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

## Estructura creada en el servidor

El repositorio oficial se clona directamente en `/opt/odoo`:

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

## CLI

Despues de instalar, administra Odoo con:

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
odoo git
odoo service
odoo fix-permissions
```

## Doctor

```bash
odoo doctor
odoo doctor --fix
```

`doctor` verifica PostgreSQL, Python, pip, virtualenv, servicio, puerto, configuracion, logs, permisos, Git, addons, sources, base de datos, Nginx, Cloudflare Tunnel y HTTPS si estan configurados.

`doctor --fix` intenta reparar permisos, virtualenv, pip, requirements, servicio, logs, PostgreSQL, configuracion, systemd, Nginx y Cloudflare Tunnel.

## Backups

Crear backup manual:

```bash
odoo backup
```

Los backups se guardan en:

```text
/opt/odoo/backups/YYYY-MM-DD_HH-MM.dump
```

Comandos:

```bash
odoo backup schedule
odoo backup list
odoo backup clean
odoo backup restore
odoo restore
```

`odoo backup schedule` permite elegir frecuencia diaria, semanal o mensual y crea automaticamente un cron en `/etc/cron.d/odoo-backup`.

## Cloudflare Tunnel

Configurar un Named Tunnel:

```bash
odoo tunnel install
```

Pregunta:

```text
Dominio: midominio.com
Subdominio [odoo]:
```

Si se presiona ENTER en subdominio, usa:

```text
https://odoo.midominio.com
```

Comandos:

```bash
odoo tunnel start
odoo tunnel stop
odoo tunnel restart
odoo tunnel status
odoo tunnel url
```

El tunnel usa `cloudflared`, `config.yml`, DNS automatico y un servicio systemd propio.

## Nginx

```bash
odoo nginx install
odoo nginx restart
odoo nginx uninstall
```

`odoo nginx install` instala Nginx, crea el virtualhost, configura `proxy_pass` hacia Odoo, habilita el sitio y reinicia el servicio.

## SSL

Si no se usa Cloudflare Tunnel:

```bash
odoo ssl install
odoo ssl renew
odoo ssl status
```

`odoo ssl install` instala Certbot, genera el certificado con Nginx y deja la renovacion automatica configurada por Certbot.

## Modulos desde Git

Instalar addons desde un repositorio:

```bash
odoo install-module https://github.com/OCA/web.git
```

El comando clona el repositorio, detecta todos los directorios con `__manifest__.py` o `__openerp__.py`, los copia dentro de `/opt/odoo/sources` y actualiza la lista de aplicaciones.

No instala automaticamente los modulos en la base de datos.

Listar modulos disponibles:

```bash
odoo list-modules
```

Muestra nombre, version, ruta y manifest encontrado.

## Ejemplos

```bash
odoo logs
odoo restart
odoo doctor
odoo doctor --fix
odoo backup
odoo backup schedule
odoo tunnel install
odoo tunnel start
odoo tunnel url
odoo nginx install
odoo ssl install
odoo install-module https://github.com/OCA/web.git
odoo list-modules
odoo info
```
