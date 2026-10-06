#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> b.sh <gstack browse command> [args...]
source "$(dirname "$0")/env.sh"
exec "$B" "$@"
