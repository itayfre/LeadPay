# LeadPay Frontend

React-based frontend for the LeadPay building management payment tracker.

## Tech Stack

- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS v4** for styling
- **TanStack Query** for API state management
- **React Router** for navigation
- **i18next** for internationalization (Hebrew/English)
- **Recharts** for data visualization

## Features

### ✅ Bilingual Support (Hebrew RTL + English)
- Automatic RTL/LTR layout switching
- Hebrew as default language
- Language toggle in header (🇮🇱 עב / 🇬🇧 EN)
- All UI text translated via i18next

### ✅ Buildings Management
- Grid view of all buildings
- Building cards showing:
  - Name, address, city
  - Total tenants count
  - Expected monthly payment
  - Click to view dashboard

### ✅ Payment Dashboard
- Per-building payment status view
- Summary statistics cards:
  - Paid tenants (✅)
  - Unpaid tenants (❌)
  - Total expected amount (💰)
  - Collection rate (📊)
- Payment status table with:
  - Apartment number
  - Tenant name
  - Expected amount
  - Paid amount
  - Payment status
  - WhatsApp action button
- Month/year selector for different periods
- Upload statement button
- Send reminders button

### ✅ Bank Statement Upload
- Drag-and-drop file upload
- Supports Excel (.xlsx, .xls) and PDF
- Real-time upload progress
- Automatic transaction matching
- Upload results showing:
  - Total transactions
  - Auto-matched count
  - Unmatched count
  - List of unmatched transactions
- Success/error feedback

### ✅ WhatsApp Reminders
- Bulk reminder generation for unpaid tenants
- Modal interface showing all messages
- Preview of message content
- One-click send via WhatsApp Web (wa.me links)
- Mark messages as sent
- Individual tenant reminders from dashboard

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── layout/
│   │       └── Layout.tsx          # Shared layout with header & nav
│   ├── pages/
│   │   ├── Buildings.tsx           # Buildings list page
│   │   ├── Dashboard.tsx           # Payment dashboard
│   │   └── UploadStatement.tsx     # File upload page
│   ├── services/
│   │   └── api.ts                  # API client functions
│   ├── types/
│   │   └── index.ts                # TypeScript interfaces
│   ├── i18n/
│   │   ├── index.ts                # i18next configuration
│   │   └── locales/
│   │       ├── he.json             # Hebrew translations
│   │       └── en.json             # English translations
│   ├── App.tsx                     # Main app component
│   ├── main.tsx                    # Entry point
│   └── index.css                   # Global styles + Tailwind
├── package.json
└── vite.config.ts
```

## API Integration

All API calls are handled via the `api.ts` service with the following modules:

- **buildingsAPI**: list, get, create, update, delete
- **paymentsAPI**: getStatus, getUnpaid
- **statementsAPI**: upload, list, getTransactions
- **messagesAPI**: generateReminders, markSent, getHistory
- **tenantsAPI**: import

API base URL is configured via `VITE_API_URL` environment variable (defaults to `http://localhost:8000`).

## Running the Frontend

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The dev server runs on **http://localhost:5173**

## Environment Variables

Create a `.env` file in the frontend directory:

```
VITE_API_URL=http://localhost:8000
```

## Routes

- `/` - Redirects to `/buildings`
- `/buildings` - Buildings list page
- `/building/:buildingId` - Payment dashboard for a building
- `/building/:buildingId/upload` - Upload bank statement

## Styling & RTL Support

- Tailwind CSS v4 with custom RTL utilities
- Automatic direction switching via `document.documentElement.dir`
- RTL-aware spacing utilities (`rtl:space-x-reverse`)
- Hebrew-friendly fonts and text rendering

## State Management

- **TanStack Query** for server state caching and synchronization
- Query keys for cache invalidation:
  - `['buildings']` - All buildings
  - `['building', buildingId]` - Single building
  - `['paymentStatus', buildingId, month, year]` - Payment status
- Automatic refetch on window focus disabled
- 30-second stale time for cached data

## Components

### Layout
Shared layout component with:
- Header with logo and navigation
- Language toggle button
- Responsive design

### StatCard (Dashboard)
Reusable statistics card with:
- Title, value, icon
- Color variants (green, red, blue, purple)
- Optional total display

### WhatsAppModal (Dashboard)
Modal for bulk WhatsApp message sending:
- List of generated messages
- Preview message content
- Send button for each message
- Track sent status

## Future Enhancements

- [ ] Charts with Recharts (pie chart for collection rate)
- [ ] Manual transaction matching interface
- [ ] Tenant management page
- [ ] Payment history timeline
- [ ] Export reports (PDF/Excel)
- [ ] Dark mode support
- [ ] Mobile app (React Native)

## Development Notes

- All hardcoded Hebrew text should be moved to translation files
- Add loading skeletons for better UX
- Consider adding error boundary for better error handling
- Add unit tests with Vitest
- Add E2E tests with Playwright
