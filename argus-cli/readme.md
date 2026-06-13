# Argus CLI — Test Bench & Manager

An interactive terminal app ([Ink](https://github.com/vadimdemedes/ink)) for testing the
peripherals on the **Argus CM5 Edge Video Node v1.0** board. It runs on a Raspberry Pi CM5
(RPi OS Bookworm 64-bit Lite) and exercises each module from one menu: cameras, the
LTE/GNSS modem, the IMU, the I2S microphone, and the RGB LED.

Hardware pin/address/device facts come from `../Argus-Board_PCBA-v1.0-User-Guide-Rev-B.pdf`
and live in one place: [src/config/hardware.ts](src/config/hardware.ts).

## Quick start

```bash
npm install
npm run build        # tsc -> dist/   (also the typecheck)
node dist/cli.js     # or: npm start

# Dev (no build step, runs the TS directly):
npm run dev

# Develop/preview on a non-Pi host (macOS, etc.) with fixture data:
ARGUS_MOCK=1 npm run dev
```

Install it as the `argus` command on the Pi with `npm link` (or `npm i -g .`).

Navigation: `↑↓` move, `↵` select, `q`/`Esc` go back, `q` on the home menu quits.

## Modules & how each is driven

| Module | Detect | Actions | Underlying tool |
|--------|--------|---------|-----------------|
| **Cameras** (CSI) | `rpicam-hello --list-cameras` | snapshot, record (res/fps/duration) | `rpicam-still`, `rpicam-vid` |
| **LTE / GNSS** | `lsusb` (SimCom `1e0e:9011`) + `/dev/ttyUSB*` | live signal, GPS fix | telemetry JSON + NMEA on `ttyUSB1` |
| **IMU** | `i2cdetect -y 1` (BNO085 `0x4A`) | — (data read deferred) | `i2c-tools` |
| **Microphone** | `arecord -l` | live level meter, record to WAV | `arecord` (ALSA) |
| **RGB LED** | `pinctrl get` | toggle R/G/B, all on/off | `pinctrl` (raspi-utils) |

### Notes per module
- **LTE signal** is read from the connection-manager daemon's atomic telemetry at
  `/run/sim7600-lte/telemetry.json` — the CLI never opens the AT port (`ttyUSB2`), which the
  daemon owns. If telemetry is missing, start `sim7600-lte.service`.
- **GPS** reads NMEA read-only from `/dev/ttyUSB1`. If no sentences arrive, GPS likely needs
  enabling on the modem (`AT+CGPS=1`); GNSS is active by default per the board straps.
- **RGB LED** is active-HIGH (R=GPIO12, G=GPIO21, B=GPIO16). `pinctrl` persists the pin state
  after exit, so toggles stick.
- Captures are written to `$ARGUS_CAPTURE_DIR` (default `~/argus-captures`).

## Architecture

```
src/
  cli.tsx              entry — render(<App/>)
  app.tsx              screen router + global keys
  config/hardware.ts   single source of truth (pins, addrs, paths, USB ids)
  lib/                 exec wrappers, platform/mock detection, format, NMEA parser
  hardware/            HAL — pure async functions, shell out, return typed results (no React)
  components/          Header, Table, StatusBadge, LogView, LevelMeter, KeyHints
  screens/             one Ink screen per module
  mocks/fixtures.ts    captured tool output (mock mode + unit tests)
test/                  parser unit tests + ink-testing-library UI smoke tests
```

`src/hardware/*` never imports React; screens render the typed results and show a calm
"not available / tool missing" state when a tool or device is absent. That separation is what
lets the whole UI run on macOS via `ARGUS_MOCK` (auto-on off-Linux, force with `ARGUS_MOCK=0/1`).

## Tests

```bash
npm test
```

- Parser tests cover `rpicam --list-cameras`, `lsusb`, `i2cdetect`, `arecord -l`, `pinctrl get`,
  PCM RMS, and the NMEA parser against fixtures in `src/mocks/`.
- UI smoke tests render every screen in mock mode and assert the expected data appears.

## Deferred (not in this build)

- **IMU live data** — detection only for now. Reading BNO085 fused motion (accel/gyro/mag/
  quaternion) needs the SHTP protocol via a bundled helper; planned next.
- **UVC USB camera** — only the 2 CSI/MIPI cameras are wired up. The USB webcam is a V4L2
  device (`ffmpeg`/`v4l2-ctl`) and will be added as a third source later.

---

## Original requirements (design brief)

> Using the Ink library, build a CLI tool that can test the Argus Board, installed on a
> Raspberry Pi CM5 (RPi OS Bookworm 64-bit Lite). Drivers are assumed installed via `../install.sh`.

- **Camera (per source, up to 3: UVC USB + 2 CSI):** list cameras, take pictures, record video
  with settings (fps, resolution).
- **4G/LTE SIM7600G:** detect (lsusb), read CSQ, read GPS data.
- **IMU:** detect (i2c address), read data.
- **Mic:** detect, record audio with visualizer.
- **RGB LED:** turn lights on/off.
