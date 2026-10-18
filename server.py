"""
Magazine Share Tracker & AI Research Hub - Application Server
Serves the interactive web application and REST APIs for:
- Adding shares encountered in investment magazines or newspapers by Name or Ticker
- Resolving Sector, Exchange Listing, Market Tier & Index Memberships (FTSE 100, FTSE 250, AIM, S&P 500, etc.)
- Aggregating Combined View of Major Companies / Brokerages (Buy / Hold / Sell Consensus & Bank Targets)
- Evaluating Trending Shares Status & Technical Momentum
- Synthesizing "Why Is It In The News?" Catalysts & Live Financial Headlines
- Generating an AI Investment Agent Verdict (Should You Buy or Not?)
"""

import os
import sys
import json
import uuid
import urllib.parse
import webbrowser
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import research_engine

PORT = 8090
HOST = "127.0.0.1"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SHARES_STORE = []


def init_store():
    global SHARES_STORE
    SHARES_STORE = research_engine.load_saved_shares()


MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class MagazineTrackerHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def do_OPTIONS(self):
        self._send_json({"ok": True}, 200)

    def do_GET(self):
        global SHARES_STORE
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/shares":
            if not SHARES_STORE:
                init_store()
            return self._send_json({
                "status": "ok",
                "count": len(SHARES_STORE),
                "shares": SHARES_STORE
            })

        if path == "/api/search":
            q = (query.get("q", [""])[0] or "").strip()
            results = research_engine.search_shares(q, limit=10)
            return self._send_json({
                "status": "ok",
                "query": q,
                "results": results
            })

        if path == "/api/research":
            q = (query.get("q", [""])[0] or "").strip()
            if not q:
                return self._send_json({"error": "Missing query parameter 'q'"}, 400)
            try:
                data = research_engine.research_share(q)
                return self._send_json({"status": "ok", "share": data})
            except Exception as e:
                return self._send_json({"error": str(e)}, 400)

        if path == "/api/catalog":
            return self._send_json({
                "status": "ok",
                "count": len(research_engine.CONSTITUENTS_CATALOG),
                "catalog": research_engine.CONSTITUENTS_CATALOG
            })

        # Static file serving
        rel_path = "index.html" if path in ["/", ""] else path.lstrip("/")
        safe_path = os.path.normpath(os.path.join(BASE_DIR, rel_path))
        if not safe_path.startswith(BASE_DIR) or not os.path.isfile(safe_path):
            safe_path = os.path.join(BASE_DIR, "index.html")

        ext = os.path.splitext(safe_path)[1].lower()
        mime = MIME_TYPES.get(ext, "application/octet-stream")
        try:
            with open(safe_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self._send_json({"error": f"File error: {e}"}, 500)

    def do_POST(self):
        global SHARES_STORE
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        if path == "/api/shares":
            query_str = (body.get("query") or body.get("name") or body.get("ticker") or "").strip()
            if not query_str:
                return self._send_json({"error": "Please enter a share name or ticker symbol."}, 400)

            magazine_meta = {
                "magazine": (body.get("magazine") or "Investors' Chronicle").strip(),
                "issue_date": (body.get("issue_date") or datetime.now().strftime("%Y-%m-%d")).strip(),
                "magazine_stance": (body.get("magazine_stance") or "Buy Tip").strip(),
                "status": (body.get("status") or "To Research").strip(),
                "notes": (body.get("notes") or "").strip()
            }

            try:
                researched = research_engine.research_share(query_str, magazine_meta)
                researched["id"] = f"share-{int(datetime.now().timestamp())}-{researched['ticker'].lower()}"
                researched["magazine"] = magazine_meta["magazine"]
                researched["issue_date"] = magazine_meta["issue_date"]
                researched["magazine_stance"] = magazine_meta["magazine_stance"]
                researched["status"] = magazine_meta["status"]
                researched["notes"] = magazine_meta["notes"]
                researched["added_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")

                if not SHARES_STORE:
                    init_store()

                # Update if symbol already in list, or insert at top
                existing_idx = next((i for i, s in enumerate(SHARES_STORE) if s.get("symbol") == researched["symbol"]), None)
                if existing_idx is not None:
                    researched["id"] = SHARES_STORE[existing_idx]["id"]
                    SHARES_STORE[existing_idx] = researched
                    SHARES_STORE.insert(0, SHARES_STORE.pop(existing_idx))
                else:
                    SHARES_STORE.insert(0, researched)

                research_engine.save_shares_list(SHARES_STORE)
                return self._send_json({
                    "status": "ok",
                    "share": researched,
                    "shares": SHARES_STORE
                }, 201)
            except Exception as e:
                return self._send_json({"error": str(e)}, 400)

        if path.startswith("/api/shares/") and path.endswith("/refresh"):
            share_id = path.split("/")[3]
            if not SHARES_STORE:
                init_store()
            target_idx = next((i for i, s in enumerate(SHARES_STORE) if s.get("id") == share_id), None)
            if target_idx is None:
                return self._send_json({"error": "Share not found"}, 404)

            old = SHARES_STORE[target_idx]
            meta = {
                "magazine": old.get("magazine", "Investors' Chronicle"),
                "issue_date": old.get("issue_date", datetime.now().strftime("%Y-%m-%d")),
                "magazine_stance": old.get("magazine_stance", "Buy Tip"),
                "status": old.get("status", "To Research"),
                "notes": old.get("notes", "")
            }
            refreshed = research_engine.research_share(old["symbol"], meta)
            refreshed["id"] = old["id"]
            refreshed["magazine"] = meta["magazine"]
            refreshed["issue_date"] = meta["issue_date"]
            refreshed["magazine_stance"] = meta["magazine_stance"]
            refreshed["status"] = meta["status"]
            refreshed["notes"] = meta["notes"]
            refreshed["added_at"] = old.get("added_at", datetime.now().strftime("%Y-%m-%d %H:%M"))

            SHARES_STORE[target_idx] = refreshed
            research_engine.save_shares_list(SHARES_STORE)
            return self._send_json({"status": "ok", "share": refreshed, "shares": SHARES_STORE})

        if path == "/api/shares/reset":
            SHARES_STORE = research_engine.get_initial_seed_shares()
            research_engine.save_shares_list(SHARES_STORE)
            return self._send_json({"status": "ok", "shares": SHARES_STORE})

        return self._send_json({"error": "Unknown endpoint"}, 404)

    def do_PUT(self):
        global SHARES_STORE
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        if path.startswith("/api/shares/"):
            share_id = path.split("/")[3]
            if not SHARES_STORE:
                init_store()
            target_idx = next((i for i, s in enumerate(SHARES_STORE) if s.get("id") == share_id), None)
            if target_idx is None:
                return self._send_json({"error": "Share not found"}, 404)

            item = SHARES_STORE[target_idx]
            for field in ["magazine", "issue_date", "magazine_stance", "status", "notes"]:
                if field in body:
                    item[field] = body[field]

            item["ai_agent"] = research_engine.build_ai_agent_verdict(item, {
                "magazine": item.get("magazine"),
                "magazine_stance": item.get("magazine_stance"),
                "notes": item.get("notes")
            })
            SHARES_STORE[target_idx] = item
            research_engine.save_shares_list(SHARES_STORE)
            return self._send_json({"status": "ok", "share": item, "shares": SHARES_STORE})

        return self._send_json({"error": "Unknown endpoint"}, 404)

    def do_DELETE(self):
        global SHARES_STORE
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/shares/"):
            share_id = path.split("/")[3]
            if not SHARES_STORE:
                init_store()
            SHARES_STORE = [s for s in SHARES_STORE if s.get("id") != share_id]
            research_engine.save_shares_list(SHARES_STORE)
            return self._send_json({"status": "ok", "shares": SHARES_STORE})

        return self._send_json({"error": "Unknown endpoint"}, 404)


def run_server():
    init_store()
    server = HTTPServer((HOST, PORT), MagazineTrackerHandler)
    url = f"http://{HOST}:{PORT}"
    print("=" * 72)
    print("  Magazine Share Tracker & AI Research Hub")
    print("  Record Magazine Share Picks | Sector, Exchange & Index Lookup")
    print("  Major Broker Consensus | Trending Status | News & AI Buy/Sell Agent")
    print(f"  Running locally at: {url}")
    print("=" * 72)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Magazine Share Tracker server.")
        server.server_close()


if __name__ == "__main__":
    run_server()
