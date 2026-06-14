#!/usr/bin/env bash
# DEVICE: Raspberry Pi CM5 - RPi OS Bookworm 64-bit Lite
# Reverses install.sh. Toggles: REMOVE_APT (default 1), REMOVE_NVM (default 0).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOT_CONFIG="/boot/firmware/config.txt"

# Same step list as install.sh; run-all undoes them in reverse (step7 -> step1).
STEPS=(step1 step2 step3 step4 step5 step6 step7)

# STEP 1: Remove Node/nvm (only when REMOVE_NVM=1 — affects all Node projects on the device).
step1() {
  if [ "${REMOVE_NVM:-0}" != "1" ]; then
    echo "[uninstall] Keeping nvm/Node (set REMOVE_NVM=1 to remove). Skipping."
    return 0
  fi
  echo "[uninstall] Removing nvm and Node toolchain..."
  rm -rf "$HOME/.nvm"
  if [ -f "$HOME/.bashrc" ]; then
    # Strip the block the nvm installer appended to ~/.bashrc.
    sed -i -E '/export NVM_DIR=.*\.nvm/d; /NVM_DIR\/nvm\.sh/d; /NVM_DIR\/bash_completion/d' "$HOME/.bashrc"
  fi
  echo "[uninstall] nvm/Node removed — open a new shell so PATH drops it."
}

# STEP 2: Remove argus-cli node_modules.
step2() {
  echo "[uninstall] Removing argus-cli node_modules..."
  rm -rf "$SCRIPT_DIR/argus-cli/node_modules"
}

# STEP 3: Revert camera config; optionally remove camera packages.
step3() {
  echo "[uninstall] Reverting camera config in $BOOT_CONFIG..."
  sudo sed -i -E '/^\s*dtoverlay=imx290,cam[01]\s*$/d' "$BOOT_CONFIG"
  # Restore stock auto-detect (install set it to 0).
  if sudo grep -qE '^\s*camera_auto_detect=' "$BOOT_CONFIG"; then
    sudo sed -i -E 's/^\s*camera_auto_detect=.*/camera_auto_detect=1/' "$BOOT_CONFIG"
  fi
  if [ "${REMOVE_APT:-1}" = "1" ]; then
    echo "[uninstall] Removing camera packages..."
    sudo apt remove -y rpicam-apps v4l-utils ffmpeg || true
  else
    echo "[uninstall] Keeping camera packages (REMOVE_APT=0)."
  fi
  echo "[uninstall] Camera config reverted — reboot to apply."
}

# STEP 4: Uninstall Adafruit libs, disable I2C; optionally remove IMU packages.
step4() {
  echo "[uninstall] Uninstalling Adafruit Python libs..."
  sudo python3 -m pip uninstall -y --break-system-packages \
    adafruit-circuitpython-bno08x adafruit-blinka || true
  echo "[uninstall] Disabling I2C bus (raspi-config)..."
  sudo raspi-config nonint do_i2c 1   # 1 = disable
  if [ "${REMOVE_APT:-1}" = "1" ]; then
    echo "[uninstall] Removing IMU packages..."
    sudo apt remove -y i2c-tools python3-pip || true
  else
    echo "[uninstall] Keeping IMU packages (REMOVE_APT=0)."
  fi
}

# STEP 5: Revert microphone config.
step5() {
  echo "[uninstall] Reverting microphone config in $BOOT_CONFIG..."
  sudo sed -i -E '/^\s*dtoverlay=googlevoicehat-soundcard\s*$/d' "$BOOT_CONFIG"
  # Re-enable the onboard audio install.sh commented out.
  sudo sed -i -E 's/^(\s*)#\s*dtparam=audio=on/\1dtparam=audio=on/' "$BOOT_CONFIG"
  echo "[uninstall] Mic config reverted — reboot to apply."
}

# STEP 6: Remove the LTE connection manager (delegate to its own uninstaller).
step6() {
  echo "[uninstall] Removing LTE connection manager..."
  bash "$SCRIPT_DIR/argus-connection-manager/uninstall.sh"
}

# STEP 7: Unlink the global `argus` command (dist/ left intact — it's committed).
step7() {
  echo "[uninstall] Unlinking the 'argus' command..."
  npm rm -g argus-cli 2>/dev/null || true
}

usage() {
  echo "Usage: $(basename "$0") [step]"
  echo "  step   Undo one step, e.g. '3' or 'step3'. Omit to undo every step (reverse order)."
  echo "  Steps: ${STEPS[*]}"
  echo "  Env:   REMOVE_APT=1 (default, remove apt pkgs)  REMOVE_NVM=0 (default, keep Node)"
}

main() {
  case "${1:-}" in
    -h|--help) usage; return 0 ;;
  esac

  # No argument: undo all steps in REVERSE install order (step7 -> step1).
  if [ "$#" -eq 0 ]; then
    for (( i=${#STEPS[@]}-1; i>=0; i-- )); do "${STEPS[i]}"; done
    return 0
  fi

  # Normalize a bare number ('3') to a step name ('step3').
  local step="$1"
  [[ "$step" =~ ^[0-9]+$ ]] && step="step$step"

  for s in "${STEPS[@]}"; do
    if [ "$s" = "$step" ]; then
      "$step"
      return 0
    fi
  done

  echo "[uninstall] Unknown step: '$1'" >&2
  usage >&2
  return 1
}

main "$@"
