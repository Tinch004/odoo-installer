#!/usr/bin/env bash

set -Eeuo pipefail

APT_MINIMAL_PACKAGES=(
    build-essential
    ca-certificates
    curl
    g++
    gcc
    git
    libffi-dev
    libfreetype6-dev
    libfribidi-dev
    libharfbuzz-dev
    libjpeg-dev
    liblcms2-dev
    libldap2-dev
    libopenjp2-7-dev
    libpq-dev
    libsasl2-dev
    libssl-dev
    libtiff-dev
    libwebp-dev
    libxcb1-dev
    libxml2-dev
    libxslt1-dev
    pkg-config
    postgresql
    python3
    python3-dev
    python3-pip
    python3-setuptools
    python3-venv
    python3-wheel
    zlib1g-dev
)

APT_FULL_EXTRA_PACKAGES=(
    fontconfig
    node-less
    npm
    software-properties-common
    unzip
    wget
    wkhtmltopdf
    xz-utils
)

install_dependencies() {
    step "Instalando dependencias"
    ensure_supported_ubuntu
    require_command "$APT_GET_COMMAND"

    export DEBIAN_FRONTEND=noninteractive

    run_command "Actualizando indices de APT..." "$APT_GET_COMMAND" update
    install_minimal_dependencies

    if [[ "$INSTALL_PROFILE" == "full" ]]; then
        install_full_dependencies
    else
        info "Perfil minimo activo: se omiten herramientas opcionales."
    fi

    ok "Dependencias instaladas correctamente."
}

install_minimal_dependencies() {
    run_command "Instalando perfil minimo..." \
        "$APT_GET_COMMAND" install -y --no-install-recommends "${APT_MINIMAL_PACKAGES[@]}"
}

install_full_dependencies() {
    run_command "Instalando extras del perfil completo..." \
        "$APT_GET_COMMAND" install -y --no-install-recommends "${APT_FULL_EXTRA_PACKAGES[@]}"
    install_rtlcss
}

install_rtlcss() {
    if command -v rtlcss >/dev/null 2>&1; then
        ok "rtlcss ya esta instalado."
        return
    fi

    run_command "Instalando rtlcss..." "$NPM_COMMAND" install -g rtlcss
}
