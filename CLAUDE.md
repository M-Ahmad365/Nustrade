# CLAUDE.md — NusTrade Backend

This file is the authoritative guide for Claude Code when working on this repository. Read it fully before making any changes. Never deviate from the rules in this file without explicit permission from the developer.

## Project Overview

**Name:** NusTrade
**Type:** Full-stack web application — a student-only marketplace for NUST Islamabad
**Think:** OLX or Dubizzle, but locked to verified @nust.edu.pk users only
**Academic context:** Final semester project for CS 236 (Advanced Database Management Systems) + Web Technologies course
**Built by:** Ahmad (Muhammad Ahmad, Reg: 502107, Class CS 14B) + one partner
**Team split:** Ahmad owns the **backend + databases**. Partner owns the **frontend + UI**. You are helping Ahmad, so your scope is backend only unless explicitly told otherwise.

## Ahmad's Scope (What You Work On)

You are responsible for:
- PostgreSQL schema, migrations, seed data
- MongoDB collection design
- Redis caching strategy and implementation
- Node.js + Express REST API
- All authentication and authorization logic
- File upload handling (images)
- Email sending (OTP verification, password reset)
- Query optimization (indexes, EXPLAIN plans, stored procedures)
- Security hardening (input validation, SQL injection prevention, rate limiting)
- Backup scripts
- Seed scripts for demo data

## Out of Scope (Never Touch Without Asking)

- `frontend/` directory — partner owns this entirely
- Frontend HTML/CSS/JS code
- Figma designs or design decisions
- Browser-side JavaScript
- Deployment of the frontend

If the user asks for anything frontend-related, politely remind them that is the partner's scope and ask if they want you to proceed anyway.

## Golden Rules

1. **Read SPECS.md fully before writing any code.** It contains every feature, endpoint, and requirement.
2. **Read SKILL.md fully before starting a new phase.** It contains the phase-by-phase build order.
3. **Never skip phases.** The build order in SKILL.md exists because later phases depend on earlier ones.
4. **Never invent features not in SPECS.md.** If a feature seems missing, ask the user first.
5. **Never use ORMs like Prisma or Sequelize.** Use raw SQL via the `pg` library. This is an ADBMS course — the professor wants to see real SQL.
6. **Never use TypeScript.** Plain Node.js with JavaScript only. Keeps the codebase readable for the professor and grader.
7. **Never commit secrets.** All secrets go in `.env`. `.env` must be in `.gitignore` from day one.
8. **Every SQL query that touches user input must be parameterized.** No string concatenation. Ever.
9. **Every endpoint must validate inputs before touching the database.** Use a validation layer.
10. **Every protected endpoint must check JWT + role before executing.** No exceptions.
11. **Write clean, commented code.** The professor reads the code. Comments explain *why*, not *what*.
12. **After every significant change, update the relevant SPECS.md or SKILL.md section.** Keep docs in sync.

## Tech Stack (Locked — Do Not Change)

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Framework | Express | 4.x |
| SQL Database | PostgreSQL | 16 |
| NoSQL Database | MongoDB | 7 |
| Cache | Redis | 7 |
| SQL Client | `pg` (node-postgres) | latest |
| Mongo Client | `mongodb` (official driver) | latest |
| Redis Client | `ioredis` | latest |
| Auth | `jsonwebtoken` + `bcrypt` | latest |
| Validation | `zod` | latest |
| File Upload | `multer` | latest |
| Email | `nodemailer` with Gmail SMTP (for dev) | latest |
| Env Management | `dotenv` | latest |
| Logging | `morgan` + `winston` | latest |
| Rate Limiting | `express-rate-limit` + Redis store | latest |
| Dev Tooling | `nodemon` | latest |

**Do NOT add:**
- Prisma, Sequelize, TypeORM, Knex, or any ORM
- TypeScript or any compilation step
- GraphQL
- Socket.io or any WebSocket library (use polling for chat — simpler, works fine for demo)
- React, Vue, or any frontend framework
- Docker (keep it simple — run locally)

## Folder Structure (Enforce Strictly)

```
nustrade/
├── backend/
│   ├── src/
│   │   ├── config/              # DB connections, env loading
│   │   │   ├── postgres.js
│   │   │   ├── mongo.js
│   │   │   ├── redis.js
│   │   │   └── env.js
│   │   ├── middleware/          # auth, validation, rate limiting, errors
│   │   │   ├── auth.js
│   │   │   ├── validate.js
│   │   │   ├── rateLimit.js
│   │   │   └── errorHandler.js
│   │   ├── routes/              # Express routers, one file per resource
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── listings.js
│   │   │   ├── offers.js
│   │   │   ├── chat.js
│   │   │   ├── reviews.js
│   │   │   ├── notifications.js
│   │   │   ├── wishlist.js
│   │   │   ├── analytics.js
│   │   │   └── admin.js
│   │   ├── controllers/         # Request handlers (business logic)
│   │   │   └── <one file per route file>
│   │   ├── services/            # Pure business logic, DB-agnostic where possible
│   │   │   └── <domain services>
│   │   ├── db/
│   │   │   ├── migrations/      # Numbered SQL migration files
│   │   │   ├── seeds/           # Seed data scripts
│   │   │   └── queries/         # Reusable SQL queries (one file per domain)
│   │   ├── utils/               # Helpers (email, OTP, hashing, etc.)
│   │   ├── validators/          # Zod schemas for request validation
│   │   └── app.js               # Express app setup
│   ├── uploads/                 # Uploaded images (gitignored except for .gitkeep)
│   ├── scripts/                 # Backup, restore, migrate scripts
│   ├── tests/                   # Postman collection, integration tests
│   ├── .env.example             # Template for .env
│   ├── .gitignore
│   ├── package.json
│   ├── server.js                # Entry point
│   └── README.md
├── frontend/                    # Partner's scope — DO NOT TOUCH
├── docs/
│   ├── CLAUDE.md                # This file
│   ├── SPECS.md                 # Full product spec
│   ├── SKILL.md                 # Build order guide
│   ├── ERD.png                  # Database diagram
│   └── api-postman.json         # Postman collection
└── README.md                    # Project root readme
```

## Coding Conventions

### General
- Use `const` unless reassignment is needed. Never use `var`.
- Async/await everywhere. No raw promises or callbacks in new code.
- One export per file. Use named exports, not default exports.
- File names: `camelCase.js` for code, `UPPER_CASE.md` for docs, `snake_case.sql` for SQL files.
- Variable names: `camelCase`. Constants: `UPPER_SNAKE_CASE`. Classes: `PascalCase`.
- Database column names: `snake_case`. JavaScript field names: `camelCase`. Convert at the boundary.

### Error Handling
- All async route handlers must be wrapped with a `asyncHandler` utility that passes errors to Express error middleware.
- Never send raw error messages or stack traces to the client. Log them, return a sanitized message.
- Use standard HTTP status codes correctly:
  - 200 OK for successful GET/PUT
  - 201 Created for successful POST
  - 204 No Content for successful DELETE
  - 400 Bad Request for validation errors
  - 401 Unauthorized for missing/invalid auth
  - 403 Forbidden for auth present but not permitted
  - 404 Not Found for missing resources
  - 409 Conflict for duplicate resources
  - 422 Unprocessable Entity for business logic errors
  - 429 Too Many Requests for rate limits
  - 500 Internal Server Error for unexpected errors

### API Response Format
Every response must follow this shape:
```json
{
  "success": true,
  "data": { ... },
  "message": "optional human-readable message"
}
```
For errors:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

### SQL Conventions
- All queries go in `src/db/queries/<domain>.js` as exported async functions.
- Use parameterized queries: `pool.query('SELECT * FROM users WHERE id = $1', [userId])`.
- Never build SQL with template literals containing user input.
- Use transactions for any multi-statement operation that must be atomic.
- Write indexes as part of the same migration that creates the table.
- Every foreign key must have `ON DELETE` behavior explicitly specified.
- Every timestamp column uses `TIMESTAMPTZ` (never `TIMESTAMP` without timezone).
- Every table has `created_at` and `updated_at` columns.
- `updated_at` is maintained by a trigger (see SPECS.md section on triggers).

### MongoDB Conventions
- Collection names are plural and snake_case: `chat_messages`, `notifications`.
- Every document has `createdAt` and `updatedAt` fields (managed in code).
- Use `ObjectId` for internal IDs, but always store the related Postgres `user_id` or `listing_id` as a numeric field alongside.
- Create indexes in `src/config/mongo.js` on startup.

### Redis Conventions
- Key format: `namespace:entity:id:field` — e.g. `user:session:42`, `listing:trending:24h`, `user:unread_count:42`.
- Always set a TTL. No infinite keys except deliberate caches.
- Document every key pattern in SPECS.md's Redis section.

### Logging
- Use `winston` for app logs.
- Every incoming request logged with `morgan` in `combined` format in production, `dev` format in development.
- Never log passwords, tokens, or OTPs.
- Log database errors with full context. Log request errors with method, path, userId (if available), and status code.

### Comments
- Comment *why*, not *what*. Good: `// Use SERIALIZABLE isolation because concurrent offers on the same listing can cause phantom reads`. Bad: `// Start a transaction`.
- Every complex SQL query gets a comment explaining its purpose.
- Every stored procedure and trigger gets a block comment at the top.
- Every route handler has a JSDoc-style comment with method, path, and brief description.

## Security Non-Negotiables

- Passwords hashed with bcrypt, cost factor 12.
- JWTs signed with HS256, secret from env, expiry 7 days (access) — no refresh tokens for MVP.
- Rate limit all auth endpoints: 5 requests per 15 minutes per IP for login/signup/OTP.
- Rate limit all POST endpoints: 60 requests per minute per user.
- Validate every input against a Zod schema. Reject unknown fields (strict mode).
- Sanitize file uploads: check MIME type AND file magic bytes, cap at 5MB per image, max 8 images per listing.
- Never trust client-provided user IDs — always derive from JWT.
- CORS: explicit allowlist only. No wildcards in production.
- Set standard security headers via `helmet`.
- Email addresses must match `/^[a-zA-Z0-9._%+-]+@nust\.edu\.pk$/` — rejected on backend, not just frontend.

## Database Philosophy

This is an ADBMS course project — the databases are the centerpiece. Make them shine:

1. **PostgreSQL is the source of truth** for all structured relational data. Everything with a relationship, transaction, or integrity requirement goes here.
2. **MongoDB handles unstructured, high-volume, or variable-shape data** — chat, notifications, activity logs, view history.
3. **Redis handles ephemeral, fast-access data** — sessions, counters, trending lists, rate limit counters, search autocomplete.

The choice of which DB to use must be defensible in the report. If you find yourself putting relational data in Mongo or unstructured data in Postgres, stop and reconsider.

## When to Ask the User

Ask the user before proceeding if:
- A requirement in SPECS.md seems ambiguous or contradictory.
- You need to add a new dependency not in the stack above.
- You need to change the folder structure.
- You hit a design decision not covered in SPECS.md (e.g., "should expired listings be soft-deleted or hard-deleted?").
- An operation requires destroying data (dropping tables, wiping collections).
- The user's request contradicts a rule in this file.

Do NOT ask the user for every tiny decision. Use judgment. But for the above categories, always ask.

## Communication Style with Ahmad

Ahmad prefers:
- Direct, practical guidance — no fluff, no filler.
- Clean code over verbose code.
- Working features over perfect features.
- Explanations in Hinglish when discussing casually, English when discussing technical specs.
- Visual/hands-on learning — show, don't just tell. When explaining a concept, trace through an example.

When you finish a task, report what you did, what you changed, and what the next step is. Do not report unrelated observations unless they are blockers.

## Definition of Done (for any task)

A task is "done" when:
1. Code is written, commented, and committed (or ready to commit).
2. Manual testing via curl or Postman passes for the happy path and at least two error cases.
3. Relevant migration runs successfully from scratch on a fresh database.
4. No console errors or warnings on server startup.
5. SPECS.md and/or SKILL.md are updated if the task changed any spec or step.

## Final Reminder

You are helping Ahmad build the backend of a real-world-quality marketplace as a course project. The goal is:
- **Full marks on the ADBMS rubric** — schema design, query optimization, transactions, security, backup, analytics.
- **Full marks on the Web Tech rubric** — clean API, good structure, works end-to-end with the frontend.
- **A demo video worth watching** — every feature should work, every query should be fast, every page should load.

Hold this bar. If something won't be good enough for a senior engineer's code review, redo it.
