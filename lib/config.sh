#!/usr/bin/env bash

set -Eeuo pipefail

EXPECTED_INSTALL_DIR="/opt/odoo"
INSTALL_DIR="$EXPECTED_INSTALL_DIR"
SOURCES_DIR="${INSTALL_DIR}/sources"
VENV_DIR="${INSTALL_DIR}/venv"
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

ODOO_REPOSITORY="https://github.com/odoo/odoo.git"
PROJECT_ROOT="${ROOT_DIR:?ROOT_DIR is not defined}"
TEMPLATE_DIR="${PROJECT_ROOT}/templates"
ODOO_CONF_TEMPLATE="${TEMPLATE_DIR}/odoo.conf"
ODOO_SERVICE_TEMPLATE="${TEMPLATE_DIR}/odoo.service"

RUN_AS_USER="${SUDO_USER:-$(id -un)}"
RUN_AS_GROUP="$(id -gn "$RUN_AS_USER")"

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
        install -d -m 0755 -o "$RUN_AS_USER" -g "$RUN_AS_GROUP" "$ODOO_LOG_DIR"

    if [[ ! -f "$ODOO_LOG_FILE" ]]; then
        run_command "Creando archivo de log..." touch "$ODOO_LOG_FILE"
    fi

    chown "${RUN_AS_USER}:${RUN_AS_GROUP}" "$ODOO_LOG_FILE"
    chmod 0644 "$ODOO_LOG_FILE"
}

get_admin_password() {
    local existing_password=""

    if [[ -f "$ODOO_CONF" ]]; then
        existing_password="$(awk -F '=' '
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
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
    printf '\n'
}

render_odoo_config() {
    local addons_path
    local temp_file

    addons_path="${INSTALL_DIR}/addons,${SOURCES_DIR}"
    temp_file="$(mktemp)"

    sed \
        -e "s|{{ADDONS_PATH}}|${addons_path}|g" \
        -e "s|{{DATA_DIR}}|${DATA_DIR}|g" \
        -e "s|{{ODOO_LOG_FILE}}|${ODOO_LOG_FILE}|g" \
        -e "s|{{POSTGRES_USER}}|${POSTGRES_USER}|g" \
        -e "s|{{ADMIN_PASSWORD}}|${ODOO_ADMIN_PASSWORD}|g" \
        -e "s|{{POSTGRES_DB}}|${POSTGRES_DB}|g" \
        -e "s|{{ODOO_PORT}}|${ODOO_PORT}|g" \
        "$ODOO_CONF_TEMPLATE" >"$temp_file"

    install -m 0640 -o "$RUN_AS_USER" -g "$RUN_AS_GROUP" "$temp_file" "$ODOO_CONF"
    rm -f "$temp_file"
}
