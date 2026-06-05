#!/usr/bin/env bash
# Rediscover and reconnect to the wireless Android device via mDNS.
# The wireless-debugging port changes on each restart, so we always
# look it up fresh rather than hardcoding an address.
set -euo pipefail

ADDR="$(adb mdns services 2>/dev/null \
  | awk '/_adb-tls-connect/ {print $NF; exit}')"

if [ -z "${ADDR:-}" ]; then
  echo "No wireless device found via mDNS." >&2
  echo "On the phone: Settings > Developer options > Wireless debugging (ON)," >&2
  echo "ensure it's on the same Wi-Fi, then re-run." >&2
  exit 1
fi

adb connect "$ADDR"
adb devices -l
