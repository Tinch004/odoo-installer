#!/usr/bin/env bash

set -Eeuo pipefail

banner() {
    clear || true
    cat <<'BANNER'

   ____       _             ___           __        ____
  / __ \___  (_)___  ____  /   |  ____   / /_____ _/ / /__  _____
 / / / / _ \/ / __ \/ __ \/ /| | / __ \ / __/ __ `/ / / _ \/ ___/
/ /_/ /  __/ / /_/ / /_/ / ___ |/ / / // /_/ /_/ / / /  __/ /
\____/\___/_/\____/\____/_/  |_/_/ /_/ \__/\__,_/_/_/\___/_/

                Odoo Installer

BANNER
}

check_root() {
    if [[ "${EUID}" -ne 0 ]]; then
        error "Ejecuta el instalador con sudo: sudo bash install.sh"
        exit 1
    fi
}

handle_error() {
    local exit_code="$1"
    local line_number="$2"
    local command="$3"

    error "Fallo el comando en la linea ${line_number}: ${command}"
    error "Codigo de salida: ${exit_code}"
    exit "$exit_code"
}

trap 'handle_error $? $LINENO "$BASH_COMMAND"' ERR

require_command() {
    local command_name="$1"

    if ! command -v "$command_name" >/dev/null 2>&1; then
        error "No se encontro el comando requerido: ${command_name}"
        exit 1
    fi
}

run_command() {
    local description="$1"

    shift
    info "$description"
    "$@"
}

is_supported_ubuntu() {
    local version_id=""

    if [[ -r /etc/os-release ]]; then
        # shellcheck source=/dev/null
        source /etc/os-release
        version_id="${VERSION_ID:-}"
    fi

    [[ "${ID:-}" == "ubuntu" && ( "$version_id" == "22.04" || "$version_id" == "24.04" ) ]]
}

ensure_supported_ubuntu() {
    if ! is_supported_ubuntu; then
        error "Este instalador soporta Ubuntu 22.04 y Ubuntu 24.04."
        exit 1
    fi
}

select_version() {
    step "Seleccione la versión"
    printf '1) Odoo 18\n'
    printf '2) Odoo 19\n\n'

    while true; do
        read -r -p "Seleccione la versión: " selected_version

        case "$selected_version" in
        1)
            ODOO_VERSION="18.0"
            break
            ;;
        2)
            ODOO_VERSION="19.0"
            break
            ;;
        *)
            warn "Opcion invalida. Ingresa 1 o 2."
            ;;
        esac
    done

    ok "Version seleccionada: Odoo ${ODOO_VERSION}"
}

safe_remove_install_dir() {
    if [[ "$INSTALL_DIR" != "$EXPECTED_INSTALL_DIR" ]]; then
        error "Ruta de instalacion inesperada: ${INSTALL_DIR}"
        exit 1
    fi

    rm -rf -- "$INSTALL_DIR"
}

finish() {
    step "Instalacion finalizada"
    ok "Odoo quedo instalado como servicio systemd: ${SERVICE_NAME}"
    info "Configuracion: ${ODOO_CONF}"
    info "Logs: ${ODOO_LOG_FILE}"
    info "URL local: http://localhost:${ODOO_PORT}"
}
