#!/usr/bin/env bash

set -Eeuo pipefail

EXPECTED_INSTALL_DIR="/opt/odoo"
INSTALL_DIR="$EXPECTED_INSTALL_DIR"
INSTALL_PARENT_DIR="/opt"
TMP_DIR="/tmp"
ADDONS_DIR="${INSTALL_DIR}/addons"
SOURCES_DIR="${INSTALL_DIR}/sources"
VENV_DIR="${INSTALL_DIR}/venv"
VENV_ACTIVATE="${VENV_DIR}/bin/activate"
PYTHON_BIN="${VENV_DIR}/bin/python"
DATA_DIR="${INSTALL_DIR}/data"
BACKUP_DIR="${INSTALL_DIR}/backups"
ODOO_BIN="${INSTALL_DIR}/odoo-bin"
REQUIREMENTS_FILE="${INSTALL_DIR}/requirements.txt"

ODOO_CONF="/etc/odoo.conf"
ODOO_LOG_DIR="/var/log/odoo"
ODOO_LOG_FILE="${ODOO_LOG_DIR}/odoo.log"

POSTGRES_DB="odoo"
POSTGRES_USER="odoo"

ODOO_PORT="8069"
SERVICE_NAME="odoo"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CLI_COMMAND="/usr/local/bin/odoo"
CLI_ROOT_DIR="/usr/local/lib/odoo-installer"
CLI_LIB_DIR="${CLI_ROOT_DIR}/lib"
CLI_LIB_FILE="${CLI_LIB_DIR}/cli.sh"
STATE_DIR="/etc/odoo-installer"
STATE_FILE="${STATE_DIR}/state.env"
BACKUP_CRON_FILE="/etc/cron.d/odoo-backup"
BACKUP_LOG_FILE="${ODOO_LOG_DIR}/backup.log"
CRON_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

CLOUDFLARED_COMMAND="cloudflared"
CLOUDFLARED_BIN="/usr/bin/cloudflared"
CLOUDFLARED_KEYRING="/usr/share/keyrings/cloudflare-main.gpg"
CLOUDFLARED_APT_SOURCE_FILE="/etc/apt/sources.list.d/cloudflared.list"
CLOUDFLARED_CONFIG_DIR="/etc/cloudflared"
CLOUDFLARED_CONFIG_FILE="${CLOUDFLARED_CONFIG_DIR}/config.yml"
CLOUDFLARED_CERT_FILE="/root/.cloudflared/cert.pem"
CLOUDFLARED_CREDENTIALS_DIR="/root/.cloudflared"
CLOUDFLARED_TUNNEL_NAME="odoo"
CLOUDFLARED_SERVICE_NAME="cloudflared-odoo"
CLOUDFLARED_SERVICE_FILE="/etc/systemd/system/${CLOUDFLARED_SERVICE_NAME}.service"
CLOUDFLARED_ORIGIN_SERVICE="http://localhost:${ODOO_PORT}"
CLOUDFLARED_PACKAGE_REPOSITORY="deb [signed-by=${CLOUDFLARED_KEYRING}] https://pkg.cloudflare.com/cloudflared any main"
CLOUDFLARED_GPG_URL="https://pkg.cloudflare.com/cloudflare-main.gpg"

NGINX_SERVICE_NAME="nginx"
NGINX_COMMAND="nginx"
NGINX_SITE_NAME="odoo"
NGINX_AVAILABLE_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
NGINX_SITE_FILE="${NGINX_AVAILABLE_DIR}/${NGINX_SITE_NAME}"
NGINX_ENABLED_FILE="${NGINX_ENABLED_DIR}/${NGINX_SITE_NAME}"

CERTBOT_COMMAND="certbot"
CERTBOT_BIN="/usr/local/bin/certbot"
SNAP_CERTBOT_BIN="/snap/bin/certbot"

ODOO_REPOSITORY="https://github.com/odoo/odoo.git"
PROJECT_ROOT="${ROOT_DIR:?ROOT_DIR is not defined}"
TEMPLATE_DIR="${PROJECT_ROOT}/templates"
ODOO_CONF_TEMPLATE="${TEMPLATE_DIR}/odoo.conf"
ODOO_SERVICE_TEMPLATE="${TEMPLATE_DIR}/odoo.service"
GETENT_COMMAND="getent"

detect_user_home() {
    local user_name="$1"
    local detected_home=""
    local passwd_entry=""

    if command -v "$GETENT_COMMAND" >/dev/null 2>&1; then
        passwd_entry="$("$GETENT_COMMAND" passwd "$user_name" || true)"
        IFS=':' read -r _ _ _ _ _ detected_home _ <<<"$passwd_entry"
    fi

    if [[ -z "$detected_home" && -n "${SUDO_HOME:-}" && -d "${SUDO_HOME:-}" ]]; then
        detected_home="$SUDO_HOME"
    fi

    if [[ -z "$detected_home" && -d "/home/${user_name}" ]]; then
        detected_home="/home/${user_name}"
    fi

    if [[ -z "$detected_home" ]]; then
        detected_home="${HOME:-}"
    fi

    if [[ -z "$detected_home" ]]; then
        detected_home="/root"
    fi

    printf '%s\n' "$detected_home"
}

RUN_AS_USER="${SUDO_USER:-$(id -un)}"
RUN_AS_GROUP="$(id -gn "$RUN_AS_USER")"
RUN_AS_HOME="$(detect_user_home "$RUN_AS_USER")"

APT_GET_COMMAND="apt-get"
AWK_COMMAND="awk"
BASENAME_COMMAND="basename"
CAT_COMMAND="cat"
CHMOD_COMMAND="chmod"
CHOWN_COMMAND="chown"
CP_COMMAND="cp"
CREATEDB_COMMAND="createdb"
CREATEUSER_COMMAND="createuser"
CURL_COMMAND="curl"
DATE_COMMAND="date"
DF_COMMAND="df"
DIRNAME_COMMAND="dirname"
DROPDB_COMMAND="dropdb"
FIND_COMMAND="find"
GIT_COMMAND="git"
GREP_COMMAND="grep"
INSTALL_COMMAND="install"
LN_COMMAND="ln"
MKDIR_COMMAND="mkdir"
MK_TEMP_COMMAND="mktemp"
NANO_COMMAND="nano"
NPM_COMMAND="npm"
OD_COMMAND="od"
PG_DUMP_COMMAND="pg_dump"
PG_RESTORE_COMMAND="pg_restore"
PSQL_COMMAND="psql"
PYTHON3_COMMAND="python3"
RM_COMMAND="rm"
RUNUSER_COMMAND="runuser"
SED_COMMAND="sed"
SERVICE_COMMAND="service"
SNAP_COMMAND="snap"
SORT_COMMAND="sort"
SS_COMMAND="ss"
SUDO_COMMAND="sudo"
SYSTEMCTL_COMMAND="systemctl"
TAIL_COMMAND="tail"
TOUCH_COMMAND="touch"
TR_COMMAND="tr"
UNAME_COMMAND="uname"

ODOO_VERSION=""
ODOO_ADMIN_PASSWORD=""
INSTALL_PROFILE="minimal"
CLONE_MODE="fast"
CLONE_DEPTH="1"
INSTALL_STEP_CURRENT=0
INSTALL_STEP_TOTAL=0
MIN_DISK_WARN_GB=8
MIN_DISK_REQUIRED_GB=5
SYSTEM_CHECK_FAILED=0
SYSTEM_CHECK_WARNINGS=0

generate_config() {
    step "Generando configuracion"
    create_log_files
    ODOO_ADMIN_PASSWORD="$(get_admin_password)"
    render_odoo_config
    ok "Configuracion generada en ${ODOO_CONF}."
}

create_log_files() {
    run_command "Creando directorio de logs..." \
        "$INSTALL_COMMAND" -d -m 0755 -o "$RUN_AS_USER" -g "$RUN_AS_GROUP" "$ODOO_LOG_DIR"

    if [[ ! -f "$ODOO_LOG_FILE" ]]; then
        run_command "Creando archivo de log..." "$TOUCH_COMMAND" "$ODOO_LOG_FILE"
    fi

    "$CHOWN_COMMAND" "${RUN_AS_USER}:${RUN_AS_GROUP}" "$ODOO_LOG_FILE"
    "$CHMOD_COMMAND" 0644 "$ODOO_LOG_FILE"
}

get_admin_password() {
    local existing_password=""

    if [[ -f "$ODOO_CONF" ]]; then
        existing_password="$("$AWK_COMMAND" -F '=' '
            /^[[:space:]]*admin_passwd[[:space:]]*=/ {
                gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
                print $2
            }
        ' "$ODOO_CONF" | "$TAIL_COMMAND" -n 1)"
    fi

    if [[ -n "$existing_password" ]]; then
        printf '%s\n' "$existing_password"
        return
    fi

    generate_admin_password
}

generate_admin_password() {
    "$OD_COMMAND" -An -N32 -tx1 /dev/urandom | tr -d ' \n'
    printf '\n'
}

render_odoo_config() {
    local addons_path
    local temp_file

    addons_path="${ADDONS_DIR},${SOURCES_DIR}"
    temp_file="$("$MK_TEMP_COMMAND")"

    "$SED_COMMAND" \
        -e "s|{{ADDONS_PATH}}|${addons_path}|g" \
        -e "s|{{DATA_DIR}}|${DATA_DIR}|g" \
        -e "s|{{ODOO_LOG_FILE}}|${ODOO_LOG_FILE}|g" \
        -e "s|{{POSTGRES_USER}}|${POSTGRES_USER}|g" \
        -e "s|{{ADMIN_PASSWORD}}|${ODOO_ADMIN_PASSWORD}|g" \
        -e "s|{{POSTGRES_DB}}|${POSTGRES_DB}|g" \
        -e "s|{{ODOO_PORT}}|${ODOO_PORT}|g" \
        "$ODOO_CONF_TEMPLATE" >"$temp_file"

    "$INSTALL_COMMAND" -m 0640 -o "$RUN_AS_USER" -g "$RUN_AS_GROUP" "$temp_file" "$ODOO_CONF"
    "$RM_COMMAND" -f "$temp_file"
}
