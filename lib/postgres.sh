#!/usr/bin/env bash

set -Eeuo pipefail

configure_postgres() {
    step "Configurando PostgreSQL"

    run_command "Iniciando PostgreSQL..." start_postgres_service
    create_postgres_user
    create_postgres_database
    configure_postgres_local_access
    run_command "Recargando PostgreSQL..." reload_postgres_service

    ok "PostgreSQL configurado correctamente."
}

create_postgres_user() {
    if postgres_role_exists; then
        ok "El usuario PostgreSQL ${POSTGRES_USER} ya existe."
        return
    fi

    run_command "Creando usuario PostgreSQL ${POSTGRES_USER}..." \
        "$RUNUSER_COMMAND" -u postgres -- "$CREATEUSER_COMMAND" "$POSTGRES_USER"
}

create_postgres_database() {
    if postgres_database_exists; then
        ok "La base PostgreSQL ${POSTGRES_DB} ya existe."
        return
    fi

    run_command "Creando base PostgreSQL ${POSTGRES_DB}..." \
        "$RUNUSER_COMMAND" -u postgres -- "$CREATEDB_COMMAND" --owner="$POSTGRES_USER" "$POSTGRES_DB"
}

postgres_role_exists() {
    "$RUNUSER_COMMAND" -u postgres -- "$PSQL_COMMAND" -tAc \
        "SELECT 1 FROM pg_roles WHERE rolname = '${POSTGRES_USER}'" |
        "$GREP_COMMAND" -qx '1'
}

postgres_database_exists() {
    "$RUNUSER_COMMAND" -u postgres -- "$PSQL_COMMAND" -tAc \
        "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" |
        "$GREP_COMMAND" -qx '1'
}

configure_postgres_local_access() {
    local hba_file
    local temp_file

    hba_file="$("$RUNUSER_COMMAND" -u postgres -- "$PSQL_COMMAND" -tAc 'SHOW hba_file;' 2>/dev/null | "$TR_COMMAND" -d '[:space:]' || true)"

    if [[ -z "$hba_file" || ! -f "$hba_file" ]]; then
        hba_file="$("$FIND_COMMAND" /etc/postgresql -name "pg_hba.conf" 2>/dev/null | "$SORT_COMMAND" -V | "$TAIL_COMMAND" -n 1 || true)"
    fi

    if [[ -z "$hba_file" || ! -f "$hba_file" ]]; then
        error "No se pudo detectar pg_hba.conf."
        exit 1
    fi

    if "$GREP_COMMAND" -Eq "^local[[:space:]]+${POSTGRES_DB}[[:space:]]+${POSTGRES_USER}[[:space:]]+trust" "$hba_file"; then
        ok "PostgreSQL ya permite acceso local para ${POSTGRES_USER}/${POSTGRES_DB}."
        return
    fi

    info "Agregando regla local acotada en ${hba_file}..."
    "$CP_COMMAND" "$hba_file" "${hba_file}.odoo-installer.bak.$("$DATE_COMMAND" +%Y%m%d%H%M%S)"
    temp_file="$("$MK_TEMP_COMMAND")"

    {
        printf '# Managed by odoo-installer. Required for db_user=%s with db_password=False.\n' "$POSTGRES_USER"
        printf 'local   %s   %s   trust\n' "$POSTGRES_DB" "$POSTGRES_USER"
        "$CAT_COMMAND" "$hba_file"
    } >"$temp_file"

    "$INSTALL_COMMAND" -m 0640 -o postgres -g postgres "$temp_file" "$hba_file"
    "$RM_COMMAND" -f "$temp_file"
}
