#!/usr/bin/env bash
# =============================================================================
# Argus Test Bench — system dependency installer
# =============================================================================
# Installs the tools and libraries the argus-cli test bench shells out to.
# Target: Raspberry Pi CM5, Raspberry Pi OS Bookworm 64-bit (Lite).
#
#   sudo bash install.sh
#
# The SIM7600 LTE connection manager has its own installer in
# ../argus-connection-manager. This script does not touch it.
# =============================================================================
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
    echo "Please run as root:  sudo bash install.sh" >&2
    exit 1
fi

echo "==> Updating apt and installing system tools"
apt-get update
# rpicam-apps : FULL build (includes libav) — CSI capture + MP4 video on Pi 5/CM5.
#               The Lite image ships rpicam-apps-lite (no libav), which cannot
#               encode video; installing the full package fixes that.
# i2c-tools   : i2cdetect — IMU (BNO085) / BMS presence detection.
# alsa-utils  : arecord — microphone detection, recording, level meter.
# usbutils    : lsusb — LTE modem (SIM7600) detection.
# raspi-utils : pinctrl — RGB LED and GPIO control on the RP1 (CM5).
apt-get install -y \
    rpicam-apps \
    i2c-tools \
    alsa-utils \
    usbutils \
    raspi-utils \
    python3 \
    python3-pip

echo "==> Installing the Adafruit BNO08x stack (IMU live-data helper)"
# Bookworm marks the system Python as externally managed (PEP 668). The CLI
# spawns the default `python3`, so the libraries must be importable there —
# hence --break-system-packages. Swap for a venv if you prefer isolation
# (then point ARGUS_PYTHON_DIR / the spawned interpreter at it).
pip3 install --break-system-packages \
    adafruit-blinka \
    adafruit-circuitpython-bno08x

echo "==> Enabling the I2C interface (BNO085 is on i2c-1, GPIO2/3)"
if command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_i2c 0 || echo "    (could not auto-enable I2C; enable it manually if needed)"
fi

cat <<'EOF'

Done. Remaining manual steps:
  - I2S microphone (SPH0645): add the device-tree overlay to
    /boot/firmware/config.txt so it appears in `arecord -l`
    (e.g. a simple-audio-card / googlevoicehat-soundcard overlay), then reboot.
  - LTE connection manager: install separately from ../argus-connection-manager.

Build and run the CLI:
  cd argus-cli
  npm install
  npm run build
  node dist/cli.js        # or: npm link  →  argus
EOF
