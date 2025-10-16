# 🃏 Poker Ranking PWA

Progressive Web App (PWA) for managing and displaying poker tournament rankings.  
Built with **Next.js 14 + TypeScript + Supabase + React Query**.

---

## 🚀 Features

- **Installable PWA** (works offline)
- **Automatic ranking updates** based on match results
- **Match and participant management**
- **Realtime updates** (via Supabase Realtime)
- **Automatic score triggers**
- **Offline mode** (Dexie + retry queue)
- **Simple REST API** (`/api/*`)

---

## ⚙️ Tech Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Frontend | Next.js + TypeScript + Tailwind + React Query |
| Backend  | Supabase (PostgreSQL + Realtime + RLS)        |
| Deploy   | Vercel (Frontend) + Supabase (Database)       |

---

## 📂 Project Structure

```
app/
 ├─ (public)/                → Public ranking page (/)
 ├─ (admin)/matches/new/     → Match creation form (/admin/matches/new)
 ├─ api/
 │   ├─ matches/             → POST (create) / GET (list)
 │   ├─ matches/[id]/        → PATCH (update positions)
 │   ├─ participants/        → POST (add participants)
 │   ├─ ranking/             → GET (ranking)
 │   └─ health/              → GET (status)
```

---

## 🔑 Environment Variables

`.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_DEFAULT_TOURNAMENT_ID=40a20d2a-c15a-44d6-bb1f-c9197666b2e8
```

> **⚠️ Note:**
>
> - `NEXT_PUBLIC_` → client-side (read-only)
> - `SUPABASE_SERVICE_ROLE_KEY` → server-only, **never** exposed to the browser

---

## 🧩 API Endpoints

### ➕ Create Match

```bash
curl -X POST http://localhost:3000/api/matches   -H 'Content-Type: application/json'   -d '{
    "request_id": "11111111-1111-1111-1111-111111111111",
    "tournament_id": "40a20d2a-c15a-44d6-bb1f-c9197666b2e8",
    "played_at": "2025-10-15T20:00:00.000Z"
  }'
```

**Response:**

```json
{
  "match": {
    "id": "f75b2ac5-a2bf-46fa-8e2c-81073c8f9f17",
    "tournament_id": "40a20d2a-c15a-44d6-bb1f-c9197666b2e8",
    "played_at": "2025-10-15T20:00:00+00:00"
  }
}
```

---

### 👥 Add Participants

```bash
curl -X POST http://localhost:3000/api/participants   -H 'Content-Type: application/json'   -d '{
    "request_id": "22222222-2222-2222-2222-222222222222",
    "match_id": "f75b2ac5-a2bf-46fa-8e2c-81073c8f9f17",
    "participants": [
      { "player_id": "ef62cf2e-45fb-460e-b111-a883dd78f0d0", "position": 1 },
      { "player_id": "0df309cf-13b1-4564-b48a-2074172830f8", "position": 2 },
      { "player_id": "8281502f-52cb-4270-9635-9ba0087e1260", "position": 3 },
      { "player_id": "97b9dcc3-8a0f-4868-866f-e4c3c600d54b", "position": 4 },
      { "player_id": "4eb87e65-c733-42a8-9898-3a43684ed4d3", "position": 5 }
    ]
  }'
```

**Response:**

```json
{ "ok": true }
```

---

### 🏅 Update Positions

```bash
curl -X PATCH http://localhost:3000/api/matches/f75b2ac5-a2bf-46fa-8e2c-81073c8f9f17   -H 'Content-Type: application/json'   -d '{
    "request_id": "33333333-3333-3333-3333-333333333333",
    "participants": [
      { "player_id": "0df309cf-13b1-4564-b48a-2074172830f8", "position": 1 }
    ]
  }'
```

**Response:**

```json
{ "ok": true }
```

---

### 📊 Get Ranking

```bash
curl -X GET "http://localhost:3000/api/ranking?tournament_id=40a20d2a-c15a-44d6-bb1f-c9197666b2e8"
```

**Expected Output:**

```json
{
  "rows": [
    { "player_name": "Alice", "total_points": 100 },
    { "player_name": "Bruno", "total_points": 75 },
    { "player_name": "Carla", "total_points": 60 },
    { "player_name": "Diego", "total_points": 50 },
    { "player_name": "Eva", "total_points": 45 }
  ]
}
```

---

### ❤️ Healthcheck

```bash
curl http://localhost:3000/api/health
```

**Response:**

```json
{ "ok": true, "ts": 1739635282207 }
```

---

## 🧮 SQL Reference

### View Rules

```sql
SELECT * FROM points_rules
WHERE tournament_id = '40a20d2a-c15a-44d6-bb1f-c9197666b2e8'
ORDER BY position;
```

### Recompute Points Manually

```sql
UPDATE match_participants mp
SET points_awarded = COALESCE((
  SELECT pr.points
  FROM matches m
  JOIN points_rules pr
    ON pr.tournament_id = m.tournament_id
   AND pr.position = mp.position
  WHERE m.id = mp.match_id
), 0);
```

---

## 🧠 Commands

```bash
# Development
pnpm dev

# Production build
pnpm build && pnpm start

# Install dependencies
pnpm i

# Clear Next cache
rm -rf .next
```

---

## 🧾 License

MIT © 2025 — Educational PWA prototype for poker tournament ranking.

---

## ✨ Next Steps

- Add `/api/admin/recompute` endpoint for server-side recalculation
- Integrate Supabase Auth for admin actions
- Add match history and statistics
- Enhance realtime dashboard (WebSocket/Realtime)
