# Odoo Installer

Instalador profesional y modular para Odoo en Linux, escrito completamente en Bash.

Soporta Ubuntu 22.04 y Ubuntu 24.04.

## Instalacion

```bash
git clone https://github.com/tu-usuario/odoo-installer.git
cd odoo-installer
sudo bash install.sh
```

El instalador pregunta solamente la version de Odoo:

```text
Seleccione la versión
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

templates/
    odoo.conf
    odoo.service
```

## Estructura creada en el servidor

El repositorio oficial de Odoo se clona directamente en `/opt/odoo`:

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
```

Tambien crea:

```text
/etc/odoo.conf
/etc/systemd/system/odoo.service
/var/log/odoo/odoo.log
/usr/local/bin/odoo
```

## Servicio

El servicio se ejecuta con el usuario que invoco `sudo`, usando:

```text
ExecStart=/opt/odoo/venv/bin/python /opt/odoo/odoo-bin -c /etc/odoo.conf
```

El instalador ejecuta automaticamente:

```bash
systemctl daemon-reload
systemctl enable odoo
systemctl restart odoo
```

## CLI de administracion

Despues de instalar, el sistema queda con el comando:

```bash
odoo
```

Comandos disponibles:

```bash
odoo start
odoo stop
odoo restart
odoo status
odoo logs
odoo shell
odoo config
odoo version
odoo update
odoo update-module sale
odoo backup
odoo restore
odoo git
odoo service
odoo fix-permissions
odoo doctor
```

Ejemplos:

```bash
odoo logs
odoo restart
odoo doctor
odoo update
odoo backup
odoo restore
odoo update-module sale
```

### Backups

`odoo backup` genera archivos en:

```text
~/Backups/Odoo/YYYY-MM-DD_HH-MM.dump
```

`odoo restore` lista los backups disponibles y permite seleccionar cual restaurar.
