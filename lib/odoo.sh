#!/usr/bin/env bash

set -Eeuo pipefail

install_odoo() {
    step "Instalando Odoo"

    if [[ -f "$ODOO_BIN" ]]; then
        handle_existing_installation
        return
    fi

    prepare_install_directory
    clone_odoo_repository
    create_runtime_directories
    create_virtualenv
    install_python_requirements
    set_installation_permissions

    ok "Odoo instalado correctamente."
}

handle_existing_installation() {
    warn "Ya existe una instalacion de Odoo en ${INSTALL_DIR}."
    printf '\n'
    printf '1) Actualizar\n\n'
    printf '2) Reinstalar\n\n'
    printf '3) Cancelar\n\n'

    while true; do
        read -r -p "Seleccione una opcion: " selected_action

        case "$selected_action" in
        1)
            update_odoo
            return
            ;;
        2)
            reinstall_odoo
            return
            ;;
        3)
            warn "Instalacion cancelada."
            exit 0
            ;;
        *)
            warn "Opcion invalida. Ingresa 1, 2 o 3."
            ;;
        esac
    done
}

prepare_install_directory() {
    if [[ -e "$INSTALL_DIR" && ! -d "$INSTALL_DIR" ]]; then
        error "${INSTALL_DIR} existe y no es un directorio."
        exit 1
    fi

    if [[ -d "$INSTALL_DIR" ]] && directory_has_content "$INSTALL_DIR"; then
        error "${INSTALL_DIR} ya existe pero no parece ser una instalacion valida de Odoo."
        error "El instalador solo elimina ${INSTALL_DIR} cuando elegis Reinstalar sobre una instalacion existente."
        exit 1
    fi
}

directory_has_content() {
    local directory="$1"

    find "$directory" -mindepth 1 -maxdepth 1 -print -quit | grep -q .
}

clone_odoo_repository() {
    run_command "Clonando Odoo ${ODOO_VERSION}..." \
        git clone --branch "$ODOO_VERSION" "$ODOO_REPOSITORY" "$INSTALL_DIR"
}

create_runtime_directories() {
    run_command "Creando directorios runtime..." mkdir -p "$SOURCES_DIR" "$DATA_DIR"
}

create_virtualenv() {
    run_command "Creando entorno virtual..." python3 -m venv "$VENV_DIR"
}

install_python_requirements() {
    run_command "Actualizando pip, wheel y setuptools..." \
        "$VENV_DIR/bin/python" -m pip install --upgrade pip wheel setuptools

    run_command "Instalando requirements.txt de Odoo..." \
        "$VENV_DIR/bin/python" -m pip install -r "$REQUIREMENTS_FILE"
}

update_odoo() {
    run_command "Actualizando repositorio Odoo..." git -C "$INSTALL_DIR" pull
    create_runtime_directories

    if [[ ! -x "$VENV_DIR/bin/python" ]]; then
        create_virtualenv
    fi

    run_command "Actualizando requirements.txt en el entorno virtual..." \
        "$VENV_DIR/bin/python" -m pip install -r "$REQUIREMENTS_FILE"

    set_installation_permissions
    ok "Odoo actualizado correctamente."
}

reinstall_odoo() {
    warn "Eliminando solamente ${INSTALL_DIR}..."
    safe_remove_install_dir

    clone_odoo_repository
    create_runtime_directories
    create_virtualenv
    install_python_requirements
    set_installation_permissions

    ok "Odoo reinstalado correctamente."
}

set_installation_permissions() {
    run_command "Configurando permisos de ${INSTALL_DIR}..." \
        chown -R "${RUN_AS_USER}:${RUN_AS_GROUP}" "$INSTALL_DIR"
}
