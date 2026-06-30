#!/usr/bin/env bash

set -Eeuo pipefail

select_enterprise_mode() {
    printf '\n'
    printf '1) Community (repositorio publico, gratuito)\n\n'
    printf '2) Enterprise (repositorio privado, requiere acceso de Odoo)\n\n'

    while true; do
        read -r -p "Seleccione edicion: " selected_edition
        case "$selected_edition" in
        1)
            ENTERPRISE_MODE="community"
            return
            ;;
        2)
            ENTERPRISE_MODE="enterprise"
            resolve_enterprise_auth
            return
            ;;
        *)
            warn "Opcion invalida. Ingresa 1 o 2."
            ;;
        esac
    done
}

has_ssh_enterprise_access() {
    GIT_TERMINAL_PROMPT=0 \
    GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes" \
        "$GIT_COMMAND" ls-remote git@github.com:odoo/enterprise.git HEAD >/dev/null 2>&1
}

resolve_enterprise_auth() {
    info "Verificando acceso SSH a github.com/odoo/enterprise..."

    if has_ssh_enterprise_access; then
        ok "Acceso SSH confirmado. No se necesitan credenciales adicionales."
        ENTERPRISE_REPO_URL="git@github.com:odoo/enterprise.git"
        return
    fi

    warn "Sin acceso SSH al repositorio Enterprise."
    info "Genera un Personal Access Token en: github.com/settings/tokens (scope: repo)"
    printf '\n'
    read -r -p "GitHub usuario: " ENTERPRISE_GITHUB_USER
    read -r -s -p "GitHub token (PAT): " ENTERPRISE_GITHUB_TOKEN
    printf '\n'
    ENTERPRISE_REPO_URL="https://${ENTERPRISE_GITHUB_USER}:${ENTERPRISE_GITHUB_TOKEN}@github.com/odoo/enterprise.git"
}

clone_enterprise_repository() {
    if [[ "$ENTERPRISE_MODE" != "enterprise" ]]; then
        return
    fi

    if [[ -d "$ENTERPRISE_DIR" ]] && directory_has_content "$ENTERPRISE_DIR"; then
        ok "Enterprise ya existe en ${ENTERPRISE_DIR}."
        return
    fi

    local clone_args=()
    if [[ "$CLONE_MODE" == "fast" ]]; then
        clone_args=(--depth "$CLONE_DEPTH")
    fi

    run_command "Clonando Odoo Enterprise ${ODOO_VERSION}..." \
        "$GIT_COMMAND" clone --branch "$ODOO_VERSION" "${clone_args[@]}" "$ENTERPRISE_REPO_URL" "$ENTERPRISE_DIR"

    run_command "Configurando permisos de ${ENTERPRISE_DIR}..." \
        "$CHOWN_COMMAND" -R "${RUN_AS_USER}:${RUN_AS_GROUP}" "$ENTERPRISE_DIR"

    write_state_value "ENTERPRISE_MODE" "enterprise"
    write_state_value "ENTERPRISE_DIR" "$ENTERPRISE_DIR"
}

install_odoo() {
    step "Instalando Odoo"

    if [[ -f "$ODOO_BIN" ]]; then
        handle_existing_installation
        return
    fi

    prepare_install_directory
    clone_odoo_repository
    clone_enterprise_repository
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

    "$FIND_COMMAND" "$directory" -mindepth 1 -maxdepth 1 -print -quit | "$GREP_COMMAND" -q .
}

clone_odoo_repository() {
    local clone_args=()

    ensure_download_space

    if [[ "$CLONE_MODE" == "fast" ]]; then
        clone_args=(--depth "$CLONE_DEPTH")
    fi

    run_command "Clonando Odoo ${ODOO_VERSION}..." \
        "$GIT_COMMAND" clone --branch "$ODOO_VERSION" "${clone_args[@]}" "$ODOO_REPOSITORY" "$INSTALL_DIR"
}

create_runtime_directories() {
    run_command "Creando directorios runtime..." "$MKDIR_COMMAND" -p "$SOURCES_DIR" "$DATA_DIR" "$BACKUP_DIR"
}

create_virtualenv() {
    run_command "Creando entorno virtual..." "$PYTHON3_COMMAND" -m venv "$VENV_DIR"
}

install_python_requirements() {
    run_command "Actualizando pip, wheel y setuptools..." \
        "$PYTHON_BIN" -m pip install --upgrade pip wheel setuptools

    run_command "Instalando requirements.txt de Odoo..." \
        "$PYTHON_BIN" -m pip install -r "$REQUIREMENTS_FILE"
}

update_odoo() {
    run_command "Actualizando repositorio Odoo..." "$GIT_COMMAND" -C "$INSTALL_DIR" pull
    create_runtime_directories

    if [[ ! -x "$PYTHON_BIN" ]]; then
        create_virtualenv
    fi

    run_command "Actualizando requirements.txt en el entorno virtual..." \
        "$PYTHON_BIN" -m pip install -r "$REQUIREMENTS_FILE"

    set_installation_permissions
    ok "Odoo actualizado correctamente."
}

reinstall_odoo() {
    warn "Eliminando solamente ${INSTALL_DIR}..."
    safe_remove_install_dir
    safe_remove_enterprise_dir

    clone_odoo_repository
    clone_enterprise_repository
    create_runtime_directories
    create_virtualenv
    install_python_requirements
    set_installation_permissions

    ok "Odoo reinstalado correctamente."
}

set_installation_permissions() {
    run_command "Configurando permisos de ${INSTALL_DIR}..." \
        "$CHOWN_COMMAND" -R "${RUN_AS_USER}:${RUN_AS_GROUP}" "$INSTALL_DIR"
}

odoo_logs() {
    ensure_file "$ODOO_LOG_FILE"
    "$TAIL_COMMAND" -f "$ODOO_LOG_FILE"
}

odoo_shell() {
    ensure_directory "$INSTALL_DIR"
    ensure_file "$VENV_ACTIVATE"

    cd "$INSTALL_DIR"
    # shellcheck source=/dev/null
    source "$VENV_ACTIVATE"
    exec "${SHELL:-/bin/bash}" -i
}

odoo_config_edit() {
    ensure_file "$ODOO_CONF"
    run_privileged "$NANO_COMMAND" "$ODOO_CONF"
}

odoo_version() {
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

odoo_update() {
    ensure_odoo_installation

    (
        cd "$INSTALL_DIR"
        "$GIT_COMMAND" pull
        # shellcheck source=/dev/null
        source "$VENV_ACTIVATE"
        "$PYTHON_BIN" -m pip install -r "$REQUIREMENTS_FILE"
    )

    local enterprise_mode
    enterprise_mode="$(read_state_value "ENTERPRISE_MODE" || true)"
    if [[ "$enterprise_mode" == "enterprise" && -d "$ENTERPRISE_DIR" ]]; then
        run_command "Actualizando Odoo Enterprise..." \
            "$GIT_COMMAND" -C "$ENTERPRISE_DIR" pull
    fi

    odoo_service_restart
    ok "Odoo actualizado correctamente."
}

odoo_update_module() {
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

    odoo_service_restart
    ok "Modulo actualizado: ${module_name}"
}

odoo_git_status() {
    ensure_odoo_installation

    print_field "Branch" "$(git_value rev-parse --abbrev-ref HEAD)"
    print_field "Ultimo commit" "$(git_value log -1 --oneline)"
    print_field "Repositorio" "$(git_value remote get-url origin)"
    printf '\nEstado:\n'
    "$GIT_COMMAND" -C "$INSTALL_DIR" status --short
}

odoo_fix_permissions() {
    run_privileged "$INSTALL_COMMAND" -d -m 0755 -o "$RUN_AS_USER" -g "$RUN_AS_GROUP" \
        "$ODOO_LOG_DIR" "$BACKUP_DIR" "$SOURCES_DIR" "$DATA_DIR"
    run_privileged "$TOUCH_COMMAND" "$ODOO_LOG_FILE"
    run_privileged "$CHOWN_COMMAND" -R "${RUN_AS_USER}:${RUN_AS_GROUP}" \
        "$INSTALL_DIR" "$ODOO_LOG_DIR"
    run_privileged "$CHMOD_COMMAND" 0644 "$ODOO_LOG_FILE"
    ok "Permisos corregidos."
}

initialize_odoo_database() {
    step "Inicializando base de datos"

    if odoo_database_initialized; then
        ok "La base de datos ya esta inicializada."
        return
    fi

    run_command "Ejecutando -i base (puede tardar varios minutos)..." \
        "$SUDO_COMMAND" -u "$RUN_AS_USER" \
        "$PYTHON_BIN" "$ODOO_BIN" \
        -c "$ODOO_CONF" \
        -d "$POSTGRES_DB" \
        -i base \
        --without-demo=all \
        --stop-after-init

    if ! odoo_database_initialized; then
        error "La base de datos no quedo inicializada correctamente."
        error "Revisa los logs: $ODOO_LOG_FILE"
        exit 1
    fi

    ok "Base de datos inicializada correctamente."
}

odoo_database_initialized() {
    PGPASSWORD="$(get_db_password)" "$PSQL_COMMAND" \
        -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
        "SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'ir_module_module'" 2>/dev/null |
        "$GREP_COMMAND" -qx '1'
}
