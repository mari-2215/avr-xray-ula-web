# Web Console

Static Web Serial UI for AVR X-Ray ULA Web.

## Run

Chrome/Edge can use Web Serial directly:

```powershell
python -m http.server 8080
```

Open `http://localhost:8080` in Chrome or Edge.

Firefox on Linux does not support Web Serial. Use the local API bridge instead:

```bash
python -m pip install pyserial
python bridge.py --serial /dev/ttyACM1
```

Then open:

```text
http://localhost:8765
```

Click **API local / Local API**. The browser will read Arduino `snapshot` and `memory` frames through Server-Sent Events and send commands through `POST /api/command`.

The `--serial` value is the Arduino device, not the browser HTTP port. Common Linux values are `/dev/ttyACM0`, `/dev/ttyACM1` and `/dev/ttyUSB0`. You can run `python bridge.py` without `--serial` to try auto-detection, but using the explicit device is more reliable.

## Notes

- Web Serial does not work from a plain `file://` URL.
- The interface starts paused. The simulator only runs after clicking **Simulador / Simulator**.
- Use **Conectar / Connect** for the Arduino Uno port after uploading the firmware.
