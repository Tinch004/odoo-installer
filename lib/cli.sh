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
# shellcheck source=lib/service.sh
source "$ROOT_DIR/lib/service.sh"
# shellcheck source=lib/postgres.sh
source "$ROOT_DIR/lib/postgres.sh"
# shellcheck source=lib/odoo.sh
source "$ROOT_DIR/lib/odoo.sh"
# shellcheck source=lib/nginx.sh
source "$ROOT_DIR/lib/nginx.sh"
# shellcheck source=lib/tunnel.sh
source "$ROOT_DIR/lib/tunnel.sh"
# shellcheck source=lib/ssl.sh
source "$ROOT_DIR/lib/ssl.sh"
# shellcheck source=lib/backup.sh
source "$ROOT_DIR/lib/backup.sh"
# shellcheck source=lib/modules.sh
source "$ROOT_DIR/lib/modules.sh"
# shellcheck source=lib/doctor.sh
source "$ROOT_DIR/lib/doctor.sh"
# shellcheck source=lib/info.sh
source "$ROOT_DIR/lib/info.sh"

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
        odoo_service_start
        ;;
    stop)
        odoo_service_stop
        ;;
    restart)
        odoo_service_restart
        ;;
    status)
        odoo_service_status
        ;;
    logs)
        odoo_logs
        ;;
    shell)
        odoo_shell
        ;;
    config)
        odoo_config_edit
        ;;
    version)
        odoo_version
        ;;
    update)
        odoo_update
        ;;
    update-module)
        odoo_update_module "$@"
        ;;
    backup)
        backup_main "$@"
        ;;
    restore)
        backup_restore
        ;;
    git)
        odoo_git_status
        ;;
    service)
        odoo_service_show
        ;;
    fix-permissions)
        odoo_fix_permissions
        ;;
    doctor)
        doctor_main "$@"
        ;;
    tunnel)
        tunnel_main "$@"
        ;;
    nginx)
        nginx_main "$@"
        ;;
    ssl)
        ssl_main "$@"
        ;;
    install-module)
        install_module_from_git "$@"
        ;;
    list-modules)
        list_modules
        ;;
    info)
        odoo_info
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
  odoo info
  odoo update
  odoo update-module MODULO
  odoo backup
  odoo backup schedule
  odoo backup list
  odoo backup clean
  odoo backup restore
  odoo restore
  odoo git
  odoo service
  odoo fix-permissions
  odoo doctor
  odoo doctor --fix
  odoo tunnel install
  odoo tunnel start
  odoo tunnel stop
  odoo tunnel restart
  odoo tunnel status
  odoo tunnel url
  odoo nginx install
  odoo nginx restart
  odoo nginx uninstall
  odoo ssl install
  odoo ssl renew
  odoo ssl status
  odoo install-module URL_GIT
  odoo list-modules
HELP
}
