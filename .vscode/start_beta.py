"""Start the real beta, or open the matching server already on port 8679."""

import errno
import http.client
import json
from pathlib import Path
import socket
import sys
import threading
import time
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
HOST = "127.0.0.1"
PORT = 8679
BETA_PATH = "/dizayn/"
BETA_URL = f"http://{HOST}:{PORT}{BETA_PATH}"


def read_route(path: str, limit: int) -> bytes:
    connection = http.client.HTTPConnection(HOST, PORT, timeout=1)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        return response.read(limit) if response.status == 200 else b""
    finally:
        connection.close()


def reuse_beta() -> int:
    expected = (ROOT / "dizayn" / "index.html").read_bytes()
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        try:
            if (json.loads(read_route("/health", 256)) == {"status": "ok"}
                    and read_route(BETA_PATH, len(expected) + 1) == expected):
                print(f"Using the beta already running on port {PORT}.", flush=True)
                open_beta()
                return 0
        except (OSError, http.client.HTTPException, ValueError):
            pass
        time.sleep(0.25)
    print(f"Port {PORT} is unavailable and does not serve this beta. Stop the other service and retry.",
          file=sys.stderr)
    return 1


def open_beta() -> None:
    try:
        opened = webbrowser.open(BETA_URL)
    except (OSError, webbrowser.Error):
        opened = False
    print(f"Opened {BETA_URL}" if opened else f"Open {BETA_URL} in your browser.", flush=True)


def main() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            listener.bind((HOST, PORT))
        except OSError as error:
            if error.errno != errno.EADDRINUSE and getattr(error, "winerror", None) not in {10013, 10048}:
                raise
            return reuse_beta()

        import uvicorn

        sys.path.insert(0, str(ROOT / "backend"))
        server = uvicorn.Server(uvicorn.Config("app.main:app", host=HOST, port=PORT, workers=1))

        def open_after_startup() -> None:
            while not server.started and not server.should_exit:
                time.sleep(0.1)
            if server.started:
                open_beta()

        threading.Thread(target=open_after_startup, daemon=True).start()
        listener.listen()
        server.run(sockets=[listener])
        return 0 if server.started else 1


if __name__ == "__main__":
    raise SystemExit(main())
