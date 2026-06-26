#!/usr/bin/env bash

set -Eeuo pipefail

configure_postgres() {
    step "Configurando PostgreSQL"

    run_command "Iniciando PostgreSQL..." start_postgres_service
    create_postgres_user
    create_postgres_database
    run_command "Recargando PostgreSQL..." reload_postgres_service
    run_command "Validando conexion a PostgreSQL..." validate_postgres_connection

    ok "PostgreSQL configurado correctamente."
}

create_postgres_user() {
    local db_password
    db_password="$(get_db_password)"

    if postgres_role_exists; then
        run_command "Actualizando credenciales del usuario PostgreSQL ${POSTGRES_USER}..." \
            "$RUNUSER_COMMAND" -u postgres -- "$PSQL_COMMAND" -c \
            "ALTER ROLE ${POSTGRES_USER} LOGIN PASSWORD '${db_password}' CREATEDB;"
        return
    fi

    run_command "Creando usuario PostgreSQL ${POSTGRES_USER}..." \
        "$RUNUSER_COMMAND" -u postgres -- "$PSQL_COMMAND" -c \
        "CREATE ROLE ${POSTGRES_USER} LOGIN PASSWORD '${db_password}' CREATEDB;"
}

validate_postgres_connection() {
    local db_password
    db_password="$(get_db_password)"

    if PGPASSWORD="$db_password" "$PSQL_COMMAND" \
        -h localhost -U "$POSTGRES_USER" -d postgres \
        -c "SELECT 1;" >/dev/null 2>&1; then
        ok "Conexion a PostgreSQL validada."
        return
    fi

    error "No se pudo conectar a PostgreSQL como ${POSTGRES_USER} en localhost."
    error "Verifica que PostgreSQL acepte conexiones TCP en 127.0.0.1 (pg_hba.conf: host all odoo 127.0.0.1/32 scram-sha-256)."
    exit 1
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

