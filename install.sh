#!/usr/bin/env bash
# DEVICE: Raspberry Pi CM5 - RPi OS Bookworm 64-bit Lite
set -e

# STEP 1: Install Nodejs (using nvm)
NVM_VERSION="v0.40.3"
NODE_VERSION="${NODE_VERSION:-22}"   # argus-cli requires node >=20; 22 is current LTS

export NVM_DIR="$HOME/.nvm"

if [ -s "$NVM_DIR/nvm.sh" ]; then
  echo "[install] nvm already present at $NVM_DIR, skipping download."
else
  echo "[install] Installing nvm $NVM_VERSION..."
  curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | bash
fi

# The nvm installer edits ~/.bashrc, not this shell — load it into the current process.
. "$NVM_DIR/nvm.sh"

echo "[install] Installing Node.js $NODE_VERSION..."
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
nvm use default

echo "[install] Node $(node -v) / npm $(npm -v) ready."
# END STEP 1

# STEP 2: Install node_modules for argus-cli
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[install] Installing argus-cli dependencies..."
npm --prefix "$SCRIPT_DIR/argus-cli" ci

# END STEP 2

# CAM:
# sudo apt install rpicam-apps          # CSI cameras (full build = libav for MP4 video)
# sudo apt install v4l-utils ffmpeg     # UVC/USB camera (enumerate + capture)
# update boot/config.txt (dtoverlay for cam0,1 and camera_auto_detect=0)

# LTE: just run `argus-test-bench/argus-connection-manager/install.sh`?

# IMU: setup python and download necessary libs like adafruit_bno08x

# MIC: update boot/config.txt