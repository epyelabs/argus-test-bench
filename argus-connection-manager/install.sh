#!/bin/bash
# install.sh — Installs the sim7600-lte connection manager
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[install] Copying script to /usr/local/bin/..."
sudo cp "$SCRIPT_DIR/sim7600-lte.sh" /usr/local/bin/sim7600-lte.sh
sudo chmod +x /usr/local/bin/sim7600-lte.sh

echo "[install] Installing systemd service..."
sudo cp "$SCRIPT_DIR/sim7600-lte.service" /etc/systemd/system/sim7600-lte.service

echo "[install] Installing udev rule..."
sudo cp "$SCRIPT_DIR/99-sim7600-lte.rules" /etc/udev/rules.d/99-sim7600-lte.rules

echo "[install] Reloading udev and systemd..."
sudo udevadm control --reload-rules
sudo systemctl daemon-reload

echo "[install] Disabling ModemManager (conflict prevention)..."
sudo systemctl disable ModemManager.service 2>/dev/null || true
sudo systemctl stop ModemManager.service 2>/dev/null || true

echo "[install] Enabling sim7600-lte service..."
sudo systemctl enable sim7600-lte.service

echo ""
echo "Done. To start now:    sudo systemctl start sim7600-lte.service"
echo "      To watch logs:   journalctl -u sim7600-lte -f"
echo "      To check status: sudo systemctl status sim7600-lte.service"
