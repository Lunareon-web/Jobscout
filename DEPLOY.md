# Deployment Guide — Job-Scout Düsseldorf

## Schritt 1: GitHub Repository erstellen

```bash
# Auf GitHub: neues Repo "jobscout-duesseldorf" anlegen (ohne README)
git remote add origin https://github.com/DEIN-USERNAME/jobscout-duesseldorf.git
git push -u origin main
```

## Schritt 2: Supabase einrichten

1. https://supabase.com → New Project
2. SQL Editor → supabase/migrations/001_initial.sql ausführen
3. Settings → API → URL + anon key notieren
4. Settings → API → service_role key notieren

## Schritt 3: Vercel deployen

```bash
npm install -g vercel
vercel login
vercel
```

Oder: GitHub-Repo in Vercel importieren (empfohlen für Auto-Deploy)

## Schritt 4: Environment Variables in Vercel

Unter Settings → Environment Variables:

| Key | Value |
|-----|-------|
| VITE_SUPABASE_URL | https://xxx.supabase.co |
| VITE_SUPABASE_ANON_KEY | eyJ... (anon key) |
| SUPABASE_URL | https://xxx.supabase.co |
| SUPABASE_SERVICE_KEY | eyJ... (service_role key) |

## Schritt 5: Redeploy

```bash
vercel --prod
```

## Fertig! ✓

Die App läuft jetzt auf Vercel mit:
- Frontend auf Vercel CDN (global, schnell)
- Backend als serverless functions (kein CORS, 60s timeout)
- Datenbank in Supabase (PostgreSQL, permanent)
