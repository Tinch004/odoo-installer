#!/usr/bin/env bash

set -Eeuo pipefail

CLI_SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$CLI_SOURCE_DIR/.." && pwd)}"

# shellcheck source=lib/colors.sh
source "$ROOT_DIR/lib/colors.sh"
# shellcheck source=lib/config.sh
source "$ROOT_DIR/lib/config.sh"
# shellcheck source=lib/utils.sh
source "$ROOT_DIR/lib/utils.sh"

DOCTOR_FAILURES=0

install_cli() {
    step "Instalando CLI odoo"
    run_command "Creando directorio de librerias CLI..." \
        "$INSTALL_COMMAND" -d -m 0755 "$CLI_LIB_DIR"
    run_command "Copiando librerias CLI..." \
        "$CP_COMMAND" "$PROJECT_ROOT"/lib/*.sh "$CLI_LIB_DIR"/
    run_command "Configurando permisos de librerias CLI..." \
        "$CHMOD_COMMAND" 0644 "$CLI_LIB_DIR"/*.sh
    create_cli_wrapper
    ok "Comando disponible: ${CLI_COMMAND}"
}

create_cli_wrapper() {
    local temp_file

    temp_file="$("$MK_TEMP_COMMAND")"
    {
        printf '#!/usr/bin/env bash\n'
        printf 'set -Eeuo pipefail\n'
        printf 'ROOT_DIR=%q\n' "$CLI_ROOT_DIR"
        printf 'source "%s"\n' "$CLI_LIB_FILE"
        printf 'cli_main "$@"\n'
    } >"$temp_file"

    "$INSTALL_COMMAND" -m 0755 "$temp_file" "$CLI_COMMAND"
    "$RM_COMMAND" -f "$temp_file"
}

cli_main() {
    local command_name="${1:-help}"

    if [[ $# -gt 0 ]]; then
        shift
    fi

    case "$command_name" in
    start)
        cli_start
        ;;
    stop)
        cli_stop
        ;;
    restart)
        cli_restart
        ;;
    status)
        cli_status
        ;;
    logs)
        cli_logs
        ;;
    shell)
        cli_shell
        ;;
    config)
        cli_config
        ;;
    version)
        cli_version
        ;;
    update)
        cli_update
        ;;
    update-module)
        cli_update_module "$@"
        ;;
    backup)
        cli_backup
        ;;
    restore)
        cli_restore
        ;;
    git)
        cli_git
        ;;
    service)
        cli_service
        ;;
    fix-permissions)
        cli_fix_permissions
        ;;
    doctor)
        cli_doctor
        ;;
    help | -h | --help)
        cli_help
        ;;
    *)
        error "Comando desconocido: ${command_name}"
        cli_help
        exit 1
        ;;
    esac
}

cli_help() {
    cat <<HELP
Uso:
  odoo start
  odoo stop
  odoo restart
  odoo status
  odoo logs
  odoo shell
  odoo config
  odoo version
  odoo update
  odoo update-module MODULO
  odoo backup
  odoo restore
  odoo git
  odoo service
  odoo fix-permissions
  odoo doctor
HELP
}

cli_start() {
    run_privileged "$SYSTEMCTL_COMMAND" start "$SERVICE_NAME"
}

cli_stop() {
    run_privileged "$SYSTEMCTL_COMMAND" stop "$SERVICE_NAME"
}

cli_restart() {
    run_privileged "$SYSTEMCTL_COMMAND" restart "$SERVICE_NAME"
}

cli_status() {
    "$SYSTEMCTL_COMMAND" status "$SERVICE_NAME"
}

cli_logs() {
    ensure_file "$ODOO_LOG_FILE"
    "$TAIL_COMMAND" -f "$ODOO_LOG_FILE"
}

cli_shell() {
    ensure_directory "$INSTALL_DIR"
    ensure_file "$VENV_ACTIVATE"

    cd "$INSTALL_DIR"
    # shellcheck source=/dev/null
    source "$VENV_ACTIVATE"
    exec "${SHELL:-/bin/bash}" -i
}

cli_config() {
    ensure_file "$ODOO_CONF"
    run_privileged "$NANO_COMMAND" "$ODOO_CONF"
}

cli_version() {
    local installed_version
    local branch
    local commit
    local python_version

    ensure_odoo_installation
    installed_version="$(get_odoo_version)"
    branch="$(git_value rev-parse --abbrev-ref HEAD)"
    commit="$(git_value rev-parse --short HEAD)"
    python_version="$("$PYTHON_BIN" --version 2>&1)"

    print_field "Version instalada" "$installed_version"
    print_field "Commit de Git" "$commit"
    print_field "Branch" "$branch"
    print_field "Ruta" "$INSTALL_DIR"
    print_field "Puerto" "$ODOO_PORT"
    print_field "Base de datos" "$POSTGRES_DB"
    print_field "Servicio" "$SERVICE_NAME"
    print_field "Python" "$python_version"
    print_field "Virtualenv" "$VENV_DIR"
}

cli_update() {
    ensure_odoo_installation

    (
        cd "$INSTALL_DIR"
        "$GIT_COMMAND" pull
        # shellcheck source=/dev/null
        source "$VENV_ACTIVATE"
        "$PYTHON_BIN" -m pip install -r "$REQUIREMENTS_FILE"
    )

    cli_restart
    ok "Odoo actualizado correctamente."
}

cli_update_module() {
    local module_name="${1:-}"

    ensure_odoo_installation

    if [[ -z "$module_name" ]]; then
        error "Uso: odoo update-module MODULO"
        exit 1
    fi

    "$PYTHON_BIN" \
        "$ODOO_BIN" \
        -c "$ODOO_CONF" \
        -u "$module_name" \
        --stop-after-init

    cli_restart
    ok "Modulo actualizado: ${module_name}"
}

cli_backup() {
    local backup_file

    require_command "$PG_DUMP_COMMAND"
    "$MKDIR_COMMAND" -p "$BACKUP_DIR"
    backup_file="${BACKUP_DIR}/$("$DATE_COMMAND" +%F_%H-%M).dump"

    "$PG_DUMP_COMMAND" \
        --username "$POSTGRES_USER" \
        --format=custom \
        --file "$backup_file" \
        "$POSTGRES_DB"

    ok "Backup generado: ${backup_file}"
}

cli_restore() {
    local backup_file

    require_command "$PG_RESTORE_COMMAND"
    backup_file="$(select_backup_file)"

    warn "Restaurando ${POSTGRES_DB} desde ${backup_file}"
    cli_stop || true
    terminate_database_connections
    run_postgres "$DROPDB_COMMAND" --if-exists "$POSTGRES_DB"
    run_postgres "$CREATEDB_COMMAND" --owner="$POSTGRES_USER" "$POSTGRES_DB"
    "$PG_RESTORE_COMMAND" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$backup_file"
    cli_restart
    ok "Backup restaurado correctamente."
}

cli_git() {
    ensure_odoo_installation

    print_field "Branch" "$(git_value rev-parse --abbrev-ref HEAD)"
    print_field "Ultimo commit" "$(git_value log -1 --oneline)"
    print_field "Repositorio" "$(git_value remote get-url origin)"
    printf '\nEstado:\n'
    "$GIT_COMMAND" -C "$INSTALL_DIR" status --short
}

cli_service() {
    ensure_file "$SERVICE_FILE"
    "$CAT_COMMAND" "$SERVICE_FILE"
}

cli_fix_permissions() {
    run_privileged "$INSTALL_COMMAND" -d -m 0755 -o "$RUN_AS_USER" -g "$RUN_AS_GROUP" "$ODOO_LOG_DIR"
    run_privileged "$TOUCH_COMMAND" "$ODOO_LOG_FILE"
    run_privileged "$CHOWN_COMMAND" -R "${RUN_AS_USER}:${RUN_AS_GROUP}" "$INSTALL_DIR" "$ODOO_LOG_DIR"
    run_privileged "$CHMOD_COMMAND" 0644 "$ODOO_LOG_FILE"
    ok "Permisos corregidos."
}

cli_doctor() {
    DOCTOR_FAILURES=0
    step "Odoo Doctor"

    doctor_check "PostgreSQL" "$SYSTEMCTL_COMMAND" is-active --quiet postgresql
    doctor_check "Python" "$PYTHON_BIN" --version
    doctor_check "pip" "$PYTHON_BIN" -m pip --version
    doctor_check "Virtualenv" test -x "$PYTHON_BIN"
    doctor_check "Servicio" "$SYSTEMCTL_COMMAND" is-active --quiet "$SERVICE_NAME"
    doctor_check "Puerto ${ODOO_PORT}" check_port
    doctor_check "Archivo de configuracion" test -f "$ODOO_CONF"
    doctor_check "Log" test -f "$ODOO_LOG_FILE"
    doctor_check "Permisos" check_permissions
    doctor_check "Git" "$GIT_COMMAND" -C "$INSTALL_DIR" status --short
    doctor_check "Addons" test -d "$ADDONS_DIR"
    doctor_check "Sources" test -d "$SOURCES_DIR"
    doctor_check "Base de datos" check_database

    if [[ "$DOCTOR_FAILURES" -eq 0 ]]; then
        ok "Doctor finalizado sin problemas."
        return
    fi

    warn "Doctor detecto ${DOCTOR_FAILURES} problema(s)."
    exit 1
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

terminate_database_connections() {
    run_postgres "$PSQL_COMMAND" -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${POSTGRES_DB}' AND pid <> pg_backend_pid();"
}

select_backup_file() {
    local backups=()
    local backup
    local selected
    local index=1

    ensure_directory "$BACKUP_DIR"
    mapfile -t backups < <("$FIND_COMMAND" "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' | "$SORT_COMMAND" -r)

    if [[ "${#backups[@]}" -eq 0 ]]; then
        error "No hay backups disponibles en ${BACKUP_DIR}."
        exit 1
    fi

    printf 'Backups disponibles:\n\n'
    for backup in "${backups[@]}"; do
        printf '%s) %s\n' "$index" "$("$BASENAME_COMMAND" "$backup")"
        index=$((index + 1))
    done

    printf '\n'
    read -r -p "Seleccione un backup: " selected

    if ! [[ "$selected" =~ ^[0-9]+$ ]]; then
        error "Seleccion invalida."
        exit 1
    fi

    if (( selected < 1 || selected > ${#backups[@]} )); then
        error "Seleccion fuera de rango."
        exit 1
    fi

    printf '%s\n' "${backups[$((selected - 1))]}"
}

ensure_odoo_installation() {
    ensure_file "$ODOO_BIN"
    ensure_file "$REQUIREMENTS_FILE"
    ensure_file "$VENV_ACTIVATE"
    ensure_directory "$INSTALL_DIR"
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

git_value() {
    "$GIT_COMMAND" -C "$INSTALL_DIR" "$@" 2>/dev/null || printf 'N/D\n'
}

print_field() {
    local label="$1"
    local value="$2"

    printf '%-20s %s\n' "${label}:" "$value"
}

doctor_check() {
    local label="$1"

    shift

    if "$@" >/dev/null 2>&1; then
        printf '%b\n' "${GREEN}✔${RESET} ${label}"
        return
    fi

    printf '%b\n' "${RED}✘${RESET} ${label}"
    DOCTOR_FAILURES=$((DOCTOR_FAILURES + 1))
}

check_port() {
    command -v "$SS_COMMAND" >/dev/null 2>&1 || return 1
    "$SS_COMMAND" -ltn | grep -Eq ":${ODOO_PORT}[[:space:]]"
}

check_permissions() {
    [[ -w "$INSTALL_DIR" && -w "$ODOO_LOG_DIR" && -r "$ODOO_LOG_FILE" ]]
}

check_database() {
    "$PSQL_COMMAND" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc 'SELECT 1' |
        grep -qx '1'
}
