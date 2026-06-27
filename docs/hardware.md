# Hardware Map / Mapa de Hardware

## Português

Este projeto mira o Arduino Uno com ATmega328P.

| Sinal | Pino | Observação |
| --- | --- | --- |
| Carry / borrow LED | D2 | Acende pelo flag `C` da ULA em modo automático |
| Resultado b3 | D3 | Bit mais significativo do resultado |
| Resultado b2 | D4 | Resultado bit 2 |
| Resultado b1 | D5 | Resultado bit 1 |
| Resultado b0 | D6 | Bit menos significativo do resultado |
| Botão b3 | D7 | `INPUT_PULLUP`, pressionado = `LOW` |
| Botão b2 | D8 | `INPUT_PULLUP`, pressionado = `LOW` |
| Botão b1 | D9 | `INPUT_PULLUP`, pressionado = `LOW` |
| Botão b0 | D10 | `INPUT_PULLUP`, pressionado = `LOW` |
| Botão OK | D11 | Confirma etapa atual |
| Potenciômetro | A0 | Entra no painel ADC/X-Ray |

LEDs precisam de resistores em série. Botões devem ligar o pino ao `GND` ao serem pressionados.

## English

This project targets the Arduino Uno with ATmega328P.

| Signal | Pin | Note |
| --- | --- | --- |
| Carry / borrow LED | D2 | Driven by ALU flag `C` in automatic mode |
| Result b3 | D3 | Most significant result bit |
| Result b2 | D4 | Result bit 2 |
| Result b1 | D5 | Result bit 1 |
| Result b0 | D6 | Least significant result bit |
| Button b3 | D7 | `INPUT_PULLUP`, pressed = `LOW` |
| Button b2 | D8 | `INPUT_PULLUP`, pressed = `LOW` |
| Button b1 | D9 | `INPUT_PULLUP`, pressed = `LOW` |
| Button b0 | D10 | `INPUT_PULLUP`, pressed = `LOW` |
| OK button | D11 | Confirms the current stage |
| Potentiometer | A0 | Feeds the ADC/X-Ray panel |

LEDs need series resistors. Buttons should connect the pin to `GND` when pressed.

