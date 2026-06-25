#!/usr/bin/env bash

set -Eeuo pipefail

odoo_info() {
    local python_version
    local pip_version

    python_version="$(get_command_output "$PYTHON_BIN" --version)"
    pip_version="$(get_command_output "$PYTHON_BIN" -m pip --version)"

    step "Odoo Info"
    print_field "Version de Odoo" "$(get_odoo_version)"
    print_field "Branch" "$(git_value rev-parse --abbrev-ref HEAD)"
    print_field "Ultimo commit" "$(git_value log -1 --oneline)"
    print_field "Python" "$python_version"
    print_field "Pip" "$pip_version"
    print_field "Virtualenv" "$VENV_DIR"
    print_field "Ruta de instalacion" "$INSTALL_DIR"
    print_field "Puerto" "$ODOO_PORT"
    print_field "Servicio" "$(service_status_text "$SERVICE_NAME")"
    print_field "Base de datos" "$POSTGRES_DB"
    print_field "Usuario PostgreSQL" "$POSTGRES_USER"
    print_field "Carpeta addons" "$ADDONS_DIR"
    print_field "Carpeta sources" "$SOURCES_DIR"
    print_field "Carpeta backups" "$BACKUP_DIR"
    print_field "Estado de Nginx" "$(service_status_text "$NGINX_SERVICE_NAME")"
    print_field "Cloudflare Tunnel" "$(cloudflare_status_text)"
    print_field "Estado del SSL" "$(ssl_status_text)"
}

get_command_output() {
    "$@" 2>/dev/null || printf 'N/D\n'
}

service_status_text() {
    local service_name="$1"

    if service_is_active "$service_name"; then
        printf 'activo\n'
        return
    fi

    if "$SYSTEMCTL_COMMAND" list-unit-files "$service_name.service" >/dev/null 2>&1; then
        printf 'inactivo\n'
        return
    fi

    printf 'no instalado\n'
}

cloudflare_status_text() {
    local url

    if ! tunnel_is_configured; then
        printf 'no configurado\n'
        return
    fi

    url="$(tunnel_https_url || true)"

    if service_is_active "$CLOUDFLARED_SERVICE_NAME"; then
        printf 'activo'
    else
        printf 'inactivo'
    fi

    if [[ -n "$url" ]]; then
        printf ' (%s)' "$url"
    fi

    printf '\n'
}

ssl_status_text() {
    if ssl_is_configured; then
        printf 'configurado\n'
        return
    fi

    printf 'no configurado\n'
}
