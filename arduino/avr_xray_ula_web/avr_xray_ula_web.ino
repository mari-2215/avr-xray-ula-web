#include <Arduino.h>
#include <EEPROM.h>
#include <avr/interrupt.h>
#include <avr/pgmspace.h>

const uint8_t PROTOCOL_VERSION = 1;
const uint32_t BAUD_RATE = 115200;
const uint16_t SAMPLE_INTERVAL_MS = 100;
const uint16_t DEBOUNCE_MS = 40;

const uint8_t LED_CARRY_PIN = 2;
const uint8_t LED_BIT_PINS[4] = {3, 4, 5, 6};  // b3, b2, b1, b0
const uint8_t BUTTON_BIT_PINS[4] = {7, 8, 9, 10};  // b3, b2, b1, b0
const uint8_t BUTTON_OK_PIN = 11;
const uint8_t ADC_PIN = A0;

const uint8_t FLAG_ZERO = 1 << 0;
const uint8_t FLAG_CARRY = 1 << 1;
const uint8_t FLAG_NEGATIVE = 1 << 2;
const uint8_t FLAG_OVERFLOW = 1 << 3;
const uint8_t FLAG_DIV_ZERO = 1 << 4;

const uint8_t EEPROM_SIGNATURE = 0xA5;
const uint8_t EEPROM_RECORD_COUNT = 32;
const uint8_t EEPROM_RECORD_SIZE = 5;
const uint16_t EEPROM_HEADER_SIZE = 4;

const uint16_t FLASH_DUMP_SIZE = 64;
const uint16_t EEPROM_DUMP_SIZE = 192;

enum InputStage : uint8_t {
  STAGE_A = 0,
  STAGE_B = 1,
  STAGE_OPERATION = 2,
  STAGE_RESULT = 3,
};

struct DebouncedButton {
  uint8_t pin;
  uint8_t stableState;
  uint8_t lastRawState;
  uint32_t changedAt;
};

volatile uint8_t ula_probe[128];

DebouncedButton bitButtons[4];
DebouncedButton okButton;

uint8_t operandA = 0;
uint8_t operandB = 0;
uint8_t operationCode = 0;
uint8_t resultValue = 0;
uint8_t ulaFlags = 0;
uint8_t currentInput = 0;
InputStage inputStage = STAGE_A;

uint16_t snapshotSequence = 0;
uint32_t nextSnapshotAt = 0;

char commandBuffer[48];
uint8_t commandLength = 0;

bool ledOverrideActive = false;
uint8_t ledOverrideBits = 0;
uint32_t ledOverrideUntil = 0;

void setupButton(DebouncedButton &button, uint8_t pin);
void processButton(DebouncedButton &button, void (*onPress)());
void processSerialCommands();
void handleCommand();
void onBit3Pressed();
void onBit2Pressed();
void onBit1Pressed();
void onBit0Pressed();
void onOkPressed();
void toggleInputBit(uint8_t bit);
void executeUla();
void updateLeds();
void writeHistoryRecord();
void ensureEepromHeader();
void updateProbe(uint16_t adcValue);
void sendHello();
void sendSnapshot(uint16_t adcValue);
void sendStaticMemory();
void printHexByte(uint8_t value);
void printProbeHex();
void printEepromHex();
void printFlashHex();
void handleLedCommand(char *target, uint8_t level);

void setup() {
  Serial.begin(BAUD_RATE);

  pinMode(LED_CARRY_PIN, OUTPUT);
  for (uint8_t index = 0; index < 4; index++) {
    pinMode(LED_BIT_PINS[index], OUTPUT);
    setupButton(bitButtons[index], BUTTON_BIT_PINS[index]);
  }
  setupButton(okButton, BUTTON_OK_PIN);

  ensureEepromHeader();
  executeUla();
  updateProbe(analogRead(ADC_PIN));
  updateLeds();
  sendHello();
  sendStaticMemory();
}

void loop() {
  processSerialCommands();

  processButton(bitButtons[0], onBit3Pressed);
  processButton(bitButtons[1], onBit2Pressed);
  processButton(bitButtons[2], onBit1Pressed);
  processButton(bitButtons[3], onBit0Pressed);
  processButton(okButton, onOkPressed);

  if (ledOverrideActive && millis() > ledOverrideUntil) {
    ledOverrideActive = false;
  }
  updateLeds();

  const uint32_t now = millis();
  if (now >= nextSnapshotAt) {
    const uint16_t adcValue = analogRead(ADC_PIN);
    updateProbe(adcValue);
    sendSnapshot(adcValue);
    nextSnapshotAt = now + SAMPLE_INTERVAL_MS;
  }
}

void setupButton(DebouncedButton &button, uint8_t pin) {
  pinMode(pin, INPUT_PULLUP);
  const uint8_t initialState = digitalRead(pin);
  button.pin = pin;
  button.stableState = initialState;
  button.lastRawState = initialState;
  button.changedAt = millis();
}

void processButton(DebouncedButton &button, void (*onPress)()) {
  const uint8_t rawState = digitalRead(button.pin);
  const uint32_t now = millis();

  if (rawState != button.lastRawState) {
    button.lastRawState = rawState;
    button.changedAt = now;
  }

  if (rawState != button.stableState && now - button.changedAt >= DEBOUNCE_MS) {
    button.stableState = rawState;
    if (button.stableState == LOW) {
      onPress();
    }
  }
}

void onBit3Pressed() { toggleInputBit(3); }
void onBit2Pressed() { toggleInputBit(2); }
void onBit1Pressed() { toggleInputBit(1); }
void onBit0Pressed() { toggleInputBit(0); }

void toggleInputBit(uint8_t bit) {
  if (inputStage == STAGE_RESULT) {
    inputStage = STAGE_A;
    currentInput = 0;
  }
  currentInput ^= (1 << bit);
  currentInput &= 0x0F;
}

void onOkPressed() {
  if (inputStage == STAGE_A) {
    operandA = currentInput & 0x0F;
    currentInput = 0;
    inputStage = STAGE_B;
    return;
  }

  if (inputStage == STAGE_B) {
    operandB = currentInput & 0x0F;
    currentInput = 0;
    inputStage = STAGE_OPERATION;
    return;
  }

  if (inputStage == STAGE_OPERATION) {
    operationCode = currentInput & 0x07;
    currentInput = 0;
    executeUla();
    writeHistoryRecord();
    inputStage = STAGE_RESULT;
    return;
  }

  currentInput = 0;
  inputStage = STAGE_A;
}

void executeUla() {
  const uint8_t a = operandA & 0x0F;
  const uint8_t b = operandB & 0x0F;
  uint16_t wideResult = 0;
  uint8_t flags = 0;

  switch (operationCode & 0x07) {
    case 0:
      wideResult = a & b;
      break;
    case 1:
      wideResult = a | b;
      break;
    case 2:
      wideResult = (~b) & 0x0F;
      break;
    case 3:
      wideResult = a ^ b;
      break;
    case 4:
      wideResult = a + b;
      if (wideResult > 0x0F) flags |= FLAG_CARRY;
      break;
    case 5:
      wideResult = (a - b) & 0x0F;
      if (a < b) flags |= FLAG_CARRY;
      break;
    case 6:
      wideResult = a * b;
      if (wideResult > 0x0F) flags |= FLAG_OVERFLOW;
      break;
    case 7:
      if (b == 0) {
        wideResult = 0;
        flags |= FLAG_DIV_ZERO;
      } else {
        wideResult = a / b;
      }
      break;
  }

  resultValue = wideResult & 0x0F;
  if (resultValue == 0) flags |= FLAG_ZERO;
  if (resultValue & 0x08) flags |= FLAG_NEGATIVE;
  ulaFlags = flags;
}

void updateLeds() {
  if (ledOverrideActive) {
    digitalWrite(LED_CARRY_PIN, (ledOverrideBits & 0x10) ? HIGH : LOW);
    digitalWrite(LED_BIT_PINS[0], (ledOverrideBits & 0x08) ? HIGH : LOW);
    digitalWrite(LED_BIT_PINS[1], (ledOverrideBits & 0x04) ? HIGH : LOW);
    digitalWrite(LED_BIT_PINS[2], (ledOverrideBits & 0x02) ? HIGH : LOW);
    digitalWrite(LED_BIT_PINS[3], (ledOverrideBits & 0x01) ? HIGH : LOW);
    return;
  }

  digitalWrite(LED_CARRY_PIN, (ulaFlags & FLAG_CARRY) ? HIGH : LOW);
  digitalWrite(LED_BIT_PINS[0], (resultValue >> 3) & 1);
  digitalWrite(LED_BIT_PINS[1], (resultValue >> 2) & 1);
  digitalWrite(LED_BIT_PINS[2], (resultValue >> 1) & 1);
  digitalWrite(LED_BIT_PINS[3], resultValue & 1);
}

void ensureEepromHeader() {
  if (
    EEPROM.read(0) != EEPROM_SIGNATURE ||
    EEPROM.read(3) != EEPROM_RECORD_SIZE ||
    EEPROM.read(1) >= EEPROM_RECORD_COUNT ||
    EEPROM.read(2) > EEPROM_RECORD_COUNT
  ) {
    EEPROM.update(0, EEPROM_SIGNATURE);
    EEPROM.update(1, 0);
    EEPROM.update(2, 0);
    EEPROM.update(3, EEPROM_RECORD_SIZE);
  }
}

void writeHistoryRecord() {
  ensureEepromHeader();

  uint8_t writeIndex = EEPROM.read(1) % EEPROM_RECORD_COUNT;
  uint8_t count = EEPROM.read(2);
  if (count > EEPROM_RECORD_COUNT) count = 0;

  const uint16_t base = EEPROM_HEADER_SIZE + writeIndex * EEPROM_RECORD_SIZE;
  EEPROM.update(base + 0, operandA & 0x0F);
  EEPROM.update(base + 1, operandB & 0x0F);
  EEPROM.update(base + 2, operationCode & 0x07);
  EEPROM.update(base + 3, resultValue & 0x0F);
  EEPROM.update(base + 4, ulaFlags & 0x1F);

  writeIndex = (writeIndex + 1) % EEPROM_RECORD_COUNT;
  if (count < EEPROM_RECORD_COUNT) count++;

  EEPROM.update(1, writeIndex);
  EEPROM.update(2, count);
}

void updateProbe(uint16_t adcValue) {
  const uint8_t sregValue = SREG;
  ula_probe[0] = operandA;
  ula_probe[1] = operandB;
  ula_probe[2] = operationCode;
  ula_probe[3] = resultValue;
  ula_probe[4] = ulaFlags;
  ula_probe[5] = sregValue;
  ula_probe[6] = PORTB;
  ula_probe[7] = PORTC;
  ula_probe[8] = PORTD;
  ula_probe[9] = PINB;
  ula_probe[10] = PINC;
  ula_probe[11] = PIND;
  ula_probe[12] = TCNT0;
  ula_probe[13] = TCNT2;
  ula_probe[14] = adcValue & 0xFF;
  ula_probe[15] = (adcValue >> 8) & 0x03;

  const uint8_t slot = (snapshotSequence / 10) % 16;
  const uint8_t base = 16 + slot * 7;
  ula_probe[base + 0] = operandA;
  ula_probe[base + 1] = operandB;
  ula_probe[base + 2] = operationCode;
  ula_probe[base + 3] = resultValue;
  ula_probe[base + 4] = ulaFlags;
  ula_probe[base + 5] = sregValue;
  ula_probe[base + 6] = snapshotSequence & 0xFF;
}

void processSerialCommands() {
  while (Serial.available() > 0) {
    const char character = Serial.read();

    if (character == '\n' || character == '\r') {
      if (commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        handleCommand();
        commandLength = 0;
      }
      continue;
    }

    if (commandLength < sizeof(commandBuffer) - 1) {
      commandBuffer[commandLength++] = character;
    } else {
      commandLength = 0;
    }
  }
}

void handleCommand() {
  if (strcmp(commandBuffer, "GET_STATIC") == 0) {
    sendStaticMemory();
    return;
  }

  if (strcmp(commandBuffer, "OK") == 0) {
    onOkPressed();
    return;
  }

  if (strncmp(commandBuffer, "INPUT:", 6) == 0) {
    currentInput = atoi(commandBuffer + 6) & 0x0F;
    if (inputStage == STAGE_RESULT) {
      inputStage = STAGE_A;
    }
    return;
  }

  if (strncmp(commandBuffer, "PRESS:", 6) == 0) {
    char *target = commandBuffer + 6;
    if (strcmp(target, "B3") == 0) toggleInputBit(3);
    else if (strcmp(target, "B2") == 0) toggleInputBit(2);
    else if (strcmp(target, "B1") == 0) toggleInputBit(1);
    else if (strcmp(target, "B0") == 0) toggleInputBit(0);
    else if (strcmp(target, "OK") == 0) onOkPressed();
    return;
  }

  if (strncmp(commandBuffer, "LED_AUTO", 8) == 0) {
    ledOverrideActive = false;
    return;
  }

  if (strncmp(commandBuffer, "LED:", 4) == 0) {
    char *target = commandBuffer + 4;
    char *separator = strchr(target, ':');
    if (separator == NULL) return;
    *separator = '\0';
    handleLedCommand(target, atoi(separator + 1) ? 1 : 0);
    return;
  }
}

void handleLedCommand(char *target, uint8_t level) {
  if (!ledOverrideActive) {
    ledOverrideBits = ((ulaFlags & FLAG_CARRY) ? 0x10 : 0x00) | (resultValue & 0x0F);
  }

  uint8_t mask = 0;
  if (strcmp(target, "CARRY") == 0) mask = 0x10;
  else if (strcmp(target, "B3") == 0) mask = 0x08;
  else if (strcmp(target, "B2") == 0) mask = 0x04;
  else if (strcmp(target, "B1") == 0) mask = 0x02;
  else if (strcmp(target, "B0") == 0) mask = 0x01;
  else return;

  if (level) ledOverrideBits |= mask;
  else ledOverrideBits &= ~mask;
  ledOverrideActive = true;
  ledOverrideUntil = millis() + 1500;
}

void sendHello() {
  Serial.print(F("{\"type\":\"hello\",\"protocol\":"));
  Serial.print(PROTOCOL_VERSION);
  Serial.print(F(",\"device\":\"AVR X-Ray ULA Web\",\"firmware\":\"2.0.0\",\"sample_hz\":10}"));
  Serial.println();
}

void sendSnapshot(uint16_t adcValue) {
  const uint8_t sregValue = SREG;
  const uint8_t interruptState = SREG;
  cli();
  const uint16_t timer1Value = TCNT1;
  SREG = interruptState;
  const uint16_t millivolts = (uint32_t)adcValue * 5000UL / 1023UL;

  Serial.print(F("{\"type\":\"snapshot\",\"protocol\":"));
  Serial.print(PROTOCOL_VERSION);
  Serial.print(F(",\"seq\":"));
  Serial.print(snapshotSequence++);
  Serial.print(F(",\"millis\":"));
  Serial.print(millis());

  Serial.print(F(",\"ula\":{\"a\":"));
  Serial.print(operandA);
  Serial.print(F(",\"b\":"));
  Serial.print(operandB);
  Serial.print(F(",\"op\":"));
  Serial.print(operationCode);
  Serial.print(F(",\"result\":"));
  Serial.print(resultValue);
  Serial.print(F(",\"flags\":"));
  Serial.print(ulaFlags);
  Serial.print(F(",\"stage\":"));
  Serial.print((uint8_t)inputStage);
  Serial.print(F(",\"input\":"));
  Serial.print(currentInput);
  Serial.print('}');

  Serial.print(F(",\"ports\":{\"B\":{\"ddr\":"));
  Serial.print(DDRB);
  Serial.print(F(",\"port\":"));
  Serial.print(PORTB);
  Serial.print(F(",\"pin\":"));
  Serial.print(PINB);
  Serial.print(F("},\"C\":{\"ddr\":"));
  Serial.print(DDRC);
  Serial.print(F(",\"port\":"));
  Serial.print(PORTC);
  Serial.print(F(",\"pin\":"));
  Serial.print(PINC);
  Serial.print(F("},\"D\":{\"ddr\":"));
  Serial.print(DDRD);
  Serial.print(F(",\"port\":"));
  Serial.print(PORTD);
  Serial.print(F(",\"pin\":"));
  Serial.print(PIND);
  Serial.print(F("}}"));

  Serial.print(F(",\"sreg\":"));
  Serial.print(sregValue);

  Serial.print(F(",\"timers\":{\"tcnt0\":"));
  Serial.print(TCNT0);
  Serial.print(F(",\"tcnt1\":"));
  Serial.print(timer1Value);
  Serial.print(F(",\"tcnt2\":"));
  Serial.print(TCNT2);
  Serial.print(F(",\"tccr0a\":"));
  Serial.print(TCCR0A);
  Serial.print(F(",\"tccr0b\":"));
  Serial.print(TCCR0B);
  Serial.print(F(",\"tccr1a\":"));
  Serial.print(TCCR1A);
  Serial.print(F(",\"tccr1b\":"));
  Serial.print(TCCR1B);
  Serial.print(F(",\"tccr2a\":"));
  Serial.print(TCCR2A);
  Serial.print(F(",\"tccr2b\":"));
  Serial.print(TCCR2B);
  Serial.print('}');

  Serial.print(F(",\"adc\":{\"a0\":"));
  Serial.print(adcValue);
  Serial.print(F(",\"millivolts\":"));
  Serial.print(millivolts);
  Serial.print('}');

  Serial.print(F(",\"sram\":\""));
  printProbeHex();
  Serial.print(F("\"}"));
  Serial.println();
}

void sendStaticMemory() {
  Serial.print(F("{\"type\":\"memory\",\"protocol\":"));
  Serial.print(PROTOCOL_VERSION);
  Serial.print(F(",\"eeprom\":\""));
  printEepromHex();
  Serial.print(F("\",\"flash\":\""));
  printFlashHex();
  Serial.print(F("\"}"));
  Serial.println();
}

void printHexByte(uint8_t value) {
  const char hexDigits[] = "0123456789ABCDEF";
  Serial.print(hexDigits[(value >> 4) & 0x0F]);
  Serial.print(hexDigits[value & 0x0F]);
}

void printProbeHex() {
  for (uint8_t index = 0; index < sizeof(ula_probe); index++) {
    printHexByte(ula_probe[index]);
  }
}

void printEepromHex() {
  for (uint16_t address = 0; address < EEPROM_DUMP_SIZE; address++) {
    printHexByte(EEPROM.read(address));
  }
}

void printFlashHex() {
  for (uint16_t address = 0; address < FLASH_DUMP_SIZE; address++) {
    printHexByte(pgm_read_byte_near(address));
  }
}
