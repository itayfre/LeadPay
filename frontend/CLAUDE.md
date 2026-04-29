## Frontend — LeadPay React App

> Project-wide rules: `../../CLAUDE.md` · Workflow: `../../workflow_orchestration.md`
> Lessons from past mistakes: `../../tasks/lessons.md`

---

### Stack & Tools
- React 18 + TypeScript (strict mode)
- Vite (dev server + build)
- shadcn/ui + Tailwind CSS
- React Query (`@tanstack/react-query`) for server state
- i18next for Hebrew/English

### File Structure
```
src/
  components/       # Reusable UI components
    layout/         # App shell, nav, sidebar
    modals/         # Dialog components
  pages/            # Route-level page components
  services/         # api.ts — all API calls here
  hooks/            # Custom React hooks
  types/            # index.ts — shared TypeScript interfaces
  i18n/             # Translation files (he/en)
  context/          # React context providers
```

### TypeScript Rules
- Strict mode is ON — no `any`, no implicit returns
- Prefer `interface` over `type` for object shapes
- All API response shapes must be defined in `src/types/index.ts`
- Run `npm run build` before marking any task done — catches type errors CI will catch

### API Client (`services/api.ts`)
- All fetch calls go through the central `fetchAPI` helper
- **Always include trailing slash** on list endpoints: `/api/v1/buildings/`, `/tenants/`
- `fetchAPI` returns `undefined` for 204/205 responses — never call `.json()` on DELETE responses
- 307 redirect strips `Authorization` header → trailing slash prevents this
- Auth token is injected by the helper — don't add it manually

### Component Patterns
- Use shadcn/ui primitives (Button, Dialog, Table, etc.) — don't re-invent
- Page components live in `pages/`, reusable pieces in `components/`
- Modals are self-contained in `components/modals/` — receive props, emit callbacks
- React Query for all server state — no `useEffect` + `fetch` patterns
- Use `useQuery` for reads, `useMutation` for writes; invalidate queries after mutations

### Hebrew / RTL
- Default language is Hebrew; `dir="rtl"` on root element
- All user-facing strings go through `i18next` — no hardcoded Hebrew in JSX
- Translation keys live in `src/i18n/` — add both `he` and `en` keys together
- Currency: `₪` symbol, format numbers with commas (`1,250`)
- Phone display: normalize to `+972` format

### State Management
- Server state → React Query (not useState or Context)
- UI state (modals open/closed, form state) → local `useState`
- Global app state (auth user, language) → Context (`src/context/`)

### Checklist Before Done
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] New API types added to `src/types/index.ts`
- [ ] Both `he` and `en` translation keys added
- [ ] RTL layout tested visually if UI changed
- [ ] React Query cache invalidated after mutations
