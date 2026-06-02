# Job-Scout Düsseldorf

Intelligente Job-Suchmaschine für Design, Interior, Architektur und Management im Umkreis von Düsseldorf.

## Architektur

```
Frontend   React + Vite + TypeScript → Vercel CDN
Backend    Vercel Serverless Functions (Node.js)
Datenbank  Supabase (PostgreSQL)
Quellen    BA-API · Kimeta RSS · StepStone · 20 Firmenseiten direkt
```

## Setup

### 1. Supabase
- Neues Projekt anlegen auf supabase.com
- `supabase/migrations/001_initial.sql` im SQL-Editor ausführen
- URL und anon key kopieren

### 2. Environment Variables (Vercel)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

### 3. Deploy
```bash
npm install
npm run build
vercel --prod
```

## Suchstrategie (3 Phasen)

| Phase | Quelle | Dauer |
|-------|--------|-------|
| 1 | Bundesagentur für Arbeit (REST-API, alle Titel + Berufsgruppen parallel) | ~5s |
| 2 | Kimeta RSS · StepStone · Karriere.de · Stellenanzeigen.de · Kalaydo | ~15s |
| 3 | 20 Firmenseiten direkt (JSON-LD → __NEXT_DATA__ → Link-Scan) | ~15s |
