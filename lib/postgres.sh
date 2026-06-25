#!/usr/bin/env bash

set -Eeuo pipefail

configure_postgres() {
    step "Configurando PostgreSQL"

    run_command "Habilitando PostgreSQL..." systemctl enable --now postgresql
    create_postgres_user
    create_postgres_database
    configure_postgres_local_access
    run_command "Recargando PostgreSQL..." systemctl reload postgresql

    ok "PostgreSQL configurado correctamente."
}

create_postgres_user() {
    if postgres_role_exists; then
        ok "El usuario PostgreSQL ${POSTGRES_USER} ya existe."
        return
    fi

    run_command "Creando usuario PostgreSQL ${POSTGRES_USER}..." \
        runuser -u postgres -- createuser "$POSTGRES_USER"
}

create_postgres_database() {
    if postgres_database_exists; then
        ok "La base PostgreSQL ${POSTGRES_DB} ya existe."
        return
    fi

    run_command "Creando base PostgreSQL ${POSTGRES_DB}..." \
        runuser -u postgres -- createdb --owner="$POSTGRES_USER" "$POSTGRES_DB"
}

postgres_role_exists() {
    runuser -u postgres -- psql -tAc \
        "SELECT 1 FROM pg_roles WHERE rolname = '${POSTGRES_USER}'" |
        grep -qx '1'
}

postgres_database_exists() {
    runuser -u postgres -- psql -tAc \
        "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" |
        grep -qx '1'
}

configure_postgres_local_access() {
    local hba_file
    local temp_file

    hba_file="$(runuser -u postgres -- psql -tAc 'SHOW hba_file;' | tr -d '[:space:]')"

    if [[ -z "$hba_file" || ! -f "$hba_file" ]]; then
        error "No se pudo detectar pg_hba.conf."
        exit 1
    fi

    if grep -Eq "^local[[:space:]]+${POSTGRES_DB}[[:space:]]+${POSTGRES_USER}[[:space:]]+trust" "$hba_file"; then
        ok "PostgreSQL ya permite acceso local para ${POSTGRES_USER}/${POSTGRES_DB}."
        return
    fi

    info "Agregando regla local acotada en ${hba_file}..."
    cp "$hba_file" "${hba_file}.odoo-installer.bak.$(date +%Y%m%d%H%M%S)"
    temp_file="$(mktemp)"

    {
        printf '# Managed by odoo-installer. Required for db_user=%s with db_password=False.\n' "$POSTGRES_USER"
        printf 'local   %s   %s   trust\n' "$POSTGRES_DB" "$POSTGRES_USER"
        cat "$hba_file"
    } >"$temp_file"

    install -m 0640 -o postgres -g postgres "$temp_file" "$hba_file"
    rm -f "$temp_file"
}
