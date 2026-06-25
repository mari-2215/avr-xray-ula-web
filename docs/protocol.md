# Serial Protocol / Protocolo Serial

Baud rate: `115200`

Encoding: ASCII JSON Lines from Arduino to web; newline-terminated text commands from web to Arduino.

## Frames

### `hello`

```json
{"type":"hello","protocol":1,"device":"AVR X-Ray ULA Web","firmware":"2.1.0","sample_hz":10}
```

### `snapshot`

Sent about 10 times per second.

```json
{
  "type": "snapshot",
  "protocol": 1,
  "seq": 42,
  "millis": 12345,
  "ula": {"a":1,"b":2,"op":4,"result":3,"flags":0,"stage":3,"input":0},
  "ports": {
    "B": {"ddr":0,"port":0,"pin":0},
    "C": {"ddr":0,"port":0,"pin":0},
    "D": {"ddr":0,"port":0,"pin":0}
  },
  "sreg": 0,
  "timers": {
    "tcnt0":0,
    "tcnt1":0,
    "tcnt2":0,
    "tccr0a":0,
    "tccr0b":0,
    "tccr1a":0,
    "tccr1b":0,
    "tccr2a":0,
    "tccr2b":0
  },
  "adc": {"a0":512,"millivolts":2502},
  "sram": "..."
}
```

`sram` is 128 bytes encoded as uppercase hexadecimal.

### `memory`

Sent at startup and when `GET_STATIC` is received.

```json
{"type":"memory","protocol":1,"eeprom":"...","flash":"..."}
```

`eeprom` is 192 bytes encoded as uppercase hexadecimal. The first 164 bytes contain the 4-byte header plus 32 records of 5 bytes; the remaining bytes are reserved/padding for compatibility.

`flash` is a 64-byte diagnostic window encoded as uppercase hexadecimal.

### `ack`

Sent after a recognized command is processed.

```json
{"type":"ack","protocol":1,"command":"RUN","ok":true}
```

## Commands

| Command | Meaning |
| --- | --- |
| `GET_STATIC` | Resend EEPROM and FLASH dump |
| `INPUT:0..15` | Replace current virtual nibble |
| `OK` | Confirm the current ALU stage |
| `CLEAR` / `RESET` | Reset operands, operation, result, flags, stage and LEDs |
| `OP:0..7` | Select operation code without blocking physical buttons |
| `RUN:A:B:OP` | Execute one ALU operation from the web UI, persist it in EEPROM, and show the result |
| `PRESS:B3` / `PRESS:B2` / `PRESS:B1` / `PRESS:B0` | Simulate a physical bit-button press |
| `PRESS:OK` | Simulate physical OK |
| `LED:CARRY:0|1` | Temporarily override carry LED |
| `LED:B3:0|1` ... `LED:B0:0|1` | Temporarily override result LEDs |
| `LED_AUTO` | Return LEDs to automatic ALU output mode |

The LED override lasts about 1.5 seconds and then returns to normal ALU-driven output.

If the web UI shows `TX ...` but never shows `ACK ...` or `RX snapshot ...`, the browser/API is not talking to the firmware currently running on the Arduino.
