"""
Supabase REST client via plain httpx.
Avoids the supabase-py package which has heavy dependencies
incompatible with Python 3.14.
"""
import httpx
from core.config import settings

BASE = settings.supabase_url.rstrip("/") + "/rest/v1"
HEADERS = {
    "apikey": settings.supabase_service_key,
    "Authorization": f"Bearer {settings.supabase_service_key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


class Table:
    def __init__(self, name: str):
        self.name = name
        self._filters: list[str] = []
        self._select = "*"
        self._order: list[str] = []
        self._limit: int | None = None
        self._range: tuple[int, int] | None = None
        self._single = False

    def select(self, cols: str = "*", count: str | None = None):
        self._select = cols
        self._count = count
        return self

    def eq(self, col: str, val):
        self._filters.append(f"{col}=eq.{val}")
        return self

    def neq(self, col: str, val):
        self._filters.append(f"{col}=neq.{val}")
        return self

    def gte(self, col: str, val):
        self._filters.append(f"{col}=gte.{val}")
        return self

    def lte(self, col: str, val):
        self._filters.append(f"{col}=lte.{val}")
        return self

    def ilike(self, col: str, val: str):
        self._filters.append(f"{col}=ilike.{val}")
        return self

    def in_(self, col: str, vals: list):
        joined = ",".join(str(v) for v in vals)
        self._filters.append(f"{col}=in.({joined})")
        return self

    def order(self, col: str, desc: bool = False):
        self._order.append(f"{col}.{'desc' if desc else 'asc'}")
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def range(self, start: int, end: int):
        self._range = (start, end)
        return self

    def single(self):
        self._single = True
        return self

    def _build_url(self) -> str:
        url = f"{BASE}/{self.name}?select={self._select}"
        for f in self._filters:
            url += f"&{f}"
        if self._order:
            url += f"&order={','.join(self._order)}"
        if self._limit:
            url += f"&limit={self._limit}"
        return url

    def _build_headers(self) -> dict:
        h = dict(HEADERS)
        if self._range:
            h["Range"] = f"{self._range[0]}-{self._range[1]}"
            h["Range-Unit"] = "items"
        if self._single:
            h["Accept"] = "application/vnd.pgrst.object+json"
        return h

    def execute(self) -> "Result":
        url = self._build_url()
        h = self._build_headers()
        with httpx.Client(timeout=15) as client:
            r = client.get(url, headers=h)
            if r.status_code >= 400:
                return Result([], r.status_code)
            data = r.json()
            if isinstance(data, dict):
                data = [data]
            # count from Content-Range
            count = None
            if "content-range" in r.headers:
                try:
                    count = int(r.headers["content-range"].split("/")[-1])
                except Exception:
                    pass
            return Result(data, r.status_code, count=count)

    def insert(self, data: dict) -> "Result":
        url = f"{BASE}/{self.name}"
        with httpx.Client(timeout=15) as client:
            r = client.post(url, json=data, headers=HEADERS)
            if r.status_code >= 400:
                return Result([], r.status_code, error=r.text)
            resp = r.json()
            return Result(resp if isinstance(resp, list) else [resp], r.status_code)

    def update(self, data: dict) -> "Table":
        self._update_data = data
        return self

    def _do_update(self) -> "Result":
        url = self._build_url()
        with httpx.Client(timeout=15) as client:
            r = client.patch(url, json=self._update_data, headers=HEADERS)
            if r.status_code >= 400:
                return Result([], r.status_code, error=r.text)
            resp = r.json() if r.text else []
            return Result(resp if isinstance(resp, list) else [resp], r.status_code)

    def delete(self) -> "Result":
        url = self._build_url()
        with httpx.Client(timeout=15) as client:
            r = client.delete(url, headers=HEADERS)
            return Result([], r.status_code)

    # Allow chaining update().eq().execute()
    def __getattr__(self, name):
        if name == "execute" and hasattr(self, "_update_data"):
            return self._do_update
        raise AttributeError(name)


class Result:
    def __init__(self, data: list, status: int, error: str | None = None, count: int | None = None):
        self.data = data
        self.status = status
        self.error = error
        self.count = count


class DB:
    def table(self, name: str) -> Table:
        return Table(name)


_db: DB | None = None


def get_db() -> DB:
    global _db
    if _db is None:
        _db = DB()
    return _db
