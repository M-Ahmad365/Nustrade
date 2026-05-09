# SPECS.md — NUST Markaz Complete Specification

This is the authoritative product and technical specification for NUST Markaz. Every feature, every table, every endpoint, every rule is defined here. If something is not in this document, it is not in scope.

Version: 1.0
Owner: Ahmad (backend)
Read this file fully before writing any code.

---

## 1. Product Summary

**NUST Markaz** is a verified, student-only marketplace exclusively for NUST Islamabad. Students can list items for sale (textbooks, electronics, furniture, bikes, clothing, hostel essentials, etc.), browse listings from other verified students, make offers, chat with sellers, arrange safe campus meetups, complete transactions, and leave reviews.

The product is NOT a general-purpose marketplace. It is a hyper-local, trust-first platform where every user is a verified member of the same institution. This constraint is the entire product differentiator.

### 1.1 Target Users
- Current NUST Islamabad students (undergraduate + graduate)
- Both hostellites and day scholars
- Any department: SEECS, NBS, S3H, SMME, SCEE, SCME, SNS, ASAB, IESE

### 1.2 Access Restriction
- Signup is restricted to email addresses matching the regex: `/^[a-zA-Z0-9._%+-]+@nust\.edu\.pk$/`
- Email verification via OTP is mandatory before the first listing can be created.
- No listing creation, offer submission, or chat initiation is allowed for unverified accounts.

---

## 2. User Types & Profile Data

Every user has a single role: `student`. There is also `admin` for platform moderators (created manually via seed script, not signup).

A student can be both a seller and a buyer simultaneously — no role lock.

### 2.1 Profile Fields

Collected at signup:
- `email` — must end in @nust.edu.pk, unique
- `password` — min 8 chars, 1 uppercase, 1 digit
- `full_name` — min 3 chars, max 100
- `department` — enum (see 2.2)
- `semester` — integer 1-10
- `residence_type` — enum: `hostellite` | `day_scholar`
- `hostel_name` — required if residence_type is hostellite, null otherwise (enum, see 2.3)
- `phone_number` — optional, Pakistani format (+92 or 0 prefix, 10 digits after)
- `profile_picture_url` — optional, set later

Derived/system fields:
- `user_id` — serial primary key
- `email_verified` — boolean, default false
- `created_at`, `updated_at` — timestamps
- `is_banned` — boolean, default false (admin-controlled)
- `is_active` — boolean, default true (soft-delete flag)
- `bio` — optional, max 300 chars, set later
- `aggregate_rating` — calculated from reviews (materialized as a column, refreshed on review insert/update)
- `total_reviews` — count of reviews received
- `total_sales` — count of completed sales as seller
- `total_purchases` — count of completed purchases as buyer

### 2.2 Department Enum
```
SEECS  -- School of Electrical Engineering and Computer Science
NBS    -- NUST Business School
S3H    -- School of Social Sciences & Humanities
SMME   -- School of Mechanical & Manufacturing Engineering
SCEE   -- School of Civil & Environmental Engineering
SCME   -- School of Chemical & Materials Engineering
SNS    -- School of Natural Sciences
ASAB   -- Atta-ur-Rahman School of Applied Biosciences
IESE   -- Institute of Environmental Sciences & Engineering
NICE   -- NUST Institute of Civil Engineering
NIT    -- NUST Institute of Transportation
MCS    -- Military College of Signals
EME    -- College of Electrical & Mechanical Engineering
OTHER  -- catch-all for any school we missed
```

### 2.3 Hostel Enum (NUST Islamabad — H-12 campus)
Boys' hostels: H1, H2, H3, H4, H5, H6, H7, H8, H9, H10, H11, H12, H13
Girls' hostels: G1, G2, G3, G4, G5, G6, G7, G8
Stored as free text from a fixed list, validated against the enum at the app level. (We do not enforce gender-hostel matching — that's the student's own knowledge.)

---

## 3. Functional Requirements

### 3.1 Authentication
- **Signup:** User submits all required fields. Backend validates, hashes password (bcrypt cost 12), creates user record with `email_verified=false`, generates 6-digit OTP, stores OTP in Redis with 10-min TTL (key: `otp:signup:{email}`), sends OTP via email. Returns 201 with a message to check email.
- **Verify OTP:** User submits email + OTP. Backend checks Redis, marks `email_verified=true` on match, deletes OTP key, returns JWT.
- **Resend OTP:** Rate-limited to 1 request per minute. Generates new OTP, overwrites Redis key.
- **Login:** Email + password. If email not verified, return 403 with `EMAIL_NOT_VERIFIED` code (frontend redirects to OTP page). If verified, return JWT.
- **Forgot Password:** User submits email. If account exists and verified, generate 6-digit OTP stored at `otp:reset:{email}` with 10-min TTL, email it. Return generic "if the account exists, email sent" message (no enumeration).
- **Reset Password:** User submits email + OTP + new password. Validate OTP, update password, invalidate all existing sessions for that user (add `user_id` to Redis `revoked_sessions:{user_id}` with TTL matching JWT expiry).
- **Logout:** Client discards JWT. Server adds the JWT's `jti` (JWT ID) to a Redis revocation set with TTL matching the token's remaining lifetime.
- **Session Check Middleware:** On every protected request, decode JWT, check if `jti` is in revocation set, check if `is_banned=false` and `is_active=true` on the user record, attach user to `req.user`.

### 3.2 Profile Management
- View own profile — full detail
- View another user's public profile — name, department, semester, hostel (if hostellite), rating, review count, total sales, join date, bio, active listings
- Edit own profile — name, department, semester, residence_type, hostel_name, phone, bio, profile picture
- Change password (requires current password)
- Delete own account — sets `is_active=false`, hides all user's active listings (status → `deleted_by_user`), does not delete historical transactions or reviews

### 3.3 Listings

A listing represents an item for sale.

**Create Listing:**
- Required: title (5-100 chars), description (20-2000 chars), category (enum), condition (enum), price (PKR, integer, 0-10,000,000), is_negotiable (boolean), location_hostel or `off_campus`, at least 1 image, max 8 images
- Optional: tags (free text array, max 10 tags, each 1-30 chars), course_code (e.g., "CS-236", useful for textbooks)
- System-set: status=`active`, posted_at, expires_at (posted_at + 30 days), view_count=0, seller_id from JWT
- Only verified users can create listings
- Images are uploaded to `/uploads/listings/{listing_id}/` — the folder is created after the listing record is inserted so we have an ID

**Edit Listing (seller only):**
- Can edit: title, description, price, is_negotiable, tags, course_code, location_hostel, condition
- Cannot edit: category (too messy for analytics), images (requires separate endpoint — see below), status
- Editing a listing with active offers does NOT invalidate those offers — the buyer can see the change history and cancel if needed

**Add/Remove Images:**
- Separate endpoints for adding and removing images
- Cannot reduce below 1 image

**Delete Listing (seller only):**
- Sets status=`deleted_by_user`
- Physically deletes image files
- Cannot delete if there's an accepted offer in `reserved` state — must cancel the offer first (or wait for auto-expiry)

**View Listing:**
- Public (any verified user)
- Increments `view_count` (transactional update with atomic increment)
- Logs the view to MongoDB `listing_views` collection (for analytics)
- Uses Redis to deduplicate view increments: one view per user per listing per hour (key: `view:{listing_id}:{user_id}` with 1-hr TTL)

**Listing Status Lifecycle:**
```
active  →  reserved (when offer accepted)
active  →  expired (30 days since posted, cron job)
active  →  deleted_by_user (seller clicks delete)
reserved →  sold (buyer + seller both confirm completion)
reserved →  active (offer cancelled before completion)
```

**Auto-Expiry:**
- Cron job runs every hour: `UPDATE listings SET status='expired' WHERE status='active' AND expires_at < NOW()`
- Sellers get a notification 3 days before expiry: "Your listing 'X' will expire in 3 days — boost it or re-post."

**Boost Listing:**
- Seller can boost an active listing once per 7 days per listing
- Sets `last_boosted_at=NOW()` — home feed sort treats boosted listings with weight
- Redis rate-limits boosts: key `boost:{listing_id}` with 7-day TTL

### 3.4 Categories (Fixed Enum)

| Slug | Name | Example Items |
|---|---|---|
| `books` | Books & Notes | Textbooks, reference books, lecture notes |
| `electronics` | Electronics | Laptops, phones, accessories, tablets |
| `furniture` | Furniture | Desks, chairs, beds, storage |
| `bikes` | Bikes & Cycles | Bicycles, motorcycles, scooters |
| `clothing` | Clothing | Hoodies, formal wear, shoes |
| `stationery` | Stationery | Drawing kits, calculators, lab equipment |
| `hostel_essentials` | Hostel Essentials | Heaters, kettles, bedding, cookware |
| `sports` | Sports | Equipment, gear, jerseys |
| `other` | Other | Anything that doesn't fit |

**Condition Enum:**
```
new           -- brand new, unused, with tag/seal
like_new      -- used once or twice, no visible wear
good          -- minor wear, fully functional
fair          -- visible wear, functional
poor          -- significant wear, may have issues (disclose in description)
```

### 3.5 Search & Discovery

**Home Feed:**
- Default sort: "Recommended" — combines recency + boost status + seller rating
- Shows 20 listings per page with infinite scroll pagination
- Category chips at top for quick filter
- Shows only `status='active'` listings

**Search:**
- Text search across title, description, tags, course_code
- Uses Postgres full-text search with `tsvector` + `tsquery` (GIN index)
- Autocomplete suggestions from Redis sorted set of popular search terms (updated on every search)

**Filters:**
- Category (multi-select)
- Price range (min, max)
- Condition (multi-select)
- Seller's hostel
- Seller's department
- Course code (for textbooks)
- Only show listings from hostellites / day scholars

**Sort Options:**
- Recommended (default)
- Newest first
- Price: low to high
- Price: high to low
- Most viewed

**Trending Section (Redis-cached):**
- Top 10 most-viewed listings in last 24 hours
- Refreshed every 15 minutes via cron
- Key: `trending:24h` (Redis sorted set)

### 3.6 Offers

Buyer can either:
1. **Chat first** (just message the seller) — no offer record created
2. **Make an offer** — structured proposal with a price

**Offer Flow:**
- Buyer submits offer: listing_id, proposed_price (may differ from listing price if is_negotiable=true), optional message
- If listing is not negotiable, proposed_price must equal listing price
- Offer status starts as `pending`
- Seller receives notification
- Seller can: `accept` | `reject` | `counter` (counter creates a new offer with seller as initiator)
- If accepted:
  - Listing status → `reserved`
  - All other pending offers on that listing are auto-rejected with reason `another_offer_accepted`
  - A `transaction` record is created in `pending_completion` state
  - Buyer is notified
  - Chat thread between buyer and seller is created if not already exists
- If rejected: notification to buyer, offer closed
- If countered: original offer closed, new offer created by seller
- Offers expire after 48 hours if not acted on (cron job, status → `expired`)
- Buyer can cancel their own pending offer anytime

**Constraints:**
- A user cannot offer on their own listing
- A user can have max 3 pending offers per listing (prevents spam)
- Rate limit: max 20 new offers per user per day (Redis counter)

### 3.7 Transactions

A transaction represents an in-progress or completed deal.

**States:**
```
pending_completion  -- offer accepted, listing reserved, awaiting both confirmations
completed           -- both parties confirmed exchange
cancelled_by_buyer  -- buyer backed out
cancelled_by_seller -- seller backed out
disputed            -- one party reports an issue (admin reviews)
```

**Completion Flow:**
- Buyer clicks "Mark as received" → `buyer_confirmed_at` set
- Seller clicks "Mark as handed over" → `seller_confirmed_at` set
- When BOTH are set: status → `completed`, listing status → `sold`, `completed_at` set
- Reviews can only be left after status = `completed`

**Auto-Handling:**
- If transaction sits in `pending_completion` for 7 days with neither party confirming, send reminder notifications
- If no confirmation after 14 days, status → `disputed`, admin reviews

### 3.8 Real-Time Chat (MongoDB)

- One chat thread per (buyer, seller, listing) triple
- Messages stored in MongoDB `chat_messages` collection
- Threads stored in `chat_threads` collection
- Chat is bound to a listing — generic DMs are NOT supported (reduces abuse)
- Supports text + image messages (images uploaded to `/uploads/chat/`)
- Read receipts: `read_by_{user_id}_at` field on each message
- Unread count per user per thread cached in Redis (key: `chat:unread:{user_id}:{thread_id}`)
- Total unread count per user cached in Redis (key: `chat:unread_total:{user_id}`)
- Client polls GET `/api/chat/threads/:id/messages?since=<timestamp>` every 3 seconds — backend returns only messages after that timestamp
- Message character limit: 2000
- Image size limit: 5MB per image
- Rate limit: 30 messages per minute per user

### 3.9 Reviews

- Created only after a transaction is `completed`
- Both buyer and seller can leave a review on each other
- One review per user per transaction (unique constraint)
- Fields: rating (1-5 integer), comment (0-500 chars), reviewer_id, reviewee_id, transaction_id
- Reviews are public on profiles
- Cannot edit a review after 7 days of posting
- Cannot delete a review (integrity) — only admin can remove abusive reviews
- After insert/update/delete, the reviewee's `aggregate_rating` and `total_reviews` are recalculated via trigger

### 3.10 Notifications (MongoDB)

All notifications live in MongoDB for fast writes and variable shape.

**Types:**
- `new_offer` — your listing received an offer
- `offer_accepted` — your offer was accepted
- `offer_rejected` — your offer was rejected
- `offer_countered` — seller sent a counter-offer
- `new_message` — new chat message
- `transaction_confirmed_by_other` — the other party confirmed the exchange
- `review_received` — someone reviewed you
- `listing_expiring_soon` — 3 days until expiry
- `listing_expired` — expired
- `wishlist_price_drop` — a wishlisted item dropped in price
- `wishlist_match` — a new listing matches your saved search
- `admin_warning` — admin-issued warning

**Fields:** `_id`, `user_id`, `type`, `payload` (flexible object with relevant IDs), `read_at`, `created_at`

**Unread count:** cached in Redis key `notif:unread:{user_id}`, incremented on write, decremented on read-mark.

### 3.11 Wishlist

- User can save listings to wishlist
- Table: `wishlist_items` (user_id, listing_id, created_at)
- On price drop of a wishlisted item, notify all users who have it wishlisted (trigger logic in controller after price update)

### 3.12 Saved Searches

- User can save a search query (text + filters) as a named saved search
- Table: `saved_searches` (id, user_id, name, query_text, filters_json, created_at)
- Cron job runs daily: for each saved search, check if any new listings match and notify the user (type `wishlist_match`)

### 3.13 Reports

- Any user can report a listing (spam, scam, inappropriate, miscategorized, other)
- Table: `reports` (id, reporter_id, listing_id, reason enum, details text, created_at, resolved_by_admin_id, resolved_at, resolution_notes)
- Admin dashboard shows all unresolved reports

### 3.14 Admin Features

- View all users, search/filter, ban/unban
- View all listings, search/filter, force-delete (soft)
- Review reports queue
- Handle disputes
- Trigger manual database backup
- View platform analytics dashboard
- Send platform-wide announcements (creates a `admin_warning` notification for all active users)

### 3.15 Analytics Dashboard

Student-facing analytics is limited to their own profile stats. Full analytics dashboard is admin-only.

**Admin Dashboard Metrics:**
- Total users, verified users, active users (signed in within 30 days)
- Total listings, active listings, sold listings
- Total transactions, total value transacted (PKR)
- Listings by category (pie chart)
- Listings by hostel (bar chart — the hostel heatmap)
- Listings by department of seller (bar chart)
- Average price per category (table with trend arrows)
- Top sellers (by sales count and by revenue)
- User signup trend (line chart, last 30/90 days)
- Listing post trend (line chart)
- Transaction completion rate
- Average time from listing post to sale
- Price history for popular course-code books (select a course code, see price history line chart)
- Semester-end surge view: compare listing volume in May-June and November-December vs baseline

These metrics are computed via SQL queries with `WINDOW` functions, `CTE`s, and aggregations. Some are cached in Redis with 10-min TTL.

---

## 4. Database Design

### 4.1 PostgreSQL Schema

#### users
```sql
CREATE TYPE department_enum AS ENUM (
  'SEECS','NBS','S3H','SMME','SCEE','SCME','SNS','ASAB','IESE','NICE','NIT','MCS','EME','OTHER'
);
CREATE TYPE residence_enum AS ENUM ('hostellite','day_scholar');
CREATE TYPE role_enum AS ENUM ('student','admin');

CREATE TABLE users (
  user_id         SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE CHECK (email ~* '^[a-zA-Z0-9._%+-]+@nust\.edu\.pk$'),
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(100) NOT NULL CHECK (char_length(full_name) >= 3),
  department      department_enum NOT NULL,
  semester        SMALLINT NOT NULL CHECK (semester BETWEEN 1 AND 10),
  residence_type  residence_enum NOT NULL,
  hostel_name     VARCHAR(10),
  phone_number    VARCHAR(20),
  bio             VARCHAR(300),
  profile_picture_url VARCHAR(500),
  role            role_enum NOT NULL DEFAULT 'student',
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  aggregate_rating NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  total_reviews   INTEGER NOT NULL DEFAULT 0,
  total_sales     INTEGER NOT NULL DEFAULT 0,
  total_purchases INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hostel_required CHECK (
    (residence_type = 'hostellite' AND hostel_name IS NOT NULL) OR
    (residence_type = 'day_scholar' AND hostel_name IS NULL)
  )
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_active ON users(is_active, is_banned) WHERE is_active = TRUE AND is_banned = FALSE;
```

#### categories
```sql
CREATE TABLE categories (
  category_id   SERIAL PRIMARY KEY,
  slug          VARCHAR(30) NOT NULL UNIQUE,
  name          VARCHAR(50) NOT NULL,
  description   TEXT,
  display_order SMALLINT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);
-- Seeded with the 9 categories listed in section 3.4
```

#### listings
```sql
CREATE TYPE condition_enum AS ENUM ('new','like_new','good','fair','poor');
CREATE TYPE listing_status_enum AS ENUM ('active','reserved','sold','expired','deleted_by_user','removed_by_admin');

CREATE TABLE listings (
  listing_id      SERIAL PRIMARY KEY,
  seller_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category_id     INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
  title           VARCHAR(100) NOT NULL CHECK (char_length(title) >= 5),
  description     TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
  price           INTEGER NOT NULL CHECK (price >= 0 AND price <= 10000000),
  is_negotiable   BOOLEAN NOT NULL DEFAULT TRUE,
  condition       condition_enum NOT NULL,
  location_hostel VARCHAR(10), -- null means off_campus
  is_off_campus   BOOLEAN NOT NULL DEFAULT FALSE,
  course_code     VARCHAR(20), -- e.g. 'CS-236'
  status          listing_status_enum NOT NULL DEFAULT 'active',
  view_count      INTEGER NOT NULL DEFAULT 0,
  posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  last_boosted_at TIMESTAMPTZ,
  sold_at         TIMESTAMPTZ,
  search_vector   TSVECTOR,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_category ON listings(category_id) WHERE status = 'active';
CREATE INDEX idx_listings_seller ON listings(seller_id);
CREATE INDEX idx_listings_posted_at ON listings(posted_at DESC) WHERE status = 'active';
CREATE INDEX idx_listings_price ON listings(price) WHERE status = 'active';
CREATE INDEX idx_listings_course_code ON listings(course_code) WHERE course_code IS NOT NULL;
CREATE INDEX idx_listings_search ON listings USING GIN(search_vector);
CREATE INDEX idx_listings_expires ON listings(expires_at) WHERE status = 'active';
```

#### listing_images
```sql
CREATE TABLE listing_images (
  image_id     SERIAL PRIMARY KEY,
  listing_id   INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  image_url    VARCHAR(500) NOT NULL,
  display_order SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_listing_images_listing ON listing_images(listing_id, display_order);
```

#### listing_tags
```sql
CREATE TABLE listing_tags (
  listing_id   INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  tag          VARCHAR(30) NOT NULL,
  PRIMARY KEY (listing_id, tag)
);
CREATE INDEX idx_listing_tags_tag ON listing_tags(tag);
```

#### offers
```sql
CREATE TYPE offer_status_enum AS ENUM ('pending','accepted','rejected','expired','cancelled','countered');

CREATE TABLE offers (
  offer_id        SERIAL PRIMARY KEY,
  listing_id      INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  buyer_id        INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  seller_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, -- denormalized for fast queries
  proposed_price  INTEGER NOT NULL CHECK (proposed_price >= 0),
  message         VARCHAR(500),
  status          offer_status_enum NOT NULL DEFAULT 'pending',
  counter_of_offer_id INTEGER REFERENCES offers(offer_id), -- if this is a counter-offer
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  responded_at    TIMESTAMPTZ,
  CONSTRAINT no_self_offer CHECK (buyer_id != seller_id)
);

CREATE INDEX idx_offers_listing_status ON offers(listing_id, status);
CREATE INDEX idx_offers_buyer ON offers(buyer_id);
CREATE INDEX idx_offers_seller ON offers(seller_id);
CREATE INDEX idx_offers_expires ON offers(expires_at) WHERE status = 'pending';
```

#### transactions
```sql
CREATE TYPE transaction_status_enum AS ENUM ('pending_completion','completed','cancelled_by_buyer','cancelled_by_seller','disputed');

CREATE TABLE transactions (
  transaction_id      SERIAL PRIMARY KEY,
  listing_id          INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE RESTRICT,
  offer_id            INTEGER NOT NULL UNIQUE REFERENCES offers(offer_id) ON DELETE RESTRICT,
  buyer_id            INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  seller_id           INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  agreed_price        INTEGER NOT NULL,
  status              transaction_status_enum NOT NULL DEFAULT 'pending_completion',
  buyer_confirmed_at  TIMESTAMPTZ,
  seller_confirmed_at TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX idx_transactions_seller ON transactions(seller_id);
CREATE INDEX idx_transactions_listing ON transactions(listing_id);
CREATE INDEX idx_transactions_status ON transactions(status);
```

#### reviews
```sql
CREATE TABLE reviews (
  review_id       SERIAL PRIMARY KEY,
  transaction_id  INTEGER NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  reviewer_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reviewee_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         VARCHAR(500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, reviewer_id), -- one review per user per transaction
  CONSTRAINT no_self_review CHECK (reviewer_id != reviewee_id)
);

CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
```

#### wishlist_items
```sql
CREATE TABLE wishlist_items (
  user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX idx_wishlist_listing ON wishlist_items(listing_id);
```

#### saved_searches
```sql
CREATE TABLE saved_searches (
  saved_search_id SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name            VARCHAR(50) NOT NULL,
  query_text      VARCHAR(200),
  filters_json    JSONB NOT NULL DEFAULT '{}',
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);
```

#### reports
```sql
CREATE TYPE report_reason_enum AS ENUM ('spam','scam','inappropriate','miscategorized','other');

CREATE TABLE reports (
  report_id          SERIAL PRIMARY KEY,
  reporter_id        INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  listing_id         INTEGER REFERENCES listings(listing_id) ON DELETE CASCADE,
  reported_user_id   INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  reason             report_reason_enum NOT NULL,
  details            VARCHAR(1000),
  resolved_by_admin_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  resolved_at        TIMESTAMPTZ,
  resolution_notes   VARCHAR(500),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_target CHECK (listing_id IS NOT NULL OR reported_user_id IS NOT NULL)
);

CREATE INDEX idx_reports_unresolved ON reports(created_at) WHERE resolved_at IS NULL;
```

### 4.2 Triggers & Stored Procedures

#### updated_at Trigger (applied to all tables with updated_at)
```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied to users, listings, offers, transactions, reviews
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- ...repeat for other tables
```

#### Listing search_vector Trigger
```sql
CREATE OR REPLACE FUNCTION update_listing_search_vector() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector =
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.course_code, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listings_search_vector BEFORE INSERT OR UPDATE OF title, description, course_code
  ON listings FOR EACH ROW EXECUTE FUNCTION update_listing_search_vector();
```

#### Review → Aggregate Rating Trigger
```sql
CREATE OR REPLACE FUNCTION recalculate_user_rating() RETURNS TRIGGER AS $$
DECLARE
  target_user_id INTEGER;
BEGIN
  target_user_id = COALESCE(NEW.reviewee_id, OLD.reviewee_id);

  UPDATE users
  SET aggregate_rating = COALESCE((
        SELECT ROUND(AVG(rating)::numeric, 2)
        FROM reviews
        WHERE reviewee_id = target_user_id
      ), 0),
      total_reviews = (
        SELECT COUNT(*)
        FROM reviews
        WHERE reviewee_id = target_user_id
      )
  WHERE user_id = target_user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reviews_recalc_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION recalculate_user_rating();
```

#### Transaction Completion Stored Procedure
```sql
CREATE OR REPLACE PROCEDURE complete_transaction(p_transaction_id INTEGER) AS $$
DECLARE
  t_record transactions%ROWTYPE;
BEGIN
  SELECT * INTO t_record FROM transactions WHERE transaction_id = p_transaction_id FOR UPDATE;

  IF t_record.buyer_confirmed_at IS NULL OR t_record.seller_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Both parties must confirm before completion';
  END IF;

  UPDATE transactions
  SET status = 'completed',
      completed_at = NOW()
  WHERE transaction_id = p_transaction_id;

  UPDATE listings
  SET status = 'sold',
      sold_at = NOW()
  WHERE listing_id = t_record.listing_id;

  UPDATE users SET total_sales = total_sales + 1 WHERE user_id = t_record.seller_id;
  UPDATE users SET total_purchases = total_purchases + 1 WHERE user_id = t_record.buyer_id;
END;
$$ LANGUAGE plpgsql;
```

### 4.3 MongoDB Collections

#### chat_threads
```js
{
  _id: ObjectId,
  thread_id: String, // "buyerId_sellerId_listingId" composite key
  buyer_id: Number,
  seller_id: Number,
  listing_id: Number,
  last_message_at: Date,
  last_message_preview: String,
  created_at: Date,
  updated_at: Date
}
// Indexes: thread_id (unique), buyer_id, seller_id, last_message_at
```

#### chat_messages
```js
{
  _id: ObjectId,
  thread_id: String,
  sender_id: Number,
  recipient_id: Number,
  listing_id: Number,
  content: String,
  image_url: String | null,
  read_by_recipient_at: Date | null,
  created_at: Date
}
// Indexes: thread_id + created_at (compound), recipient_id + read_by_recipient_at (for unread)
```

#### notifications
```js
{
  _id: ObjectId,
  user_id: Number,
  type: String,
  payload: Object, // variable shape per type
  read_at: Date | null,
  created_at: Date
}
// Indexes: user_id + created_at (compound), user_id + read_at
```

#### listing_views
```js
{
  _id: ObjectId,
  listing_id: Number,
  viewer_id: Number, // null if not logged in (we don't allow this but future-proof)
  viewed_at: Date
}
// Indexes: listing_id + viewed_at, viewer_id + viewed_at
// TTL index: viewed_at, expireAfterSeconds 7776000 (90 days)
```

#### activity_log
```js
{
  _id: ObjectId,
  user_id: Number,
  action: String, // "login", "listing_created", "offer_made", etc.
  target_type: String, // "listing", "offer", "user"
  target_id: Number,
  metadata: Object,
  created_at: Date
}
// Indexes: user_id + created_at, action + created_at
// TTL index: 180 days
```

### 4.4 Redis Key Patterns

| Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `session:jwt_revoked:{jti}` | String | token expiry | Revoked JWT IDs |
| `otp:signup:{email}` | String | 10 min | Signup OTP |
| `otp:reset:{email}` | String | 10 min | Password reset OTP |
| `ratelimit:{ip}:{route}` | String (counter) | 15 min | IP-based rate limit |
| `ratelimit:user:{user_id}:{route}` | String (counter) | 1 min | User-based rate limit |
| `view:{listing_id}:{user_id}` | String | 1 hour | View deduplication |
| `trending:24h` | Sorted Set | 15 min | Top listings by views |
| `search:autocomplete` | Sorted Set | permanent | Popular search terms |
| `chat:unread:{user_id}:{thread_id}` | String (counter) | 30 days | Per-thread unread count |
| `chat:unread_total:{user_id}` | String (counter) | 30 days | Total unread |
| `notif:unread:{user_id}` | String (counter) | 30 days | Unread notifications |
| `cache:dashboard:{metric}` | String (JSON) | 10 min | Analytics dashboard cache |
| `cache:user_profile:{user_id}` | String (JSON) | 5 min | Profile cache |
| `boost:{listing_id}` | String | 7 days | Boost rate limit |
| `offer_count:{user_id}:{date}` | String (counter) | 24 hours | Daily offer spam prevention |

---

## 5. API Endpoints

All endpoints are prefixed with `/api/v1`. All responses follow the format in CLAUDE.md.

### 5.1 Auth
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | public | Create account, send OTP |
| POST | `/auth/verify-otp` | public | Verify email OTP, return JWT |
| POST | `/auth/resend-otp` | public | Resend signup OTP |
| POST | `/auth/login` | public | Login, return JWT |
| POST | `/auth/forgot-password` | public | Request reset OTP |
| POST | `/auth/reset-password` | public | Reset password with OTP |
| POST | `/auth/change-password` | student | Change password (current + new) |
| POST | `/auth/logout` | student | Revoke current JWT |

### 5.2 Users
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/users/me` | student | Full own profile |
| PATCH | `/users/me` | student | Update own profile |
| DELETE | `/users/me` | student | Deactivate own account |
| POST | `/users/me/profile-picture` | student | Upload profile picture |
| GET | `/users/:userId` | student | Public profile of another user |
| GET | `/users/:userId/listings` | student | User's active listings |
| GET | `/users/:userId/reviews` | student | Reviews received by user |

### 5.3 Listings
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/listings` | student | Home feed with filters |
| GET | `/listings/trending` | student | Trending 24h (Redis-cached) |
| GET | `/listings/search` | student | Full-text search |
| GET | `/listings/:id` | student | Listing detail + increment views |
| POST | `/listings` | student (verified) | Create listing (with images) |
| PATCH | `/listings/:id` | student (owner) | Update listing |
| DELETE | `/listings/:id` | student (owner) | Soft-delete |
| POST | `/listings/:id/boost` | student (owner) | Boost (once per 7 days) |
| POST | `/listings/:id/images` | student (owner) | Add image |
| DELETE | `/listings/:id/images/:imageId` | student (owner) | Remove image |
| POST | `/listings/:id/report` | student | Report listing |

### 5.4 Offers
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/offers` | student (verified) | Create offer on a listing |
| GET | `/offers/sent` | student | Offers I've made |
| GET | `/offers/received` | student | Offers on my listings |
| POST | `/offers/:id/accept` | student (seller) | Accept offer |
| POST | `/offers/:id/reject` | student (seller) | Reject offer |
| POST | `/offers/:id/counter` | student (seller) | Counter-offer |
| POST | `/offers/:id/cancel` | student (buyer) | Cancel own offer |

### 5.5 Transactions
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/transactions` | student | My transactions (buyer and seller views) |
| GET | `/transactions/:id` | student (party) | Transaction detail |
| POST | `/transactions/:id/confirm-buyer` | student (buyer) | Mark as received |
| POST | `/transactions/:id/confirm-seller` | student (seller) | Mark as handed over |
| POST | `/transactions/:id/cancel` | student (party) | Cancel with reason |
| POST | `/transactions/:id/dispute` | student (party) | Open dispute |

### 5.6 Chat
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/chat/threads` | student | All my chat threads |
| GET | `/chat/threads/:threadId` | student (party) | Thread detail + messages |
| GET | `/chat/threads/:threadId/messages` | student (party) | Paginated messages with `?since=` |
| POST | `/chat/threads/:threadId/messages` | student (party) | Send message (text/image) |
| POST | `/chat/threads/:threadId/read` | student (party) | Mark all as read |
| POST | `/chat/start` | student | Start chat (takes listing_id + seller_id) |

### 5.7 Reviews
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/reviews` | student | Create review (must be after completion) |
| PATCH | `/reviews/:id` | student (owner) | Edit own review within 7 days |
| GET | `/reviews/transaction/:txId` | student (party) | Reviews for a transaction |

### 5.8 Wishlist & Saved Searches
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/wishlist` | student | My wishlist |
| POST | `/wishlist/:listingId` | student | Add to wishlist |
| DELETE | `/wishlist/:listingId` | student | Remove from wishlist |
| GET | `/saved-searches` | student | My saved searches |
| POST | `/saved-searches` | student | Create saved search |
| DELETE | `/saved-searches/:id` | student | Delete saved search |

### 5.9 Notifications
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/notifications` | student | My notifications (paginated) |
| GET | `/notifications/unread-count` | student | Unread count (from Redis) |
| POST | `/notifications/:id/read` | student (owner) | Mark one as read |
| POST | `/notifications/mark-all-read` | student | Mark all as read |

### 5.10 Admin
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/admin/users` | admin | List users with filters |
| POST | `/admin/users/:id/ban` | admin | Ban a user |
| POST | `/admin/users/:id/unban` | admin | Unban |
| GET | `/admin/listings` | admin | List all listings |
| POST | `/admin/listings/:id/remove` | admin | Force-remove listing |
| GET | `/admin/reports` | admin | Unresolved reports |
| POST | `/admin/reports/:id/resolve` | admin | Resolve a report |
| GET | `/admin/analytics` | admin | Full dashboard metrics |
| POST | `/admin/backup` | admin | Trigger manual backup |
| POST | `/admin/announcement` | admin | Broadcast to all users |

### 5.11 Categories
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/categories` | public | List all categories |

---

## 6. Non-Functional Requirements

- **Performance:** Home feed should respond in < 200ms for first 20 results. Listing detail in < 100ms. Search in < 300ms.
- **Concurrency:** Support at least 100 concurrent users (target for demo).
- **Reliability:** All critical operations (accept offer, complete transaction, create review) wrapped in SQL transactions with appropriate isolation levels.
- **Security:** All top-10 OWASP vulnerabilities addressed (SQL injection, XSS via content-type, CSRF via SameSite cookies, etc.).
- **Backup:** Daily automated pg_dump + mongodump to timestamped files in a `backups/` folder. 7-day retention.

---

## 7. Seed Data Requirements

For demo purposes, seed the database with:
- 1 admin user (`admin@nust.edu.pk`)
- 30 realistic student users spread across departments and hostels
- 9 categories (already defined above)
- 80 listings with realistic data (use AI-generated text + placeholder images)
- ~40 offers in various states
- ~20 transactions (mix of completed, pending, cancelled)
- ~30 reviews on completed transactions
- Some wishlist entries, saved searches, notifications

The seed script must be idempotent — running it twice on a clean DB produces the same result; running it on a populated DB does nothing (checks if seeded flag is set).

---

## 8. Acceptance Criteria

The project is considered complete when:

1. All 67+ API endpoints listed above work correctly against Postman tests.
2. Schema deploys from scratch with a single `npm run db:migrate` command.
3. Seed data loads with `npm run db:seed` and produces a demo-ready database.
4. All three databases (Postgres, Mongo, Redis) are connected and used for their intended purposes.
5. Email OTP flow works end-to-end (verified with a real Gmail account in dev).
6. Auth middleware rejects unauthenticated, unverified, banned, and inactive users correctly.
7. Full-text search returns relevant results within 300ms.
8. The dashboard shows live analytics with SQL queries optimized via EXPLAIN ANALYZE.
9. Manual backup script produces restore-able dumps.
10. No secrets in the repo. `.env.example` shows all required variables.
11. README has setup instructions that work on a fresh machine.
12. Postman collection in `docs/api-postman.json` covers every endpoint.

---

End of SPECS.md. Any changes to scope must be reflected here first before code changes.
