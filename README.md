# LeadPay — Building Management Payment Tracker

> ניהול תשלומים לבניינים — פלטפורמה לניהול דיירים, תשלומים ותזכורות WhatsApp

LeadPay automates the most painful parts of building management: matching bank statement transactions to tenants, tracking who paid and who didn't, and sending WhatsApp payment reminders — all in Hebrew with RTL support.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🏢 **Buildings** | Create and manage multiple buildings |
| 👥 **Tenants** | Import from Excel, track ownership type |
| 📄 **Bank Statements** | Upload Excel files, auto-parse transactions |
| 🧠 **Smart Matching** | Fuzzy Hebrew name matching (5 strategies, 70% threshold) |
| 💰 **Payment Dashboard** | Real-time payment status per period |
| 💬 **WhatsApp Reminders** | Bulk wa.me links with customizable templates |
| 🔐 **Auth + Roles** | JWT auth with 4 roles (Manager, Worker, Viewer, Tenant) |
| 🌐 **Bilingual** | Hebrew RTL default, English optional |

---

## 🔐 User Roles

| Role | Can Do |
|------|--------|
| **Manager** | Full CRUD, manage users, approve tenants |
| **Worker** | View + edit everything, upload statements, send reminders |
| **Viewer** | Read-only access to all data |
| **Tenant** | Read-only access to their own building |

### Account Flows
- **Manager / Worker / Viewer**: Manager sends an email invite → user sets password → account active
- **Tenant**: Self-registers at `/register` → status = `pending` → Manager approves

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (Supabase recommended)

### 1 — Clone & Set Up Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate         # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy env template and fill in your values
cp .env.example .env
# Edit .env — set DATABASE_URL and APP_SECRET_KEY

# Run migrations
alembic upgrade head

# Create the first manager account
python3 scripts/create_manager.py --email admin@example.com --name "Admin" --password "yourpassword"

# Start server
uvicorn app.main:app --reload
```

Backend runs at **http://localhost:8000** — API docs at **/docs**

### 2 — Set Up Frontend

```bash
cd frontend

# Install dependencies
npm install

# Set backend URL
echo "VITE_API_URL=http://localhost:8000" > .env

# Start dev server
npm run dev
```

Frontend runs at **http://localhost:5173**

---

## 📁 Project Structure

```
leadpay/
├── backend/
│   ├── app/
│   │   ├── models/            # SQLAlchemy models (8 tables incl. users)
│   │   ├── routers/           # FastAPI endpoints
│   │   │   ├── auth.py        # Login, register, invite, refresh
│   │   │   ├── users.py       # User management (Manager only)
│   │   │   ├── buildings.py   # Building CRUD
│   │   │   ├── tenants.py     # Tenant management + Excel import
│   │   │   ├── statements.py  # Bank statement upload + matching
│   │   │   ├── payments.py    # Payment status + history
│   │   │   └── messages.py    # WhatsApp message generation
│   │   ├── services/
│   │   │   ├── auth_service.py      # JWT + bcrypt
│   │   │   ├── excel_parser.py      # Bank statement parser
│   │   │   ├── matching_engine.py   # Fuzzy Hebrew name matching
│   │   │   └── whatsapp_service.py  # Message template engine
│   │   ├── dependencies/
│   │   │   └── auth.py        # JWT guards + RBAC helpers
│   │   ├── utils/
│   │   │   └── user_utils.py  # Shared user serializer
│   │   ├── database.py        # SQLAlchemy engine + session
│   │   └── main.py            # App factory, CORS, security headers
│   ├── alembic/               # Database migrations
│   ├── scripts/
│   │   └── create_manager.py  # First-run manager seed
│   ├── Procfile               # Railway deployment
│   ├── runtime.txt            # Python 3.11
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── Login.tsx
    │   │   ├── Register.tsx
    │   │   ├── InviteAccept.tsx
    │   │   ├── Buildings.tsx
    │   │   ├── Dashboard.tsx
    │   │   ├── Tenants.tsx
    │   │   ├── AllTenants.tsx
    │   │   ├── UploadStatement.tsx
    │   │   ├── StatementsUpload.tsx
    │   │   ├── Users.tsx
    │   │   ├── Settings.tsx
    │   │   └── WhatsAppTemplates.tsx
    │   ├── components/
    │   │   ├── layout/          # Layout, Sidebar, Header
    │   │   ├── modals/          # UploadReviewModal
    │   │   └── ProtectedRoute.tsx
    │   ├── context/
    │   │   └── AuthContext.tsx  # JWT auth + silent refresh
    │   ├── services/
    │   │   └── api.ts           # Typed fetch client
    │   ├── types/               # TypeScript interfaces
    │   └── i18n/                # he/en translations
    └── vercel.json              # SPA routing for Vercel
```

---

## 🔄 Workflow

```
1. Create Building        → Buildings page → "בניין חדש"
2. Import Tenants         → Dashboard (empty state) or Tenants page
3. Upload Bank Statement  → Statements page → drag-and-drop Excel
4. Review Matches         → Auto-matched by fuzzy engine; manual override available
5. View Dashboard         → Payment status table per month/year
6. Send Reminders         → "שלח תזכורות" → WhatsApp links generated per tenant
7. Manage Users           → /users (Manager only) — invite, approve, change roles
```

---

## 📊 Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Auth: email, hashed_password, role, status, building_id |
| `buildings` | Building info (name, address, bank account) |
| `apartments` | Units within a building |
| `tenants` | Tenant details, ownership type, phone |
| `bank_statements` | Uploaded statement files |
| `transactions` | Individual rows parsed from statements |
| `name_mappings` | Manual match memory (payer name → tenant) |
| `messages` | WhatsApp message history + delivery status |

---

## 🧠 Fuzzy Matching Engine

The engine uses 5 strategies to match Hebrew bank statement names to tenants:

1. **Exact match** — direct string comparison after normalization
2. **Reversed name** — handles "first last" vs "last first"
3. **Fuzzy match** — Levenshtein distance via RapidFuzz (≥80% threshold)
4. **Token match** — word-level matching for abbreviations (e.g., "גיא מ" → "גיא מן")
5. **Amount match** — cross-validates with expected monthly payment

Hebrew normalization: final letters are collapsed (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ).

Auto-confirm at ≥90% confidence. Below 70% → unmatched (manual review).

---

## 💬 WhatsApp Integration

Uses **wa.me** links — no API key required.

Customizable templates via Settings → WhatsApp Templates:
- 📩 Payment Reminder
- ✅ Payment Received
- ⚡ Partial Payment
- 💸 Overpayment

Available variables: `{tenant_name}`, `{building_name}`, `{apartment_number}`, `{amount}`, `{period}`

---

## 🔐 Security

- JWT access tokens (30 min) + refresh tokens (30-day sliding window)
- bcrypt password hashing
- RBAC on every endpoint
- CORS restricted to `FRONTEND_URL` env var
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- File upload validation: Excel only, max 10 MB
- Rate limiting on login + upload endpoints
- API docs disabled in production (`APP_ENV=production`)

---

## 📝 Environment Variables

### Backend `backend/.env`

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
APP_SECRET_KEY=<run: openssl rand -hex 32>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
FRONTEND_URL=https://your-app.vercel.app
APP_ENV=production           # disables /docs in prod
```

### Frontend `frontend/.env`

```env
VITE_API_URL=https://your-backend.railway.app
```

---

## 🚢 Production Deployment

### Frontend → Vercel

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → import repo
3. Set **Root Directory** to `frontend`
4. Add env var: `VITE_API_URL=https://your-backend.railway.app`
5. Deploy — Vercel auto-builds on every push to `main`

> `frontend/vercel.json` handles SPA routing (all paths → `/index.html`)

### Backend → Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Set **Root Directory** to `backend`
3. Add environment variables (see above)
4. Railway reads `Procfile` → `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Run migrations once: open Railway shell → `alembic upgrade head`
6. Seed first manager: `python3 scripts/create_manager.py --email ... --password ...`

### Making Changes After Deploy

```bash
# 1. Make changes locally, test them
npm run build          # check TypeScript
pytest                 # check backend

# 2. Commit
git add .
git commit -m "feat: describe what you changed"

# 3. Push → Vercel + Railway redeploy automatically
git push origin main
```

---

## 🧪 Testing

```bash
# Backend
cd backend
pytest

# Frontend type-check
cd frontend
npm run build
```

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11, FastAPI 0.115, SQLAlchemy 2.0, Alembic |
| Auth | python-jose (JWT), passlib (bcrypt) |
| Matching | RapidFuzz, Pandas |
| Database | PostgreSQL via Supabase |
| Frontend | React 19, TypeScript 5, Vite 7 |
| State | TanStack Query v5 |
| Routing | React Router v7 |
| Styling | Tailwind CSS v3 |
| Charts | Recharts |
| i18n | i18next |

---

## 📖 GitHub Repo

[https://github.com/itayfre/LeadPay](https://github.com/itayfre/LeadPay)

---

*Built with [Claude Code](https://claude.ai/claude-code) — Anthropic*
