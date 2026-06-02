"""
Job Validator
Prüft ob ein gefundener Eintrag eine echte Stellenanzeige ist.
Keine KI nötig — regelbasiert und schnell.
"""
import re

# ── Positive Indikatoren — deutet auf echten Job hin ──────────
JOB_INDICATORS = re.compile(
    r"\(m/w/d\)|\(w/m/d\)|\(gn\)|\(f/m/d\)|"
    r"vollzeit|teilzeit|festanstellung|befristet|unbefristet|"
    r"projekt.?manag|projekt.?leit|projekt.?koord|project.?manag|"
    r"innenarchitekt|interior.?design|retail.?design|store.?design|"
    r"design.?manag|design.?director|creative.?director|"
    r"brand.?manag|visual.?merchandis|concept.?design|"
    r"werkstudent|praktikant|trainee|junior|senior|lead\b|"
    r"stellenangebot|stellenausschreibung|job.?angebot|"
    r"head of|leiter.?in|referent.?in|koordinator.?in|"
    r"architekt|architekt.?in|innenarchitekt|"
    r"store.?develop|expansion|workplace|"
    r"designer\b|manager\b|direktor|director|berater|consultant",
    re.I
)

# ── Negative Indikatoren — deutet auf Nicht-Job hin ───────────
NAV_BLACKLIST = re.compile(
    r"^(übersicht|produkte?|service|tools?|kontakt|impressum|"
    r"datenschutz|agb|home|news|blog|presse|referenzen?|portfolio|"
    r"about|team|karriere|jobs|stellenangebote|"
    r"hotel|airport|access|retail|fashion|food|pharma|bank|"
    r"healthcare|logistik|checkout|market|shop|store|"
    r"material.?handling|near.?food|non.?food|"
    r"digital|grafik|atelier|magazin|youtube|instagram|"
    r"konfigurator|design.in|4rooms|solutions?)$",
    re.I
)

# ── URL-basierte Validierung ───────────────────────────────────
JOB_URL_PATTERNS = re.compile(
    r"/(job|jobs|career|careers|karriere|stelle|stellen|"
    r"vacancies|vacancy|position|positions|"
    r"stellenangebot|bewerbung|apply)/",
    re.I
)

# Bekannte ATS-Domains — immer echte Jobs
ATS_DOMAINS = re.compile(
    r"greenhouse\.io|lever\.co|personio\.de|smartrecruiters\.com|"
    r"stepstone\.de|indeed\.com|arbeitsagentur\.de|"
    r"join\.com|recruitee\.com|softgarden\.de|rexx-systems\.de",
    re.I
)


def is_real_job(title: str, url: str = "", description: str = "") -> tuple[bool, str]:
    """
    Prüft ob ein Eintrag eine echte Stellenanzeige ist.
    Returns (is_valid, reason)
    """
    title = (title or "").strip()

    # Mindestlänge
    if len(title) < 8:
        return False, f"Titel zu kurz: '{title}'"

    # Maximallänge (Navigationslinks sind meist kurz, Jobs etwas länger)
    if len(title) > 150:
        return False, f"Titel zu lang ({len(title)} Zeichen)"

    # Bekannte Navigation/Produkt-Blacklist
    if NAV_BLACKLIST.match(title):
        return False, f"Navigation/Produkt-Seite: '{title}'"

    # Nur aus einzelnem Wort (kein echter Jobtitel)
    words = title.split()
    if len(words) == 1 and not JOB_INDICATORS.search(title):
        return False, f"Einzelwort ohne Job-Kontext: '{title}'"

    # Positive Validierung: hat mindestens einen Job-Indikator ODER Job-URL
    has_job_indicator = bool(JOB_INDICATORS.search(title))
    has_job_url = bool(JOB_URL_PATTERNS.search(url)) or bool(ATS_DOMAINS.search(url))
    has_description_hint = len(description) > 50  # hat echte Beschreibung

    if not has_job_indicator and not has_job_url and not has_description_hint:
        return False, f"Kein Job-Indikator gefunden: '{title}'"

    return True, "ok"


def filter_jobs(jobs: list[dict]) -> list[dict]:
    """Filtert eine Liste von Job-Dicts und gibt nur echte Jobs zurück."""
    valid = []
    for job in jobs:
        ok, reason = is_real_job(
            job.get("title", "") or job.get("titel", ""),
            job.get("url", ""),
            job.get("description", "") or job.get("beschreibung", ""),
        )
        if ok:
            valid.append(job)
    return valid
