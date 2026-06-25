#!/usr/bin/env bash

set -Eeuo pipefail

if [[ -t 1 ]]; then
    RED=$'\033[0;31m'
    GREEN=$'\033[0;32m'
    YELLOW=$'\033[1;33m'
    BLUE=$'\033[0;34m'
    CYAN=$'\033[0;36m'
    WHITE=$'\033[1;37m'
    RESET=$'\033[0m'
else
    RED=""
    GREEN=""
    YELLOW=""
    BLUE=""
    CYAN=""
    WHITE=""
    RESET=""
fi

info() {
    printf '%b\n' "${CYAN}[INFO]${RESET} $*"
}

warn() {
    printf '%b\n' "${YELLOW}[WARN]${RESET} $*"
}

error() {
    printf '%b\n' "${RED}[ERROR]${RESET} $*"
}

ok() {
    printf '%b\n' "${GREEN}[OK]${RESET} $*"
}

step() {
    printf '\n%b\n' "${BLUE}============================================================${RESET}"
    printf '%b\n' "${WHITE}$*${RESET}"
    printf '%b\n' "${BLUE}============================================================${RESET}"
}
