#!/usr/bin/env bash

set -Eeuo pipefail

nginx_main() {
    local action="${1:-help}"

    case "$action" in
    install)
        nginx_install
        ;;
    restart)
        nginx_restart
        ;;
    uninstall)
        nginx_uninstall
        ;;
    status)
        nginx_status
        ;;
    help | -h | --help)
        nginx_help
        ;;
    *)
        error "Comando nginx desconocido: ${action}"
        nginx_help
        exit 1
        ;;
    esac
}

nginx_help() {
    cat <<HELP
Uso:
  odoo nginx install
  odoo nginx restart
  odoo nginx uninstall
HELP
}

nginx_install() {
    local domain

    domain="$(get_or_prompt_domain "NGINX_DOMAIN" "Dominio para Nginx: ")"
    write_state_value "NGINX_DOMAIN" "$domain"
    install_nginx_package
    render_nginx_site "$domain"
    enable_nginx_site
    nginx_restart
    ok "Nginx configurado para http://${domain}"
}

install_nginx_package() {
    if command -v "$NGINX_COMMAND" >/dev/null 2>&1; then
        ok "nginx ya esta instalado."
        return
    fi

    run_privileged "$APT_GET_COMMAND" update
    run_privileged "$APT_GET_COMMAND" install -y nginx
}

render_nginx_site() {
    local domain="$1"
    local temp_file

    temp_file="$("$MK_TEMP_COMMAND")"
    {
        printf 'server {\n'
        printf '    listen 80;\n'
        printf '    server_name %s;\n\n' "$domain"
        printf '    proxy_read_timeout 720s;\n'
        printf '    proxy_connect_timeout 720s;\n'
        printf '    proxy_send_timeout 720s;\n\n'
        printf '    proxy_set_header X-Forwarded-Host $host;\n'
        printf '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n'
        printf '    proxy_set_header X-Forwarded-Proto $scheme;\n'
        printf '    proxy_set_header X-Real-IP $remote_addr;\n\n'
        printf '    location / {\n'
        printf '        proxy_redirect off;\n'
        printf '        proxy_pass http://127.0.0.1:%s;\n' "$ODOO_PORT"
        printf '    }\n'
        printf '}\n'
    } >"$temp_file"

    run_privileged "$INSTALL_COMMAND" -m 0644 "$temp_file" "$NGINX_SITE_FILE"
    "$RM_COMMAND" -f "$temp_file"
}

enable_nginx_site() {
    run_privileged "$LN_COMMAND" -sfn "$NGINX_SITE_FILE" "$NGINX_ENABLED_FILE"
    run_privileged "$NGINX_COMMAND" -t
}

nginx_restart() {
    run_systemctl_privileged restart "$NGINX_SERVICE_NAME"
}

nginx_uninstall() {
    run_privileged "$RM_COMMAND" -f "$NGINX_ENABLED_FILE" "$NGINX_SITE_FILE"
    nginx_restart
    ok "Configuracion de Nginx eliminada."
}

nginx_status() {
    if ! systemd_available; then
        warn "systemd no esta disponible en este entorno."
        return 0
    fi

    "$SYSTEMCTL_COMMAND" status "$NGINX_SERVICE_NAME"
}

nginx_is_configured() {
    [[ -f "$NGINX_SITE_FILE" && -L "$NGINX_ENABLED_FILE" ]]
}

get_or_prompt_domain() {
    local state_key="$1"
    local prompt="$2"
    local domain

    domain="$(read_state_value "$state_key")"

    if [[ -z "$domain" ]]; then
        domain="$(read_state_value "TUNNEL_HOSTNAME")"
    fi

    if [[ -z "$domain" ]]; then
        domain="$(prompt_required "$prompt")"
    fi

    printf '%s\n' "$domain"
}
