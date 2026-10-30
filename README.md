# Career Mentor

Download the CV (PDF), analyze it with Gemini, see its relevance to your chosen field (Frontend, Cybersecurity, Data Science) and the development plan.

## Installation
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env   # Fill in GEMINI_API_KEY and GEMINI_MODEL
```

## Startup
```bash
cd backend
uvicorn app.main:app --reload
```
In the browser: http://localhost:8000 (API documentation: /docs)

## Tests
```bash
cd backend && pytest -q
```
Frontend request-flow tests (Node.js 22 or newer, from the repository root):
```bash
node --test frontend/tests/*.test.cjs
```
Tests use a temporary database and mocked AI responses; no API key or paid calls are needed.

## Add field
Add a new JSON file to the `backend/app/data/roles/` folder (copy it from existing files) and restart the server.

## Notes
- The original PDF and full extracted CV text are not stored. Analysis results, including quoted CV excerpts and filenames, are saved in the local SQLite database (`karyera.db`). The evaluation cache also stores excerpts, with filenames removed.
- CV text is sent to Gemini for analysis. Review this data flow and retention policy before accepting real users' CVs.
- There is no user account yet; the history is tied to an `X-Client-Id` value in browser storage. This is not authentication. Add authentication and request limits before making the application publicly accessible.
- CV evaluation, three static role profiles, history, and roadmap generation are implemented. Vacancies, application tracking, and mentor chat are placeholders; there is no live job-market feed yet.
- `/api/evaluate` returns `evaluation_id` for the exact saved result. Use that ID for `/api/roadmap/{evaluation_id}` instead of inferring it from the newest history entry.
- Deleting or pruning a history entry removes its saved roadmap. Evaluation-cache retention and deletion still need a separate policy.
