#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/colors.sh
source "$ROOT_DIR/lib/colors.sh"
# shellcheck source=lib/config.sh
source "$ROOT_DIR/lib/config.sh"
# shellcheck source=lib/utils.sh
source "$ROOT_DIR/lib/utils.sh"
# shellcheck source=lib/dependencies.sh
source "$ROOT_DIR/lib/dependencies.sh"
# shellcheck source=lib/odoo.sh
source "$ROOT_DIR/lib/odoo.sh"
# shellcheck source=lib/postgres.sh
source "$ROOT_DIR/lib/postgres.sh"
# shellcheck source=lib/service.sh
source "$ROOT_DIR/lib/service.sh"
# shellcheck source=lib/cli.sh
source "$ROOT_DIR/lib/cli.sh"

INSTALL_STEP_TOTAL=14

banner
check_root
run_system_check
select_version
select_install_profile
select_clone_mode
select_enterprise_mode
install_dependencies
install_odoo
configure_postgres
generate_config
initialize_odoo_database
create_service
install_cli
start_odoo
cleanup_installation
finish
