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

run_privileged() {
    if [[ "$EUID" -eq 0 ]]; then
        "$@"
        return
    fi

    require_command "$SUDO_COMMAND"
    "$SUDO_COMMAND" "$@"
}

run_postgres() {
    if [[ "$EUID" -eq 0 ]]; then
        "$RUNUSER_COMMAND" -u postgres -- "$@"
        return
    fi

    require_command "$SUDO_COMMAND"
    "$SUDO_COMMAND" -u postgres "$@"
}

ensure_file() {
    local file_path="$1"

    if [[ ! -f "$file_path" ]]; then
        error "No existe el archivo: ${file_path}"
        exit 1
    fi
}

ensure_directory() {
    local directory_path="$1"

    if [[ ! -d "$directory_path" ]]; then
        error "No existe el directorio: ${directory_path}"
        exit 1
    fi
}

print_field() {
    local label="$1"
    local value="$2"

    printf '%-24s %s\n' "${label}:" "$value"
}

git_value() {
    "$GIT_COMMAND" -C "$INSTALL_DIR" "$@" 2>/dev/null || printf 'N/D\n'
}

get_odoo_version() {
    local release_file="${INSTALL_DIR}/odoo/release.py"
    local version=""

    if [[ -f "$release_file" ]]; then
        version="$("$AWK_COMMAND" -F "'" '/^version = / { print $2; exit }' "$release_file")"
    fi

    if [[ -n "$version" ]]; then
        printf '%s\n' "$version"
        return
    fi

    git_value rev-parse --abbrev-ref HEAD
}

ensure_odoo_installation() {
    ensure_file "$ODOO_BIN"
    ensure_file "$REQUIREMENTS_FILE"
    ensure_file "$VENV_ACTIVATE"
    ensure_directory "$INSTALL_DIR"
}

read_state_value() {
    local key="$1"

    if [[ ! -f "$STATE_FILE" ]]; then
        return 0
    fi

    "$AWK_COMMAND" -F '=' -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1) }' "$STATE_FILE" |
        "$TAIL_COMMAND" -n 1
}

write_state_value() {
    local key="$1"
    local value="$2"
    local temp_file

    run_privileged "$INSTALL_COMMAND" -d -m 0755 "$STATE_DIR"
    temp_file="$("$MK_TEMP_COMMAND")"

    if [[ -f "$STATE_FILE" ]]; then
        "$GREP_COMMAND" -v -E "^${key}=" "$STATE_FILE" >"$temp_file" || true
    fi

    printf '%s=%s\n' "$key" "$value" >>"$temp_file"
    run_privileged "$INSTALL_COMMAND" -m 0644 "$temp_file" "$STATE_FILE"
    "$RM_COMMAND" -f "$temp_file"
}

prompt_required() {
    local prompt="$1"
    local value=""

    while [[ -z "$value" ]]; do
        read -r -p "$prompt" value
        if [[ -z "$value" ]]; then
            warn "Este valor es obligatorio."
        fi
    done

    printf '%s\n' "$value"
}

service_is_active() {
    local service_name="$1"

    "$SYSTEMCTL_COMMAND" is-active --quiet "$service_name"
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

    "$RM_COMMAND" -rf -- "$INSTALL_DIR"
}

finish() {
    step "Instalacion finalizada"
    ok "Odoo quedo instalado como servicio systemd: ${SERVICE_NAME}"
    ok "CLI instalada: ${CLI_COMMAND}"
    info "Configuracion: ${ODOO_CONF}"
    info "Logs: ${ODOO_LOG_FILE}"
    info "URL local: http://localhost:${ODOO_PORT}"
}
