# SKILL.md — NUST Markaz Build Guide

This is the operational playbook for Claude Code. It defines the exact order to build the backend in, with concrete deliverables for each phase. Follow phases in order. Do not skip. Do not start phase N+1 until phase N's "Definition of Done" is met.

**Before you begin any phase:** re-read CLAUDE.md and the relevant section of SPECS.md.

---

## Phase 0 — Repo Setup (Day 1, ~2 hours)

### Goal
Empty, well-configured Node.js repo with all dependencies installed, env template ready, folder structure in place.

### Steps
1. Initialize repo: `npm init -y`, set name to `nust-markaz-backend`, version to `0.1.0`.
2. Install production deps:
   ```
   npm install express pg mongodb ioredis jsonwebtoken bcrypt zod multer nodemailer dotenv morgan winston express-rate-limit rate-limit-redis helmet cors uuid
   ```
3. Install dev deps:
   ```
   npm install --save-dev nodemon
   ```
4. Create the folder structure as specified in CLAUDE.md.
5. Create `.gitignore` — must include `node_modules/`, `.env`, `uploads/` (but keep `.gitkeep`), `backups/`, `*.log`.
6. Create `.env.example` with every variable:
   ```
   NODE_ENV=development
   PORT=4000
   PG_HOST=localhost
   PG_PORT=5432
   PG_DB=nust_markaz
   PG_USER=postgres
   PG_PASSWORD=
   MONGO_URI=mongodb://localhost:27017/nust_markaz
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=change-me-to-a-long-random-string
   JWT_EXPIRY=7d
   BCRYPT_ROUNDS=12
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=
   SMTP_PASSWORD=
   SMTP_FROM="NUST Markaz <no-reply@example.com>"
   UPLOAD_DIR=./uploads
   MAX_UPLOAD_SIZE=5242880
   CORS_ORIGIN=http://localhost:5173
   ```
7. Create `package.json` scripts:
   ```json
   {
     "start": "node server.js",
     "dev": "nodemon server.js",
     "db:migrate": "node src/db/migrate.js",
     "db:seed": "node src/db/seed.js",
     "db:reset": "node src/db/reset.js",
     "backup": "node scripts/backup.js"
   }
   ```
8. Create `server.js` (entry point) and `src/app.js` (Express app) with minimal setup — just enough for `GET /health` to return 200.
9. Write a `README.md` at the repo root with: project overview, prerequisites (Node 20, Postgres 16, Mongo 7, Redis 7), installation, env setup, running, and migration commands.

### Definition of Done
- `npm run dev` starts the server without errors.
- `GET http://localhost:4000/health` returns `{"success":true,"data":{"status":"ok"}}`.
- `.env.example` exists and is committed. `.env` is gitignored.
- Folder structure matches CLAUDE.md.

---

## Phase 1 — Database Foundation (Days 2-3, ~6 hours)

### Goal
All three databases connected. Postgres schema fully migrated. Initial seed of categories loaded.

### Steps

**1. Postgres connection (`src/config/postgres.js`):**
- Create a connection pool using `pg.Pool`
- Export a `query(text, params)` helper that wraps `pool.query`
- Export a `getClient()` helper that returns a client for transactions (caller must release)
- On startup, run a `SELECT 1` to verify connectivity — log failure loudly, exit process

**2. MongoDB connection (`src/config/mongo.js`):**
- Use the official `mongodb` driver
- Export `getDb()` that returns the database handle
- On startup, connect, create indexes for all collections listed in SPECS.md section 4.3
- Log success/failure

**3. Redis connection (`src/config/redis.js`):**
- Use `ioredis`
- Export the client instance
- On startup, ping Redis
- Handle reconnection gracefully

**4. Migration system (`src/db/migrate.js`):**
- Read all `.sql` files in `src/db/migrations/` sorted by filename
- Keep a `schema_migrations` table with `version, run_at`
- Only run migrations not already recorded
- Run inside a transaction per file
- Log each migration applied

**5. Write migrations in order:**
- `001_create_enums.sql` — all ENUM types
- `002_create_users.sql` — users table + indexes + updated_at trigger
- `003_create_categories.sql` — categories table
- `004_create_listings.sql` — listings + indexes + search_vector trigger
- `005_create_listing_images.sql`
- `006_create_listing_tags.sql`
- `007_create_offers.sql`
- `008_create_transactions.sql`
- `009_create_reviews.sql` + recalculate_user_rating trigger
- `010_create_wishlist.sql`
- `011_create_saved_searches.sql`
- `012_create_reports.sql`
- `013_create_procedures.sql` — complete_transaction stored procedure
- `014_seed_categories.sql` — insert the 9 categories (idempotent via `ON CONFLICT DO NOTHING`)

**6. Reset script (`src/db/reset.js`):**
- Drops and recreates the database (only runs if `NODE_ENV !== 'production'`)
- Useful during development

### Definition of Done
- `npm run db:migrate` runs cleanly on an empty database.
- `psql` shows all tables, all indexes, all triggers.
- `categories` table has 9 rows.
- Mongo connection works and indexes are created.
- Redis connection works.

---

## Phase 2 — Core Infrastructure (Days 4-5, ~8 hours)

### Goal
All middleware, utilities, and patterns that every feature will depend on.

### Steps

**1. Error handling (`src/middleware/errorHandler.js`):**
- Central error handler
- Define an `AppError` class with `statusCode`, `code`, `message`, `details`
- Handle Zod validation errors — return 400 with readable details
- Handle pg errors (unique violation → 409, foreign key → 400)
- Handle JWT errors — return 401
- Fall through to 500 with generic message (never leak stack traces)
- `asyncHandler` wrapper function to catch async errors

**2. Response helpers (`src/utils/response.js`):**
- `ok(res, data, message)` → 200/201
- `created(res, data)` → 201
- `noContent(res)` → 204
- All use the envelope format from CLAUDE.md

**3. Validation (`src/middleware/validate.js`):**
- Takes a Zod schema + source (`body`, `query`, `params`)
- Validates and replaces req[source] with parsed data
- On failure, calls next with AppError 400

**4. Auth middleware (`src/middleware/auth.js`):**
- `authenticate` — require valid JWT, check revocation in Redis, load user from DB, attach to req.user
- `requireVerified` — runs after authenticate, rejects if email_verified = false
- `requireAdmin` — runs after authenticate, rejects if role != 'admin'
- `requireOwner(getResourceOwnerId)` — factory that checks req.user.user_id matches the resource owner

**5. Rate limiting (`src/middleware/rateLimit.js`):**
- Use `express-rate-limit` with `rate-limit-redis` store
- Factory: `makeRateLimit({ windowMs, max, keyFn })`
- Preset limiters: `authLimiter` (5/15min by IP), `postLimiter` (60/min by user), `chatLimiter` (30/min by user)

**6. File upload (`src/middleware/upload.js`):**
- Multer config for image uploads
- Validate MIME type AND magic bytes (use `file-type` package or manual buffer check)
- Max 5MB per file
- Generate unique filenames with UUIDs
- Store in `/uploads/{type}/{entityId}/`

**7. Email utility (`src/utils/email.js`):**
- Nodemailer with SMTP from env
- `sendOtpEmail(to, otp)` — styled HTML template
- `sendPasswordResetEmail(to, otp)` — styled HTML
- In dev mode (NODE_ENV=development), log emails to console instead of sending

**8. OTP utility (`src/utils/otp.js`):**
- `generateOtp()` — returns 6-digit string
- `storeOtp(key, otp, ttlSeconds)` — stores in Redis
- `verifyOtp(key, otp)` — checks and deletes on match

**9. Password utility (`src/utils/password.js`):**
- `hashPassword(plain)` — bcrypt cost from env
- `verifyPassword(plain, hash)`

**10. JWT utility (`src/utils/jwt.js`):**
- `signToken(payload)` — signs with JTI, adds expiry
- `verifyToken(token)` — returns payload or throws
- `revokeToken(jti, expiryMs)` — adds to Redis set

**11. Logger (`src/utils/logger.js`):**
- Winston with console + file transports
- Levels: debug, info, warn, error
- JSON format in production, pretty in development

**12. Request logger:**
- Morgan middleware in `app.js`, format based on NODE_ENV

**13. Helmet + CORS in `app.js`:**
- Helmet defaults
- CORS with allowlist from env

### Definition of Done
- All middleware and utilities exist and are tested individually.
- `app.js` imports and uses: helmet, cors, morgan, body parser, the error handler.
- A dummy route that throws a validation error returns the proper envelope.
- A dummy rate-limited route returns 429 after exceeding the limit.

---

## Phase 3 — Authentication (Days 6-7, ~8 hours)

### Goal
Complete auth flow: signup → OTP → verify → login → forgot/reset/change password → logout.

### Steps

**1. Validators (`src/validators/auth.js`):**
- `signupSchema` — email (regex), password (min 8, 1 upper, 1 digit), full_name, department, semester, residence_type, hostel_name (conditional), phone_number (optional)
- `loginSchema` — email, password
- `otpSchema` — email, otp (6 digits)
- `forgotPasswordSchema` — email
- `resetPasswordSchema` — email, otp, new_password
- `changePasswordSchema` — current_password, new_password

**2. Auth queries (`src/db/queries/auth.js`):**
- `createUser(userData)` — inserts + returns user
- `findUserByEmail(email)` — for login
- `findUserById(userId)` — for JWT middleware
- `verifyEmail(userId)` — sets email_verified=true
- `updatePassword(userId, passwordHash)`

**3. Auth controller (`src/controllers/auth.js`):**
- All endpoints from SPECS section 5.1
- Business logic: generate OTP, store in Redis, send email, create/verify user, issue JWT
- On successful signup, create user with email_verified=false

**4. Auth routes (`src/routes/auth.js`):**
- Apply `authLimiter` to all endpoints
- Wire controller functions

**5. Mount auth routes in `app.js`**

**6. Manual testing checklist:**
- Signup with valid nust.edu.pk email → 201 + OTP logged
- Signup with non-nust email → 400
- Signup with duplicate email → 409
- Verify OTP → returns JWT
- Login without verification → 403 with EMAIL_NOT_VERIFIED
- Login with wrong password → 401
- Login with right password → 200 + JWT
- Forgot password → OTP sent (even if email doesn't exist — no enumeration)
- Reset password → works, old password no longer works
- Change password → works, requires current password
- Logout → token revoked, subsequent requests with same token get 401

### Definition of Done
- All 8 auth endpoints work per Postman.
- Rate limiting triggers on repeated auth attempts.
- OTP expires after 10 minutes.
- JWT revocation actually invalidates tokens.
- Email HTML looks clean when inspected.

---

## Phase 4 — User Profiles (Day 8, ~4 hours)

### Goal
All user profile endpoints in SPECS section 5.2.

### Steps

1. Validators for profile update
2. Queries in `src/db/queries/users.js`
3. Controllers and routes
4. Profile picture upload endpoint with multer
5. Public profile endpoint excludes sensitive fields (email, phone, password_hash)
6. Deactivation sets `is_active=false` AND sets all user's active listings to `deleted_by_user`

### Definition of Done
- All endpoints in SPECS 5.2 work.
- Public profile never leaks email or phone.
- Profile picture uploads correctly, old picture deleted on replacement.

---

## Phase 5 — Listings (Days 9-11, ~10 hours)

### Goal
Complete listings CRUD + search + filters + boost.

### Steps

**1. Validators** for create, update, search filters.

**2. Queries (`src/db/queries/listings.js`):**
- `createListing`, `updateListing`, `deleteListing` (soft)
- `getListingById` with seller info via JOIN
- `getListings(filters, sort, page, limit)` — the big one, build SQL dynamically but SAFELY (whitelist columns/operators, parameterize values)
- `incrementViewCount(listingId)` — atomic
- `searchListings(query, filters)` — uses tsquery
- `addImage`, `removeImage`
- `boostListing`
- `expireListings()` — for cron

**3. Controllers and routes** for SPECS 5.3.

**4. Image upload flow:**
- Create listing record first to get ID
- Upload images to `/uploads/listings/{id}/`
- Insert rows in `listing_images`
- Return complete listing with image URLs

**5. View tracking:**
- On GET /listings/:id, check Redis key `view:{listing_id}:{user_id}`
- If absent, increment view_count in Postgres + log to Mongo + set Redis key with 1hr TTL

**6. Trending cache (`src/services/trending.js`):**
- Function that queries top 10 most-viewed in last 24h from Mongo `listing_views`
- Writes to Redis sorted set `trending:24h`
- Called on startup + every 15 min via `setInterval` (for MVP, use node-cron later)

**7. Listing expiry cron:**
- Use `setInterval` or `node-cron` (add to deps if needed)
- Runs hourly, sets expired listings, creates notifications for expiring ones

### Definition of Done
- All 11 listing endpoints work.
- Search returns relevant results with expected ranking.
- Filters combine correctly (category + price range + condition + hostel).
- Sort options all work.
- View dedup works (same user viewing same listing twice within an hour increments only once).
- Trending endpoint returns cached results in <10ms.

---

## Phase 6 — Offers & Transactions (Days 12-13, ~8 hours)

### Goal
Offer flow (create, accept, reject, counter, cancel, expire) and transaction flow (confirm, complete, cancel, dispute).

### Steps

**1. Offers:**
- Validators, queries, controller, routes
- Critical: accept-offer must be transactional:
  ```sql
  BEGIN;
    UPDATE offers SET status='accepted', responded_at=NOW() WHERE offer_id=$1;
    UPDATE listings SET status='reserved' WHERE listing_id=$2;
    UPDATE offers SET status='rejected', responded_at=NOW() WHERE listing_id=$2 AND status='pending' AND offer_id!=$1;
    INSERT INTO transactions (listing_id, offer_id, buyer_id, seller_id, agreed_price, status) VALUES (...);
  COMMIT;
  ```
- Counter-offer: close original, create new offer with reversed buyer/seller framing
- Expiry cron: set expired offers

**2. Transactions:**
- Validators, queries, controller, routes
- Confirm-buyer / confirm-seller set respective timestamps
- When both set, call `complete_transaction` stored procedure
- Dispute sets status + creates notification to admin

**3. Notifications in both flows:**
- Every state change creates a notification in Mongo
- Increments Redis unread count

### Definition of Done
- Offer flow end-to-end works.
- Accepting offer atomically updates all related rows.
- Transaction completion requires BOTH confirmations.
- Disputes notify admin.

---

## Phase 7 — Chat (Days 14-15, ~6 hours)

### Goal
Real-time-feel chat via polling.

### Steps

**1. Thread and message services using MongoDB:**
- `getOrCreateThread(buyerId, sellerId, listingId)` — thread_id is deterministic composite
- `sendMessage(threadId, senderId, content, imageUrl)` — inserts message + updates thread's last_message_*
- `getMessages(threadId, since?)` — returns messages after given timestamp
- `markRead(threadId, userId)` — sets read_by_recipient_at on unread messages + clears Redis unread

**2. Routes in SPECS 5.6**

**3. Image upload for chat:**
- Multer endpoint accepts image, returns URL
- URL passed in send-message body

**4. Unread counting via Redis:**
- On new message: INCR `chat:unread:{recipient}:{thread}` and `chat:unread_total:{recipient}`
- On mark-read: SET to 0

**5. Rate limit:** 30 messages per minute per user.

### Definition of Done
- Users can start chat from a listing
- Messages persist in Mongo
- Polling with ?since= works correctly
- Unread counts update
- Cannot start/message a chat for a listing you don't own when not verified

---

## Phase 8 — Reviews, Wishlist, Saved Searches (Day 16, ~4 hours)

### Goal
Section 3.9 + 3.11 + 3.12 features.

### Steps
- Reviews: validator + queries + controller + routes. Enforce transaction completion. Trigger auto-updates user rating.
- Wishlist: simple CRUD.
- Saved searches: simple CRUD + a background job that checks matches daily (just stub for now, can run manually).

### Definition of Done
- Reviews work only after transaction completed
- Editing review after 7 days returns 422
- Wishlist add/remove works
- Saved search persists filters correctly

---

## Phase 9 — Notifications (Day 17, ~3 hours)

### Goal
Mongo-backed notifications system that every other feature writes to.

### Steps

1. Create a central `notify(userId, type, payload)` service function
2. Go back through Phases 5, 6, 7, 8 and wire `notify(...)` calls at every state change listed in SPECS 3.10
3. Endpoints for list, unread-count, mark-read, mark-all-read
4. Redis counter stays in sync with actual DB state

### Definition of Done
- Every action that should notify actually does
- Unread count is accurate
- Listing expiry creates notifications for the seller
- Wishlist price drop creates notifications for all wishlist owners

---

## Phase 10 — Admin & Analytics (Days 18-19, ~6 hours)

### Goal
Admin panel APIs + full analytics dashboard.

### Steps

**1. Admin endpoints from SPECS 5.10**

**2. Analytics service (`src/services/analytics.js`):**
- Each metric is its own function
- Queries use CTEs, window functions, aggregations where appropriate
- Results cached in Redis with 10-min TTL
- `getDashboard()` aggregates all metrics into one response

**3. Report queries:**
- Listings by category (use GROUP BY)
- Listings by hostel (GROUP BY)
- Top sellers by sales count (ORDER BY + LIMIT)
- Top sellers by revenue (JOIN transactions, SUM)
- User signup trend (DATE_TRUNC + COUNT over dates)
- Average time to sale (AVG of completed_at - posted_at)
- Completion rate (completed / total transactions)
- Price history per course code (WINDOW function ordering by date)

**4. Backup endpoint:**
- Shells out to `pg_dump` and `mongodump`
- Writes to `backups/{timestamp}/`
- Returns the file paths

### Definition of Done
- Admin can ban/unban users
- Admin can remove listings
- Dashboard returns all metrics with good performance
- Backup endpoint produces valid dumps

---

## Phase 11 — Hardening & Optimization (Day 20, ~4 hours)

### Goal
Production-ready polish.

### Steps

1. Run `EXPLAIN ANALYZE` on every query in the dashboard + search + home feed. Document in comments. Add indexes where needed.
2. Load-test the top 10 endpoints with `autocannon` (add as dev dep). Aim for 100 req/s on the home feed.
3. Security pass:
   - Confirm all inputs are validated
   - Confirm all queries are parameterized (`grep -r "query.*${" src/` should find nothing)
   - Confirm all protected endpoints have auth middleware
   - Confirm file uploads are size- and type-checked
   - Confirm CORS is set correctly
4. Write Postman collection with every endpoint + example requests. Save to `docs/api-postman.json`.
5. Write a `scripts/backup.js` that runs pg_dump + mongodump automatically.
6. Write docstring comments on all stored procedures and triggers.
7. Final README pass — ensure setup instructions work on a clean machine.

### Definition of Done
- All queries documented with EXPLAIN output in comments
- Postman collection exported and committed
- No un-parameterized queries anywhere
- README works for a fresh dev machine

---

## Phase 12 — Demo Prep (Day 21, ~3 hours)

### Goal
Ready to demo to Dr. Ayesha.

### Steps

1. Run `npm run db:reset && npm run db:migrate && npm run db:seed` to confirm clean rebuild.
2. Record demo flow checklist:
   - Signup with fake @nust.edu.pk
   - OTP verification
   - Login
   - Browse home feed
   - Filter by category + price
   - Search for "CS-236"
   - Open a listing, view images
   - Make an offer
   - (As seller) See offer, accept
   - Chat between buyer and seller
   - Confirm transaction (both sides)
   - Leave review
   - View updated rating on profile
   - (As admin) See analytics dashboard
   - (As admin) Trigger backup
3. Prepare 3 screenshots of EXPLAIN ANALYZE output for the report
4. Prepare a short note on challenges faced for the report section

### Definition of Done
- Clean rebuild from scratch works
- Demo flow works end-to-end without bugs
- You can explain every architectural choice in 30 seconds

---

## Integration Checkpoints with Frontend Partner

Your partner works on frontend in parallel. Sync every 2 days:

- **After Phase 3:** Partner can start login/signup UI against real auth APIs
- **After Phase 5:** Partner can build home feed, listing detail, create listing forms
- **After Phase 6:** Partner can build offer flow UI
- **After Phase 7:** Partner can build chat UI
- **After Phase 10:** Partner can build admin dashboard

Agree on API contract during Phase 2 so frontend work isn't blocked.

---

## Common Pitfalls to Avoid

1. **Don't skip migrations and just write to DB directly.** Every schema change goes through a migration file.
2. **Don't store user input in SQL via template literals.** Always parameterize.
3. **Don't forget to release pg clients** after using `getClient()` for transactions. Use `try/finally`.
4. **Don't cache sensitive data in Redis** without thinking about invalidation (ban a user → clear their profile cache).
5. **Don't forget ON DELETE CASCADE vs RESTRICT** — think about each foreign key deliberately. Transactions should RESTRICT to prevent accidental history loss.
6. **Don't make the frontend's job hard.** Return data in shapes that are easy to render. Include related entities (seller name, listing image URL) in the same response when it makes sense.
7. **Don't skip EXPLAIN ANALYZE** on the analytics queries. The professor will read them. Indexes matter.
8. **Don't write WebSocket code.** Polling is fine for demo and keeps things simple.

---

## Daily Habits

- Pull latest code before starting
- Create a branch for each phase: `git checkout -b phase-3-auth`
- Commit in small, logical chunks
- Push end-of-day
- Update this SKILL.md if you learn something that changes the plan
- Ask Ahmad before any destructive operation (drop table, wipe collection, delete files)

---

## When You're Stuck

1. Re-read SPECS.md section for the feature
2. Re-read CLAUDE.md for conventions
3. Check if Postgres error codes reveal the issue
4. Check logs (`winston` output)
5. If still stuck, document what you tried and ask Ahmad

---

End of SKILL.md. Follow the phases in order. Deliver excellence.
