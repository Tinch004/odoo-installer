#!/usr/bin/env bash

set -Eeuo pipefail

DOCTOR_FAILURES=0

doctor_main() {
    local action="${1:-check}"

    case "$action" in
    check)
        doctor_check_all
        ;;
    --fix)
        doctor_fix
        ;;
    *)
        error "Uso: odoo doctor [--fix]"
        exit 1
        ;;
    esac
}

doctor_check_all() {
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
    doctor_check_optional "Nginx" nginx_is_configured "$SYSTEMCTL_COMMAND" is-active --quiet "$NGINX_SERVICE_NAME"
    doctor_check_optional "Cloudflare Tunnel" tunnel_is_configured "$SYSTEMCTL_COMMAND" is-active --quiet "$CLOUDFLARED_SERVICE_NAME"
    doctor_check_optional "HTTPS Cloudflare" tunnel_is_configured check_tunnel_https

    if [[ "$DOCTOR_FAILURES" -eq 0 ]]; then
        ok "Doctor finalizado sin problemas."
        return
    fi

    warn "Doctor detecto ${DOCTOR_FAILURES} problema(s)."
    exit 1
}

doctor_fix() {
    step "Odoo Doctor Fix"

    doctor_try_fix "permisos" odoo_fix_permissions
    doctor_try_fix "virtualenv" ensure_virtualenv
    doctor_try_fix "pip" upgrade_pip
    doctor_try_fix "requirements" install_python_requirements
    doctor_try_fix "logs" create_log_files
    doctor_try_fix "PostgreSQL" configure_postgres
    doctor_try_fix "configuracion" generate_config
    doctor_try_fix "systemd" fix_systemd_service
    doctor_try_fix "servicio" odoo_service_restart
    doctor_try_fix "nginx" fix_nginx_if_configured
    doctor_try_fix "cloudflare" fix_cloudflare_if_configured

    printf '\n'
    doctor_check_all
}

doctor_try_fix() {
    local label="$1"

    shift

    if "$@"; then
        ok "Fix aplicado: ${label}"
        return
    fi

    warn "No se pudo corregir: ${label}"
}

ensure_virtualenv() {
    if [[ -x "$PYTHON_BIN" ]]; then
        return
    fi

    create_virtualenv
}

upgrade_pip() {
    ensure_virtualenv
    "$PYTHON_BIN" -m pip install --upgrade pip wheel setuptools
}

fix_systemd_service() {
    render_service_template
    run_systemctl_privileged daemon-reload
    run_systemctl_privileged enable "$SERVICE_NAME"
}

fix_nginx_if_configured() {
    if ! nginx_is_configured; then
        warn "Nginx no esta configurado; se omite."
        return
    fi

    run_privileged "$NGINX_COMMAND" -t
    nginx_restart
}

fix_cloudflare_if_configured() {
    if ! tunnel_is_configured; then
        warn "Cloudflare Tunnel no esta configurado; se omite."
        return
    fi

    run_systemctl_privileged daemon-reload
    run_systemctl_privileged enable "$CLOUDFLARED_SERVICE_NAME"
    tunnel_restart
}

doctor_check() {
    local label="$1"

    shift

    if "$@" >/dev/null 2>&1; then
        printf '%b\n' "${GREEN}[OK]${RESET} ${label}"
        return
    fi

    printf '%b\n' "${RED}[FAIL]${RESET} ${label}"
    DOCTOR_FAILURES=$((DOCTOR_FAILURES + 1))
}

doctor_check_optional() {
    local label="$1"
    local predicate="$2"

    shift 2

    if ! "$predicate" >/dev/null 2>&1; then
        printf '%b\n' "${YELLOW}[SKIP]${RESET} ${label}"
        return
    fi

    doctor_check "$label" "$@"
}

check_port() {
    command -v "$SS_COMMAND" >/dev/null 2>&1 || return 1
    "$SS_COMMAND" -ltn | "$GREP_COMMAND" -Eq ":${ODOO_PORT}[[:space:]]"
}

check_permissions() {
    [[ -w "$INSTALL_DIR" && -w "$ODOO_LOG_DIR" && -r "$ODOO_LOG_FILE" ]]
}

check_database() {
    command -v "$PSQL_COMMAND" >/dev/null 2>&1 || return 1
    local db_password
    db_password="$(get_db_password)"
    PGPASSWORD="$db_password" "$PSQL_COMMAND" \
        -h localhost --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc 'SELECT 1' |
        "$GREP_COMMAND" -qx '1'
}

check_tunnel_https() {
    local url

    url="$(tunnel_https_url)"
    "$CURL_COMMAND" -fsSIL --max-time 10 "$url" >/dev/null
}
