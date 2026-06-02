"""
Supabase REST client via plain httpx.
Avoids the supabase-py package which has heavy dependencies
incompatible with Python 3.14.

Usage matches supabase-py patterns:
  db.table("x").select("*").eq("col", val).execute()
  db.table("x").insert({...}).execute()   # insert executes immediately, .execute() is no-op
  db.table("x").update({...}).eq("id", x).execute()
  db.table("x").select("*").order("col", desc=True).limit(10).execute()
"""
import httpx
from core.config import settings

BASE = settings.supabase_url.rstrip("/") + "/rest/v1"
_HEADERS = {
    "apikey": settings.supabase_service_key,
    "Authorization": f"Bearer {settings.supabase_service_key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


class Result:
    def __init__(self, data: list, status: int = 200,
                 error: str | None = None, count: int | None = None):
        self.data = data
        self.status = status
        self.error = error
        self.count = count

    def execute(self) -> "Result":
        """No-op — allows .insert({}).execute() pattern."""
        return self


class Table:
    def __init__(self, name: str):
        self._name = name
        self._filters: list[str] = []
        self._select = "*"
        self._order: list[str] = []
        self._limit: int | None = None
        self._range: tuple[int, int] | None = None
        self._single = False
        self._update_data: dict | None = None

    # ── Builder methods ──────────────────────────────────────

    def select(self, cols: str = "*", count: str | None = None) -> "Table":
        self._select = cols
        return self

    def eq(self, col: str, val) -> "Table":
        self._filters.append(f"{col}=eq.{val}")
        return self

    def neq(self, col: str, val) -> "Table":
        self._filters.append(f"{col}=neq.{val}")
        return self

    def gte(self, col: str, val) -> "Table":
        self._filters.append(f"{col}=gte.{val}")
        return self

    def lte(self, col: str, val) -> "Table":
        self._filters.append(f"{col}=lte.{val}")
        return self

    def ilike(self, col: str, val: str) -> "Table":
        self._filters.append(f"{col}=ilike.{val}")
        return self

    def in_(self, col: str, vals: list) -> "Table":
        joined = ",".join(str(v) for v in vals)
        self._filters.append(f"{col}=in.({joined})")
        return self

    def order(self, col: str, desc: bool = False) -> "Table":
        self._order.append(f"{col}.{'desc' if desc else 'asc'}")
        return self

    def limit(self, n: int) -> "Table":
        self._limit = n
        return self

    def range(self, start: int, end: int) -> "Table":
        self._range = (start, end)
        return self

    def single(self) -> "Table":
        self._single = True
        return self

    def update(self, data: dict) -> "Table":
        self._update_data = data
        return self

    # ── URL / Header builders ────────────────────────────────

    def _build_url(self) -> str:
        url = f"{BASE}/{self._name}?select={self._select}"
        for f in self._filters:
            url += f"&{f}"
        if self._order:
            url += f"&order={','.join(self._order)}"
        if self._limit:
            url += f"&limit={self._limit}"
        return url

    def _build_headers(self) -> dict:
        h = dict(_HEADERS)
        if self._range:
            h["Range"] = f"{self._range[0]}-{self._range[1]}"
            h["Range-Unit"] = "items"
        if self._single:
            h["Accept"] = "application/vnd.pgrst.object+json"
        return h

    # ── Terminal methods ──────────────────────────────────────

    def execute(self) -> Result:
        """Execute a SELECT or a pending UPDATE."""
        if self._update_data is not None:
            return self._run_update()
        return self._run_select()

    def _run_select(self) -> Result:
        url = self._build_url()
        headers = self._build_headers()
        with httpx.Client(timeout=15) as client:
            r = client.get(url, headers=headers)
        if r.status_code >= 400:
            return Result([], r.status_code, error=r.text)
        data = r.json()
        if isinstance(data, dict):
            data = [data]
        count = None
        if "content-range" in r.headers:
            try:
                count = int(r.headers["content-range"].split("/")[-1])
            except Exception:
                pass
        return Result(data or [], r.status_code, count=count)

    def _run_update(self) -> Result:
        url = self._build_url()
        with httpx.Client(timeout=15) as client:
            r = client.patch(url, json=self._update_data, headers=_HEADERS)
        if r.status_code >= 400:
            return Result([], r.status_code, error=r.text)
        data = r.json() if r.text.strip() else []
        return Result(data if isinstance(data, list) else [data], r.status_code)

    def insert(self, data: dict) -> Result:
        """Execute INSERT immediately. Returns Result (with .execute() no-op)."""
        url = f"{BASE}/{self._name}"
        with httpx.Client(timeout=15) as client:
            r = client.post(url, json=data, headers=_HEADERS)
        if r.status_code >= 400:
            return Result([], r.status_code, error=r.text)
        resp = r.json() if r.text.strip() else []
        return Result(resp if isinstance(resp, list) else [resp], r.status_code)

    def delete(self) -> Result:
        url = self._build_url()
        with httpx.Client(timeout=15) as client:
            r = client.delete(url, headers=_HEADERS)
        return Result([], r.status_code)


class DB:
    def table(self, name: str) -> Table:
        return Table(name)


_db: DB | None = None


def get_db() -> DB:
    global _db
    if _db is None:
        _db = DB()
    return _db
