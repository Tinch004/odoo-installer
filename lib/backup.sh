#!/usr/bin/env bash

set -Eeuo pipefail

backup_main() {
    local action="${1:-create}"

    case "$action" in
    create)
        backup_create
        ;;
    schedule)
        backup_schedule
        ;;
    list)
        backup_list
        ;;
    clean)
        backup_clean
        ;;
    restore)
        backup_restore
        ;;
    help | -h | --help)
        backup_help
        ;;
    *)
        error "Comando backup desconocido: ${action}"
        backup_help
        exit 1
        ;;
    esac
}

backup_help() {
    cat <<HELP
Uso:
  odoo backup
  odoo backup schedule
  odoo backup list
  odoo backup clean
  odoo backup restore
HELP
}

backup_create() {
    local backup_file

    require_command "$PG_DUMP_COMMAND"
    run_privileged "$INSTALL_COMMAND" -d -m 0755 -o "$RUN_AS_USER" -g "$RUN_AS_GROUP" "$BACKUP_DIR"
    backup_file="${BACKUP_DIR}/$("$DATE_COMMAND" +%F_%H-%M).dump"

    "$PG_DUMP_COMMAND" \
        --username "$POSTGRES_USER" \
        --format=custom \
        --file "$backup_file" \
        "$POSTGRES_DB"

    run_privileged "$CHOWN_COMMAND" "${RUN_AS_USER}:${RUN_AS_GROUP}" "$backup_file"
    ok "Backup generado: ${backup_file}"
}

backup_schedule() {
    local option
    local cron_schedule

    step "Programar backup automatico"
    printf '1) Diario\n'
    printf '2) Semanal\n'
    printf '3) Mensual\n\n'

    while true; do
        read -r -p "Frecuencia: " option
        case "$option" in
        1)
            cron_schedule="0 2 * * *"
            break
            ;;
        2)
            cron_schedule="0 2 * * 0"
            break
            ;;
        3)
            cron_schedule="0 2 1 * *"
            break
            ;;
        *)
            warn "Opcion invalida. Ingresa 1, 2 o 3."
            ;;
        esac
    done

    write_backup_cron "$cron_schedule"
    ok "Backup automatico configurado."
}

write_backup_cron() {
    local cron_schedule="$1"
    local temp_file

    temp_file="$("$MK_TEMP_COMMAND")"
    {
        printf 'SHELL=/bin/bash\n'
        printf 'PATH=%s\n' "$CRON_PATH"
        printf '%s root %s backup >> %s 2>&1\n' "$cron_schedule" "$CLI_COMMAND" "$BACKUP_LOG_FILE"
    } >"$temp_file"

    run_privileged "$INSTALL_COMMAND" -m 0644 "$temp_file" "$BACKUP_CRON_FILE"
    "$RM_COMMAND" -f "$temp_file"
}

backup_list() {
    local backups=()
    local backup

    ensure_directory "$BACKUP_DIR"
    mapfile -t backups < <(find_backup_files)

    if [[ "${#backups[@]}" -eq 0 ]]; then
        warn "No hay backups en ${BACKUP_DIR}."
        return
    fi

    for backup in "${backups[@]}"; do
        printf '%s\n' "$backup"
    done
}

backup_clean() {
    ensure_directory "$BACKUP_DIR"
    run_privileged "$FIND_COMMAND" "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -mtime +30 -delete
    ok "Backups anteriores a 30 dias eliminados."
}

backup_restore() {
    local backup_file

    require_command "$PG_RESTORE_COMMAND"
    backup_file="$(select_backup_file)"

    warn "Restaurando ${POSTGRES_DB} desde ${backup_file}"
    odoo_service_stop || true
    terminate_database_connections
    run_postgres "$DROPDB_COMMAND" --if-exists "$POSTGRES_DB"
    run_postgres "$CREATEDB_COMMAND" --owner="$POSTGRES_USER" "$POSTGRES_DB"
    "$PG_RESTORE_COMMAND" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" "$backup_file"
    odoo_service_restart
    ok "Backup restaurado correctamente."
}

terminate_database_connections() {
    run_postgres "$PSQL_COMMAND" -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${POSTGRES_DB}' AND pid <> pg_backend_pid();"
}

select_backup_file() {
    local backups=()
    local backup
    local selected
    local index=1

    ensure_directory "$BACKUP_DIR"
    mapfile -t backups < <(find_backup_files)

    if [[ "${#backups[@]}" -eq 0 ]]; then
        error "No hay backups disponibles en ${BACKUP_DIR}."
        exit 1
    fi

    printf 'Backups disponibles:\n\n'
    for backup in "${backups[@]}"; do
        printf '%s) %s\n' "$index" "$("$BASENAME_COMMAND" "$backup")"
        index=$((index + 1))
    done

    printf '\n'
    read -r -p "Seleccione un backup: " selected

    if ! [[ "$selected" =~ ^[0-9]+$ ]]; then
        error "Seleccion invalida."
        exit 1
    fi

    if (( selected < 1 || selected > ${#backups[@]} )); then
        error "Seleccion fuera de rango."
        exit 1
    fi

    printf '%s\n' "${backups[$((selected - 1))]}"
}

find_backup_files() {
    "$FIND_COMMAND" "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' | "$SORT_COMMAND" -r
}
