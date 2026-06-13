# sim7600-lte — Resilient LTE Connection Manager

A self-healing LTE connection daemon for the **SIM7600G-H-M.2** cellular modem, designed for always-on IoT deployments such as the Argus dashcam and fleet tracking systems. It runs as a systemd service, automatically manages signal quality, establishes a DHCP connection over the modem's USB network interface, and continuously monitors link health — reconnecting whenever the connection drops.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Prerequisites](#prerequisites)
4. [Directory Structure](#directory-structure)
5. [Installation](#installation)
6. [Uninstallation](#uninstallation)
7. [Configuration](#configuration)
8. [Startup Sequence](#startup-sequence)
9. [Telemetry](#telemetry)
10. [Operations](#operations)
11. [Troubleshooting](#troubleshooting)
12. [Customization](#customization)

---

## Overview

In fleet and IoT contexts the modem may be powered on in a weak-signal area, roam across dead zones, or lose connectivity due to carrier issues. A simple `dhclient` in a script is not sufficient — you need something that:

- Waits for a genuinely stable signal before attempting to connect
- Distinguishes a **dead zone** (weak/no signal) from a **network failure** (signal OK but ping failing) so each case gets the right recovery strategy
- Exposes real-time modem state to other processes (GPS, IMU, cloud uploader) without file-locking hazards
- Runs unattended from boot, survives reboots and modem resets, and logs everything

This package provides all of that as a single Bash daemon backed by systemd.

---

## How It Works

### High-level flow

```
Boot
 └─ udev detects ttyUSB2
     └─ systemd starts sim7600-lte.service
         └─ sim7600-lte.sh
             ├─ Wait MODEM_BOOT_WAIT seconds (USB enumeration settling)
             ├─ Wait for /dev/ttyUSB2 to appear as a character device
             ├─ Wait for modem to respond OK to AT command
             └─ Loop forever:
                 ├─ [Signal wait] Poll AT+CSQ until signal is stable ≥ GOOD_CSQ
                 ├─ [Connect]     AT+NETOPEN → dhclient usb0
                 ├─ [Monitor]     Ping 8.8.8.8 every 15s, track CSQ
                 │    ├─ Ping OK  → update telemetry, continue
                 │    └─ Ping fail × 3:
                 │         ├─ Signal weak → dead zone path (skip reconnect delay)
                 │         └─ Signal OK   → network/carrier issue (reconnect)
                 └─ [Teardown]   dhclient -r → ip link down → AT+NETCLOSE
```

### Signal quality (AT+CSQ)

The modem reports signal strength as a CSQ value 0–31 (or 99 = unknown/not registered). The conversion to dBm is:

```
RSSI (dBm) = -113 + (CSQ × 2)
```

| CSQ | dBm   | Interpretation         |
|-----|-------|------------------------|
| 99  | —     | Unknown / not registered |
| 0–9 | ≤ -95 | Too weak to connect    |
| 10–14 | -93 to -85 | Marginal — wait |
| 15–31 | ≤ -83 | Good — connection allowed |

The script uses two thresholds:

- **`MIN_CSQ`** (default 10): below this, signal is too weak — the script will not attempt to connect and marks telemetry as `dead_zone`.
- **`GOOD_CSQ`** (default 15): to begin connecting, this value must be reached for `SIGNAL_STABLE_COUNT` (3) consecutive polls.

### Adaptive CSQ polling

Rather than polling the modem on a fixed interval, the script adjusts its polling rate based on signal behaviour:

| Condition | Interval | Rationale |
|-----------|----------|-----------|
| Signal unknown or below MIN_CSQ | 5 s (`CSQ_INTERVAL_WEAK`) | Recover quickly from dead zones |
| Signal changing rapidly (delta ≥ 3) | 3 s (`CSQ_INTERVAL_FAST`) | Higher resolution during transitions |
| Signal stable and above GOOD_CSQ | 30 s (`CSQ_INTERVAL_STABLE`) | Reduce AT bus traffic when connected |

### Dead zone vs. network failure

When the ping health check fails `HEALTH_FAIL_THRESHOLD` times in a row, the script checks the current CSQ:

- **CSQ < MIN_CSQ or 99**: classified as a **dead zone**. The script tears down the interface and goes back to the signal wait loop immediately, without the `RECONNECT_DELAY` pause — waiting for coverage to return is the right strategy.
- **CSQ ≥ MIN_CSQ**: classified as a **network/carrier failure**. Signal is present but traffic isn't flowing — the modem may need a full re-connect cycle, so the script tears down, waits `RECONNECT_DELAY` seconds, and retries.

### Telemetry

Every time the signal is polled or the connection state changes, an atomic JSON file is written to `/run/sim7600-lte/telemetry.json`. "Atomic" means the data is written to a `.tmp` file first and then renamed into place, so a reader can never observe a half-written file.

---

## Prerequisites

### Hardware

- SIM7600G-H-M.2 modem installed in an M.2 (B-key or B+M-key) slot with USB passthrough to the host
- Active SIM card with a data plan
- The modem must enumerate at least `ttyUSB2` on the host (verify with `ls /dev/ttyUSB*` after inserting the modem)

### Software

- Linux with **systemd** (tested on Raspberry Pi OS / Debian Bookworm)
- `iproute2` — for `ip link` / `ip addr` commands
- `isc-dhcp-client` — for `dhclient`
- `iputils-ping` — for `ping -I <iface>`
- `util-linux` / `bsdutils` — for `logger`
- `udev` — typically present on any systemd system

Install missing packages on Debian/Ubuntu:

```bash
sudo apt update
sudo apt install iproute2 isc-dhcp-client iputils-ping
```

---

## Directory Structure

```
connection-manager/
├── install.sh                  # One-shot installer — copies files, reloads systemd/udev
├── uninstall.sh                # Removes all installed files and disables the service
├── sim7600-lte.sh              # Main connection manager daemon
├── sim7600-lte.service         # systemd unit file
├── 99-sim7600-lte.rules        # udev rule — triggers service on modem enumeration
└── readme.md                   # This file
```

---

## Installation

1. Copy the `connection-manager` directory onto the target host (or clone the repository).

2. Run the installer:

   ```bash
   sudo bash install.sh
   ```

   The installer does the following steps:

   | Step | What happens |
   |------|-------------|
   | Copy script | `sim7600-lte.sh` → `/usr/local/bin/sim7600-lte.sh` (executable) |
   | Install service | `sim7600-lte.service` → `/etc/systemd/system/` |
   | Install udev rule | `99-sim7600-lte.rules` → `/etc/udev/rules.d/` |
   | Reload udev | `udevadm control --reload-rules` |
   | Reload systemd | `systemctl daemon-reload` |
   | Disable ModemManager | Stops and disables `ModemManager.service` to prevent AT port conflicts |
   | Enable service | `systemctl enable sim7600-lte.service` (starts at boot) |

3. Start the service now (optional — it will also start on next boot or when the modem enumerates):

   ```bash
   sudo systemctl start sim7600-lte.service
   ```

4. Watch the live output:

   ```bash
   journalctl -u sim7600-lte -f
   ```

---

## Uninstallation

To completely remove the connection manager from the host:

```bash
sudo bash uninstall.sh
```

The uninstaller performs the following steps:

| Step | What happens |
|------|-------------|
| Stop service | `systemctl stop sim7600-lte.service` |
| Disable service | `systemctl disable sim7600-lte.service` (removes boot autostart) |
| Remove script | Deletes `/usr/local/bin/sim7600-lte.sh` |
| Remove service unit | Deletes `/etc/systemd/system/sim7600-lte.service` |
| Remove drop-in overrides | Deletes `/etc/systemd/system/sim7600-lte.service.d/` (if present) |
| Remove udev rule | Deletes `/etc/udev/rules.d/99-sim7600-lte.rules` |
| Reload udev | `udevadm control --reload-rules` |
| Reload systemd | `systemctl daemon-reload` |

> **Note:** ModemManager is **not** automatically re-enabled by the uninstaller. If you need it back:
> ```bash
> sudo systemctl enable --now ModemManager.service
> ```

---

## Configuration

All tuneable parameters are exposed as environment variables. The defaults live in `sim7600-lte.service` and in the script itself. You can override them without modifying either file using a **systemd drop-in**.

### All configuration variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SIM7600_SERIAL` | `/dev/ttyUSB2` | Serial device for AT commands |
| `SIM7600_IFACE` | `usb0` | Network interface presented by the modem |
| `SIM7600_PING_HOST` | `8.8.8.8` | Host to ping for health checks |
| `SIM7600_MIN_CSQ` | `10` (~-93 dBm) | Minimum CSQ to consider connecting |
| `SIM7600_GOOD_CSQ` | `15` (~-83 dBm) | CSQ required for stable connection |
| `SIM7600_TELEMETRY_FILE` | `/run/sim7600-lte/telemetry.json` | Path for atomic JSON telemetry output |

### Hardcoded timing constants (edit `sim7600-lte.sh` to change)

| Constant | Default | Description |
|----------|---------|-------------|
| `SIGNAL_STABLE_COUNT` | `3` | Consecutive good CSQ reads before connecting |
| `HEALTH_CHECK_INTERVAL` | `15 s` | How often to ping while connected |
| `HEALTH_FAIL_THRESHOLD` | `3` | Consecutive ping failures before reconnect |
| `RECONNECT_DELAY` | `5 s` | Wait after non-dead-zone failure before retrying |
| `AT_CMD_DELAY` | `1 s` | Pause injected after write-only AT commands |
| `MODEM_BOOT_WAIT` | `8 s` | Initial sleep for USB enumeration to settle |
| `CSQ_INTERVAL_FAST` | `3 s` | Poll interval when signal is changing rapidly |
| `CSQ_INTERVAL_WEAK` | `5 s` | Poll interval when signal is weak/unknown |
| `CSQ_INTERVAL_STABLE` | `30 s` | Poll interval when signal is stable |
| `CSQ_RAPID_DELTA` | `3` | CSQ change per cycle to trigger fast polling |

### Overriding via systemd drop-in (recommended)

Create a drop-in file so your changes survive package upgrades and are visible to `systemctl show`:

```bash
sudo mkdir -p /etc/systemd/system/sim7600-lte.service.d
sudo tee /etc/systemd/system/sim7600-lte.service.d/override.conf <<EOF
[Service]
Environment="SIM7600_SERIAL=/dev/ttyUSB3"
Environment="SIM7600_MIN_CSQ=12"
Environment="SIM7600_GOOD_CSQ=18"
EOF
sudo systemctl daemon-reload
sudo systemctl restart sim7600-lte.service
```

---

## Startup Sequence

From cold boot to active LTE connection:

1. **udev** detects `ttyUSB2` appearing and sets `SYSTEMD_WANTS=sim7600-lte.service`, causing systemd to start the unit.
2. **systemd** launches `/usr/local/bin/sim7600-lte.sh` as a long-running `Type=simple` service. If the script exits for any reason, systemd restarts it after 10 seconds (`Restart=always`).
3. **Boot wait** — the script sleeps `MODEM_BOOT_WAIT` (8 s) to allow the full USB device tree to settle before probing.
4. **Serial wait** — polls until `/dev/ttyUSB2` appears as a character device (up to 60 s, checking every 2 s).
5. **Modem AT handshake** — sends bare `AT` and waits for `OK` (up to 40 s, checking every 2 s).
6. **Signal wait loop** — polls `AT+CSQ` on the adaptive schedule until CSQ ≥ `GOOD_CSQ` for `SIGNAL_STABLE_COUNT` consecutive readings.
7. **AT+NETOPEN** — tells the modem to open its internal network context (PDP context activation).
8. **dhclient** — acquires an IP address on `usb0` via DHCP from the modem's internal DHCP server.
9. **Health monitor** — enters the main loop: ping every 15 s, track CSQ, write telemetry. On failure, classifies the reason and selects the right recovery path (see [Dead zone vs. network failure](#dead-zone-vs-network-failure)).

---

## Telemetry

The script writes a JSON snapshot to `/run/sim7600-lte/telemetry.json` (in-memory tmpfs, cleared on reboot) on every signal poll and connection state change.

### Schema

```json
{
  "timestamp":    "2026-03-28T10:23:45Z",
  "csq":          18,
  "rssi_dbm":     -77,
  "csq_interval": 30,
  "status":       "connected",
  "iface":        "usb0",
  "ip":           "10.164.20.3"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO-8601 UTC string | When this snapshot was written |
| `csq` | integer 0–31 or 99 | Raw CSQ value from AT+CSQ |
| `rssi_dbm` | integer or `null` | Converted dBm (`-113 + csq*2`); `null` when CSQ=99 |
| `csq_interval` | integer | Current adaptive poll interval in seconds |
| `status` | string | One of: `connected`, `connecting`, `disconnected`, `dead_zone` |
| `iface` | string | Network interface name (e.g. `usb0`) |
| `ip` | string or `null` | Current IP address on the interface, or `null` |

### Status values

| Status | Meaning |
|--------|---------|
| `connected` | Interface is up and ping is succeeding |
| `connecting` | Signal is good, connection attempt in progress |
| `disconnected` | Signal too marginal, or ping failing (but not dead zone) |
| `dead_zone` | CSQ below `MIN_CSQ` — no usable signal |

### Reading from another process

Because the file is replaced atomically via `rename(2)`, you can read it at any time without locking:

```bash
# Shell
cat /run/sim7600-lte/telemetry.json

# Python
import json
state = json.load(open("/run/sim7600-lte/telemetry.json"))
if state["status"] == "connected":
    ...
```

---

## Operations

### Service control

```bash
# Start / stop / restart
sudo systemctl start sim7600-lte.service
sudo systemctl stop sim7600-lte.service
sudo systemctl restart sim7600-lte.service

# Check status
sudo systemctl status sim7600-lte.service

# Enable / disable autostart
sudo systemctl enable sim7600-lte.service
sudo systemctl disable sim7600-lte.service
```

### Logs

```bash
# Follow live output
journalctl -u sim7600-lte -f

# Last 100 lines
journalctl -u sim7600-lte -n 100

# Since last boot
journalctl -u sim7600-lte -b

# Persistent log file (also written by the script)
tail -f /var/log/sim7600-lte.log
```

### Telemetry

```bash
# Pretty-print current state
cat /run/sim7600-lte/telemetry.json | python3 -m json.tool

# Watch continuously
watch -n 2 cat /run/sim7600-lte/telemetry.json
```

### Manual AT commands (for debugging)

```bash
# Send an AT command and read response
echo -e "AT+CSQ\r" > /dev/ttyUSB2
timeout 2 cat /dev/ttyUSB2

# Check network registration
echo -e "AT+CREG?\r" > /dev/ttyUSB2
timeout 2 cat /dev/ttyUSB2
```

---

## Troubleshooting

### Modem serial port never appears

**Symptom:** Log shows `Serial port /dev/ttyUSB2 never appeared`.

- Run `lsusb` — the SIM7600 should appear as a USB device (e.g. `SimCom` or `1e0e:9011`).
- Run `ls /dev/ttyUSB*` — the modem typically creates `ttyUSB0`–`ttyUSB3`. If the AT port is on a different node, update `SIM7600_SERIAL`.
- Check `dmesg | grep -i usb` for enumeration errors.

### CSQ always 99

**Symptom:** Log shows `Signal unknown (CSQ=99)` indefinitely.

- The modem may not yet have registered to a network. This is normal for 10–30 s after power-on.
- Check the SIM is seated correctly and has an active data plan.
- Send `AT+CREG?` manually — the response `+CREG: 0,1` means registered on home network; `0,0` means not registered.
- Verify antenna connections.

### dhclient fails

**Symptom:** Log shows `dhclient failed on usb0`.

- Confirm `usb0` is the correct interface name: `ip link show` after the modem is connected.
- The interface may not have appeared yet — check `dmesg | grep usb0`.
- Try running `dhclient -v usb0` manually while the modem is registered.

### ModemManager conflicts

**Symptom:** AT commands are inconsistent or the serial port is grabbed by another process.

- The installer disables ModemManager automatically. If it was re-enabled: `sudo systemctl disable --now ModemManager.service`
- Check `fuser /dev/ttyUSB2` to identify any process holding the port.

### Service keeps restarting immediately

**Symptom:** `systemctl status` shows the service failing and being restarted every 10 s.

- Check `journalctl -u sim7600-lte -n 50` for the error.
- Common causes: wrong serial port, `dhclient` not installed, or the modem is not present at all.

---

## Customization

### Different AT serial port

If the modem's AT command port lands on `ttyUSB0`, `ttyUSB1`, or `ttyUSB3` on your system:

```bash
# In the drop-in override:
Environment="SIM7600_SERIAL=/dev/ttyUSB0"
```

Also update the udev rule to match the new port name:

```
# /etc/udev/rules.d/99-sim7600-lte.rules
SUBSYSTEM=="tty", KERNEL=="ttyUSB0", TAG+="systemd", ENV{SYSTEMD_WANTS}+="sim7600-lte.service"
```

Then reload: `sudo udevadm control --reload-rules && sudo systemctl daemon-reload`

### Different network interface

Some SIM7600 configurations expose `wwan0` or `eth1` instead of `usb0`:

```bash
Environment="SIM7600_IFACE=wwan0"
```

### Private ping host

If the deployment has no access to `8.8.8.8`, point at a reachable internal host or your carrier's gateway:

```bash
Environment="SIM7600_PING_HOST=10.0.0.1"
```

### Tighter signal requirements

For deployments where marginal connectivity causes more harm than no connectivity (e.g. partial packet loss corrupting uploads):

```bash
Environment="SIM7600_MIN_CSQ=12"
Environment="SIM7600_GOOD_CSQ=20"
```

### Telemetry location

The default path is on tmpfs (`/run/`) and is lost on reboot. To persist across reboots, point at a real filesystem path:

```bash
Environment="SIM7600_TELEMETRY_FILE=/var/lib/sim7600-lte/telemetry.json"
```

Ensure the directory exists and is writable by root before starting the service.
