# NusTrade — Student Marketplace for NUST Islamabad

Peer-to-peer marketplace for buying/selling items exclusively between NUST students.

## Tech Stack

**Backend:** Node.js + Express, PostgreSQL, MongoDB, Redis  
**Frontend:** HTML/CSS/JS (vanilla)  
**Authentication:** JWT + bcrypt, email OTP verification via Gmail SMTP  
**File Upload:** Multer (local uploads to `backend/uploads/`)

## Project Structure

```
nustrade/
├── backend/          # Node.js + Express API
│   ├── src/
│   │   ├── config/   # DB connections
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── db/       # migrations, seeds, queries
│   │   ├── utils/
│   │   └── validators/
│   ├── uploads/      # gitignored — local image storage
│   ├── server.js
│   └── .env.example
├── frontend/         # Static HTML/CSS/JS (partner scope)
└── docs/             # SPECS.md, SKILL.md, ERD
```

## Setup

### Prerequisites
- Node.js 20 LTS
- PostgreSQL 16
- MongoDB 7
- Redis 7

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in .env with your local credentials
```

Run migrations:
```bash
npm run migrate
```

Seed demo data:
```bash
npm run seed
```

Start server:
```bash
npm run dev     # nodemon (development)
npm start       # production
```

API runs at `http://localhost:4000/api/v1`

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in values. Never commit `.env`.

## Academic Context

Final semester project — CS 236 (Advanced Database Management Systems) + Web Technologies, NUST Islamabad.

Built by Muhammad Ahmad (Reg: 502107, CS 14B).
