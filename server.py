"""Local finance tracker server. Data is stored in data/finance.db."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import csv
from datetime import datetime
import io
import json
import sqlite3

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DB_DIR = ROOT / "data"
DB_PATH = DB_DIR / "finance.db"


def connect():
    DB_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def initialize():
    with connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                color TEXT NOT NULL DEFAULT '#9b8cff',
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL CHECK(kind IN ('expense','income','savings')),
                amount_paise INTEGER NOT NULL,
                category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
                note TEXT NOT NULL DEFAULT '',
                month TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS budgets (
                month TEXT NOT NULL,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
                amount_paise INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(month, category_id)
            );
            CREATE TABLE IF NOT EXISTS savings_targets (
                month TEXT PRIMARY KEY,
                amount_paise INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS monthly_budgets (
                month TEXT PRIMARY KEY,
                amount_paise INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            );
            INSERT OR IGNORE INTO preferences(key, value) VALUES ('statement_marker', '');
            INSERT OR IGNORE INTO preferences(key, value) VALUES ('monthly_savings_target', '0');
        """)
        for name, color in [("Food", "#ffb86b"), ("Transport", "#66d9c2"), ("Shopping", "#bd9aff"), ("Bills", "#73a7ff"), ("Outing", "#ff7f9c"), ("Health", "#9bdb7c"), ("Other", "#9aa4b2")]:
            db.execute("INSERT OR IGNORE INTO categories(name,color) VALUES (?,?)", (name, color))


def rowdict(row):
    return dict(row) if row else None


def money_to_paise(value):
    amount = round(float(value) * 100)
    return int(amount)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def send_json(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.api_get(parsed.path, parse_qs(parsed.query))
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def api_get(self, path, query):
        month = query.get("month", [""])[0]
        with connect() as db:
            if path == "/api/categories":
                return self.send_json([rowdict(r) for r in db.execute("SELECT * FROM categories ORDER BY active DESC, name")])
            if path == "/api/dashboard":
                if not month:
                    return self.send_json({"error": "A month is required"}, 400)
                totals = {r["kind"]: r["total"] or 0 for r in db.execute("SELECT kind, SUM(amount_paise) total FROM entries WHERE month=? GROUP BY kind", (month,))}
                category_rows = db.execute("""
                    SELECT c.id, c.name, c.color, c.active,
                    EXISTS(SELECT 1 FROM entries history WHERE history.category_id=c.id) OR EXISTS(SELECT 1 FROM budgets old_budget WHERE old_budget.category_id=c.id) has_history,
                    COALESCE(SUM(e.amount_paise),0) total, COALESCE(b.amount_paise,0) budget
                    FROM categories c LEFT JOIN entries e ON e.category_id=c.id AND e.month=? AND e.kind='expense'
                    LEFT JOIN budgets b ON b.category_id=c.id AND b.month=?
                    GROUP BY c.id ORDER BY total DESC, c.name
                """, (month, month)).fetchall()
                entries = db.execute("""
                    SELECT e.*, c.name category_name, c.color category_color FROM entries e
                    LEFT JOIN categories c ON c.id=e.category_id WHERE e.month=?
                    ORDER BY e.id DESC LIMIT 100
                """, (month,)).fetchall()
                prefs = {r["key"]: r["value"] for r in db.execute("SELECT * FROM preferences")}
                target = db.execute("SELECT amount_paise FROM savings_targets WHERE month=?", (month,)).fetchone()
                monthly_budget = db.execute("SELECT amount_paise FROM monthly_budgets WHERE month=?", (month,)).fetchone()
                return self.send_json({
                    "month": month,
                    "income": totals.get("income", 0),
                    "expenses": totals.get("expense", 0),
                    "savings": totals.get("savings", 0),
                    "categories": [rowdict(r) for r in category_rows],
                    "entries": [rowdict(r) for r in entries],
                    "statement_marker": prefs.get("statement_marker", ""),
                    "monthly_savings_target": int(target["amount_paise"] if target else 0),
                    "monthly_budget": int(monthly_budget["amount_paise"] if monthly_budget else 0),
                })
            if path == "/api/export.csv":
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerow(["Month", "Type", "Amount (INR)", "Category", "Note", "Created"])
                rows = db.execute("""
                    SELECT e.month,e.kind,e.amount_paise,c.name category,e.note,e.created_at
                    FROM entries e LEFT JOIN categories c ON c.id=e.category_id
                    WHERE (?='' OR e.month=?) ORDER BY e.month,e.id
                """, (month, month)).fetchall()
                for r in rows:
                    writer.writerow([r["month"], r["kind"], f'{r["amount_paise"] / 100:.2f}', r["category"] or "", r["note"], r["created_at"]])
                data = output.getvalue().encode("utf-8-sig")
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", f'attachment; filename="paisa-{month or "all"}.csv"')
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return self.wfile.write(data)
        self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        data = self.body()
        try:
            with connect() as db:
                if path == "/api/categories":
                    name = str(data.get("name", "")).strip()
                    if not name:
                        return self.send_json({"error": "Enter a category name"}, 400)
                    color = str(data.get("color", "#9b8cff"))
                    cur = db.execute("INSERT INTO categories(name,color) VALUES (?,?)", (name, color))
                    return self.send_json(rowdict(db.execute("SELECT * FROM categories WHERE id=?", (cur.lastrowid,)).fetchone()), 201)
                if path == "/api/entries":
                    kind = data.get("kind", "expense")
                    month = str(data.get("month", ""))
                    amount = money_to_paise(data.get("amount", 0))
                    if kind not in ("expense", "income", "savings") or len(month) != 7 or amount == 0:
                        return self.send_json({"error": "Choose a valid type, month, and non-zero amount"}, 400)
                    if kind in ("income", "savings") and amount < 0:
                        return self.send_json({"error": "Income and savings amounts must be positive"}, 400)
                    category_id = data.get("category_id") if kind == "expense" else None
                    if kind == "expense" and not category_id:
                        return self.send_json({"error": "Choose a category"}, 400)
                    if category_id:
                        cat = db.execute("SELECT active FROM categories WHERE id=?", (category_id,)).fetchone()
                        if not cat or not cat["active"]:
                            return self.send_json({"error": "Choose an active category"}, 400)
                    cur = db.execute("INSERT INTO entries(kind,amount_paise,category_id,note,month) VALUES (?,?,?,?,?)", (kind, amount, category_id, str(data.get("note", "")).strip(), month))
                    return self.send_json({"id": cur.lastrowid}, 201)
                if path == "/api/budgets":
                    month = str(data.get("month", ""))
                    amount = max(0, money_to_paise(data.get("amount", 0)))
                    if len(month) != 7:
                        return self.send_json({"error": "Choose a valid month"}, 400)
                    db.execute("INSERT INTO monthly_budgets(month,amount_paise) VALUES (?,?) ON CONFLICT(month) DO UPDATE SET amount_paise=excluded.amount_paise", (month, amount))
                    return self.send_json({"ok": True})
                if path == "/api/preferences":
                    if "savings_target" in data:
                        month = str(data.get("month", ""))
                        amount = max(0, money_to_paise(data["savings_target"]))
                        if len(month) != 7:
                            return self.send_json({"error": "Choose a valid month"}, 400)
                        db.execute("INSERT INTO savings_targets(month,amount_paise) VALUES (?,?) ON CONFLICT(month) DO UPDATE SET amount_paise=excluded.amount_paise", (month, amount))
                    for key in ("statement_marker", "monthly_savings_target"):
                        if key in data:
                            value = str(money_to_paise(data[key]) if key == "monthly_savings_target" else data[key]).strip()
                            db.execute("INSERT INTO preferences(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))
                    return self.send_json({"ok": True})
        except sqlite3.IntegrityError as exc:
            return self.send_json({"error": "That category already exists" if "UNIQUE" in str(exc) else "Could not save that item"}, 409)
        except (ValueError, TypeError):
            return self.send_json({"error": "Please check the values and try again"}, 400)
        self.send_json({"error": "Not found"}, 404)

    def do_PATCH(self):
        path = urlparse(self.path).path
        data = self.body()
        with connect() as db:
            if path.startswith("/api/categories/"):
                category_id = int(path.rsplit("/", 1)[1])
                month = str(data.get("month", ""))
                current_month = datetime.now().strftime("%Y-%m")
                if month != current_month:
                    return self.send_json({"error": "Categories can only be managed while viewing the current month."}, 409)
                active = bool(data.get("active", False))
                if active:
                    db.execute("UPDATE categories SET active=1 WHERE id=?", (category_id,))
                    return self.send_json({"ok": True})
                total = db.execute("SELECT COALESCE(SUM(amount_paise),0) total FROM entries WHERE category_id=? AND month=? AND kind='expense'", (category_id, month)).fetchone()["total"]
                if total != 0:
                    return self.send_json({"error": "This category has a non-zero total this month and cannot be removed."}, 409)
                history_count = db.execute("SELECT (SELECT COUNT(*) FROM entries WHERE category_id=?) + (SELECT COUNT(*) FROM budgets WHERE category_id=?)", (category_id, category_id)).fetchone()[0]
                if history_count == 0:
                    db.execute("DELETE FROM categories WHERE id=?", (category_id,))
                    return self.send_json({"deleted": True})
                db.execute("UPDATE categories SET active=0 WHERE id=?", (category_id,))
                return self.send_json({"archived": True})
            if path.startswith("/api/entries/"):
                entry_id = int(path.rsplit("/", 1)[1])
                old = db.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone()
                if not old:
                    return self.send_json({"error": "Entry not found"}, 404)
                kind = data.get("kind", old["kind"])
                month = str(data.get("month", old["month"]))
                amount = money_to_paise(data.get("amount", old["amount_paise"] / 100))
                category_id = data.get("category_id") if kind == "expense" else None
                if kind not in ("expense", "income", "savings") or amount == 0 or len(month) != 7:
                    return self.send_json({"error": "Choose a valid type, month, and non-zero amount"}, 400)
                if kind in ("income", "savings") and amount < 0:
                    return self.send_json({"error": "Income and savings amounts must be positive"}, 400)
                if kind == "expense" and not category_id:
                    return self.send_json({"error": "Choose a category"}, 400)
                if category_id:
                    cat = db.execute("SELECT active FROM categories WHERE id=?", (category_id,)).fetchone()
                    if not cat or (not cat["active"] and category_id != old["category_id"]):
                        return self.send_json({"error": "Choose an active category"}, 400)
                db.execute("UPDATE entries SET kind=?, amount_paise=?, category_id=?, note=?, month=? WHERE id=?", (kind, amount, category_id, str(data.get("note", old["note"])).strip(), month, entry_id))
                return self.send_json({"ok": True})
        self.send_json({"error": "Not found"}, 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/entries/"):
            entry_id = int(path.rsplit("/", 1)[1])
            with connect() as db:
                db.execute("DELETE FROM entries WHERE id=?", (entry_id,))
            return self.send_json({"ok": True})
        self.send_json({"error": "Not found"}, 404)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


if __name__ == "__main__":
    initialize()
    port = 8765
    print(f"Paisa is running at http://127.0.0.1:{port}")
    print(f"Database: {DB_PATH}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
