# NusTrade — Student Marketplace for NUST Islamabad

Peer-to-peer marketplace for buying and selling items exclusively between verified NUST students. Think OLX, but locked to `@nust.edu.pk` email addresses only.

**Academic context:** Final semester project — CS 236 Advanced Database Management Systems + Web Technologies, NUST Islamabad.  
**Built by:** Muhammad Ahmad (Reg: 502107, CS 14B)

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Prerequisites](#prerequisites)
3. [Project Structure](#project-structure)
4. [First-Time Setup (New Machine)](#first-time-setup-new-machine)
5. [Environment Variables](#environment-variables)
6. [Database Setup](#database-setup)
7. [Running the Server](#running-the-server)
8. [Running the Frontend](#running-the-frontend)
9. [API Overview](#api-overview)
10. [NPM Scripts Reference](#npm-scripts-reference)
11. [Backup & Restore](#backup--restore)
12. [Common Errors & Fixes](#common-errors--fixes)

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Framework | Express | 5.x |
| SQL Database | PostgreSQL | 16 |
| NoSQL Database | MongoDB | 7 |
| Cache | Redis | 7 |
| SQL Client | `pg` (node-postgres) | latest |
| Mongo Client | `mongodb` (official driver) | latest |
| Redis Client | `ioredis` | latest |
| Auth | `jsonwebtoken` + `bcrypt` | latest |
| Validation | `zod` | latest |
| File Upload | `multer` | latest |
| Email | `nodemailer` + Gmail SMTP | latest |
| Frontend | Vanilla HTML / CSS / JS | — |

---

## Prerequisites

Install these before anything else.

### 1. Node.js 20 LTS

```bash
# macOS (Homebrew)
brew install node@20
brew link node@20

# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows — download installer from https://nodejs.org (choose 20 LTS)
```

Verify:
```bash
node -v   # should print v20.x.x
npm -v    # should print 10.x.x or higher
```

### 2. PostgreSQL 16

```bash
# macOS (Homebrew)
brew install postgresql@16
brew services start postgresql@16

# Ubuntu / Debian
sudo apt install -y postgresql postgresql-contrib

# Windows — download from https://www.postgresql.org/download/windows/
# Use the default installer. Remember the password you set for the postgres user.
```

Verify:
```bash
psql --version   # should print psql (PostgreSQL) 16.x
```

### 3. MongoDB 7

```bash
# macOS (Homebrew)
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0

# Ubuntu / Debian
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl start mongod

# Windows — download from https://www.mongodb.com/try/download/community (version 7.x)
```

Verify:
```bash
mongod --version   # should print db version v7.x.x
```

### 4. Redis 7

```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# Ubuntu / Debian
sudo apt install -y redis-server
sudo systemctl start redis-server

# Windows — use WSL2 (recommended) or download from https://github.com/tporadowski/redis/releases
```

Verify:
```bash
redis-cli ping   # should print PONG
```

### 5. Git

```bash
# macOS
brew install git

# Ubuntu / Debian
sudo apt install -y git

# Windows — download from https://git-scm.com/download/win
```

---

## Project Structure

```
Nustrade/
├── backend/
│   ├── src/
│   │   ├── config/             # DB connection setup (postgres, mongo, redis, env)
│   │   ├── controllers/        # Route handlers — one file per resource
│   │   ├── db/
│   │   │   ├── migrations/     # Numbered SQL files — run in order by migrate.js
│   │   │   ├── seeds/          # Demo data script
│   │   │   ├── queries/        # Reusable parameterized SQL — one file per domain
│   │   │   ├── migrate.js      # Migration runner
│   │   │   ├── seed.js         # Seed entry point
│   │   │   └── reset.js        # DROP + re-migrate (dev only — destroys all data)
│   │   ├── middleware/         # auth, validate, rateLimit, errorHandler, upload
│   │   ├── routes/             # Express routers — one file per resource
│   │   ├── services/           # Business logic: chat, notify, trending, analytics
│   │   ├── utils/              # email, jwt, logger, otp, password, response helpers
│   │   ├── validators/         # Zod schemas for every request body
│   │   └── app.js              # Express app setup (middleware + routes mounted)
│   ├── uploads/                # Uploaded images (gitignored — structure kept via .gitkeep)
│   │   ├── avatars/
│   │   └── listings/
│   ├── scripts/
│   │   └── backup.js           # pg_dump + mongodump backup script
│   ├── logs/                   # Winston log output (gitignored)
│   ├── tests/                  # Postman collection + integration tests
│   ├── server.js               # Entry point — starts server + cron jobs
│   ├── package.json
│   ├── .env                    # YOUR secrets (never committed)
│   └── .env.example            # Template — copy this to .env
├── frontend/                   # Vanilla HTML/CSS/JS SPA
│   ├── index.html              # Shell — router loads pages here
│   ├── css/                    # Design tokens, base, components, layout, animations
│   ├── js/
│   │   ├── api.js              # All fetch() calls to backend
│   │   ├── auth.js             # JWT storage + auth guards
│   │   ├── router.js           # Client-side routing
│   │   ├── toast.js            # Toast notification UI
│   │   ├── utils.js            # Shared helpers
│   │   └── pages/              # One JS file per page (listings, chat, profile, etc.)
│   └── pages/                  # HTML pages loaded by router
├── docs/
│   ├── SPECS.md                # Full product specification
│   ├── SKILL.md                # Phase-by-phase build order
│   └── api-postman.json        # Postman collection for API testing
└── README.md                   # This file
```

---

## First-Time Setup (New Machine)

Follow these steps **in order** on a fresh machine.

### Step 1 — Clone the repo

```bash
git clone https://github.com/M-Ahmad365/Nustrade.git
cd Nustrade
```

### Step 2 — Create the PostgreSQL database

```bash
# Log in as the postgres superuser
psql -U postgres

# Inside psql:
CREATE DATABASE nustrade_db;
\q
```

> **Windows tip:** Open "SQL Shell (psql)" from the Start Menu. Use password you set during PostgreSQL install.

### Step 3 — Install backend dependencies

```bash
cd backend
npm install
```

### Step 4 — Configure environment variables

```bash
# Copy the template
cp .env.example .env
```

Now open `backend/.env` in any text editor and fill in your values. See the [Environment Variables](#environment-variables) section below for a complete explanation of every field.

Minimum required for the server to start:
```
PG_HOST=localhost
PG_PORT=5432
PG_DB=nustrade_db
PG_USER=postgres
PG_PASSWORD=your_postgres_password
MONGO_URI=mongodb://localhost:27017/nustrade
REDIS_URL=redis://localhost:6379
JWT_SECRET=any-long-random-string-at-least-32-chars
```

### Step 5 — Run database migrations

```bash
npm run db:migrate
```

This applies all 16 SQL migration files in order. Creates all tables, enums, indexes, triggers, and stored procedures. Output should look like:

```
[migrate] applied 001_create_enums.sql
[migrate] applied 002_create_users.sql
...
[migrate] applied 016_fix_semester_and_hostels.sql
[migrate] done — 16 migration(s) applied
```

### Step 6 — (Optional) Seed demo data

```bash
npm run db:seed
```

Inserts demo users, categories, listings, offers, and reviews so you have data to work with immediately. Safe to re-run — seed script checks for existing data before inserting.

### Step 7 — Start the server

```bash
npm run dev
```

Server starts on `http://localhost:4000`. You should see:

```
[mongo] all collection indexes created/verified
[mongo] connected — db: nustrade
[redis] connected to redis://localhost:6379
[redis] ping OK
[postgres] connected — db: nustrade_db, host: localhost
NUST Markaz backend running on port 4000 [development]
```

### Step 8 — Open the frontend

Open `frontend/index.html` in a browser **via a local server** (not `file://` — the fetch calls need a proper origin).

**Option A — VS Code Live Server** (easiest):
1. Install the "Live Server" extension in VS Code.
2. Right-click `frontend/index.html` → "Open with Live Server".
3. Opens at `http://127.0.0.1:5500`.

**Option B — Python HTTP server:**
```bash
# from the Nustrade/ root
cd frontend
python3 -m http.server 5500
# open http://localhost:5500
```

**Option C — Node `serve`:**
```bash
npx serve frontend -p 5500
# open http://localhost:5500
```

> The backend CORS config allows `localhost:5500`, `localhost:5501`, `127.0.0.1:5500`, and `127.0.0.1:5501` in development by default.

---

## Environment Variables

Full reference for `backend/.env`:

```bash
# ── PostgreSQL ─────────────────────────────────────────────────────────────────
PG_HOST=localhost           # hostname of your Postgres server
PG_PORT=5432                # default Postgres port
PG_DB=nustrade_db           # database name (must exist before running migrations)
PG_USER=postgres            # Postgres username
PG_PASSWORD=                # Postgres password (can be empty if no auth configured)

# ── MongoDB ────────────────────────────────────────────────────────────────────
MONGO_URI=mongodb://localhost:27017/nustrade
# MongoDB will create the "nustrade" database automatically on first write.

# ── Redis ──────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379
# If Redis has a password: redis://:yourpassword@localhost:6379

# ── JWT ────────────────────────────────────────────────────────────────────────
JWT_SECRET=change-me-to-a-long-random-string-at-least-32-chars
# Generate a good one: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_EXPIRY=7d               # token lifetime — 7 days

# ── Bcrypt ─────────────────────────────────────────────────────────────────────
BCRYPT_ROUNDS=12            # cost factor — 12 is secure, use 10 for faster dev seeding

# ── Email (Gmail SMTP) ─────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASSWORD=your-gmail-app-password
# SMTP_PASSWORD must be a Gmail App Password, NOT your Gmail login password.
# How to get one: Google Account → Security → 2-Step Verification → App passwords
# App name: "NusTrade" — copy the 16-char code it shows you
SMTP_FROM="NusTrade <your-gmail@gmail.com>"

# ── Server ─────────────────────────────────────────────────────────────────────
NODE_ENV=development        # use "production" on server
PORT=4000                   # port the API listens on
CORS_ORIGIN=http://localhost:3000,http://localhost:5500,http://localhost:5173
# Comma-separated origins allowed in production. In development, all origins allowed.

# ── File Upload ────────────────────────────────────────────────────────────────
UPLOAD_DIR=./uploads        # relative to backend/ — where images are stored
MAX_UPLOAD_SIZE=5242880     # 5MB in bytes — max size per image
```

> **Security rule:** Never commit `.env`. It is in `.gitignore`. Only commit `.env.example`.

---

## Database Setup

### PostgreSQL — what migrations create

All migrations are in `backend/src/db/migrations/` and run automatically via `npm run db:migrate`.

| File | What it creates |
|---|---|
| `001_create_enums.sql` | All ENUM types (user_role, listing_status, offer_status, etc.) |
| `002_create_users.sql` | `users` table + `updated_at` trigger |
| `003_create_categories.sql` | `categories` table (self-referencing for subcategories) |
| `004_create_listings.sql` | `listings` table + full-text search index |
| `005_create_listing_images.sql` | `listing_images` table |
| `006_create_listing_tags.sql` | `listing_tags` table |
| `007_create_offers.sql` | `offers` table |
| `008_create_transactions.sql` | `transactions` table |
| `009_create_reviews.sql` | `reviews` table |
| `010_create_wishlist.sql` | `wishlist` table |
| `011_create_saved_searches.sql` | `saved_searches` table |
| `012_create_reports.sql` | `reports` table |
| `013_create_procedures.sql` | Stored procedures + triggers |
| `014_seed_categories.sql` | Inserts default categories |
| `015_fix_email_constraint.sql` | Email validation constraint |
| `016_fix_semester_and_hostels.sql` | Semester enum + hostel data |

Migrations are idempotent — re-running `npm run db:migrate` skips already-applied files tracked in the `schema_migrations` table.

### MongoDB — collections created automatically

The app creates these collections and their indexes on first startup:

| Collection | Purpose |
|---|---|
| `chat_threads` | One document per buyer–seller–listing conversation |
| `chat_messages` | Individual messages inside threads |
| `notifications` | In-app notifications per user |
| `listing_views` | View history (TTL: 90 days auto-expire) |
| `activity_log` | User activity audit trail (TTL: 180 days auto-expire) |

### Redis — key patterns

| Key | TTL | Purpose |
|---|---|---|
| `user:session:{userId}` | 7 days | JWT blocklist for logout |
| `otp:{email}` | 10 min | Email OTP for signup/reset |
| `listing:trending:24h` | 15 min | Trending listings cache |
| `user:unread_count:{userId}` | 1 hour | Unread notification count |
| Rate limit counters | 15 min / 1 min | Per-IP and per-user rate limiting |

### Reset everything (dev only)

```bash
# WARNING: destroys ALL data in PostgreSQL. Use only in development.
npm run db:reset
```

This drops all tables and re-runs all migrations from scratch. MongoDB and Redis data is not touched.

---

## Running the Server

### Development (auto-restart on file changes)

```bash
cd backend
npm run dev
```

Uses `nodemon` — server restarts automatically whenever you save a `.js` file.

### Production

```bash
cd backend
npm start
```

Uses plain `node`. Set `NODE_ENV=production` in `.env` for production logging format (combined) and strict CORS.

### Health check

```bash
curl http://localhost:4000/health
# {"success":true,"data":{"status":"ok"}}
```

---

## Running the Frontend

The frontend is vanilla HTML/CSS/JS with a client-side router. It must be served over HTTP (not opened as a `file://` URL) because fetch requests need a proper origin.

**VS Code Live Server (recommended for development):**
1. Open the `Nustrade/` folder in VS Code.
2. Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer).
3. Right-click `frontend/index.html` in the explorer → "Open with Live Server".
4. App opens at `http://127.0.0.1:5500`.

The `frontend/js/api.js` file sets the API base URL — it defaults to `http://localhost:4000/api/v1`. If your backend runs on a different port, update that constant.

---

## API Overview

Base URL: `http://localhost:4000/api/v1`

All responses follow this shape:
```json
{
  "success": true,
  "data": { },
  "message": "optional message"
}
```

Error responses:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

### Route groups

| Prefix | Description |
|---|---|
| `POST /api/v1/auth/signup` | Register with @nust.edu.pk email |
| `POST /api/v1/auth/verify-otp` | Verify email OTP |
| `POST /api/v1/auth/login` | Login, get JWT |
| `POST /api/v1/auth/logout` | Invalidate JWT |
| `POST /api/v1/auth/forgot-password` | Send reset OTP |
| `POST /api/v1/auth/reset-password` | Set new password via OTP |
| `GET/PUT /api/v1/users/me` | View/update own profile |
| `GET /api/v1/listings` | Browse/search listings |
| `POST /api/v1/listings` | Create listing (multipart/form-data) |
| `GET /api/v1/listings/:id` | Single listing detail |
| `PUT/DELETE /api/v1/listings/:id` | Edit/delete own listing |
| `GET /api/v1/categories` | All categories |
| `POST /api/v1/offers` | Make offer on listing |
| `PUT /api/v1/offers/:id/accept` | Accept offer |
| `PUT /api/v1/offers/:id/decline` | Decline offer |
| `GET /api/v1/chat/threads` | My chat threads |
| `POST /api/v1/chat/threads` | Start a chat |
| `GET /api/v1/chat/threads/:id/messages` | Poll messages |
| `POST /api/v1/chat/threads/:id/messages` | Send message |
| `GET /api/v1/notifications` | My notifications |
| `POST /api/v1/notifications/mark-read` | Mark as read |
| `GET/POST /api/v1/wishlist` | View/add wishlist items |
| `DELETE /api/v1/wishlist/:listingId` | Remove from wishlist |
| `GET /api/v1/reviews/user/:userId` | Reviews for a user |
| `POST /api/v1/reviews` | Post a review |
| `GET /api/v1/analytics/dashboard` | Admin analytics |
| `GET /api/v1/admin/users` | Admin: list users |
| `GET /api/v1/admin/reports` | Admin: view reports |

Full request/response docs are in `docs/api-postman.json` — import into Postman.

---

## NPM Scripts Reference

Run from the `backend/` directory.

| Script | Command | What it does |
|---|---|---|
| `npm run dev` | `nodemon server.js` | Start server with auto-restart |
| `npm start` | `node server.js` | Start server (production) |
| `npm run db:migrate` | `node src/db/migrate.js` | Apply pending SQL migrations |
| `npm run db:seed` | `node src/db/seed.js` | Insert demo data |
| `npm run db:reset` | `node src/db/reset.js` | **Drop all tables** + re-migrate (dev only) |
| `npm run backup` | `node scripts/backup.js` | Dump PostgreSQL + MongoDB to `backups/` |

---

## Backup & Restore

### Create a backup

```bash
cd backend
npm run backup
```

Creates `backend/backups/{timestamp}/` containing:
- `postgres.dump` — pg_dump custom format
- `mongo/` — mongodump output

Requires `pg_dump` and `mongodump` on your PATH (they come with PostgreSQL and MongoDB installs).

### Restore PostgreSQL

```bash
pg_restore -U postgres -d nustrade_db --clean backend/backups/<timestamp>/postgres.dump
```

### Restore MongoDB

```bash
mongorestore --uri="mongodb://localhost:27017" backend/backups/<timestamp>/mongo/
```

---

## Common Errors & Fixes

### `[env] FATAL — missing required env var: PG_HOST`

`.env` file is missing or not in the right place. Make sure `backend/.env` exists (not `Nustrade/.env`).

```bash
cd backend
cp .env.example .env
# then edit .env and fill in values
```

### `[postgres] FATAL — cannot connect: password authentication failed`

Wrong `PG_PASSWORD` in `.env`. Check with:
```bash
psql -U postgres -h localhost -d nustrade_db
```

### `[postgres] FATAL — cannot connect: database "nustrade_db" does not exist`

Database not created yet:
```bash
psql -U postgres -c "CREATE DATABASE nustrade_db;"
```

### `[mongo] FATAL — cannot connect: connect ECONNREFUSED 127.0.0.1:27017`

MongoDB is not running:
```bash
# macOS
brew services start mongodb-community@7.0

# Linux
sudo systemctl start mongod
```

### `[redis] startup ping failed: connect ECONNREFUSED 127.0.0.1:6379`

Redis is not running:
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis-server
```

### `Error: Cannot find module 'express'` or similar

Dependencies not installed:
```bash
cd backend
npm install
```

### `[migrate] FAILED 001_create_enums.sql: type "user_role" already exists`

Partial migration state. Reset (dev only — destroys data):
```bash
npm run db:reset
```

Or drop just the conflicting type manually in psql:
```sql
DROP TYPE user_role CASCADE;
```

### Uploads not loading in frontend (images broken)

Make sure `backend/uploads/` directory exists:
```bash
mkdir -p backend/uploads/avatars backend/uploads/listings
```

The backend serves uploads at `http://localhost:4000/uploads/...`. This path is set in `backend/src/app.js`.

### CORS error in browser console

In development, CORS is wide open (all origins allowed). If you see a CORS error in dev, it usually means the backend is not running. Check:
```bash
curl http://localhost:4000/health
```

---

## Security Notes

- Passwords: bcrypt with cost factor 12.
- Auth: JWT HS256, 7-day expiry. Logout invalidates token via Redis blocklist.
- Rate limiting: 5 req/15 min per IP on all auth endpoints; 60 req/min per user on POST endpoints.
- Email: Only `@nust.edu.pk` addresses accepted — enforced on the backend, not just the frontend.
- File uploads: MIME type + magic bytes checked, 5MB cap, max 8 images per listing.
- All SQL: parameterized queries only — no string concatenation with user input anywhere.
- Secrets: never committed — always in `.env` which is gitignored.

---

## Built With

- [Express](https://expressjs.com/) — web framework
- [node-postgres (pg)](https://node-postgres.com/) — PostgreSQL client
- [MongoDB Node.js Driver](https://www.mongodb.com/docs/drivers/node/current/) — MongoDB client
- [ioredis](https://github.com/redis/ioredis) — Redis client
- [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) — JWT
- [bcrypt](https://github.com/kelektiv/node.bcrypt.js) — password hashing
- [zod](https://zod.dev/) — request validation
- [multer](https://github.com/expressjs/multer) — file uploads
- [nodemailer](https://nodemailer.com/) — email
- [winston](https://github.com/winstonjs/winston) + [morgan](https://github.com/expressjs/morgan) — logging
- [helmet](https://helmetjs.github.io/) — security headers
