#!/usr/bin/env bash
# DEVICE: Raspberry Pi CM5 - RPi OS Bookworm 64-bit Lite
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOT_CONFIG="/boot/firmware/config.txt"

# Ordered list of steps run when no argument is given.
STEPS=(step1 step2 step3 step4 step5)

# STEP 1: Install Nodejs (using nvm)
step1() {
  local NVM_VERSION="v0.40.3"
  local NODE_VERSION="${NODE_VERSION:-22}"   # argus-cli requires node >=20; 22 is current LTS

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
  echo "[install] NOTE: open a new shell (or run 'source ~/.bashrc') before using node/npm/argus."
}

# STEP 2: Install node_modules for argus-cli
step2() {
  echo "[install] Installing argus-cli dependencies..."
  npm --prefix "$SCRIPT_DIR/argus-cli" ci
}

# STEP 3: Cameras (Both CSI and UVC)
step3() {
  echo "[install] Installing camera packages..."
  sudo apt update
  sudo apt install -y rpicam-apps          # CSI cameras (full build = libav for MP4 video)
  sudo apt install -y v4l-utils ffmpeg     # UVC/USB camera (enumerate + capture)

  echo "[install] Configuring CSI cameras in $BOOT_CONFIG..."

  # Disable auto-detect so the explicit imx290 overlays take effect.
  if sudo grep -qE '^\s*camera_auto_detect=' "$BOOT_CONFIG"; then
    sudo sed -i -E 's/^\s*camera_auto_detect=.*/camera_auto_detect=0/' "$BOOT_CONFIG"
  else
    echo "camera_auto_detect=0" | sudo tee -a "$BOOT_CONFIG" >/dev/null
  fi

  # Add the IMX290 overlay for both CSI connectors (idempotent).
  for ov in "dtoverlay=imx290,cam0" "dtoverlay=imx290,cam1"; do
    if sudo grep -qxF "$ov" "$BOOT_CONFIG"; then
      echo "[install] '$ov' already present, skipping."
    else
      echo "$ov" | sudo tee -a "$BOOT_CONFIG" >/dev/null
    fi
  done

  echo "[install] Camera config done — reboot required for the overlays to take effect."
}

# STEP 4 - IMU: i2c-tools + Python (adafruit_bno08x). See argus-cli/src/hardware/imu.ts.
step4() {
  echo "[install] Installing IMU tooling (i2c-tools, python3-pip)..."
  sudo apt update
  sudo apt install -y i2c-tools python3-pip

  echo "[install] Installing Adafruit Python libs (system-wide)..."
  # Bookworm enforces PEP 668; --break-system-packages installs into system site-packages
  # so the bare `python3` the CLI spawns can import them.
  sudo python3 -m pip install --break-system-packages \
    adafruit-circuitpython-bno08x adafruit-blinka

  echo "[install] Enabling I2C bus (raspi-config)..."
  # Canonical enabler: writes dtparam=i2c_arm=on to config.txt AND loads the i2c-dev
  # module so /dev/i2c-1 comes up. Idempotent. (0 = enable in raspi-config's convention.)
  sudo raspi-config nonint do_i2c 0

  echo "[install] IMU setup done — reboot required for I2C to come up. Verify with: i2cdetect -y 1"
}

# STEP 5 - MIC: enable the googlevoicehat I2S soundcard overlay in config.txt.
step5() {
  echo "[install] Configuring I2S microphone in $BOOT_CONFIG..."

  # Disable the default onboard audio so the I2S overlay owns the bus (idempotent:
  # once commented, the '#' prevents the uncommented pattern from matching again).
  if sudo grep -qE '^\s*dtparam=audio=on' "$BOOT_CONFIG"; then
    sudo sed -i -E 's/^(\s*)dtparam=audio=on/\1#dtparam=audio=on/' "$BOOT_CONFIG"
  fi

  # Add the googlevoicehat soundcard overlay (matches mic.ts card hint "googlevoicehat").
  if sudo grep -qxF "dtoverlay=googlevoicehat-soundcard" "$BOOT_CONFIG"; then
    echo "[install] mic overlay already present, skipping."
  else
    echo "dtoverlay=googlevoicehat-soundcard" | sudo tee -a "$BOOT_CONFIG" >/dev/null
  fi

  echo "[install] Mic config done — reboot required. Verify with: arecord -l"
}

# STEP 6 - LTE: just run `argus-test-bench/argus-connection-manager/install.sh`?

usage() {
  echo "Usage: $(basename "$0") [step]"
  echo "  step   Run only one step, e.g. '3' or 'step3'. Omit to run every step in order."
  echo "  Steps: ${STEPS[*]}"
}

main() {
  case "${1:-}" in
    -h|--help) usage; return 0 ;;
  esac

  # No argument: run all steps in order.
  if [ "$#" -eq 0 ]; then
    for s in "${STEPS[@]}"; do "$s"; done
    return 0
  fi

  # Normalize a bare number ('3') to a step name ('step3').
  local step="$1"
  [[ "$step" =~ ^[0-9]+$ ]] && step="step$step"

  # Only run it if it's a known step.
  for s in "${STEPS[@]}"; do
    if [ "$s" = "$step" ]; then
      "$step"
      return 0
    fi
  done

  echo "[install] Unknown step: '$1'" >&2
  usage >&2
  return 1
}

main "$@"
