# Odoo Installer

Instalador y CLI de administracion para Odoo en Ubuntu Debian-based.

## Requisitos

- Debian/Ubuntu (cualquier version reciente)
- Usuario con `sudo`
- Conexion a Internet
- 5 GB libres como minimo
- 8 GB libres recomendados
- 2 GB RAM como minimo practico

El instalador verifica arquitectura, RAM, disco, Internet, Git y Python antes de comenzar.

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

### Servicio

```bash
odoo start
odoo stop
odoo restart
odoo status
odoo logs
```

### Odoo

```bash
odoo shell
odoo config
odoo version
odoo info
odoo update
odoo update-module MODULO
odoo git
odoo service
odoo fix-permissions
```

### Base de datos y backups

```bash
odoo backup
odoo backup schedule
odoo backup list
odoo backup clean
odoo backup restore
odoo restore
```

### Modulos

```bash
odoo install-module https://github.com/OCA/web.git
odoo list-modules
```

### Diagnostico

```bash
odoo doctor
odoo doctor --fix
```

### Cloudflare Tunnel

Expone Odoo en internet via un tunel cifrado de Cloudflare sin necesidad de abrir puertos.

```bash
odoo tunnel install    # pregunta el modo (ver abajo)
odoo tunnel start
odoo tunnel stop
odoo tunnel restart
odoo tunnel status
odoo tunnel url        # muestra la URL publica
```

Durante `odoo tunnel install` se pregunta el modo:

```text
1) Con dominio propio (DNS permanente en Cloudflare)
2) URL temporal de Cloudflare (sin dominio, sin configuracion)
```

**Modo 1 — Dominio propio:**

Requiere cuenta Cloudflare y dominio configurado. Solicita:

```text
Dominio: ejemplo.com
Subdominio [odoo]: odoo
```

Instala cloudflared, autentica con Cloudflare, crea el tunnel, registra el DNS automaticamente.
Resultado: `https://odoo.ejemplo.com` permanente con HTTPS gestionado por Cloudflare.

**Modo 2 — URL temporal:**

No requiere dominio ni cuenta Cloudflare. Levanta el tunnel directamente con una URL del tipo `https://nombre-aleatorio.trycloudflare.com`. La URL cambia cada vez que el servicio se reinicia.

```bash
odoo tunnel install    # elegir opcion 2
odoo tunnel url        # muestra la URL generada (puede tardar unos segundos)
```

Si `odoo tunnel url` no muestra la URL todavia, espera unos segundos y reintenta. El tunnel puede tardar en establecerse.

### Nginx (proxy reverso)

Configura Nginx como proxy reverso frente a Odoo en el puerto 80. Requerido antes de instalar SSL si no se usa Cloudflare Tunnel.

```bash
odoo nginx install     # instala nginx y configura el proxy para el dominio indicado
odoo nginx restart
odoo nginx uninstall
```

Durante `odoo nginx install` se solicita el dominio. Si Cloudflare Tunnel ya esta configurado, toma el hostname automaticamente.

El proxy generado incluye headers `X-Forwarded-*` y timeouts de 720 segundos.

### SSL con Let's Encrypt

Instala un certificado TLS gratuito via Certbot sobre el sitio Nginx configurado.

```bash
odoo ssl install       # instala certbot, obtiene certificado y redirige HTTP a HTTPS
odoo ssl renew         # renueva certificados existentes
odoo ssl status        # muestra certificados instalados
```

Durante `odoo ssl install` se usa el dominio ya configurado en Nginx o Cloudflare Tunnel. Si Nginx no esta instalado, lo instala automaticamente.

> Si ya usas Cloudflare Tunnel, el SSL publico lo gestiona Cloudflare; `odoo ssl install` no es necesario.

### Flujo recomendado para exponer Odoo publicamente

**Opcion A — URL temporal sin configuracion (Cloudflare):**

```bash
odoo tunnel install    # elegir opcion 2
odoo tunnel url
```

**Opcion B — Dominio propio con Cloudflare Tunnel:**

```bash
odoo tunnel install    # elegir opcion 1
```

**Opcion C — Dominio propio con Nginx + SSL (Let's Encrypt):**

```bash
odoo nginx install
odoo ssl install
```

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

### No puedo acceder al database manager

Por diseno, el database manager web esta deshabilitado (`list_db=False` en `/etc/odoo.conf`). La base de datos se crea automaticamente durante la instalacion. Accede directamente en `/web/login`.
