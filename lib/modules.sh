#!/usr/bin/env bash

set -Eeuo pipefail

install_module_from_git() {
    local repository_url="${1:-}"
    local temp_dir

    if [[ -z "$repository_url" ]]; then
        error "Uso: odoo install-module URL_GIT"
        exit 1
    fi

    ensure_odoo_installation
    temp_dir="$("$MK_TEMP_COMMAND" -d)"

    run_command "Clonando repositorio de modulos..." \
        "$GIT_COMMAND" clone "$repository_url" "$temp_dir"

    copy_detected_modules "$temp_dir"
    "$RM_COMMAND" -rf "$temp_dir"
    update_apps_list
    ok "Modulos disponibles en ${SOURCES_DIR}."
}

copy_detected_modules() {
    local repository_dir="$1"
    local manifests=()
    local manifest
    local module_dir
    local module_name
    local target_dir
    local copied=0

    run_privileged "$INSTALL_COMMAND" -d -m 0755 -o "$RUN_AS_USER" -g "$RUN_AS_GROUP" "$SOURCES_DIR"
    mapfile -t manifests < <(find_module_manifests "$repository_dir")

    if [[ "${#manifests[@]}" -eq 0 ]]; then
        error "No se encontraron modulos Odoo en el repositorio."
        exit 1
    fi

    for manifest in "${manifests[@]}"; do
        module_dir="$(dirname "$manifest")"
        module_name="$("$BASENAME_COMMAND" "$module_dir")"
        target_dir="${SOURCES_DIR}/${module_name}"

        remove_existing_module "$target_dir"
        run_privileged "$CP_COMMAND" -a "$module_dir" "$SOURCES_DIR/"
        run_privileged "$CHOWN_COMMAND" -R "${RUN_AS_USER}:${RUN_AS_GROUP}" "$target_dir"
        copied=$((copied + 1))
        ok "Modulo copiado: ${module_name}"
    done

    info "Total de modulos detectados: ${copied}"
}

remove_existing_module() {
    local target_dir="$1"

    if [[ "$target_dir" != "$SOURCES_DIR/"* ]]; then
        error "Ruta de modulo inesperada: ${target_dir}"
        exit 1
    fi

    if [[ -d "$target_dir" ]]; then
        warn "Reemplazando modulo existente: ${target_dir}"
        run_privileged "$RM_COMMAND" -rf "$target_dir"
    fi
}

update_apps_list() {
    run_command "Actualizando lista de aplicaciones..." \
        "$PYTHON_BIN" "$ODOO_BIN" -c "$ODOO_CONF" -d "$POSTGRES_DB" -u base --stop-after-init
    odoo_service_restart
}

list_modules() {
    local manifests=()
    local manifest

    mapfile -t manifests < <(
        find_module_manifests "$ADDONS_DIR"
        find_module_manifests "$SOURCES_DIR"
    )

    if [[ "${#manifests[@]}" -eq 0 ]]; then
        warn "No se encontraron modulos."
        return
    fi

    printf '%-32s %-16s %-12s %s\n' "Nombre" "Version" "Manifest" "Ruta"
    printf '%-32s %-16s %-12s %s\n' "------" "-------" "--------" "----"

    for manifest in "${manifests[@]}"; do
        print_module_row "$manifest"
    done
}

print_module_row() {
    local manifest="$1"
    local module_dir
    local module_name
    local module_version
    local manifest_name

    module_dir="$(dirname "$manifest")"
    module_name="$("$BASENAME_COMMAND" "$module_dir")"
    module_version="$(get_manifest_version "$manifest")"
    manifest_name="$("$BASENAME_COMMAND" "$manifest")"

    printf '%-32s %-16s %-12s %s\n' "$module_name" "$module_version" "$manifest_name" "$module_dir"
}

find_module_manifests() {
    local search_dir="$1"

    if [[ ! -d "$search_dir" ]]; then
        return
    fi

    "$FIND_COMMAND" "$search_dir" -type f \( -name '__manifest__.py' -o -name '__openerp__.py' \) |
        "$SORT_COMMAND"
}

get_manifest_version() {
    local manifest="$1"
    local version

    version="$("$AWK_COMMAND" -F "['\"]" '/version[[:space:]]*:/ { print $4; exit }' "$manifest")"

    if [[ -z "$version" ]]; then
        version="N/D"
    fi

    printf '%s\n' "$version"
}
