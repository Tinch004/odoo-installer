#!/usr/bin/env bash

set -Eeuo pipefail

create_service() {
    step "Creando servicio systemd"
    render_service_template
    run_command "Recargando systemd..." systemctl daemon-reload
    run_command "Habilitando servicio ${SERVICE_NAME}..." systemctl enable "$SERVICE_NAME"
    ok "Servicio ${SERVICE_NAME} creado correctamente."
}

start_odoo() {
    step "Iniciando Odoo"
    run_command "Reiniciando servicio ${SERVICE_NAME}..." systemctl restart "$SERVICE_NAME"

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        ok "El servicio ${SERVICE_NAME} esta activo."
        return
    fi

    error "El servicio ${SERVICE_NAME} no quedo activo. Revisa: journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
    exit 1
}

render_service_template() {
    local temp_file

    temp_file="$(mktemp)"
    sed \
        -e "s|{{SERVICE_NAME}}|${SERVICE_NAME}|g" \
        -e "s|{{RUN_AS_USER}}|${RUN_AS_USER}|g" \
        -e "s|{{RUN_AS_GROUP}}|${RUN_AS_GROUP}|g" \
        -e "s|{{INSTALL_DIR}}|${INSTALL_DIR}|g" \
        -e "s|{{VENV_DIR}}|${VENV_DIR}|g" \
        -e "s|{{ODOO_BIN}}|${ODOO_BIN}|g" \
        -e "s|{{ODOO_CONF}}|${ODOO_CONF}|g" \
        "$ODOO_SERVICE_TEMPLATE" >"$temp_file"

    install -m 0644 "$temp_file" "$SERVICE_FILE"
    rm -f "$temp_file"
}
