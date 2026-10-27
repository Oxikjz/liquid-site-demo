#!/usr/bin/env python3
"""Локальный сервер для разработки: как `python3 -m http.server`, но запрещает кэш,
чтобы Safari после правок всегда показывал свежую версию. Запуск: python3 tools/serve.py [порт]"""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5175
http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
