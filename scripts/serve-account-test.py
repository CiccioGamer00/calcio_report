"""Serve the real frontend locally against the isolated account-test Worker only.

No files or production settings are changed. Requires only Python 3.
Run from any directory: py scripts/serve-account-test.py
"""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
TEST_API = "https://calcio-report-test.stemoro84.workers.dev"
CONFIG = {
    "baseUrl": TEST_API,
    "headers": {},
    "telegramUrl": "",
    "supportEmail": "",
    "paymentUrl": "",
    "paypalUrl": "",
}


class AccountTestHandler(SimpleHTTPRequestHandler):
    mock_payment = False

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/config.js":
            config = dict(CONFIG)
            if self.mock_payment:
                config["paymentUrl"] = "http://127.0.0.1:5501/payment-test"
            return self.send_content(
                ("window.API_CONFIG = " + json.dumps(config) + ";\n").encode(),
                "application/javascript; charset=utf-8",
            )
        if path == "/payment-test" and self.mock_payment:
            return self.send_content(
                '<!doctype html><html lang="it"><meta charset="utf-8"><title>Pagamento simulato</title><h1>Pagamento simulato aperto correttamente</h1><p>Nessun pagamento eseguito. Nessuna attivazione PRO. Puoi chiudere questa scheda.</p></html>'.encode(),
                "text/html; charset=utf-8",
            )
        target = (ROOT / path.lstrip("/")).resolve()
        if not target.is_relative_to(ROOT) or any(part.startswith(".") for part in Path(path).parts if part not in ("/", ".")):
            self.send_error(404)
            return
        if path in ("/", "/index.html"):
            html = (ROOT / "index.html").read_text(encoding="utf-8")
            html = html.replace("<title>", "<title>TEST ACCOUNT — ", 1)
            html = html.replace("<body>", '<body><div style="padding:10px;text-align:center;background:#633d00;color:#fff">COLLAUDO ACCOUNT — solo credenziali fittizie; pagamenti disattivati</div>', 1)
            return self.send_content(html.encode(), "text/html; charset=utf-8")
        if not target.is_file() or target.suffix.lower() not in {".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp", ".woff", ".woff2"}:
            self.send_error(404)
            return
        super().do_GET()

    def send_content(self, content, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mock-payment", action="store_true", help="Simula il checkout su una pagina locale, senza pagamenti")
    AccountTestHandler.mock_payment = parser.parse_args().mock_payment
    handler = partial(AccountTestHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", 5501), handler) as server:
        print("Apri http://127.0.0.1:5501 — COLLAUDO ACCOUNT", flush=True)
        print("API di test: " + TEST_API, flush=True)
        print("Lascia aperto questo terminale. Ctrl+C per terminare.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
