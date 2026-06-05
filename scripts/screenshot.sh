#!/usr/bin/env bash
# Capture a screenshot from the connected (wireless) Android device.
# Usage: ./scripts/screenshot.sh [output-dir]
#   Saves to ~/Desktop by default. Auto-reconnects if the device dropped.
set -euo pipefail

OUT_DIR="${1:-$HOME/Desktop}"
FILE="portact-$(date +%Y%m%d-%H%M%S).png"

# Pick a single device serial. The same wireless phone can appear twice (an
# IP:port serial and an mDNS "_adb-tls-connect" name), which makes bare adb
# commands fail with "more than one device". Prefer the IP:port serial.
pick_serial() {
  adb devices | awk '/\tdevice$/ {print $1}' | grep -E '^[0-9]+\.[0-9]+' | head -1 \
    || true
}

SERIAL="$(pick_serial)"
if [ -z "$SERIAL" ]; then
  echo "No device attached — trying to reconnect..."
  "$(dirname "$0")/reconnect.sh" >/dev/null 2>&1 || true
  SERIAL="$(pick_serial)"
fi
if [ -z "$SERIAL" ]; then
  # fall back to any device line (e.g. USB or emulator)
  SERIAL="$(adb devices | awk '/\tdevice$/ {print $1}' | head -1)"
fi
if [ -z "$SERIAL" ]; then
  echo "No device found. Run: npm run reconnect" >&2
  exit 1
fi

adb -s "$SERIAL" shell screencap -p "/sdcard/$FILE"
adb -s "$SERIAL" pull "/sdcard/$FILE" "$OUT_DIR/$FILE"
adb -s "$SERIAL" shell rm "/sdcard/$FILE"
echo "Saved: $OUT_DIR/$FILE  (device: $SERIAL)"
