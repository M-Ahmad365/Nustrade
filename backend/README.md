# NUST Markaz — Backend

Student-only marketplace for NUST Islamabad. All accounts must have a verified `@nust.edu.pk` email.

---

## Prerequisites

Install these before proceeding. Tested versions listed — others may work.

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org or `nvm install 20` |
| PostgreSQL | 16 | https://postgresql.org/download |
| MongoDB | 7 | https://www.mongodb.com/try/download/community |
| Redis | 7 | https://redis.io/docs/getting-started |
| pg_dump / pg_restore | bundled with Postgres | — |
| mongodump | bundled with MongoDB Tools | https://www.mongodb.com/try/download/database-tools |

**macOS (Homebrew):**
```bash
brew install node@20 postgresql@16 mongodb-community@7 redis
brew services start postgresql@16
brew services start mongodb-community@7
brew services start redis
```

**Ubuntu / Debian:**
```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 16
sudo apt-get install -y postgresql-16

# MongoDB 7
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org

# Redis 7
sudo apt-get install -y redis-server
```

---

## Initial Setup (fresh machine)

```bash
# 1. Clone and enter the backend
git clone <repo-url>
cd nust-markaz/backend

# 2. Install Node dependencies
npm install

# 3. Create the PostgreSQL database
#    (connect as postgres superuser)
psql -U postgres -c "CREATE DATABASE nust_markaz;"
psql -U postgres -c "CREATE USER nust_markaz_user WITH PASSWORD 'yourpassword';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE nust_markaz TO nust_markaz_user;"

# 4. Copy and fill in environment variables
cp .env.example .env
```

Edit `.env` — minimum required changes:

| Variable | What to set |
|---|---|
| `PG_USER` | postgres user (e.g. `nust_markaz_user`) |
| `PG_PASSWORD` | postgres password |
| `JWT_SECRET` | any long random string, e.g. `openssl rand -hex 32` |
| `SMTP_USER` | Gmail address for OTP emails |
| `SMTP_PASSWORD` | Gmail App Password (16-char, not your account password) |
| `CORS_ORIGIN` | Frontend URL (default `http://localhost:5173` is fine for dev) |

MongoDB and Redis use their defaults (`localhost:27017` / `localhost:6379`) — no auth needed for local dev.

```bash
# 5. Run migrations (creates all tables, indexes, triggers, stored procedures)
npm run db:migrate

# 6. Seed with demo data (optional but recommended for demo)
npm run db:seed

# 7. Start the server
npm run dev   # development — nodemon auto-restarts on file changes
npm start     # production
```

Server runs on `http://localhost:4000` (or `PORT` from `.env`).

**Verify it's up:**
```bash
curl http://localhost:4000/health
# {"success":true,"data":{"status":"ok"}}
```

---

## Gmail SMTP Setup (for OTP emails)

1. Go to your Google Account → Security → 2-Step Verification (must be ON)
2. Go to App Passwords → create one for "Mail" / "Other"
3. Copy the 16-character password into `SMTP_PASSWORD` in `.env`
4. Set `SMTP_USER` to your Gmail address
5. Set `SMTP_FROM` to e.g. `"NUST Markaz <no-reply@gmail.com>"`

---

## npm Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with nodemon (auto-restart on save) |
| `npm start` | Start without nodemon (production) |
| `npm run db:migrate` | Apply all pending SQL migrations |
| `npm run db:seed` | Insert demo users, listings, offers, transactions |
| `npm run db:reset` | **Destructive** — drop + recreate database, then migrate |
| `npm run backup` | pg_dump + mongodump → `backups/{timestamp}/` |

---

## Environment Variables

Full reference — all are in `.env.example`:

```
NODE_ENV=development          # development | production
PORT=4000

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_DB=nust_markaz
PG_USER=postgres
PG_PASSWORD=

# MongoDB (no auth for local dev)
MONGO_URI=mongodb://localhost:27017/nust_markaz

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=<long random string>
JWT_EXPIRY=7d

# Bcrypt cost factor
BCRYPT_ROUNDS=12

# SMTP (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youraddress@gmail.com
SMTP_PASSWORD=<16-char app password>
SMTP_FROM="NUST Markaz <youraddress@gmail.com>"

# File uploads
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=5242880       # 5 MB in bytes

# CORS
CORS_ORIGIN=http://localhost:5173
```

---

## API

All endpoints are prefixed `/api/v1`. Import `docs/api-postman.json` into Postman for the full collection with example request bodies and responses.

**Auth header for protected routes:**
```
Authorization: Bearer <jwt>
```

**Response envelope (all endpoints):**
```json
{ "success": true, "data": { ... }, "message": "optional" }
```

**Error envelope:**
```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable" } }
```

**Route overview:**

| Prefix | Auth | Purpose |
|---|---|---|
| `/api/v1/auth` | public | Signup, OTP, login, password reset |
| `/api/v1/users` | JWT | Profiles, profile picture |
| `/api/v1/listings` | JWT | Home feed, search, CRUD, boost |
| `/api/v1/offers` | JWT + verified | Create, accept, reject, counter |
| `/api/v1/transactions` | JWT | Confirm, cancel, dispute |
| `/api/v1/chat` | JWT + verified | Threads, polling messages |
| `/api/v1/reviews` | JWT | Post-transaction reviews |
| `/api/v1/wishlist` | JWT | Save/remove listings |
| `/api/v1/saved-searches` | JWT | Named search presets |
| `/api/v1/notifications` | JWT | Paginated, unread count, mark-read |
| `/api/v1/admin` | JWT + admin | Users, listings, reports, analytics, backup |

---

## Backup & Restore

**Create backup:**
```bash
npm run backup
# writes to backups/{ISO-timestamp}/postgres.dump + backups/{ISO-timestamp}/mongo/
```

**Restore Postgres:**
```bash
pg_restore -h localhost -U postgres -d nust_markaz --clean \
  backups/<timestamp>/postgres.dump
```

**Restore MongoDB:**
```bash
mongorestore --uri mongodb://localhost:27017/nust_markaz \
  backups/<timestamp>/mongo/nust_markaz
```

---

## Database Architecture

Three databases, each used for what it's best at:

| Database | Data stored |
|---|---|
| **PostgreSQL 16** | Users, listings, offers, transactions, reviews, wishlist, saved searches, reports — all relational, integrity-critical data |
| **MongoDB 7** | Chat threads + messages, notifications, listing view events, activity log — high-write, variable-shape documents |
| **Redis 7** | JWT revocation, OTPs, rate limit counters, unread counts, trending cache, search autocomplete, analytics cache |

Key features demonstrated for ADBMS:
- Full-text search via `tsvector` + GIN index (Postgres)
- `WINDOW` functions for price trend + semester surge analytics
- CTEs for top-seller aggregation
- Stored procedure `complete_transaction()` with row-level `FOR UPDATE` lock
- Trigger `trg_reviews_recalc_rating` for live aggregate rating
- Atomic multi-statement transactions for offer acceptance
- TTL indexes in MongoDB (listing views: 90d, activity log: 180d)

---

## Project Structure

```
backend/
├── server.js              # Entry point — DB connect, cron jobs, listen
├── src/
│   ├── app.js             # Express setup, middleware, route mounts
│   ├── config/            # postgres.js, mongo.js, redis.js, env.js
│   ├── middleware/        # auth.js, validate.js, rateLimit.js, upload.js, errorHandler.js
│   ├── routes/            # One router file per resource
│   ├── controllers/       # Request handlers (thin — delegate to services/queries)
│   ├── services/          # analytics.js, chat.js, notify.js, trending.js
│   ├── db/
│   │   ├── migrations/    # Numbered .sql files (run in order by migrate.js)
│   │   ├── seeds/         # Demo data scripts
│   │   └── queries/       # Parameterized SQL — one file per domain
│   ├── validators/        # Zod schemas — one file per route domain
│   └── utils/             # jwt.js, email.js, otp.js, password.js, logger.js, response.js
├── scripts/
│   └── backup.js          # Standalone pg_dump + mongodump script
├── uploads/               # Served at /uploads/* — gitignored except .gitkeep
├── backups/               # Backup outputs — gitignored
├── .env.example           # All env vars with defaults
└── package.json
```

---

## Security Notes

- Passwords: bcrypt, cost factor 12
- JWT: HS256, 7-day expiry, per-token revocation via Redis JTI set
- All SQL queries: parameterized (`$1`, `$2`) — no string interpolation of user input
- File uploads: MIME type check + magic bytes validation + 5 MB cap
- Rate limits: 5 req/15 min on auth, 60 req/min on POST, 30 req/min on chat
- CORS: explicit allowlist (`CORS_ORIGIN`), no wildcards
- Security headers: `helmet`
- Email: NUST domain enforced by regex + Postgres `CHECK` constraint

---

## Academic Context

CS 236 Advanced Database Management Systems + Web Technologies, NUST Islamabad.
Ahmad (Muhammad Ahmad, Reg 502107, CS 14B) — backend.
