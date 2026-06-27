const PROTOCOL_VERSION = 1;
const COPY = {
  pt: {
    statusSim: "Simulador ativo",
    statusPaused: "Simulador pausado",
    serialUnavailable: "Web Serial indisponivel neste navegador",
    serialConnected: "Serial conectado em 115200",
    bridge: "API local",
    bridgeConnected: "API local conectada",
    bridgeFailed: "Falha na API local",
    bridgeNoSerial: "API local aberta, mas sem serial",
    connectFailed: "Falha ao conectar",
    noConnection: "Sem conexao real com o Arduino",
    noRx: "Conectado, mas sem dados do Arduino",
    serialStopped: "Serial interrompido",
    brandEyebrow: "Arduino Uno / ATmega328P",
    connect: "Conectar",
    simulator: "Simulador",
    aluFlow: "Fluxo da ULA",
    sendSignal: "Enviar sinal",
    sendInput: "Enviar input",
    physicalSignals: "Sinais fisicos",
    ledsButtons: "LEDs e botoes",
    ledPins: "LEDs D2-D6",
    buttonPins: "Botoes D7-D11",
    liveDump: "Dump ao vivo",
    registers: "Registradores",
    staticMemory: "Memoria estatica",
    tabOverview: "Visao Geral",
    tabSreg: "SREG",
    tabPorts: "Portas",
    tabTimers: "Temporizadores",
    tabMemory: "Memoria",
    waitingStatic: "Aguardando GET_STATIC...",
    selectedBit: "Alternar bit",
    ledCommand: "Enviar comando para LED",
    stages: ["Entrada do operando A", "Entrada do operando B", "Selecao da operacao", "Resultado"],
    ops: ["AND", "OR", "NOT B", "XOR", "ADD", "SUB", "MUL", "DIV"],
    sramHistory: "Historico circular da ULA, slot",
    sramDefault: "Byte instrumentado.",
    bridgeHint: "Firefox/Linux: rode python bridge.py e clique em API local. Ele detecta ACM0/ACM1 pelo JSON do Arduino.",
  },
  en: {
    statusSim: "Simulator active",
    statusPaused: "Simulator paused",
    serialUnavailable: "Web Serial is unavailable in this browser",
    serialConnected: "Serial connected at 115200",
    bridge: "Local API",
    bridgeConnected: "Local API connected",
    bridgeFailed: "Local API failed",
    bridgeNoSerial: "Local API open, but no serial",
    connectFailed: "Connection failed",
    noConnection: "No real Arduino connection",
    noRx: "Connected, but no Arduino data",
    serialStopped: "Serial stopped",
    brandEyebrow: "Arduino Uno / ATmega328P",
    connect: "Connect",
    simulator: "Simulator",
    aluFlow: "ALU flow",
    sendSignal: "Send signal",
    sendInput: "Send input",
    physicalSignals: "Physical signals",
    ledsButtons: "LEDs and buttons",
    ledPins: "LEDs D2-D6",
    buttonPins: "Buttons D7-D11",
    liveDump: "Live dump",
    registers: "Registers",
    staticMemory: "Static memory",
    tabOverview: "Overview",
    tabSreg: "SREG",
    tabPorts: "Ports",
    tabTimers: "Timers",
    tabMemory: "Memory",
    waitingStatic: "Waiting for GET_STATIC...",
    selectedBit: "Toggle bit",
    ledCommand: "Send command to LED",
    stages: ["Operand A input", "Operand B input", "Operation selection", "Result"],
    ops: ["AND", "OR", "NOT B", "XOR", "ADD", "SUB", "MUL", "DIV"],
    sramHistory: "ALU circular history, slot",
    sramDefault: "Instrumented byte.",
    bridgeHint: "Firefox/Linux: run python bridge.py and click Local API. It detects ACM0/ACM1 from Arduino JSON.",
  },
};
const OPS_BITS = ["000", "001", "010", "011", "100", "101", "110", "111"];
const OPERATIONS = [
  { code: 0, bits: "000", name: "AND", expression: "A & B", description: "Liga somente bits que estao 1 em A e B." },
  { code: 1, bits: "001", name: "OR", expression: "A | B", description: "Liga bits que estao 1 em A ou B." },
  { code: 2, bits: "010", name: "NOT B", expression: "~B", description: "Inverte os quatro bits do operando B." },
  { code: 3, bits: "011", name: "XOR", expression: "A ^ B", description: "Liga bits diferentes entre A e B." },
  { code: 4, bits: "100", name: "ADD", expression: "A + B", description: "Soma A e B; C indica vai-um." },
  { code: 5, bits: "101", name: "SUB", expression: "A - B", description: "Subtrai B de A; C indica borrow." },
  { code: 6, bits: "110", name: "MUL", expression: "A * B", description: "Multiplica e mostra os quatro bits baixos; V indica overflow." },
  { code: 7, bits: "111", name: "DIV", expression: "A / B", description: "Divisao inteira; D indica divisor zero." },
];
const FLAGS = [
  ["Z", 1],
  ["C", 2],
  ["N", 4],
  ["V", 8],
  ["D", 16],
];
const BUTTON_PINS = [
  ["b3", 7],
  ["b2", 8],
  ["b1", 9],
  ["b0", 10],
  ["OK", 11],
];
const LED_NAMES = ["CARRY", "B3", "B2", "B1", "B0"];

const $ = (id) => document.getElementById(id);
const state = {
  port: null,
  reader: null,
  writer: null,
  buffer: "",
  connected: false,
  bridgeConnected: false,
  eventSource: null,
  bridgeBase: "http://localhost:8765",
  simulate: false,
  selectedInput: 0,
  selectedDump: "eeprom",
  selectedCell: 0,
  lang: "pt",
  prevSram: new Uint8Array(128),
  frame: null,
  memory: { eeprom: new Uint8Array(192), flash: new Uint8Array(64) },
  gameScore: 0,
  gameTarget: 0.5,
  gameLastHitAt: 0,
  selectedOperation: 0,
  smartRunning: false,
  commandMode: "legacy",
  firmware: "",
  rxCount: 0,
  lastRxAt: 0,
  rxWatchdog: 0,
  operationLog: [],
  lastLoggedSignature: "",
  lastFrameStage: null,
  pendingSource: "",
};
const t = (key) => COPY[state.lang][key];

function bits(value, width) {
  return (value >>> 0).toString(2).padStart(width, "0").slice(-width);
}

function hex(value, width = 2) {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, "0");
}

function bytesFromHex(text, size) {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16) || 0;
  return out;
}

function readNibbleInput(id) {
  const value = Number($(id).value);
  if (!Number.isInteger(value) || value < 0 || value > 15) {
    $(id).classList.add("invalid");
    return null;
  }
  $(id).classList.remove("invalid");
  return value;
}

function renderDecimalBits() {
  const a = readNibbleInput("decimalA");
  const b = readNibbleInput("decimalB");
  $("decimalABits").textContent = a === null ? "----" : bits(a, 4);
  $("decimalBBits").textContent = b === null ? "----" : bits(b, 4);
}

function initUi() {
  FLAGS.forEach(([name]) => {
    const node = document.createElement("div");
    node.className = "flag";
    node.id = `flag${name}`;
    node.textContent = name;
    $("flagRow").appendChild(node);
  });

  ["I", "T", "H", "S", "V", "N", "Z", "C"].forEach((name) => {
    const node = document.createElement("div");
    node.className = "flag";
    node.id = `sreg${name}`;
    node.textContent = name;
    $("sregFlags").appendChild(node);
  });

  [3, 2, 1, 0].forEach((bit) => {
    const btn = document.createElement("button");
    btn.className = "bit";
    btn.textContent = `b${bit}`;
    btn.title = `${t("selectedBit")} ${bit}`;
    btn.addEventListener("click", () => {
      state.selectedInput ^= 1 << bit;
      renderInputNibble();
    });
    $("inputNibble").appendChild(btn);
  });

  LED_NAMES.forEach((name) => {
    const led = document.createElement("button");
    led.className = "led";
    led.id = `led${name}`;
    led.textContent = name;
    led.title = `${t("ledCommand")} ${name}`;
    led.addEventListener("click", () => {
      const nextLevel = led.classList.contains("on") ? 0 : 1;
      sendCommand(`LED:${name}:${nextLevel}`);
    });
    $("leds").appendChild(led);
  });

  BUTTON_PINS.forEach(([name, pin]) => {
    const btn = document.createElement("div");
    btn.className = "button-state";
    btn.id = `button${pin}`;
    btn.textContent = name;
    $("buttons").appendChild(btn);
  });

  for (let i = 0; i < 128; i++) {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.title = `ula_probe[${i}]`;
    cell.addEventListener("click", () => {
      state.selectedCell = i;
      renderSram(state.frame?.sram || state.prevSram);
    });
    $("sramMap").appendChild(cell);
  }

  ["B", "C", "D"].forEach((port) => $("ports").appendChild(makePort(port)));
  renderOperationTable();

  ["tcnt0", "tcnt1", "tcnt2", "tccr0a", "tccr0b", "tccr1a", "tccr1b", "tccr2a", "tccr2b"].forEach((name) => {
    const node = document.createElement("div");
    node.className = "metric";
    node.id = `timer-${name}`;
    node.innerHTML = `<span>${name.toUpperCase()}</span><strong>0</strong>`;
    $("timers").appendChild(node);
  });

  document.querySelectorAll(".dump-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.selectedDump = tab.dataset.dump;
      document.querySelectorAll(".dump-tab").forEach((t) => t.classList.toggle("active", t === tab));
      renderDump();
    });
  });

  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => selectView(tab.dataset.view));
  });

  $("connectBtn").addEventListener("click", connectSerial);
  $("bridgeBtn").addEventListener("click", connectBridge);
  $("simBtn").addEventListener("click", toggleSimulator);
  $("langBtn").addEventListener("click", toggleLanguage);
  $("sendInputBtn").addEventListener("click", () => sendCommand(`INPUT:${state.selectedInput}`));
  $("okBtn").addEventListener("click", pressOkFromUi);
  $("clearBtn").addEventListener("click", clearOperation);
  $("staticBtn").addEventListener("click", () => sendCommand("GET_STATIC"));
  $("runDecimalBtn").addEventListener("click", runDecimalOperation);
  $("smartRunBtn").addEventListener("click", runSmartCommand);
  $("gameResetBtn").addEventListener("click", resetPotGame);
  ["decimalA", "decimalB"].forEach((id) => {
    $(id).addEventListener("input", renderDecimalBits);
  });

  renderInputNibble();
  renderDecimalBits();
  renderFlagDescriptions();
  renderOperationLog();
  renderDump();
  applyLanguage();
}

function renderOperationTable() {
  $("operationTable").innerHTML = OPERATIONS.map((op) => `
    <tr data-op="${op.code}">
      <td><code>${op.bits}</code></td>
      <td>${op.name}</td>
      <td><code>${op.expression}</code></td>
      <td>${op.description}</td>
    </tr>
  `).join("");
  document.querySelectorAll("#operationTable tr").forEach((row) => {
    row.addEventListener("click", () => selectOperation(Number(row.dataset.op), true));
  });
  selectOperation(state.selectedOperation, false);
}

function selectOperation(code, notifyArduino) {
  state.selectedOperation = Math.max(0, Math.min(7, code));
  document.querySelectorAll("#operationTable tr").forEach((row) => {
    row.classList.toggle("selected", Number(row.dataset.op) === state.selectedOperation);
  });
  const op = OPERATIONS[state.selectedOperation];
  $("opBits").textContent = op.bits;
  $("opName").textContent = op.name;
  $("opExpression").textContent = op.expression;
  if (notifyArduino) {
    const command = state.commandMode === "direct" ? `OP:${state.selectedOperation}` : `INPUT:${state.selectedOperation}`;
    sendCommand(command);
  }
}

function renderFlagDescriptions() {
  const aluFlags = [
    ["Z", "Zero: resultado igual a 0"],
    ["C", "Carry/borrow: vai-um ou emprestimo"],
    ["N", "Negativo: bit 3 do resultado ligado"],
    ["V", "Overflow: multiplicacao passou de 4 bits"],
    ["D", "Divisao por zero"],
  ];
  $("aluFlagDescriptions").innerHTML = aluFlags
    .map(([name, text]) => `<span><b>${name}</b>${text}</span>`)
    .join("");

  const sregFlags = [
    ["I", "Global interrupt enable"],
    ["T", "Bit copy storage"],
    ["H", "Half carry"],
    ["S", "Sign"],
    ["V", "Two's complement overflow"],
    ["N", "Negative"],
    ["Z", "Zero"],
    ["C", "Carry"],
  ];
  $("sregFlagDescriptions").innerHTML = sregFlags
    .map(([name, text]) => `<span><b>${name}</b>${text}</span>`)
    .join("");
}

function selectView(view) {
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `view-${view}`);
  });
}

async function runDecimalOperation() {
  const a = readNibbleInput("decimalA");
  const b = readNibbleInput("decimalB");
  if (a === null || b === null) {
    $("smartStatus").textContent = "Use valores de 0 a 15.";
    return;
  }
  await executeOperation(a, b, state.selectedOperation, "UI");
}

async function executeOperation(a, b, op, source = "UI", options = {}) {
  selectOperation(op, false);
  state.pendingSource = source;
  if (state.simulate || options.forceSimulated) {
    if (!options.forceSimulated) {
      state.simulate = false;
      $("simBtn").classList.remove("active");
    }
    renderSimulatedOperation(a, b, op, source);
    setStatus("Resultado simulado", true);
    return;
  }
  if (state.commandMode === "direct") {
    await sendCommand(`RUN:${a}:${b}:${op}`);
    await wait(250);
    await sendCommand("GET_STATIC");
    return;
  }
  await sendLegacyOperation(a, b, op);
}

async function sendLegacyOperation(a, b, op) {
  const currentStage = state.frame?.ula?.stage;
  if (currentStage === 3) {
    await sendCommand("OK");
    await wait(120);
  }
  await sendCommand(`INPUT:${a}`);
  await wait(100);
  await sendCommand("OK");
  await wait(140);
  await sendCommand(`INPUT:${b}`);
  await wait(100);
  await sendCommand("OK");
  await wait(140);
  await sendCommand(`INPUT:${op}`);
  await wait(100);
  await sendCommand("OK");
  await wait(120);
  await sendCommand("GET_STATIC");
}

function renderSimulatedOperation(a, b, op, source = "Sim") {
  const result = executeOp(a, b, op);
  const flags = makeFlags(a, b, op, result);
  const sram = new Uint8Array(128);
  sram[0] = a;
  sram[1] = b;
  sram[2] = op;
  sram[3] = result;
  sram[4] = flags;
  for (let i = 5; i < 128; i++) sram[i] = (i * 13 + result * 17) & 255;
  renderFrame({
    seq: state.frame ? state.frame.seq + 1 : 1,
    millis: Date.now() % 1000000,
    ula: { a, b, op, result, flags, stage: 3, input: 0 },
    ports: {
      B: { ddr: 0x0f, port: result, pin: 0xff },
      C: { ddr: 0x00, port: 0x00, pin: 0 },
      D: { ddr: 0x7c, port: (result << 3) & 0x78, pin: 0xff },
    },
    sreg: flags,
    timers: {},
    adc: { a0: Math.floor(state.gameTarget * 1023), millivolts: Math.floor(state.gameTarget * 5000) },
    sram,
  });
}

function parseSmartCommand(text) {
  const normalized = text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[;,]/g, " depois ");
  const chunks = normalized.split(/\bdepois\b/).map((part) => part.trim()).filter(Boolean).slice(0, 3);
  return chunks.map(parseSmartChunk).filter(Boolean);
}

function parseSmartChunk(chunk) {
  const operationPatterns = [
    [4, /\b(soma|somar|add|adicao)\b/],
    [5, /\b(subtrai|subtrair|subtracao)\b/],
    [3, /\bxor\b/],
    [0, /\b(and|e logico)\b/],
    [1, /\b(or|ou logico)\b/],
    [6, /\b(multiplica|multiplicar|vezes)\b/],
    [7, /\b(divide|dividir|divisao)\b/],
    [2, /\b(not b|nega b|inverte b)\b/],
  ];
  const match = operationPatterns.find(([, pattern]) => pattern.test(chunk));
  if (!match) return null;
  const numbers = [...chunk.matchAll(/\b(1[0-5]|[0-9])\b/g)].map((item) => Number(item[1]));
  if (match[0] === 2) {
    return numbers.length >= 1 ? { op: 2, a: 0, b: numbers[0] } : null;
  }
  return numbers.length >= 2 ? { op: match[0], a: numbers[0], b: numbers[1] } : null;
}

async function runSmartCommand() {
  if (state.smartRunning) return;
  const operations = parseSmartCommand($("smartCommand").value);
  if (!operations.length) {
    $("smartStatus").textContent = "Nao entendi. Ex.: soma 3 e 4.";
    return;
  }

  state.smartRunning = true;
  const simulateSequence = state.simulate;
  if (simulateSequence) {
    state.simulate = false;
    $("simBtn").classList.remove("active");
  }
  $("smartStatus").textContent = `Executando ${operations.length} operacao(oes)...`;
  for (let index = 0; index < operations.length; index++) {
    const item = operations[index];
    $("smartStatus").textContent = `Etapa ${index + 1}/${operations.length}: ${OPERATIONS[item.op].name} ${item.a}, ${item.b}`;
    await executeOperation(item.a, item.b, item.op, "Smart", { forceSimulated: simulateSequence });
    await blinkForSequence();
    $("smartStatus").textContent = `Segurando LEDs por 3s: ${OPERATIONS[item.op].name} -> ${bits(executeOp(item.a, item.b, item.op), 4)}`;
    await wait(3000);
  }
  $("smartStatus").textContent = "Sequencia concluida.";
  state.smartRunning = false;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function blinkForSequence() {
  for (let i = 0; i < 3; i++) {
    document.body.classList.add("sequence-blink");
    await wait(180);
    document.body.classList.remove("sequence-blink");
    await wait(180);
  }
}

function makePort(port) {
  const wrap = document.createElement("div");
  wrap.className = "port-row";
  wrap.innerHTML = `<strong>${port}</strong><div class="registers"></div>`;
  ["DDR", "PORT", "PIN"].forEach((reg) => {
    const row = document.createElement("div");
    row.className = "reg";
    row.id = `${reg}${port}`;
    row.innerHTML = `<span>${reg}</span>`;
    for (let i = 7; i >= 0; i--) {
      const bit = document.createElement("span");
      bit.className = "reg-bit";
      bit.textContent = i;
      row.appendChild(bit);
    }
    wrap.querySelector(".registers").appendChild(row);
  });
  return wrap;
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    setStatus(t("serialUnavailable"), false);
    return;
  }

  try {
    state.port = await navigator.serial.requestPort();
    await state.port.open({ baudRate: 115200 });
    state.writer = state.port.writable.getWriter();
    state.reader = state.port.readable.getReader();
    state.connected = true;
    state.bridgeConnected = false;
    state.simulate = false;
    state.rxCount = 0;
    state.lastRxAt = 0;
    $("simBtn").classList.remove("active");
    setStatus(t("serialConnected"), true);
    readLoop();
    requestStaticAfterConnect();
    startRxWatchdog();
  } catch (error) {
    setStatus(`${t("connectFailed")}: ${error.message}`, false);
  }
}

async function connectBridge() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  try {
    const response = await fetch(`${state.bridgeBase}/api/status`);
    const status = await response.json();
    if (!status.serial_connected) {
      setStatus(`${t("bridgeNoSerial")}: ${status.error || state.bridgeBase}`, false);
      return;
    }
  } catch (error) {
    setStatus(`${t("bridgeFailed")}: ${state.bridgeBase}`, false);
    return;
  }

  const source = new EventSource(`${state.bridgeBase}/api/events`);
  state.eventSource = source;

  source.onopen = () => {
    state.connected = true;
    state.bridgeConnected = true;
    state.simulate = false;
    state.rxCount = 0;
    state.lastRxAt = 0;
    $("simBtn").classList.remove("active");
    $("bridgeBtn").classList.add("active");
    setStatus(t("bridgeConnected"), true);
    requestStaticAfterConnect();
    startRxWatchdog();
  };

  source.onmessage = (event) => {
    if (event.data) handleLine(event.data);
  };

  source.onerror = () => {
    state.connected = false;
    state.bridgeConnected = false;
    $("bridgeBtn").classList.remove("active");
    setStatus(`${t("bridgeFailed")}: ${state.bridgeBase}`, false);
  };
}

function requestStaticAfterConnect() {
  [350, 1600, 3200].forEach((delay) => {
    setTimeout(() => {
      if (state.connected || state.bridgeConnected) sendCommand("GET_STATIC");
    }, delay);
  });
}

function startRxWatchdog() {
  clearTimeout(state.rxWatchdog);
  state.rxWatchdog = setTimeout(async () => {
    const hasConnection = state.connected || state.bridgeConnected;
    if (hasConnection && !state.simulate && !state.lastRxAt) {
      const detail = await bridgePortDetail();
      setStatus(`${t("noRx")}: ${detail || "verifique porta, upload do sketch e Serial Monitor fechado"}`, false);
    }
  }, 4200);
}

async function bridgePortDetail() {
  if (!state.bridgeConnected) return "";
  try {
    const response = await fetch(`${state.bridgeBase}/api/status`);
    const status = await response.json();
    const available = (status.ports || []).map((port) => port.device).join(", ") || "nenhuma";
    return `API em ${status.serial_device || "sem serial"}; portas: ${available}; reinicie com python bridge.py para auto-detectar`;
  } catch (error) {
    return "";
  }
}

async function readLoop() {
  const decoder = new TextDecoder();
  while (state.connected && state.reader) {
    try {
      const { value, done } = await state.reader.read();
      if (done) break;
      state.buffer += decoder.decode(value, { stream: true });
      const lines = state.buffer.split(/\r?\n/);
      state.buffer = lines.pop() || "";
      lines.filter(Boolean).forEach(handleLine);
    } catch (error) {
      setStatus(`${t("serialStopped")}: ${error.message}`, false);
      state.connected = false;
    }
  }
}

function handleLine(line) {
  const start = line.indexOf("{");
  if (start < 0) return;
  const jsonText = line.slice(start).trim();
  if (!jsonText) return;

  try {
    const payload = JSON.parse(jsonText);
    if (payload.protocol && payload.protocol !== PROTOCOL_VERSION) return;
    state.rxCount += 1;
    state.lastRxAt = Date.now();
    if (payload.type === "snapshot") {
      renderFrame(normalizeSnapshot(payload));
      setStatus(`RX snapshot ${payload.seq ?? state.rxCount}`, true);
    }
    if (payload.type === "memory") {
      state.memory = {
        eeprom: bytesFromHex(payload.eeprom || "", 192),
        flash: bytesFromHex(payload.flash || "", 64),
      };
      renderDump();
      setStatus("RX memory dump", true);
    }
    if (payload.type === "ack") {
      setStatus(`ACK ${payload.command || ""}`.trim(), Boolean(payload.ok ?? true));
    }
    if (payload.type === "hello") {
      state.firmware = payload.firmware || "";
      state.commandMode = supportsDirectCommands(state.firmware) ? "direct" : "legacy";
      setStatus(`${payload.device || "Arduino"} / fw ${state.firmware || "?"}`, true);
    }
  } catch (error) {
    // Serial can start mid-line right after opening. Ignore malformed fragments silently.
    return;
  }
}

function supportsDirectCommands(firmware) {
  const match = String(firmware || "").match(/^(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || (major === 2 && minor >= 1);
}

function normalizeSnapshot(payload) {
  return {
    seq: payload.seq || 0,
    millis: payload.millis || 0,
    ula: payload.ula || { a: 0, b: 0, op: 0, result: 0, flags: 0, stage: 0, input: 0 },
    ports: payload.ports || {},
    sreg: payload.sreg || 0,
    timers: payload.timers || {},
    adc: payload.adc || { a0: 0, millivolts: 0 },
    sram: bytesFromHex(payload.sram || "", 128),
  };
}

async function sendCommand(command) {
  if (!state.simulate && !state.bridgeConnected && !state.writer) {
    setStatus(t("noConnection"), false);
    return false;
  }
  pulseCommand(command);
  if (state.bridgeConnected) {
    const response = await fetch(`${state.bridgeBase}/api/command`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: command,
    });
    if (!response.ok) {
      const message = await response.text();
      setStatus(`${t("bridgeFailed")}: ${message || response.status}`, false);
      return false;
    }
    return true;
  }
  if (state.simulate && !state.writer) return true;
  const bytes = new TextEncoder().encode(`${command}\n`);
  await state.writer.write(bytes);
  return true;
}

function pulseCommand(command) {
  setStatus(`TX ${command}`, state.connected || state.simulate);
  document.body.animate(
    [{ filter: "brightness(1)" }, { filter: "brightness(1.18)" }, { filter: "brightness(1)" }],
    { duration: 220, easing: "ease-out" }
  );
}

function toggleSimulator() {
  state.simulate = !state.simulate;
  $("simBtn").classList.toggle("active", state.simulate);
  setStatus(state.simulate ? t("statusSim") : t("statusPaused"), state.simulate);
}

function toggleLanguage() {
  state.lang = state.lang === "pt" ? "en" : "pt";
  applyLanguage();
  if (state.frame) renderFrame(state.frame);
  renderDump();
}

function applyLanguage() {
  document.documentElement.lang = state.lang === "pt" ? "pt-BR" : "en";
  $("langBtn").textContent = state.lang === "pt" ? "EN" : "PT";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  [...$("inputNibble").children].forEach((btn, index) => {
    btn.title = `${t("selectedBit")} ${3 - index}`;
  });
  [...$("leds").children].forEach((led) => {
    led.title = `${t("ledCommand")} ${led.textContent}`;
  });
  $("bridgeHelp").querySelector("span").textContent = t("bridgeHint");
  if (!state.connected) setStatus(state.simulate ? t("statusSim") : t("statusPaused"), state.simulate);
}

function addOperationLog(entry) {
  const op = OPERATIONS[entry.op] || OPERATIONS[0];
  state.operationLog.unshift({
    ...entry,
    opName: op.name,
    bits: op.bits,
    index: state.operationLog.length ? state.operationLog[0].index + 1 : 1,
    at: new Date().toLocaleTimeString(),
  });
  state.operationLog = state.operationLog.slice(0, 10);
  renderOperationLog();
}

function renderOperationLog() {
  const body = $("operationLog");
  if (!body) return;
  if (!state.operationLog.length) {
    body.innerHTML = `<tr><td colspan="7">Aguardando operacoes.</td></tr>`;
    return;
  }
  body.innerHTML = state.operationLog.map((entry) => `
    <tr>
      <td><span>${entry.index}</span><small>${entry.at}</small></td>
      <td>${entry.source}</td>
      <td><code>${bits(entry.a, 4)}</code><small>${entry.a}</small></td>
      <td><code>${bits(entry.b, 4)}</code><small>${entry.b}</small></td>
      <td><code>${entry.bits}</code><small>${entry.opName}</small></td>
      <td><code>${bits(entry.result, 4)}</code><small>${entry.result}</small></td>
      <td>${formatFlags(entry.flags)}</td>
    </tr>
  `).join("");
}

function formatFlags(flags) {
  const active = FLAGS.filter(([, mask]) => flags & mask).map(([name]) => name);
  return active.length ? active.join(" ") : "-";
}

function renderFrame(frame) {
  state.frame = frame;
  const ula = frame.ula;
  $("stageLabel").textContent = t("stages")[ula.stage] || `Stage ${ula.stage}`;
  $("seqLabel").textContent = `seq ${String(frame.seq).padStart(4, "0")}`;
  $("rateLabel").textContent = `${Math.round(frame.millis / 1000)} s`;
  $("valueA").textContent = bits(ula.a, 4);
  $("valueB").textContent = bits(ula.b, 4);
  $("valueR").textContent = bits(ula.result, 4);
  $("decA").textContent = ula.a;
  $("decB").textContent = ula.b;
  $("decR").textContent = ula.result;
  selectOperation(ula.op || 0, false);

  FLAGS.forEach(([name, mask]) => $(`flag${name}`).classList.toggle("on", Boolean(ula.flags & mask)));
  updateAluFlagDescriptions(ula.flags);
  renderLeds(ula, frame.ports?.D?.port);
  renderButtons(frame.ports?.B?.pin || 0, frame.ports?.D?.pin || 0);
  renderPorts(frame.ports || {});
  renderSreg(frame.sreg || 0);
  renderTimers(frame.timers || {}, frame.adc || {});
  renderSram(frame.sram);
  maybeLogFrameOperation(frame);
  state.lastFrameStage = ula.stage;
}

async function pressOkFromUi() {
  const resetAfterOk = state.frame?.ula?.stage === 3;
  await sendCommand("OK");
  if (resetAfterOk) resetDisplayLocally("Display limpo");
}

async function clearOperation() {
  resetDisplayLocally("Display limpo");
  if (state.bridgeConnected || state.writer) await sendCommand("CLEAR");
}

function resetDisplayLocally(statusText) {
  state.selectedInput = 0;
  state.pendingSource = "";
  renderInputNibble();
  const ports = {
    ...(state.frame?.ports || {}),
    D: { ...(state.frame?.ports?.D || {}), port: 0 },
  };
  renderFrame({
    seq: state.frame ? state.frame.seq + 1 : 0,
    millis: state.frame ? state.frame.millis : 0,
    ula: { a: 0, b: 0, op: 0, result: 0, flags: 0, stage: 0, input: 0 },
    ports,
    sreg: state.frame?.sreg || 0,
    timers: state.frame?.timers || {},
    adc: state.frame?.adc || { a0: 0, millivolts: 0 },
    sram: state.frame?.sram || new Uint8Array(128),
  });
  setStatus(statusText, true);
}

function maybeLogFrameOperation(frame) {
  const ula = frame.ula || {};
  if (ula.stage !== 3) return;
  const signature = `${ula.a}:${ula.b}:${ula.op}:${ula.result}:${ula.flags}`;
  const shouldLog = state.pendingSource || state.lastFrameStage !== 3;
  if (!shouldLog) return;
  addOperationLog({
    a: ula.a || 0,
    b: ula.b || 0,
    op: ula.op || 0,
    result: ula.result || 0,
    flags: ula.flags || 0,
    source: state.pendingSource || (state.simulate ? "Sim" : "Arduino"),
  });
  state.pendingSource = "";
  state.lastLoggedSignature = signature;
}

function updateAluFlagDescriptions(flags) {
  [...$("aluFlagDescriptions").children].forEach((node, index) => {
    const mask = FLAGS[index][1];
    node.classList.toggle("on", Boolean(flags & mask));
  });
}

function renderSreg(value) {
  $("sregValue").textContent = `0x${hex(value)}`;
  const flags = [
    ["I", 7],
    ["T", 6],
    ["H", 5],
    ["S", 4],
    ["V", 3],
    ["N", 2],
    ["Z", 1],
    ["C", 0],
  ];
  flags.forEach(([name, bit]) => {
    $(`sreg${name}`).classList.toggle("on", Boolean(value & (1 << bit)));
  });
}

function renderTimers(timers, adc) {
  Object.entries(timers).forEach(([name, value]) => {
    const node = $(`timer-${name}`);
    if (node) node.querySelector("strong").textContent = value;
  });
  const adcValue = adc.a0 || 0;
  const millivolts = adc.millivolts || 0;
  $("adcValue").textContent = `${adcValue} / ${millivolts} mV`;
  $("adcMeter").style.width = `${Math.max(0, Math.min(100, (adcValue / 1023) * 100))}%`;
  renderPotGame(adcValue);
}

function renderPotGame(adcValue) {
  const position = Math.max(0, Math.min(1, adcValue / 1023));
  const player = $("gamePlayer");
  const target = $("gameTarget");
  player.style.left = `${position * 100}%`;
  target.style.left = `${state.gameTarget * 100}%`;

  const now = performance.now();
  if (Math.abs(position - state.gameTarget) < 0.045 && now - state.gameLastHitAt > 650) {
    state.gameScore += 1;
    state.gameLastHitAt = now;
    state.gameTarget = 0.08 + Math.random() * 0.84;
    $("gameLane").animate(
      [{ boxShadow: "0 0 0 0 rgba(59,238,122,0)" }, { boxShadow: "0 0 0 3px rgba(59,238,122,0.75)" }, { boxShadow: "0 0 0 0 rgba(59,238,122,0)" }],
      { duration: 420, easing: "ease-out" }
    );
  }
  $("gameScore").textContent = state.gameScore;
}

function resetPotGame() {
  state.gameScore = 0;
  state.gameLastHitAt = 0;
  state.gameTarget = 0.08 + Math.random() * 0.84;
  $("gameScore").textContent = "0";
  $("gameTarget").style.left = `${state.gameTarget * 100}%`;
  setStatus("Pot Racer zerado", true);
}

function renderInputNibble() {
  [...$("inputNibble").children].forEach((btn, index) => {
    const bit = 3 - index;
    btn.classList.toggle("on", Boolean(state.selectedInput & (1 << bit)));
  });
}

function renderLeds(ula, portD) {
  if (Number.isInteger(portD)) {
    setLedState("CARRY", Boolean(portD & (1 << 2)));
    setLedState("B3", Boolean(portD & (1 << 3)));
    setLedState("B2", Boolean(portD & (1 << 4)));
    setLedState("B1", Boolean(portD & (1 << 5)));
    setLedState("B0", Boolean(portD & (1 << 6)));
    return;
  }

  setLedState("CARRY", Boolean(ula.flags & 2));
  [3, 2, 1, 0].forEach((bit) => {
    setLedState(`B${bit}`, Boolean(ula.result & (1 << bit)));
  });
}

function setLedState(name, enabled) {
  $(`led${name}`).classList.toggle("on", enabled);
  const boardPin = $(`boardLed${name}`);
  if (boardPin) boardPin.classList.toggle("on", enabled);
}

function renderButtons(pinB, pinD) {
  const pinValues = { 7: pinD, 8: pinB, 9: pinB, 10: pinB, 11: pinB };
  BUTTON_PINS.forEach(([, pin]) => {
    const source = pinValues[pin] || 0;
    const bit = pin === 7 ? 7 : pin - 8;
    const releasedHigh = Boolean(source & (1 << bit));
    const pressed = !releasedHigh;
    $(`button${pin}`).classList.toggle("on", pressed);
    const boardPin = $(`boardButton${pin}`);
    if (boardPin) boardPin.classList.toggle("on", pressed);
  });
}

function renderPorts(ports) {
  ["B", "C", "D"].forEach((port) => {
    const data = ports[port] || { ddr: 0, port: 0, pin: 0 };
    renderRegister(`DDR${port}`, data.ddr);
    renderRegister(`PORT${port}`, data.port);
    renderRegister(`PIN${port}`, data.pin);
  });
}

function renderRegister(id, value) {
  const bitsNodes = [...$(id).querySelectorAll(".reg-bit")];
  bitsNodes.forEach((node, index) => {
    const bit = 7 - index;
    node.classList.toggle("on", Boolean(value & (1 << bit)));
  });
}

function renderSram(bytes) {
  const cells = [...$("sramMap").children];
  cells.forEach((cell, i) => {
    const value = bytes[i] || 0;
    const hot = value / 255;
    const changed = state.prevSram[i] !== value;
    cell.style.background = `rgb(${Math.round(34 + hot * 221)}, ${Math.round(51 + hot * 166)}, ${Math.round(58 + hot * 50)})`;
    cell.classList.toggle("selected", i === state.selectedCell);
    if (changed) {
      cell.classList.remove("changed");
      void cell.offsetWidth;
      cell.classList.add("changed");
    }
  });
  state.prevSram = bytes.slice();
  const selected = bytes[state.selectedCell] || 0;
  $("selectedByte").textContent = `0x${hex(selected)}`;
  $("inspector").textContent =
    `ula_probe[${state.selectedCell}] = ${selected} dec / 0x${hex(selected)} / ${bits(selected, 8)}\n` +
    sramMeaning(state.selectedCell);
}

function sramMeaning(index) {
  const known = state.lang === "pt"
    ? {
        0: "Operando A confirmado.",
        1: "Operando B confirmado.",
        2: "Codigo da operacao.",
        3: "Resultado da ULA.",
        4: "Flags D,V,N,C,Z.",
        5: "Copia do SREG.",
        6: "PORTB.",
        7: "PORTC.",
        8: "PORTD.",
        9: "PINB.",
        10: "PINC.",
        11: "PIND.",
        12: "TCNT0.",
        13: "TCNT2.",
        14: "ADC A0 low.",
        15: "ADC A0 high.",
      }
    : {
        0: "Confirmed operand A.",
        1: "Confirmed operand B.",
        2: "Operation code.",
        3: "ALU result.",
        4: "Flags D,V,N,C,Z.",
        5: "SREG copy.",
        6: "PORTB.",
        7: "PORTC.",
        8: "PORTD.",
        9: "PINB.",
        10: "PINC.",
        11: "PIND.",
        12: "TCNT0.",
        13: "TCNT2.",
        14: "ADC A0 low.",
        15: "ADC A0 high.",
      };
  if (known[index]) return known[index];
  if (index >= 16) return `${t("sramHistory")} ${Math.floor((index - 16) / 7)}.`;
  return t("sramDefault");
}

function renderDump() {
  const data = state.memory[state.selectedDump] || new Uint8Array();
  const rows = [];
  for (let i = 0; i < data.length; i += 16) {
    const chunk = [...data.slice(i, i + 16)].map((v) => hex(v)).join(" ");
    rows.push(`${hex(i, 4)}  ${chunk}`);
  }
  $("dumpView").textContent = rows.join("\n") || t("waitingStatic");
}

function setStatus(text, good) {
  $("statusText").textContent = text;
  $("statusPill").querySelector("i").style.background = good ? "var(--green)" : "var(--red)";
  $("statusPill").querySelector("i").style.boxShadow = `0 0 18px ${good ? "var(--green)" : "var(--red)"}`;
}

function simulateTick() {
  if (!state.simulate) return;
  const t = Date.now();
  const a = (t >> 8) & 15;
  const b = (t >> 11) & 15;
  const op = (t >> 10) & 7;
  const result = executeOp(a, b, op);
  const flags = makeFlags(a, b, op, result);
  const adcA0 = Math.round((Math.sin(t / 850) * 0.5 + 0.5) * 1023);
  const sram = new Uint8Array(128);
  sram[0] = a; sram[1] = b; sram[2] = op; sram[3] = result; sram[4] = flags; sram[5] = (t >> 5) & 255;
  for (let i = 6; i < 128; i++) sram[i] = (Math.sin((t / 260) + i * 0.37) * 92 + 128) & 255;
  renderFrame({
    seq: Math.floor(t / 100) % 10000,
    millis: t % 1000000,
    ula: { a, b, op, result, flags, stage: (t >> 12) & 3, input: state.selectedInput },
    ports: {
      B: { ddr: 0x0f, port: result, pin: 0xff ^ (((t >> 9) & 1) << 0) },
      C: { ddr: 0x00, port: 0x00, pin: (t >> 4) & 255 },
      D: { ddr: 0x7c, port: (result << 3) & 255, pin: 0xff ^ (((t >> 8) & 1) << 7) },
    },
    sreg: flags,
    timers: {
      tcnt0: (t >> 2) & 255,
      tcnt1: t & 65535,
      tcnt2: (t >> 3) & 255,
      tccr0a: 3,
      tccr0b: 3,
      tccr1a: 0,
      tccr1b: 1,
      tccr2a: 0,
      tccr2b: 4,
    },
    adc: { a0: adcA0, millivolts: Math.round((adcA0 * 5000) / 1023) },
    sram,
  });
  if (Math.floor(t / 2000) % 2 === 0) {
    state.memory.eeprom = state.memory.eeprom.map((_, i) => (i * 7 + (t >> 8)) & 255);
    state.memory.flash = state.memory.flash.map((_, i) => (0x40 + i * 3) & 255);
    renderDump();
  }
}

function executeOp(a, b, op) {
  if (op === 0) return a & b;
  if (op === 1) return a | b;
  if (op === 2) return (~b) & 15;
  if (op === 3) return a ^ b;
  if (op === 4) return (a + b) & 15;
  if (op === 5) return (a - b) & 15;
  if (op === 6) return (a * b) & 15;
  if (op === 7) return b === 0 ? 0 : Math.floor(a / b) & 15;
  return 0;
}

function makeFlags(a, b, op, result) {
  let flags = result === 0 ? 1 : 0;
  if (op === 4 && a + b > 15) flags |= 2;
  if (op === 5 && a < b) flags |= 2;
  if (result & 8) flags |= 4;
  if (op === 6 && a * b > 15) flags |= 8;
  if (op === 7 && b === 0) flags |= 16;
  return flags;
}

initUi();
setInterval(simulateTick, 100);
