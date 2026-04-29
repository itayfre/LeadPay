## Backend — LeadPay FastAPI Service

> Project-wide rules: `../../CLAUDE.md` · Workflow: `../../workflow_orchestration.md`
> Lessons from past mistakes: `../../tasks/lessons.md`

---

### Stack & Tools
- Python 3.11, FastAPI, SQLAlchemy 2.0 (async-compatible ORM)
- Alembic for database migrations
- PostgreSQL via Supabase
- pytest for testing

### File Structure
```
app/
  main.py           # FastAPI app, CORS config, router registration
  models/           # SQLAlchemy ORM models (one file per entity)
  schemas/          # Pydantic request/response schemas
  routers/          # Route handlers (one file per resource)
  services/         # Business logic (matching_engine, excel_parser, etc.)
  dependencies/     # FastAPI dependency injection (auth, db session)
  utils/            # Shared utilities
alembic/            # Migration versions
tests/              # pytest test files
```

### FastAPI Patterns
- `redirect_slashes=False` is set — **trailing slash is mandatory on all list routes**
- All list endpoints must end with `/`: `GET /api/v1/buildings/`, `/tenants/`, `/users/`
- DELETE endpoints return **204 No Content** — no response body, never return JSON
- Auth via dependency injection: add `current_user: User = Depends(get_current_user)`
- Use `APIRouter` with prefix, not bare routes on the app

### SQLAlchemy 2.0 Patterns
- Use `select()` + `session.execute()` — not the legacy `session.query()` style
- Always use `db: AsyncSession = Depends(get_db)` in route signatures
- Relationships: define with `relationship()` + `back_populates`; be explicit about `lazy`
- UUIDs: generated automatically via `default=uuid4` in model column definitions
- Never expose raw SQLAlchemy model objects — always convert to Pydantic schema first

### Alembic Workflow
```bash
# Generate a new migration after changing models
alembic revision --autogenerate -m "description of change"

# Always review the generated file before applying
alembic upgrade head

# Check current state
alembic current
```
- Migrations run automatically on Railway deploy (via `Procfile`)
- Never edit an already-applied migration — create a new one instead
- If `autogenerate` misses something, write the migration manually

### Matching Engine (`services/matching_engine.py`)
- Tenant names in bank statements are abbreviated — fuzzy matching is essential
- Names support both `first last` and `last first` ordering
- Phone numbers: normalize to `+972` format before comparing
- This is the most critical service — test it thoroughly with `pytest`

### Testing
```bash
cd backend && pytest                    # run all tests
cd backend && pytest tests/test_matching.py  # run specific file
```
- Test the matching engine with edge cases: abbreviated names, reversed order, missing phone
- Use real DB patterns where possible — mocking DB led to false positives in the past

### Code Style
- PEP 8 everywhere
- Type hints on **all** function signatures — no bare `def foo(x):`
- Pydantic schemas for all request bodies and responses
- Keep business logic in `services/`, not in routers

### Dependencies
- Pin all versions in `requirements.txt` (`pip freeze > requirements.txt` after installs)
- `runtime.txt` specifies the Python version for Railway

### Checklist Before Done
- [ ] `pytest` passes with no failures
- [ ] New model changes have an Alembic migration
- [ ] Pydantic schemas added/updated for new fields
- [ ] Frontend `src/types/index.ts` updated to match schema changes
- [ ] All route endpoints use trailing slash
