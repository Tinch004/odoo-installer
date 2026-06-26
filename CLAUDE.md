# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A Bash installer and post-install CLI for Odoo on Debian/Ubuntu. Two distinct entry points:

- `install.sh` — runs once as root to provision a new machine
- `/usr/local/bin/odoo` (generated) — the daily-use CLI, wraps `lib/cli.sh`

## Installer flow (`install.sh`)

Steps run in order:

```
banner → check_root → run_system_check → select_version → select_install_profile →
select_clone_mode → install_dependencies → install_odoo → configure_postgres →
generate_config → create_service → install_cli → start_odoo → cleanup_installation → finish
```

`install_dependencies` installs PostgreSQL via apt and immediately calls `configure_postgres_local_access` to add the `trust` rule to `pg_hba.conf` before the postgres configuration step runs. This ensures the rule is present even in environments where `systemctl` is unavailable (WSL).

## Architecture

All logic lives in `lib/`. Each file owns one domain:

| File | Responsibility |
|---|---|
| `config.sh` | All constants, paths, and command variables. Sourced first. |
| `utils.sh` | Cross-cutting helpers: `run_command`, `run_privileged`, `run_postgres`, `run_systemctl`, `start_postgres_service`, `reload_postgres_service`, `systemd_available`, `read_state_value`, `write_state_value` |
| `colors.sh` | Terminal color variables and `ok`/`warn`/`error`/`info`/`step` print functions |
| `dependencies.sh` | apt package lists and `install_dependencies` |
| `postgres.sh` | `configure_postgres`, `configure_postgres_local_access`, user/db creation |
| `config.sh` | `generate_config`, `render_odoo_config` (renders `templates/odoo.conf`) |
| `service.sh` | systemd service management for the `odoo` service |
| `odoo.sh` | Odoo operations: update, shell, logs, version, git, fix-permissions |
| `cli.sh` | `cli_main` dispatcher, `install_cli`, `create_cli_wrapper` |
| `tunnel.sh` | Cloudflare Tunnel: install, start/stop/restart, DNS creation |
| `nginx.sh` | Nginx reverse proxy: install, render config, enable site |
| `ssl.sh` | Certbot SSL: install via snap, renew, status |
| `backup.sh` | pg_dump/pg_restore, backup scheduling via cron |
| `modules.sh` | `install_module_from_git`, `list_modules` |
| `doctor.sh` | Health checks with optional `--fix` |
| `info.sh` | `odoo_info` summary panel |

## Key conventions

**State file**: `/etc/odoo-installer/state.env` — persists tunnel hostname, nginx domain, etc. across commands. Use `read_state_value KEY` / `write_state_value KEY VALUE`.

**Privilege**: The CLI can run as a normal user with sudo, or as root. `run_privileged` prepends `sudo` when not root. `run_postgres` uses `runuser -u postgres --` or `sudo -u postgres`.

**systemd fallback**: Always gate systemctl calls with `systemd_available` or use `run_systemctl`/`run_systemctl_privileged`, which silently skip when systemd is absent (WSL without systemd).

**pg_hba.conf rule**: The installer prepends `local odoo odoo trust` to `pg_hba.conf`. `configure_postgres_local_access` skips if the rule already exists. It first queries `SHOW hba_file` from psql, then falls back to `find /etc/postgresql -name pg_hba.conf` if postgres is not yet running.

**Templates**: `templates/odoo.conf` and `templates/odoo.service` use `{{PLACEHOLDER}}` substituted by `sed` in `render_odoo_config` and `render_service_template`. `list_db=False` and `dbfilter=^odoo$` are intentional — the database manager is disabled by design.

**Idempotency**: Every step checks before acting (`postgres_role_exists`, `postgres_database_exists`, grep for pg_hba rule, etc.). The installer is safe to re-run.

## Adding a new CLI command

1. Implement the function(s) in the relevant `lib/*.sh` file
2. Add a `case` branch in `cli_main` in `lib/cli.sh`
3. Add the usage line to `cli_help` in `lib/cli.sh`
4. If the command has sub-actions, follow the pattern in `tunnel.sh` or `nginx.sh` (`*_main` + `*_help`)
