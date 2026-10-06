#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> b.sh <gstack browse command> [args...]
# Runs one gstack browse command against this lane's own browser daemon.
source "$(dirname "$0")/env.sh"
exec "$B" "$@"
