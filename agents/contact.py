"""
Contact Agent
Findet Ansprechpartner auf Unternehmensseiten und in Pressemitteilungen.
Output → contacts
"""
import logging
import re
import httpx
from bs4 import BeautifulSoup
from core.database import get_db

log = logging.getLogger(__name__)

TARGET_TITLES = re.compile(
    r"head of (store|retail|design|workplace|expansion)|"
    r"design director|project director|projektleiter|"
    r"expansion manager|store development|retail director|"
    r"interior.*leitung|creative director|brand director",
    re.I
)

TEAM_PATHS = ["/team", "/about/team", "/unternehmen/team", "/people", "/kontakt"]
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124"}

# Simple name pattern: 2-3 words starting with uppercase
NAME_RE = re.compile(r"\b([A-ZÄÖÜ][a-zäöüß]{2,20})\s+([A-ZÄÖÜ][a-zäöüß]{2,30})\b")


async def _extract_contacts(html: str, source_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    contacts = []
    seen = set()

    # Look for title matches near names
    text_blocks = soup.find_all(["p", "div", "li", "span", "h3", "h4"])
    for block in text_blocks:
        text = block.get_text(separator=" ", strip=True)
        if not TARGET_TITLES.search(text):
            continue

        title_match = TARGET_TITLES.search(text)
        title = title_match.group(0) if title_match else ""

        name_match = NAME_RE.search(text)
        if not name_match:
            continue
        name = f"{name_match.group(1)} {name_match.group(2)}"

        key = f"{name}|{title}".lower()
        if key in seen:
            continue
        seen.add(key)

        contacts.append({
            "name": name[:100],
            "title": title[:150],
            "source_url": source_url,
        })

        if len(contacts) >= 5:
            break

    return contacts


async def run(company_id: str) -> int:
    db = get_db()

    company = db.table("companies").select("*").eq("id", company_id).single().execute()
    if not company.data:
        return 0
    c = company.data[0]

    log.info(f"Contact search: {c['name']}")
    base = c["website"].rstrip("/")
    total_new = 0

    async with httpx.AsyncClient(timeout=12, headers=HEADERS, follow_redirects=True) as client:
        for path in TEAM_PATHS:
            try:
                r = await client.get(base + path)
                if r.status_code >= 400:
                    continue

                contacts = await _extract_contacts(r.text, base + path)
                for contact in contacts:
                    # Dedup check
                    existing = (
                        db.table("contacts")
                        .select("id")
                        .eq("company_id", company_id)
                        .eq("name", contact["name"])
                        .execute()
                    )
                    if existing.data:
                        continue

                    db.table("contacts").insert({
                        "company_id": company_id,
                        **contact,
                    }).execute()
                    total_new += 1

            except Exception as e:
                log.debug(f"Contact fetch error {base + path}: {e}")
                continue

    log.info(f"  → {total_new} new contacts for {c['name']}")
    return total_new
