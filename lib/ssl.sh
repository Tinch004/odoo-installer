#!/usr/bin/env bash

set -Eeuo pipefail

ssl_main() {
    local action="${1:-help}"

    case "$action" in
    install)
        ssl_install
        ;;
    renew)
        ssl_renew
        ;;
    status)
        ssl_status
        ;;
    help | -h | --help)
        ssl_help
        ;;
    *)
        error "Comando ssl desconocido: ${action}"
        ssl_help
        exit 1
        ;;
    esac
}

ssl_help() {
    cat <<HELP
Uso:
  odoo ssl install
  odoo ssl renew
  odoo ssl status
HELP
}

ssl_install() {
    local domain

    if tunnel_is_configured; then
        warn "Cloudflare Tunnel ya esta configurado. SSL publico se resuelve en Cloudflare."
    fi

    domain="$(get_or_prompt_domain "NGINX_DOMAIN" "Dominio para SSL: ")"
    write_state_value "NGINX_DOMAIN" "$domain"
    nginx_install_if_needed "$domain"
    install_certbot
    run_privileged "$CERTBOT_COMMAND" --nginx -d "$domain" \
        --non-interactive --agree-tos --redirect --register-unsafely-without-email
    ssl_renew_dry_run
    ok "SSL configurado para https://${domain}"
}

nginx_install_if_needed() {
    local domain="$1"

    if nginx_is_configured; then
        return
    fi

    write_state_value "NGINX_DOMAIN" "$domain"
    install_nginx_package
    render_nginx_site "$domain"
    enable_nginx_site
    nginx_restart
}

install_certbot() {
    if command -v "$CERTBOT_COMMAND" >/dev/null 2>&1; then
        ok "certbot ya esta instalado."
        return
    fi

    run_privileged "$APT_GET_COMMAND" update
    run_privileged "$APT_GET_COMMAND" install -y snapd
    run_privileged "$SNAP_COMMAND" install core
    run_privileged "$SNAP_COMMAND" refresh core
    run_privileged "$SNAP_COMMAND" install --classic certbot
    run_privileged "$LN_COMMAND" -sf "$SNAP_CERTBOT_BIN" "$CERTBOT_BIN"
}

ssl_renew() {
    require_command "$CERTBOT_COMMAND"
    run_privileged "$CERTBOT_COMMAND" renew
}

ssl_renew_dry_run() {
    run_privileged "$CERTBOT_COMMAND" renew --dry-run
}

ssl_status() {
    require_command "$CERTBOT_COMMAND"
    run_privileged "$CERTBOT_COMMAND" certificates
}

ssl_is_configured() {
    command -v "$CERTBOT_COMMAND" >/dev/null 2>&1 &&
        "$CERTBOT_COMMAND" certificates >/dev/null 2>&1
}
