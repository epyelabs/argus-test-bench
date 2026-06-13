#!/bin/bash
# uninstall.sh — Removes the sim7600-lte connection manager
set -e

echo "[uninstall] Stopping and disabling sim7600-lte service..."
sudo systemctl stop sim7600-lte.service 2>/dev/null || true
sudo systemctl disable sim7600-lte.service 2>/dev/null || true

echo "[uninstall] Removing script from /usr/local/bin/..."
sudo rm -f /usr/local/bin/sim7600-lte.sh

echo "[uninstall] Removing systemd service..."
sudo rm -f /etc/systemd/system/sim7600-lte.service

echo "[uninstall] Removing systemd drop-in overrides (if any)..."
sudo rm -rf /etc/systemd/system/sim7600-lte.service.d

echo "[uninstall] Removing udev rule..."
sudo rm -f /etc/udev/rules.d/99-sim7600-lte.rules

echo "[uninstall] Reloading udev and systemd..."
sudo udevadm control --reload-rules
sudo systemctl daemon-reload

echo ""
echo "Done. The sim7600-lte connection manager has been removed."
echo "      Note: ModemManager was not re-enabled automatically."
echo "      To re-enable it: sudo systemctl enable --now ModemManager.service"
