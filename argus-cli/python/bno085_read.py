#!/usr/bin/env python3
"""Stream BNO085 motion data as line-delimited JSON for the Argus CLI.

The Argus CLI (Node/Ink) spawns this and reads stdout. Each line is one JSON
object: a "ready" marker, a "sample", or an "error". I2C runs at 100 kHz to
avoid the BNO085's clock-stretching issues on the Pi (matches the verified
test script). Requires `adafruit-circuitpython-bno08x` + `adafruit-blinka`.
"""
import argparse
import json
import sys
import time


def emit(obj):
    print(json.dumps(obj), flush=True)


def parse_address(value):
    return int(value, 16) if str(value).lower().startswith("0x") else int(value)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--address", default="0x4a", help="I2C address, e.g. 0x4a or 0x4b")
    ap.add_argument("--interval", type=float, default=0.05, help="seconds between samples")
    args = ap.parse_args()
    addr = parse_address(args.address)

    try:
        import board
        import busio
        from adafruit_bno08x import (
            BNO_REPORT_ROTATION_VECTOR,
            BNO_REPORT_LINEAR_ACCELERATION,
        )
        from adafruit_bno08x.i2c import BNO08X_I2C
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "error": f"import failed: {exc}. "
              "Install adafruit-circuitpython-bno08x and adafruit-blinka."})
        return 2

    try:
        i2c = busio.I2C(board.SCL, board.SDA, frequency=100000)
        bno = BNO08X_I2C(i2c, address=addr)
        bno.enable_feature(BNO_REPORT_ROTATION_VECTOR)
        bno.enable_feature(BNO_REPORT_LINEAR_ACCELERATION)
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "error": f"init failed at {hex(addr)}: {exc}"})
        return 3

    emit({"type": "ready", "address": hex(addr)})

    try:
        while True:
            # Adafruit returns the quaternion as (i, j, k, real).
            qi, qj, qk, qr = bno.quaternion
            ax, ay, az = bno.linear_acceleration
            emit({
                "type": "sample",
                "quat": {"r": qr, "i": qi, "j": qj, "k": qk},
                "linaccel": {"x": ax, "y": ay, "z": az},
            })
            time.sleep(args.interval)
    except KeyboardInterrupt:
        return 0
    except Exception as exc:  # noqa: BLE001
        emit({"type": "error", "error": f"read failed: {exc}"})
        return 4


if __name__ == "__main__":
    sys.exit(main())
