#!/usr/bin/env bash

set -Eeuo pipefail

tunnel_main() {
    local action="${1:-help}"

    case "$action" in
    install)
        tunnel_install
        ;;
    start)
        tunnel_start
        ;;
    stop)
        tunnel_stop
        ;;
    restart)
        tunnel_restart
        ;;
    status)
        tunnel_status
        ;;
    url)
        tunnel_url
        ;;
    help | -h | --help)
        tunnel_help
        ;;
    *)
        error "Comando tunnel desconocido: ${action}"
        tunnel_help
        exit 1
        ;;
    esac
}

tunnel_help() {
    cat <<HELP
Uso:
  odoo tunnel install
  odoo tunnel start
  odoo tunnel stop
  odoo tunnel restart
  odoo tunnel status
  odoo tunnel url
HELP
}

tunnel_install() {
    printf '\n'
    printf '1) Con dominio propio (DNS permanente en Cloudflare)\n\n'
    printf '2) URL temporal de Cloudflare (sin dominio, sin configuracion)\n\n'

    local selected_mode=""
    while true; do
        read -r -p "Seleccione una opcion: " selected_mode
        case "$selected_mode" in
        1) tunnel_install_named; return ;;
        2) tunnel_install_quick; return ;;
        *) warn "Opcion invalida. Ingresa 1 o 2." ;;
        esac
    done
}

tunnel_install_named() {
    local domain
    local subdomain
    local hostname
    local tunnel_id

    domain="$(prompt_required "Dominio: ")"
    read -r -p "Subdominio [odoo]: " subdomain
    subdomain="${subdomain:-odoo}"
    hostname="${subdomain}.${domain}"

    install_cloudflared
    cloudflared_login_if_needed
    tunnel_id="$(ensure_named_tunnel)"
    render_cloudflared_config "$tunnel_id" "$hostname"
    create_cloudflared_service
    create_cloudflared_dns "$hostname"
    write_state_value "TUNNEL_HOSTNAME" "$hostname"
    write_state_value "TUNNEL_MODE" "named"
    tunnel_restart

    ok "Cloudflare Tunnel configurado."
    info "URL: https://${hostname}"
}

tunnel_install_quick() {
    install_cloudflared
    create_cloudflared_quick_service
    write_state_value "TUNNEL_MODE" "quick"
    tunnel_restart

    ok "Cloudflare Tunnel iniciado en modo rapido."
    info "La URL publica aparece en los logs (puede tardar unos segundos):"
    info "  odoo tunnel url"
}

create_cloudflared_quick_service() {
    local temp_file

    temp_file="$("$MK_TEMP_COMMAND")"
    {
        printf '[Unit]\n'
        printf 'Description=Cloudflare Tunnel for Odoo\n'
        printf 'After=network-online.target\n'
        printf 'Wants=network-online.target\n\n'
        printf '[Service]\n'
        printf 'Type=simple\n'
        printf 'ExecStart=%s tunnel --url %s\n' "$CLOUDFLARED_BIN" "$CLOUDFLARED_ORIGIN_SERVICE"
        printf 'Restart=always\n'
        printf 'RestartSec=5\n\n'
        printf '[Install]\n'
        printf 'WantedBy=multi-user.target\n'
    } >"$temp_file"

    run_privileged "$INSTALL_COMMAND" -m 0644 "$temp_file" "$CLOUDFLARED_SERVICE_FILE"
    "$RM_COMMAND" -f "$temp_file"
    run_systemctl_privileged daemon-reload
    run_systemctl_privileged enable "$CLOUDFLARED_SERVICE_NAME"
}

install_cloudflared() {
    if command -v "$CLOUDFLARED_COMMAND" >/dev/null 2>&1; then
        ok "cloudflared ya esta instalado."
        return
    fi

    install_cloudflared_repository
    run_privileged "$APT_GET_COMMAND" update
    run_privileged "$APT_GET_COMMAND" install -y cloudflared
}

install_cloudflared_repository() {
    local key_file
    local source_file

    key_file="$("$MK_TEMP_COMMAND")"
    source_file="$("$MK_TEMP_COMMAND")"

    "$CURL_COMMAND" -fsSL "$CLOUDFLARED_GPG_URL" -o "$key_file"
    printf '%s\n' "$CLOUDFLARED_PACKAGE_REPOSITORY" >"$source_file"

    run_privileged "$INSTALL_COMMAND" -d -m 0755 "$("$DIRNAME_COMMAND" "$CLOUDFLARED_KEYRING")"
    run_privileged "$INSTALL_COMMAND" -m 0644 "$key_file" "$CLOUDFLARED_KEYRING"
    run_privileged "$INSTALL_COMMAND" -m 0644 "$source_file" "$CLOUDFLARED_APT_SOURCE_FILE"

    "$RM_COMMAND" -f "$key_file" "$source_file"
}

cloudflared_login_if_needed() {
    if [[ -f "$CLOUDFLARED_CERT_FILE" ]]; then
        ok "Cloudflare ya tiene credenciales locales."
        return
    fi

    warn "Se abrira el flujo de autenticacion de Cloudflare en la consola."
    run_privileged "$CLOUDFLARED_COMMAND" tunnel login
}

ensure_named_tunnel() {
    local tunnel_id
    local create_output

    tunnel_id="$(get_tunnel_id)"

    if [[ -n "$tunnel_id" ]]; then
        printf '%s\n' "$tunnel_id"
        return
    fi

    create_output="$(run_privileged "$CLOUDFLARED_COMMAND" tunnel create "$CLOUDFLARED_TUNNEL_NAME" 2>&1 || true)"
    info "$create_output" >&2
    tunnel_id="$(printf '%s\n' "$create_output" | "$GREP_COMMAND" -Eo '[0-9a-fA-F-]{36}' | "$TAIL_COMMAND" -n 1)"

    if [[ -z "$tunnel_id" ]]; then
        tunnel_id="$(get_tunnel_id)"
    fi

    if [[ -z "$tunnel_id" ]]; then
        error "No se pudo obtener el ID del tunnel ${CLOUDFLARED_TUNNEL_NAME}."
        exit 1
    fi

    printf '%s\n' "$tunnel_id"
}

get_tunnel_id() {
    local json_output

    json_output="$(run_privileged "$CLOUDFLARED_COMMAND" tunnel list --name "$CLOUDFLARED_TUNNEL_NAME" --output json 2>/dev/null || true)"

    if [[ -z "$json_output" ]]; then
        return
    fi

    printf '%s\n' "$json_output" |
        "$PYTHON3_COMMAND" -c 'import json,sys; data=json.load(sys.stdin); print(data[0].get("id","") if data else "")' 2>/dev/null || true
}

render_cloudflared_config() {
    local tunnel_id="$1"
    local hostname="$2"
    local temp_file

    temp_file="$("$MK_TEMP_COMMAND")"
    {
        printf 'tunnel: %s\n' "$tunnel_id"
        printf 'credentials-file: %s/%s.json\n\n' "$CLOUDFLARED_CREDENTIALS_DIR" "$tunnel_id"
        printf 'ingress:\n'
        printf '  - hostname: %s\n' "$hostname"
        printf '    service: %s\n' "$CLOUDFLARED_ORIGIN_SERVICE"
        printf '  - service: http_status:404\n'
    } >"$temp_file"

    run_privileged "$INSTALL_COMMAND" -d -m 0755 "$CLOUDFLARED_CONFIG_DIR"
    run_privileged "$INSTALL_COMMAND" -m 0644 "$temp_file" "$CLOUDFLARED_CONFIG_FILE"
    "$RM_COMMAND" -f "$temp_file"
}

create_cloudflared_service() {
    local temp_file

    temp_file="$("$MK_TEMP_COMMAND")"
    {
        printf '[Unit]\n'
        printf 'Description=Cloudflare Tunnel for Odoo\n'
        printf 'After=network-online.target\n'
        printf 'Wants=network-online.target\n\n'
        printf '[Service]\n'
        printf 'Type=simple\n'
        printf 'ExecStart=%s --config %s tunnel run\n' "$CLOUDFLARED_BIN" "$CLOUDFLARED_CONFIG_FILE"
        printf 'Restart=always\n'
        printf 'RestartSec=5\n\n'
        printf '[Install]\n'
        printf 'WantedBy=multi-user.target\n'
    } >"$temp_file"

    run_privileged "$INSTALL_COMMAND" -m 0644 "$temp_file" "$CLOUDFLARED_SERVICE_FILE"
    "$RM_COMMAND" -f "$temp_file"
    run_systemctl_privileged daemon-reload
    run_systemctl_privileged enable "$CLOUDFLARED_SERVICE_NAME"
}

create_cloudflared_dns() {
    local hostname="$1"

    if run_privileged "$CLOUDFLARED_COMMAND" tunnel route dns "$CLOUDFLARED_TUNNEL_NAME" "$hostname"; then
        ok "DNS creado: ${hostname}"
        return
    fi

    warn "No se pudo crear el DNS automaticamente o ya existia: ${hostname}"
}

tunnel_start() {
    run_systemctl_privileged start "$CLOUDFLARED_SERVICE_NAME"
}

tunnel_stop() {
    run_systemctl_privileged stop "$CLOUDFLARED_SERVICE_NAME"
}

tunnel_restart() {
    run_systemctl_privileged restart "$CLOUDFLARED_SERVICE_NAME"
}

tunnel_status() {
    if ! systemd_available; then
        warn "systemd no esta disponible en este entorno."
        return 0
    fi

    "$SYSTEMCTL_COMMAND" status "$CLOUDFLARED_SERVICE_NAME"
}

tunnel_url() {
    local tunnel_mode
    tunnel_mode="$(read_state_value "TUNNEL_MODE")"

    if [[ "$tunnel_mode" == "quick" ]]; then
        tunnel_url_quick
        return
    fi

    local hostname
    hostname="$(read_state_value "TUNNEL_HOSTNAME")"

    if [[ -z "$hostname" ]]; then
        error "Cloudflare Tunnel no esta configurado."
        exit 1
    fi

    printf 'https://%s\n' "$hostname"
}

tunnel_url_quick() {
    local url=""

    if systemd_available; then
        url="$("$SYSTEMCTL_COMMAND" --no-pager -n 50 status "$CLOUDFLARED_SERVICE_NAME" 2>/dev/null \
            | "$GREP_COMMAND" -o 'https://[^ ]*\.trycloudflare\.com' | "$TAIL_COMMAND" -n 1 || true)"
    fi

    if [[ -z "$url" ]] && command -v journalctl >/dev/null 2>&1; then
        url="$(journalctl -u "$CLOUDFLARED_SERVICE_NAME" --no-pager -n 100 2>/dev/null \
            | "$GREP_COMMAND" -o 'https://[^ ]*\.trycloudflare\.com' | "$TAIL_COMMAND" -n 1 || true)"
    fi

    if [[ -n "$url" ]]; then
        printf '%s\n' "$url"
        return
    fi

    warn "URL aun no disponible. El tunnel puede estar iniciando."
    info "Reintenta en unos segundos con: odoo tunnel url"
    info "O revisa los logs con: journalctl -u ${CLOUDFLARED_SERVICE_NAME} -f"
}

tunnel_is_configured() {
    [[ -f "$CLOUDFLARED_SERVICE_FILE" ]]
}

tunnel_https_url() {
    local tunnel_mode
    tunnel_mode="$(read_state_value "TUNNEL_MODE")"

    if [[ "$tunnel_mode" == "quick" ]]; then
        local url=""
        if command -v journalctl >/dev/null 2>&1; then
            url="$(journalctl -u "$CLOUDFLARED_SERVICE_NAME" --no-pager -n 100 2>/dev/null \
                | "$GREP_COMMAND" -o 'https://[^ ]*\.trycloudflare\.com' | "$TAIL_COMMAND" -n 1 || true)"
        fi
        [[ -n "$url" ]] || return 1
        printf '%s\n' "$url"
        return
    fi

    local hostname
    hostname="$(read_state_value "TUNNEL_HOSTNAME")"
    [[ -n "$hostname" ]] || return 1
    printf 'https://%s\n' "$hostname"
}
