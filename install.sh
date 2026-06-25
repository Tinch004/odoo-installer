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

banner
check_root
select_version
install_dependencies
install_odoo
configure_postgres
generate_config
create_service
start_odoo
finish
