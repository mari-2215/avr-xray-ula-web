from __future__ import annotations

import argparse
import json
import os
import queue
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar


try:
    import serial
    from serial.tools import list_ports
except ImportError:  # pragma: no cover - depends on the local machine
    serial = None
    list_ports = None


class SerialHub:
    def __init__(self) -> None:
        self.clients: list[queue.Queue[str]] = []
        self.clients_lock = threading.Lock()
        self.serial_lock = threading.Lock()
        self.serial_port = None
        self.serial_device = ""
        self.error = ""

    def attach_serial(self, device: str, baud: int) -> None:
        if serial is None:
            raise RuntimeError("pyserial is not installed. Run: python -m pip install pyserial")

        self.serial_port = serial.Serial(device, baudrate=baud, timeout=0.25)
        self.serial_device = device
        self.error = ""
        thread = threading.Thread(target=self._read_serial, daemon=True)
        thread.start()

    def _read_serial(self) -> None:
        assert self.serial_port is not None
        while True:
            line = self.serial_port.readline()
            if not line:
                continue
            text = line.decode("ascii", errors="ignore").strip()
            if text:
                self.broadcast(text)

    def send_command(self, command: str) -> None:
        if self.serial_port is None:
            raise RuntimeError(self.error or "Serial port is not open.")
        payload = (command.strip() + "\n").encode("ascii")
        with self.serial_lock:
            self.serial_port.write(payload)

    def add_client(self) -> queue.Queue[str]:
        client: queue.Queue[str] = queue.Queue()
        with self.clients_lock:
            self.clients.append(client)
        return client

    def remove_client(self, client: queue.Queue[str]) -> None:
        with self.clients_lock:
            if client in self.clients:
                self.clients.remove(client)

    def broadcast(self, message: str) -> None:
        with self.clients_lock:
            clients = list(self.clients)
        for client in clients:
            client.put(message)

    def status(self) -> dict[str, object]:
        return {
            "serial_connected": self.serial_port is not None,
            "serial_device": self.serial_device,
            "error": self.error,
            "ports": list_serial_ports(),
        }


class BridgeHandler(SimpleHTTPRequestHandler):
    hub: ClassVar[SerialHub]

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/events":
            self._handle_events()
            return
        if self.path == "/api/status":
            self._handle_status()
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/command":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        command = self.rfile.read(length).decode("ascii", errors="ignore").strip()
        try:
            self.hub.send_command(command)
        except Exception as exc:  # pragma: no cover - user-facing bridge errors
            self.send_response(503)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(str(exc).encode("utf-8"))
            return

        self.send_response(204)
        self.end_headers()

    def _handle_events(self) -> None:
        client = self.hub.add_client()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        try:
            while True:
                try:
                    message = client.get(timeout=15)
                    self.wfile.write(f"data: {message}\n\n".encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            self.hub.remove_client(client)

    def _handle_status(self) -> None:
        payload = json.dumps(self.hub.status()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def list_serial_ports() -> list[dict[str, str]]:
    if list_ports is None:
        return []
    return [
        {
            "device": port.device,
            "description": port.description,
            "hwid": port.hwid,
        }
        for port in list_ports.comports()
    ]


def choose_serial_port(explicit: str | None) -> str | None:
    if explicit:
        return explicit
    ports = list_serial_ports()
    if not ports:
        return None
    arduino_ports = [
        port["device"]
        for port in ports
        if "arduino" in f"{port['description']} {port['hwid']}".lower()
        or "ttyacm" in port["device"].lower()
    ]
    if len(arduino_ports) == 1:
        return arduino_ports[0]
    if len(ports) == 1:
        return ports[0]["device"]
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="AVR X-Ray ULA Web local serial API bridge")
    parser.add_argument("--serial", help="Arduino serial device, e.g. COM3 or /dev/ttyACM0")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--http-port", type=int, default=8765)
    args = parser.parse_args()

    os.chdir(Path(__file__).resolve().parent)

    hub = SerialHub()
    serial_device = choose_serial_port(args.serial)
    if serial_device:
        try:
            hub.attach_serial(serial_device, args.baud)
        except Exception as exc:
            hub.error = str(exc)
    else:
        ports = ", ".join(port["device"] for port in list_serial_ports()) or "none"
        hub.error = (
            "Serial port was not provided and could not be auto-detected. "
            f"Run with --serial /dev/ttyACM0 or --serial COM3. Available ports: {ports}"
        )
    BridgeHandler.hub = hub

    server = ThreadingHTTPServer((args.host, args.http_port), BridgeHandler)
    print(f"AVR X-Ray ULA Web bridge: http://{args.host}:{args.http_port}")
    if hub.serial_port is None:
        print(f"Serial: not connected - {hub.error}")
    else:
        print(f"Serial: {hub.serial_device} @ {args.baud}")
    server.serve_forever()


if __name__ == "__main__":
    main()
