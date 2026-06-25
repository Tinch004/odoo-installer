#!/usr/bin/env bash

set -Eeuo pipefail

create_service() {
    step "Creando servicio systemd"
    render_service_template
    run_command "Recargando systemd..." "$SYSTEMCTL_COMMAND" daemon-reload
    run_command "Habilitando servicio ${SERVICE_NAME}..." "$SYSTEMCTL_COMMAND" enable "$SERVICE_NAME"
    ok "Servicio ${SERVICE_NAME} creado correctamente."
}

odoo_service_start() {
    run_privileged "$SYSTEMCTL_COMMAND" start "$SERVICE_NAME"
}

odoo_service_stop() {
    run_privileged "$SYSTEMCTL_COMMAND" stop "$SERVICE_NAME"
}

odoo_service_restart() {
    run_privileged "$SYSTEMCTL_COMMAND" restart "$SERVICE_NAME"
}

odoo_service_status() {
    "$SYSTEMCTL_COMMAND" status "$SERVICE_NAME"
}

odoo_service_show() {
    ensure_file "$SERVICE_FILE"
    "$CAT_COMMAND" "$SERVICE_FILE"
}

start_odoo() {
    step "Iniciando Odoo"
    run_command "Reiniciando servicio ${SERVICE_NAME}..." "$SYSTEMCTL_COMMAND" restart "$SERVICE_NAME"

    if "$SYSTEMCTL_COMMAND" is-active --quiet "$SERVICE_NAME"; then
        ok "El servicio ${SERVICE_NAME} esta activo."
        return
    fi

    error "El servicio ${SERVICE_NAME} no quedo activo. Revisa: journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
    exit 1
}

render_service_template() {
    local temp_file

    temp_file="$("$MK_TEMP_COMMAND")"
    "$SED_COMMAND" \
        -e "s|{{SERVICE_NAME}}|${SERVICE_NAME}|g" \
        -e "s|{{RUN_AS_USER}}|${RUN_AS_USER}|g" \
        -e "s|{{RUN_AS_GROUP}}|${RUN_AS_GROUP}|g" \
        -e "s|{{INSTALL_DIR}}|${INSTALL_DIR}|g" \
        -e "s|{{VENV_DIR}}|${VENV_DIR}|g" \
        -e "s|{{ODOO_BIN}}|${ODOO_BIN}|g" \
        -e "s|{{ODOO_CONF}}|${ODOO_CONF}|g" \
        "$ODOO_SERVICE_TEMPLATE" >"$temp_file"

    "$INSTALL_COMMAND" -m 0644 "$temp_file" "$SERVICE_FILE"
    "$RM_COMMAND" -f "$temp_file"
}
