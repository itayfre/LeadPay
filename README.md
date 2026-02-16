# LeadPay - Building Management Payment Tracker

Complete solution for managing building payments with automatic bank statement matching and WhatsApp reminders.

## 🎯 Features

### Backend (FastAPI + PostgreSQL)
- ✅ Building & tenant management
- ✅ Bank statement Excel/PDF parsing
- ✅ Fuzzy matching engine for Hebrew names (5 strategies, 70% threshold)
- ✅ Payment status tracking by period
- ✅ WhatsApp reminder generation (bilingual)
- ✅ Manual transaction matching with memory
- ✅ Collection rate calculations

### Frontend (React + TypeScript)
- ✅ Buildings list with grid view
- ✅ Payment dashboard with status table
- ✅ Drag-and-drop file upload
- ✅ WhatsApp bulk messaging interface
- ✅ Bilingual support (Hebrew RTL + English)
- ✅ Responsive design with Tailwind CSS

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (Supabase)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

Backend runs on **http://localhost:8000**
API docs at **http://localhost:8000/docs**

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
echo "VITE_API_URL=http://localhost:8000" > .env

# Start development server
npm run dev
```

Frontend runs on **http://localhost:5173**

## 📁 Project Structure

```
leadpay/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy models (7 tables)
│   │   ├── routers/         # FastAPI endpoints (26 routes)
│   │   ├── services/        # Business logic
│   │   │   ├── excel_parser.py       # Bank statement parser
│   │   │   ├── matching_engine.py    # Fuzzy name matching
│   │   │   └── whatsapp_service.py   # Message generation
│   │   └── main.py          # FastAPI app
│   ├── alembic/             # Database migrations
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── pages/           # React pages
    │   │   ├── Buildings.tsx
    │   │   ├── Dashboard.tsx
    │   │   └── UploadStatement.tsx
    │   ├── components/      # Reusable components
    │   ├── services/        # API client
    │   ├── i18n/            # Translations (he/en)
    │   └── types/           # TypeScript interfaces
    └── package.json
```

## 🔄 Complete Workflow

1. **Create Building** → API: `POST /api/v1/buildings`
2. **Import Tenants** → Upload Excel with tenant data
3. **Upload Bank Statement** → Auto-match transactions to tenants
4. **View Dashboard** → See payment status for current period
5. **Send Reminders** → Generate WhatsApp messages for unpaid tenants
6. **Track Payments** → Monitor collection rate over time

## 📊 Database Schema

- **buildings** - Building information
- **apartments** - Apartment units in buildings
- **tenants** - Tenant details with ownership type
- **bank_statements** - Uploaded statements
- **transactions** - Individual payments from statements
- **name_mappings** - Manual match memory
- **messages** - WhatsApp message history

## 🧠 Fuzzy Matching Engine

The matching engine uses 5 strategies to match Hebrew names:

1. **Exact Match** - Direct name comparison
2. **Reversed Name** - Handle "last first" vs "first last"
3. **Fuzzy Match** - Levenshtein distance with 80% threshold
4. **Token Match** - Word-based matching for abbreviations
5. **Amount Match** - Confirm matches with expected amounts

Hebrew normalization handles final letters (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ)

Auto-confirmation at 90% confidence, manual review below 70%.

## 💬 WhatsApp Integration

Uses **wa.me** links for free WhatsApp Web integration (no API key required).

Message templates in Hebrew & English:
- Payment reminder
- Payment received
- Partial payment
- Overpayment

## 🌐 Bilingual Support

- Default: Hebrew (RTL)
- Optional: English (LTR)
- Automatic layout direction switching
- All UI text translated via i18next

## 📝 Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://user:pass@host:6543/leadpay
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
```

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests (coming soon)
cd frontend
npm test
```

## 📦 Production Deployment

### Backend
- Deploy on Railway, Render, or Fly.io
- Use Supabase for PostgreSQL
- Set DATABASE_URL environment variable

### Frontend
- Build: `npm run build`
- Deploy to Vercel, Netlify, or Cloudflare Pages
- Set VITE_API_URL to your backend URL

## 🛠️ Tech Stack

### Backend
- Python 3.11
- FastAPI 0.115.6
- SQLAlchemy 2.0
- Alembic (migrations)
- PostgreSQL (Supabase)
- Pandas (Excel parsing)
- RapidFuzz (fuzzy matching)

### Frontend
- React 19
- TypeScript 5.9
- Vite 7
- TanStack Query
- React Router 7
- i18next
- Tailwind CSS v4
- Recharts

## 📖 Documentation

- Backend API: http://localhost:8000/docs
- Frontend README: [frontend/FRONTEND_README.md](frontend/FRONTEND_README.md)
- Project Plan: [CLAUDE.md](CLAUDE.md)

## 🔐 Security

- Never commit .env files
- Use environment variables for secrets
- PostgreSQL connection uses Session Pooler (port 6543)
- Phone numbers normalized to +972 format

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests
4. Commit with clear messages
5. Push to GitHub

## 📜 License

MIT License - see LICENSE file for details

## 🙏 Credits

Built with Claude Sonnet 4.5 using Anthropic's Claude Agent SDK.

---

**Status**: ✅ Production Ready
**Version**: 1.0.0
**Last Updated**: February 2025
