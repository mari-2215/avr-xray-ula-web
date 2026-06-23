# AVR X-Ray ULA Web

**Portugues:** projeto completo para operar uma ULA fisica de 4 bits no Arduino Uno e observar o ATmega328P em tempo real por uma interface web dinamica. A ULA, o X-Ray e o log em EEPROM seguem a mesma logica: fluxo `A -> B -> operacao -> resultado`, snapshots JSON Lines a `115200`, dumps de SRAM/EEPROM/FLASH e historico circular persistente na EEPROM.

**English:** a complete project for operating a physical 4-bit ALU on an Arduino Uno while inspecting the ATmega328P in real time through a dynamic web interface. The ALU, X-Ray monitor and EEPROM log follow the same logic: `A -> B -> operation -> result`, JSON Lines snapshots at `115200`, SRAM/EEPROM/FLASH dumps and a persistent circular EEPROM history.

## O que vem aqui / What's Included

- Arduino firmware: `arduino/avr_xray_ula_web/avr_xray_ula_web.ino`.
- Bilingual Web Serial dashboard: `web/index.html`.
- Physical and virtual ALU input.
- Output LEDs driven by the ALU, with temporary web LED override commands.
- Live X-Ray snapshots for ALU state, ports, timers, SREG, ADC and SRAM probe.
- EEPROM circular log with 32 confirmed ALU operations.
- Static EEPROM and FLASH dumps through `GET_STATIC`.

## Hardware

| Function | Arduino Uno pin |
| --- | --- |
| Carry LED | D2 |
| Result LEDs b3, b2, b1, b0 | D3, D4, D5, D6 |
| Input buttons b3, b2, b1, b0 | D7, D8, D9, D10 |
| Confirm / OK button | D11 |
| Potentiometer / analog monitor | A0 |

Buttons use `INPUT_PULLUP`: released is `HIGH`, pressed is `LOW`. Each LED needs a series resistor, typically 220 to 330 ohms.

More detail: [docs/hardware.md](docs/hardware.md)

## Upload

Open this sketch in the Arduino IDE:

```text
arduino/avr_xray_ula_web/avr_xray_ula_web.ino
```

Select **Arduino Uno**, choose the board port, upload, and close the Arduino Serial Monitor before opening the web console.

Arduino CLI:

```bash
arduino-cli compile --fqbn arduino:avr:uno arduino/avr_xray_ula_web
arduino-cli upload --fqbn arduino:avr:uno --port COM3 arduino/avr_xray_ula_web
```

## Run the Web Console

Web Serial requires `localhost` or HTTPS.

```powershell
cd web
python -m http.server 8080
```

Open:

```text
http://localhost:8080
```

Use **Conectar / Connect** to select the Arduino port. Use **Simulador / Simulator** when the hardware is not connected.

Firefox on Linux does not support Web Serial. For Firefox, run the local bridge:

```bash
cd web
python -m pip install pyserial
python bridge.py --serial /dev/ttyACM0
```

Open `http://localhost:8765` and click **API local / Local API**.

## Requirements checklist

- Dynamic web interface: animated dashboard with live tabs for ULA, SREG, ports, timers and memory.
- ULA access: live operands, operation, result, flags and workflow stage are read from Arduino snapshots.
- Dump access: SRAM, EEPROM and FLASH are rendered in the memory tab.
- API usage: Chrome/Edge can use Web Serial directly; Firefox/Linux can use the local HTTP/SSE API bridge.
- Bidirectional flow: the web UI reads Arduino `snapshot`/`memory` frames and sends commands back.
- LED signal command: clicking LED controls sends `LED:*` commands to the Arduino.
- Button signal reading: button states are read from `PINB`/`PIND` in the live port snapshots.
- EEPROM log: operations are persisted with `EEPROM.update()` only after the operation stage is confirmed.

## ALU Workflow

1. Toggle the bit buttons to build operand `A`, then press OK.
2. Toggle the bit buttons to build operand `B`, then press OK.
3. Toggle the lower three bits to choose the operation, then press OK.
4. Read the result on the LEDs and web dashboard.
5. Press OK again to restart the flow.

| Code | Operation |
| --- | --- |
| `000` | AND |
| `001` | OR |
| `010` | NOT(B), limited to 4 bits |
| `011` | XOR |
| `100` | Addition |
| `101` | Subtraction with borrow |
| `110` | Multiplication with overflow |
| `111` | Integer division with division-by-zero flag |

Flags: `Z` zero, `C` carry/borrow, `N` result bit 3, `V` multiplication overflow, `D` division by zero.

## Serial API

Arduino to web:

- `hello`
- `snapshot`
- `memory`

Web to Arduino:

- `GET_STATIC`
- `INPUT:0..15`
- `OK`
- `PRESS:B3`, `PRESS:B2`, `PRESS:B1`, `PRESS:B0`, `PRESS:OK`
- `LED:CARRY:0|1`, `LED:B3:0|1`, `LED:B2:0|1`, `LED:B1:0|1`, `LED:B0:0|1`
- `LED_AUTO`

More detail: [docs/protocol.md](docs/protocol.md)

## EEPROM Log

EEPROM address layout:

- `0`: signature `0xA5`
- `1`: next write index
- `2`: record count, max 32
- `3`: record size, fixed at 5
- `4..163`: 32 records of `A, B, operation, result, flags`
- `164..191`: reserved/padding in the static dump

The firmware writes a record only when the operation stage is confirmed with OK. It uses `EEPROM.update()` to avoid unnecessary cell wear.

## Project Structure

```text
avr-xray-ula-web/
  arduino/avr_xray_ula_web/avr_xray_ula_web.ino
  web/index.html
  web/styles.css
  web/app.js
  docs/hardware.md
  docs/protocol.md
  README.md
```
