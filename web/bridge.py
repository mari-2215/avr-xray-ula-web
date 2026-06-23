from __future__ import annotations

import argparse
import os
import queue
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar


try:
    import serial
except ImportError:  # pragma: no cover - depends on the local machine
    serial = None


class SerialHub:
    def __init__(self) -> None:
        self.clients: list[queue.Queue[str]] = []
        self.clients_lock = threading.Lock()
        self.serial_lock = threading.Lock()
        self.serial_port = None

    def attach_serial(self, device: str, baud: int) -> None:
        if serial is None:
            raise RuntimeError("pyserial is not installed. Run: python -m pip install pyserial")

        self.serial_port = serial.Serial(device, baudrate=baud, timeout=0.25)
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
            raise RuntimeError("Serial port is not open.")
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


def main() -> None:
    parser = argparse.ArgumentParser(description="AVR X-Ray ULA Web local serial API bridge")
    parser.add_argument("--serial", required=True, help="Arduino serial device, e.g. COM3 or /dev/ttyACM0")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--http-port", type=int, default=8765)
    args = parser.parse_args()

    os.chdir(Path(__file__).resolve().parent)

    hub = SerialHub()
    hub.attach_serial(args.serial, args.baud)
    BridgeHandler.hub = hub

    server = ThreadingHTTPServer((args.host, args.http_port), BridgeHandler)
    print(f"AVR X-Ray ULA Web bridge: http://{args.host}:{args.http_port}")
    print(f"Serial: {args.serial} @ {args.baud}")
    server.serve_forever()


if __name__ == "__main__":
    main()
