#!/bin/bash
# =============================================================================
# sim7600-lte.sh — Resilient LTE connection manager for SIM7600G-H-M.2
# =============================================================================
# Designed for IoT deployments (e.g. Argus dashcam, fleet tracking).
#
# Features:
#   - Waits for stable signal (AT+CSQ) before connecting
#   - Adaptive CSQ polling: faster when signal is changing rapidly
#   - Signal-aware reconnect: distinguishes dead zone vs network failure
#   - Atomic JSON telemetry output for consumption by other processes
#   - Automatic reconnect on link failure
# =============================================================================

# --- Configuration -----------------------------------------------------------
SERIAL="${SIM7600_SERIAL:-/dev/ttyUSB2}"
IFACE="${SIM7600_IFACE:-usb0}"
PING_HOST="${SIM7600_PING_HOST:-8.8.8.8}"

# Signal thresholds (AT+CSQ returns RSSI 0–31; 99 = unknown)
# 10 = ~-93dBm (marginal), 15 = ~-83dBm (good)
MIN_CSQ="${SIM7600_MIN_CSQ:-10}"
GOOD_CSQ="${SIM7600_GOOD_CSQ:-15}"

# Timing (seconds)
SIGNAL_STABLE_COUNT=3        # consecutive good readings before connecting
HEALTH_CHECK_INTERVAL=15     # how often to ping while connected
HEALTH_FAIL_THRESHOLD=3      # consecutive ping failures before reconnect
RECONNECT_DELAY=5            # wait before attempting reconnect
AT_CMD_DELAY=1               # pause between AT commands
MODEM_BOOT_WAIT=8            # initial wait for modem USB enumeration

# Adaptive CSQ polling intervals (seconds)
CSQ_INTERVAL_FAST=3          # signal changing rapidly (delta >= CSQ_RAPID_DELTA)
CSQ_INTERVAL_WEAK=5          # signal weak / recovering (CSQ < MIN_CSQ)
CSQ_INTERVAL_STABLE=30       # signal stable and connected
CSQ_RAPID_DELTA=3            # CSQ change threshold to trigger fast polling

# Telemetry
TELEMETRY_FILE="${SIM7600_TELEMETRY_FILE:-/run/sim7600-lte/telemetry.json}"

# --- Logging -----------------------------------------------------------------
LOG_TAG="sim7600-lte"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]  $*" | tee -a /var/log/sim7600-lte.log; logger -t "$LOG_TAG" "$*"; }
warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN]  $*" | tee -a /var/log/sim7600-lte.log; logger -t "$LOG_TAG" -p user.warning "$*"; }
err()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" | tee -a /var/log/sim7600-lte.log; logger -t "$LOG_TAG" -p user.err "$*"; }

# --- Telemetry ---------------------------------------------------------------
# Writes an atomic JSON snapshot to TELEMETRY_FILE.
# Other processes (GPS, IMU, cloud uploader) can read this at any time
# without risk of reading a half-written file.
#
# Schema:
# {
#   "timestamp":    ISO-8601 UTC string
#   "csq":          integer 0-31, or 99 if unknown
#   "rssi_dbm":     integer dBm, or null if unknown
#   "csq_interval": current adaptive poll interval in seconds
#   "status":       "connected" | "connecting" | "disconnected" | "dead_zone"
#   "iface":        interface name
#   "ip":           current IP string, or null
# }
write_telemetry() {
    local csq="$1"
    local status="$2"
    local csq_interval="$3"

    mkdir -p "$(dirname "$TELEMETRY_FILE")"

    local rssi_dbm="null"
    if [[ "$csq" -ne 99 ]]; then
        rssi_dbm=$(( -113 + csq * 2 ))
    fi

    local ip="null"
    local raw_ip
    raw_ip=$(ip addr show "$IFACE" 2>/dev/null | grep "inet " | awk '{print $2}' | cut -d/ -f1)
    if [[ -n "$raw_ip" ]]; then
        ip="\"$raw_ip\""
    fi

    local timestamp
    timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    # Write to temp file first, then atomically move into place
    # so readers never see a partial file
    local tmp="${TELEMETRY_FILE}.tmp"

    cat > "$tmp" <<EOF
{
  "timestamp": "$timestamp",
  "csq": $csq,
  "rssi_dbm": $rssi_dbm,
  "csq_interval": $csq_interval,
  "status": "$status",
  "iface": "$IFACE",
  "ip": $ip
}
EOF

    mv "$tmp" "$TELEMETRY_FILE"
}

# --- AT command helpers -------------------------------------------------------
at_cmd() {
    local cmd="$1"
    local wait="${2:-$AT_CMD_DELAY}"
    echo -e "${cmd}\r" > "$SERIAL"
    sleep "$wait"
}

at_query() {
    local cmd="$1"
    echo -e "${cmd}\r" > "$SERIAL"
    timeout 2 cat "$SERIAL" 2>/dev/null | tr -d '\r'
}

# --- Signal quality ----------------------------------------------------------
get_csq() {
    local raw
    raw=$(at_query "AT+CSQ" | grep "+CSQ:" | head -1)
    local val
    val=$(echo "$raw" | sed -n 's/.*+CSQ: \([0-9]*\),.*/\1/p')
    echo "${val:-99}"
}

csq_to_dbm() {
    local csq="$1"
    if [[ "$csq" -eq 99 ]]; then echo "unknown"; return; fi
    echo "$(( -113 + csq * 2 )) dBm"
}

# Computes adaptive poll interval based on signal state and rate of change.
# Args: $1=current_csq $2=previous_csq
# Prints interval in seconds.
adaptive_interval() {
    local csq="$1"
    local prev_csq="$2"

    if [[ "$csq" -eq 99 || "$csq" -lt "$MIN_CSQ" ]]; then
        # Weak or unknown — poll more often, reconnect decisions depend on this
        echo "$CSQ_INTERVAL_WEAK"
        return
    fi

    local delta=$(( csq - prev_csq ))
    delta="${delta#-}"   # absolute value

    if [[ "$delta" -ge "$CSQ_RAPID_DELTA" ]]; then
        # Signal changing rapidly — increase resolution
        echo "$CSQ_INTERVAL_FAST"
    else
        # Signal stable — back off to conserve AT bus bandwidth
        echo "$CSQ_INTERVAL_STABLE"
    fi
}

# --- Modem / interface helpers -----------------------------------------------
wait_for_serial() {
    log "Waiting for modem serial port $SERIAL..."
    local attempts=0
    while [[ ! -c "$SERIAL" ]]; do
        sleep 2
        (( attempts++ ))
        if (( attempts > 30 )); then
            err "Serial port $SERIAL never appeared. Is the modem enumerated?"
            return 1
        fi
    done
    log "Serial port $SERIAL is available."
}

modem_at_ok() {
    local response
    response=$(at_query "AT")
    echo "$response" | grep -q "OK"
}

wait_for_modem_ready() {
    log "Waiting for modem AT interface to respond..."
    local attempts=0
    while ! modem_at_ok; do
        sleep 2
        (( attempts++ ))
        if (( attempts > 20 )); then
            err "Modem not responding to AT commands."
            return 1
        fi
    done
    log "Modem is responsive."
}

teardown_interface() {
    if ip link show "$IFACE" &>/dev/null; then
        log "Tearing down $IFACE..."
        dhclient -r "$IFACE" 2>/dev/null || true
        ip link set "$IFACE" down 2>/dev/null || true
    fi
    at_cmd "AT+NETCLOSE" 2
}

bring_up_interface() {
    log "Opening modem network context (AT+NETOPEN)..."
    at_cmd "AT+NETOPEN" 3

    log "Running dhclient on $IFACE..."
    if dhclient -v "$IFACE" 2>&1 | tee -a /var/log/sim7600-lte.log; then
        log "Interface $IFACE is up."
        ip addr show "$IFACE" | grep "inet " | tee -a /var/log/sim7600-lte.log
        return 0
    else
        err "dhclient failed on $IFACE."
        return 1
    fi
}

# --- Signal wait loop --------------------------------------------------------
wait_for_stable_signal() {
    log "Waiting for stable LTE signal (min CSQ=$MIN_CSQ, need $SIGNAL_STABLE_COUNT consecutive reads >= $GOOD_CSQ)..."
    local stable_count=0
    local prev_csq=99
    local interval=$CSQ_INTERVAL_WEAK

    while true; do
        local csq dbm
        csq=$(get_csq)
        dbm=$(csq_to_dbm "$csq")
        interval=$(adaptive_interval "$csq" "$prev_csq")

        if [[ "$csq" -eq 99 ]]; then
            warn "Signal unknown (CSQ=99) — modem may still be registering. [poll=${interval}s]"
            stable_count=0
            write_telemetry "$csq" "disconnected" "$interval"

        elif [[ "$csq" -lt "$MIN_CSQ" ]]; then
            warn "Signal too weak: CSQ=$csq ($dbm). Waiting... [poll=${interval}s]"
            stable_count=0
            write_telemetry "$csq" "dead_zone" "$interval"

        elif [[ "$csq" -ge "$GOOD_CSQ" ]]; then
            (( stable_count++ ))
            log "Good signal: CSQ=$csq ($dbm) [$stable_count/$SIGNAL_STABLE_COUNT stable] [poll=${interval}s]"
            write_telemetry "$csq" "connecting" "$interval"
            if [[ "$stable_count" -ge "$SIGNAL_STABLE_COUNT" ]]; then
                log "Signal stable. Proceeding with connection."
                return 0
            fi

        else
            log "Marginal signal: CSQ=$csq ($dbm). Waiting for improvement... [poll=${interval}s]"
            stable_count=0
            write_telemetry "$csq" "disconnected" "$interval"
        fi

        prev_csq="$csq"
        sleep "$interval"
    done
}

# --- Health monitor ----------------------------------------------------------
# Exit codes:
#   1 — reconnect needed (ping failed, signal OK → network/carrier issue)
#   2 — dead zone (ping failed, signal weak → wait for signal recovery)
monitor_connection() {
    log "Connection monitor started. Pinging $PING_HOST every ${HEALTH_CHECK_INTERVAL}s."
    local fail_count=0
    local prev_csq=99

    while true; do
        sleep "$HEALTH_CHECK_INTERVAL"

        local csq dbm interval
        csq=$(get_csq)
        dbm=$(csq_to_dbm "$csq")
        interval=$(adaptive_interval "$csq" "$prev_csq")
        prev_csq="$csq"

        if ping -c 2 -W 4 -I "$IFACE" "$PING_HOST" &>/dev/null; then
            fail_count=0
            write_telemetry "$csq" "connected" "$interval"
            log "Health OK — CSQ=$csq ($dbm) [poll=${interval}s]"
        else
            (( fail_count++ ))
            warn "Ping failed ($fail_count/$HEALTH_FAIL_THRESHOLD) — CSQ=$csq ($dbm)"
            write_telemetry "$csq" "disconnected" "$interval"

            if [[ "$fail_count" -ge "$HEALTH_FAIL_THRESHOLD" ]]; then
                if [[ "$csq" -eq 99 || "$csq" -lt "$MIN_CSQ" ]]; then
                    err "Connection lost — signal too weak (CSQ=$csq). Entering dead zone wait."
                    return 2
                else
                    err "Connection lost — signal OK (CSQ=$csq) but ping failing. Network issue, reconnecting."
                    return 1
                fi
            fi
        fi
    done
}

# --- Main loop ---------------------------------------------------------------
main() {
    log "============================================"
    log " sim7600-lte connection manager starting"
    log " Serial:    $SERIAL"
    log " Interface: $IFACE"
    log " Telemetry: $TELEMETRY_FILE"
    log "============================================"

    log "Waiting ${MODEM_BOOT_WAIT}s for modem USB enumeration..."
    sleep "$MODEM_BOOT_WAIT"

    wait_for_serial || exit 1
    wait_for_modem_ready || exit 1

    while true; do
        # 1. Wait for stable signal
        wait_for_stable_signal

        # 2. Bring up interface
        if bring_up_interface; then
            log "LTE connection established."

            # 3. Monitor — exit code tells us why it failed
            monitor_connection
            local monitor_exit=$?

            # 4. Teardown
            warn "Tearing down connection..."
            teardown_interface

            if [[ "$monitor_exit" -eq 2 ]]; then
                # Dead zone — go straight back to signal wait, no reconnect delay
                log "Dead zone detected. Waiting for signal recovery..."
                continue
            fi
        else
            err "Failed to bring up interface."
        fi

        log "Retrying in ${RECONNECT_DELAY}s..."
        sleep "$RECONNECT_DELAY"
        log "--- Reconnect attempt ---"
    done
}

main "$@"
