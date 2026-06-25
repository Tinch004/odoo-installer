#!/usr/bin/env bash

set -Eeuo pipefail

EXPECTED_INSTALL_DIR="/opt/odoo"
INSTALL_DIR="$EXPECTED_INSTALL_DIR"
ADDONS_DIR="${INSTALL_DIR}/addons"
SOURCES_DIR="${INSTALL_DIR}/sources"
VENV_DIR="${INSTALL_DIR}/venv"
VENV_ACTIVATE="${VENV_DIR}/bin/activate"
PYTHON_BIN="${VENV_DIR}/bin/python"
DATA_DIR="${INSTALL_DIR}/data"
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

ODOO_REPOSITORY="https://github.com/odoo/odoo.git"
PROJECT_ROOT="${ROOT_DIR:?ROOT_DIR is not defined}"
TEMPLATE_DIR="${PROJECT_ROOT}/templates"
ODOO_CONF_TEMPLATE="${TEMPLATE_DIR}/odoo.conf"
ODOO_SERVICE_TEMPLATE="${TEMPLATE_DIR}/odoo.service"

detect_user_home() {
    local user_name="$1"
    local detected_home=""

    if command -v getent >/dev/null 2>&1; then
        detected_home="$(getent passwd "$user_name" | cut -d ':' -f 6 || true)"
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
BACKUP_DIR="${RUN_AS_HOME}/Backups/Odoo"

APT_GET_COMMAND="apt-get"
AWK_COMMAND="awk"
BASENAME_COMMAND="basename"
CAT_COMMAND="cat"
CHMOD_COMMAND="chmod"
CHOWN_COMMAND="chown"
CP_COMMAND="cp"
CREATEDB_COMMAND="createdb"
CREATEUSER_COMMAND="createuser"
DATE_COMMAND="date"
DROPDB_COMMAND="dropdb"
FIND_COMMAND="find"
GIT_COMMAND="git"
INSTALL_COMMAND="install"
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
SORT_COMMAND="sort"
SS_COMMAND="ss"
SUDO_COMMAND="sudo"
SYSTEMCTL_COMMAND="systemctl"
TAIL_COMMAND="tail"
TOUCH_COMMAND="touch"

ODOO_VERSION=""
ODOO_ADMIN_PASSWORD=""

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
        ' "$ODOO_CONF" | tail -n 1)"
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
