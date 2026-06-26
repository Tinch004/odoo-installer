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

    if [[ "$exit_code" -eq 141 ]]; then
        return 0
    fi

    error "Fallo el comando en la linea ${line_number}: ${command}"
    error "Codigo de salida: ${exit_code}"
    warn "Revisa permisos, conexion a Internet y dependencias del sistema."
    warn "Puedes volver a ejecutar el instalador despues de corregir el problema; las tareas son idempotentes."
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

    systemd_available || return 1
    "$SYSTEMCTL_COMMAND" is-active --quiet "$service_name"
}

systemd_available() {
    command -v "$SYSTEMCTL_COMMAND" >/dev/null 2>&1 && [[ -d /run/systemd/system ]]
}

run_systemctl() {
    if systemd_available; then
        "$SYSTEMCTL_COMMAND" "$@"
        return
    fi

    warn "systemd no esta disponible; se omitio: systemctl $*"
    return 0
}

run_systemctl_privileged() {
    if ! systemd_available; then
        warn "systemd no esta disponible; se omitio: systemctl $*"
        return 0
    fi

    if [[ "$EUID" -eq 0 ]]; then
        "$SYSTEMCTL_COMMAND" "$@"
        return
    fi

    require_command "$SUDO_COMMAND"
    "$SUDO_COMMAND" "$SYSTEMCTL_COMMAND" "$@"
}

start_postgres_service() {
    if systemd_available; then
        "$SYSTEMCTL_COMMAND" enable --now postgresql
        return
    fi

    if command -v "$SERVICE_COMMAND" >/dev/null 2>&1; then
        "$SERVICE_COMMAND" postgresql start
        return
    fi

    warn "No se pudo iniciar PostgreSQL automaticamente."
}

reload_postgres_service() {
    if systemd_available; then
        "$SYSTEMCTL_COMMAND" reload postgresql
        return
    fi

    if command -v "$SERVICE_COMMAND" >/dev/null 2>&1; then
        "$SERVICE_COMMAND" postgresql reload || "$SERVICE_COMMAND" postgresql restart
        return
    fi

    warn "No se pudo recargar PostgreSQL automaticamente."
}

run_system_check() {
    step "Verificando sistema"
    SYSTEM_CHECK_FAILED=0
    SYSTEM_CHECK_WARNINGS=0

    check_ubuntu_version
    check_architecture
    check_memory
    check_free_space
    check_internet
    check_command_presence "Git" "$GIT_COMMAND"
    check_command_presence "Python" "$PYTHON3_COMMAND"
    check_postgresql_presence
    check_wsl

    if [[ "$SYSTEM_CHECK_FAILED" -gt 0 ]]; then
        error "El chequeo del sistema encontro ${SYSTEM_CHECK_FAILED} problema(s) critico(s)."
        exit 1
    fi

    if [[ "$SYSTEM_CHECK_WARNINGS" -gt 0 ]]; then
        warn "Chequeo finalizado con ${SYSTEM_CHECK_WARNINGS} advertencia(s)."
        return
    fi

    ok "Chequeo del sistema completado."
}

check_ubuntu_version() {
    local version_id=""
    local pretty_name="Ubuntu"

    if [[ -r /etc/os-release ]]; then
        # shellcheck source=/dev/null
        source /etc/os-release
        version_id="${VERSION_ID:-}"
        pretty_name="${PRETTY_NAME:-Ubuntu ${version_id}}"
    fi

    if is_supported_ubuntu; then
        check_ok "$pretty_name"
        return
    fi

    check_fail "Ubuntu soportado" "Se requiere Ubuntu 22.04 o 24.04."
}

check_architecture() {
    local architecture

    architecture="$("$UNAME_COMMAND" -m)"

    case "$architecture" in
    x86_64 | amd64 | aarch64 | arm64)
        check_ok "Arquitectura ${architecture}"
        ;;
    *)
        check_warn "Arquitectura ${architecture}" "No es una arquitectura validada oficialmente."
        ;;
    esac
}

check_memory() {
    local ram_gb

    ram_gb="$("$AWK_COMMAND" '/MemTotal/ { printf "%.0f", $2 / 1024 / 1024 }' /proc/meminfo 2>/dev/null || true)"

    if [[ -z "$ram_gb" ]]; then
        check_warn "RAM" "No se pudo calcular la memoria disponible."
        return
    fi

    if (( ram_gb < 2 )); then
        check_warn "${ram_gb} GB RAM" "Odoo puede funcionar lento con menos de 2 GB."
        return
    fi

    check_ok "${ram_gb} GB RAM"
}

check_free_space() {
    local free_gb

    free_gb="$(get_free_space_gb)"

    if [[ -z "$free_gb" ]]; then
        check_warn "Espacio libre" "No se pudo calcular el espacio disponible."
        return
    fi

    if (( free_gb < MIN_DISK_REQUIRED_GB )); then
        check_fail "${free_gb} GB libres" "Se requieren al menos ${MIN_DISK_REQUIRED_GB} GB."
        return
    fi

    if (( free_gb < MIN_DISK_WARN_GB )); then
        check_warn "${free_gb} GB libres" "Recomendado: ${MIN_DISK_WARN_GB} GB o mas."
        return
    fi

    check_ok "${free_gb} GB libres"
}

ensure_download_space() {
    local free_gb

    free_gb="$(get_free_space_gb)"

    if [[ -z "$free_gb" ]]; then
        warn "No se pudo calcular el espacio libre antes de clonar Odoo."
        return
    fi

    if (( free_gb < MIN_DISK_REQUIRED_GB )); then
        error "Espacio insuficiente: ${free_gb} GB libres. Se requieren al menos ${MIN_DISK_REQUIRED_GB} GB."
        exit 1
    fi

    if (( free_gb < MIN_DISK_WARN_GB )); then
        warn "Espacio bajo: ${free_gb} GB libres. Recomendado: ${MIN_DISK_WARN_GB} GB o mas."
    fi
}

get_free_space_gb() {
    local check_path="$INSTALL_PARENT_DIR"

    if [[ ! -d "$check_path" ]]; then
        check_path="/"
    fi

    "$DF_COMMAND" -BG --output=avail "$check_path" 2>/dev/null |
        "$TAIL_COMMAND" -n 1 |
        "$TR_COMMAND" -dc '0-9'
}

check_internet() {
    if has_internet_connection; then
        check_ok "Internet"
        return
    fi

    check_fail "Internet" "No se pudo contactar github.com."
}

has_internet_connection() {
    if command -v "$CURL_COMMAND" >/dev/null 2>&1; then
        "$CURL_COMMAND" -fsS --max-time 8 https://github.com >/dev/null 2>&1
        return
    fi

    if command -v "$GETENT_COMMAND" >/dev/null 2>&1; then
        "$GETENT_COMMAND" hosts github.com >/dev/null 2>&1
        return
    fi

    return 1
}

check_command_presence() {
    local label="$1"
    local command_name="$2"

    if command -v "$command_name" >/dev/null 2>&1; then
        check_ok "$label"
        return
    fi

    check_warn "$label" "No instalado; el instalador lo instalara."
}

check_postgresql_presence() {
    if command -v "$PSQL_COMMAND" >/dev/null 2>&1; then
        check_ok "PostgreSQL"
        return
    fi

    check_warn "PostgreSQL" "No instalado; el instalador lo instalara."
}

check_wsl() {
    if is_wsl; then
        check_warn "WSL detectado" "systemd puede requerir configuracion adicional."
        return
    fi

    check_ok "No WSL"
}

is_wsl() {
    [[ -n "${WSL_DISTRO_NAME:-}" || -n "${WSL_INTEROP:-}" ]] && return 0

    if [[ -r /proc/sys/kernel/osrelease ]] &&
        "$GREP_COMMAND" -qiE 'microsoft|wsl' /proc/sys/kernel/osrelease; then
        return 0
    fi

    if [[ -r /proc/version ]] &&
        "$GREP_COMMAND" -qiE 'microsoft|wsl' /proc/version; then
        return 0
    fi

    return 1
}

check_ok() {
    printf '%b\n' "${GREEN}[OK]${RESET} $*"
}

check_warn() {
    local label="$1"
    local message="$2"

    SYSTEM_CHECK_WARNINGS=$((SYSTEM_CHECK_WARNINGS + 1))
    printf '%b\n' "${YELLOW}[WARN]${RESET} ${label} - ${message}"
}

check_fail() {
    local label="$1"
    local message="$2"

    SYSTEM_CHECK_FAILED=$((SYSTEM_CHECK_FAILED + 1))
    printf '%b\n' "${RED}[FAIL]${RESET} ${label} - ${message}"
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
    local selected_version

    step "Seleccione la version"
    printf '1) Odoo 18\n'
    printf '2) Odoo 19\n\n'

    while true; do
        read -r -p "Seleccione la version: " selected_version

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

select_install_profile() {
    local selected_profile

    step "Instalacion"
    printf '1) Minima (recomendada)\n'
    printf '2) Completa\n\n'

    while true; do
        read -r -p "Instalacion [1]: " selected_profile
        selected_profile="${selected_profile:-1}"

        case "$selected_profile" in
        1)
            INSTALL_PROFILE="minimal"
            ok "Instalacion minima seleccionada."
            break
            ;;
        2)
            INSTALL_PROFILE="full"
            ok "Instalacion completa seleccionada."
            break
            ;;
        *)
            warn "Opcion invalida. Ingresa 1 o 2."
            ;;
        esac
    done
}

select_clone_mode() {
    local selected_clone_mode

    step "Clonado"
    printf '1) Rapido (depth=1)\n'
    printf '2) Completo\n\n'

    while true; do
        read -r -p "Clonado [1]: " selected_clone_mode
        selected_clone_mode="${selected_clone_mode:-1}"

        case "$selected_clone_mode" in
        1)
            CLONE_MODE="fast"
            ok "Clonado rapido seleccionado."
            break
            ;;
        2)
            CLONE_MODE="full"
            ok "Clonado completo seleccionado."
            break
            ;;
        *)
            warn "Opcion invalida. Ingresa 1 o 2."
            ;;
        esac
    done
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

cleanup_installation() {
    step "Limpiando instalacion"
    export DEBIAN_FRONTEND=noninteractive

    cleanup_command "Eliminando paquetes no usados..." \
        "$APT_GET_COMMAND" autoremove -y
    cleanup_command "Limpiando cache de APT..." \
        "$APT_GET_COMMAND" clean

    if [[ -x "$PYTHON_BIN" ]]; then
        cleanup_command "Limpiando cache de pip..." \
            "$PYTHON_BIN" -m pip cache purge
    fi

    cleanup_command "Eliminando temporales propios..." \
        "$FIND_COMMAND" "$TMP_DIR" -maxdepth 1 -type f -name 'odoo-installer.*' -delete

    ok "Limpieza finalizada."
}

cleanup_command() {
    local description="$1"

    shift
    info "$description"

    if "$@"; then
        return
    fi

    warn "No se pudo completar la limpieza: $*"
}
