#!/usr/bin/env bash

set -Eeuo pipefail

APT_PACKAGES=(
    build-essential
    ca-certificates
    curl
    fontconfig
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
    node-less
    npm
    pkg-config
    postgresql
    python3
    python3-dev
    python3-pip
    python3-setuptools
    python3-venv
    python3-wheel
    software-properties-common
    unzip
    wget
    wkhtmltopdf
    xz-utils
    zlib1g-dev
)

install_dependencies() {
    step "Instalando dependencias"
    ensure_supported_ubuntu
    require_command "$APT_GET_COMMAND"

    export DEBIAN_FRONTEND=noninteractive

    run_command "Actualizando indices de APT..." "$APT_GET_COMMAND" update
    run_command "Instalando paquetes del sistema..." \
        "$APT_GET_COMMAND" install -y --no-install-recommends "${APT_PACKAGES[@]}"

    install_rtlcss

    ok "Dependencias instaladas correctamente."
}

install_rtlcss() {
    if command -v rtlcss >/dev/null 2>&1; then
        ok "rtlcss ya esta instalado."
        return
    fi

    run_command "Instalando rtlcss..." "$NPM_COMMAND" install -g rtlcss
}
