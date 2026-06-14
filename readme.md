# Argus Test Bench

A hardware test suite and management software for the **Argus CM5 Edge Video Node v1.0** — a
Raspberry Pi CM5 carrier board with dual CSI cameras (plus USB/UVC), a SIM7600G LTE/GNSS modem,
a BNO085 IMU, an SPH0645 I2S microphone, and an RGB status LED. Target OS is **Raspberry Pi OS
Bookworm 64-bit Lite**.

## Quick start

On a Raspberry Pi CM5 (Argus board, RPi OS Bookworm 64-bit Lite):

```bash
# 1. GIT
sudo apt install git

# 2. Clone
git clone https://github.com/epyelabs/argus-test-bench.git
cd argus-test-bench

# 3. Install everything
bash install.sh

# 4. Once installation is done, Reboot
sudo reboot

# 5. After the reboot, in a new shell:
argus
```

Already installed and just want the latest? `bash update.sh`. Want to develop without hardware?
`cd argus-cli && ARGUS_MOCK=1 npm run dev`. Each step is explained in detail below.

---

## Overview

The repository ships two components:

- **[argus-cli/](argus-cli/)** — an interactive terminal app (Ink + React) that detects and
  exercises every peripheral from a single menu. Installed as the global `argus` command.
  See [argus-cli/readme.md](argus-cli/readme.md).
- **[argus-connection-manager/](argus-connection-manager/)** — a self-healing LTE connection
  daemon for the SIM7600G modem (systemd + udev) with adaptive signal polling and atomic
  telemetry. See [argus-connection-manager/readme.md](argus-connection-manager/readme.md).

---

## Repository layout

```
argus-test-bench/
├── install.sh                 # 7-step installer (Node, cameras, IMU, mic, LTE, CLI)
├── uninstall.sh               # Reverses install.sh
├── update.sh                  # git pull + rebuild + relink `argus`
├── argus-cli/                 # Interactive test-bench CLI (TypeScript + Ink)
└── argus-connection-manager/  # SIM7600G LTE daemon (Bash + systemd)
```

---

## Prerequisites

- **Hardware:** Raspberry Pi CM5 on the Argus board, with an active SIM card (data plan) for the
  LTE/GNSS module.
- **OS:** Raspberry Pi OS Bookworm 64-bit Lite.
- **git** (installed below). Node.js is installed for you by `install.sh` (via nvm, default v22).

---

## Install

### Step 1 — Install git

```bash
sudo apt install git
```

### Step 2 — Clone the repository

```bash
git clone https://github.com/epyelabs/argus-test-bench.git
cd argus-test-bench
```

### Step 3 — Run the installer

```bash
bash install.sh
```

This runs all seven steps in order:

| Step | What it does                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | Install Node.js via nvm (override with `NODE_VERSION`, default `22`; CLI requires Node >= 20)                                 |
| 2    | `npm ci` — install argus-cli dependencies                                                                                     |
| 3    | Install camera packages (`rpicam-apps`, `v4l-utils`, `ffmpeg`) and add the IMX290 CSI overlays to `/boot/firmware/config.txt` |
| 4    | Install IMU tooling (`i2c-tools`, Python Adafruit BNO08x libs) and enable the I2C bus                                         |
| 5    | Enable the I2S microphone overlay in `/boot/firmware/config.txt`                                                              |
| 6    | Install the LTE connection manager (delegates to `argus-connection-manager/install.sh`)                                       |
| 7    | Build argus-cli and `npm link` the global `argus` command                                                                     |

You can run a single step (handy for re-running just one part):

```bash
bash install.sh 3        # or: bash install.sh step3
bash install.sh -h       # usage
```

### Step 4 — Reboot

Steps 3–5 change device-tree overlays, which only take effect after a reboot.

```bash
sudo reboot
```

### Step 5 — Run the CLI

nvm is added to your shell startup, so open a **new shell** (or `source ~/.bashrc`) after the
first install so the `argus` command is on your `PATH`:

```bash
argus
```

---

## Update

Pull the latest code and rebuild:

```bash
bash update.sh
```

`update.sh` pulls `origin/main`, runs `npm ci` **only** if the dependency lockfile/manifest
changed, then rebuilds argus-cli and relinks the `argus` command. It does not touch the
camera/IMU/mic system config — re-run the relevant `install.sh` step if those change.

---

## Uninstall

```bash
bash uninstall.sh
```

This reverses `install.sh` in reverse order (step 7 → step 1): unlinks `argus`, removes the LTE
manager, reverts the mic/IMU/camera config in `/boot/firmware/config.txt`, removes argus-cli's
`node_modules`, and (by default) removes the apt packages it installed. Two toggles:

| Variable     | Default | Effect                                                                                                        |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| `REMOVE_APT` | `1`     | Remove apt packages (`rpicam-apps`, `v4l-utils`, `ffmpeg`, `i2c-tools`, `python3-pip`). Set `0` to keep them. |
| `REMOVE_NVM` | `0`     | Keep Node/nvm (they may be used by other projects). Set `1` to remove `~/.nvm` and its `~/.bashrc` lines.     |

```bash
REMOVE_APT=0 bash uninstall.sh    # revert config but keep apt packages
bash uninstall.sh 3               # undo a single step
sudo reboot                       # reboot to apply reverted overlays
```

> The global `argus` symlink is removed, but the committed `argus-cli/dist/` build output is left
> in place. ModemManager (disabled during LTE install) is **not** automatically re-enabled — see
> the [connection-manager readme](argus-connection-manager/readme.md#uninstallation).

---

## Using the CLI

Run `argus`, then navigate with the keyboard:

- `↑ ↓` move · `↵` select · `q` / `Esc` go back · `q` on the home menu quits

Modules in the menu:

| Module     | What it tests                                          |
| ---------- | ------------------------------------------------------ |
| Cameras    | CSI (IMX290) snapshot/record + USB/UVC capture         |
| LTE / GNSS | Live signal (CSQ/dBm) and GPS fix                      |
| IMU        | Live quaternion / Euler / linear acceleration (BNO085) |
| Microphone | Live level meter and WAV recording (SPH0645 I2S)       |
| RGB LED    | Toggle R/G/B and all on/off                            |

Captures are written to `$ARGUS_CAPTURE_DIR` (default `~/argus-captures`).

### Development

You can develop the CLI on any machine — it runs against fixture data when no hardware is present.

```bash
cd argus-cli
npm install
npm run dev                  # run the TypeScript directly (no build)
ARGUS_MOCK=1 npm run dev     # force mock/fixture data (e.g. on macOS)
npm run build && npm start   # build to dist/ and run the compiled CLI
npm test                     # run the test suite (vitest)
```

See [argus-cli/readme.md](argus-cli/readme.md) for the architecture and per-module details.

---

## Configuration

Common environment variables for the CLI:

| Variable            | Default            | Description                                                                   |
| ------------------- | ------------------ | ----------------------------------------------------------------------------- |
| `ARGUS_MOCK`        | auto               | `1` forces fixture data, `0` forces real hardware. Auto-on when not on Linux. |
| `ARGUS_MIC_GAIN`    | `16`               | Software gain for the I2S mic. Lower it if the meter clips/pegs.              |
| `ARGUS_CAPTURE_DIR` | `~/argus-captures` | Where snapshots and recordings are written.                                   |
| `NODE_VERSION`      | `22`               | Node version `install.sh` installs (CLI requires >= 20).                      |

The LTE daemon has its own `SIM7600_*` tunables (serial port, interface, signal thresholds,
telemetry path) — see the
[connection-manager configuration](argus-connection-manager/readme.md#configuration).

---

## Troubleshooting

| Symptom                                                       | Fix                                                                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `argus: command not found` after install                      | Open a new shell or `source ~/.bashrc` so nvm/`argus` are on `PATH`.                                                              |
| Cameras, mic, or IMU not detected                             | A reboot is required after install (device-tree overlays). Verify: `rpicam-hello --list-cameras`, `arecord -l`, `i2cdetect -y 1`. |
| Camera video recording errors with "Unrecognised codec libav" | Install the full camera stack: `sudo apt install rpicam-apps`. Snapshots work without it.                                         |
| LTE signal/GPS not showing in the CLI                         | The daemon owns the modem; check `sudo systemctl status sim7600-lte` and `journalctl -u sim7600-lte -f`.                          |

Deeper troubleshooting lives in the component readmes:
[argus-cli](argus-cli/readme.md) and
[argus-connection-manager](argus-connection-manager/readme.md#troubleshooting).

---

## Further documentation

- [argus-cli/readme.md](argus-cli/readme.md) — CLI architecture, modules, tests, dev workflow.
- [argus-connection-manager/readme.md](argus-connection-manager/readme.md) — LTE daemon design,
  telemetry schema, systemd operations, and tuning.
- Hardware pin/address/path facts: `argus-cli/src/config/hardware.ts` (single source of truth),
  derived from the Argus Board PCBA v1.0 User Guide.
