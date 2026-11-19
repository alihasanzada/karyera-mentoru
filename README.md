# Karyera Mentoru

AI career mentor for the Azerbaijani market. Upload a CV (PDF), get an explainable score from Gemini, compare it with a target field (Frontend, Cybersecurity, Data Science) and receive a 7/14/21 day roadmap.

## Local beta on Windows

From the repository root in PowerShell with Python 3.12:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Open [the beta](http://127.0.0.1:8000/dizayn/). The API docs are at `/docs`, and `/` serves the original interface. On other platforms create the virtual environment with `python3.12 -m venv .venv` and use `.venv/bin/python` for the same commands.

For live AI features, set the existing approved `GEMINI_API_KEY` and `GEMINI_MODEL` in the ignored `.env` file. If setting `GEMINI_MODELS`, its list takes precedence over `GEMINI_MODEL`. Use a fictional text PDF for the demonstration. Accounts, profiles and saved history are available without a provider key. An optional `DATABASE_PATH` points to a separate SQLite file for a clean demo.

## Tests
```bash
cd backend && pytest -q
```
Frontend request-flow tests (Node.js 22 or newer, from the repository root):
```bash
node --test frontend/tests/*.test.cjs
```
Tests mock Gemini. To avoid opening your normal SQLite file during app setup, set `DATABASE_PATH=:memory:` before running pytest (`$env:DATABASE_PATH=':memory:'` in PowerShell).

## Add a field
Add a new JSON file to the `backend/app/data/roles/` folder (copy it from existing files) and restart the server.

## Notes
- The original PDF and full extracted CV text are not stored. Analysis results, including quoted CV excerpts and filenames, are saved in the local SQLite database (`karyera.db`). The evaluation cache also stores excerpts, with filenames removed.
- CV text is sent to Gemini for analysis. The mentor receives selected profile fields, skills and scores, roadmap task titles, the current question and up to three recent conversation turns. It does not receive the original CV, CV excerpts, filename or email as context. The application keeps chat turns in browser memory for the current visit.
- Sign up with an email and a password of at least 12 characters, then sign in. Password hashes and seven-day login sessions are stored in SQLite. A session cookie is HttpOnly, SameSite=Strict and Secure on HTTPS. Users only see their own analysis history and roadmaps.
- Existing history from the earlier anonymous `X-Client-Id` version is not transferred automatically. Keep the old local database as a backup, then upload the CV again in the new account.
- The local beta uses per-IP rate limits for login, signup and AI endpoints in one process. Public hosting needs a shared limiter, password reset/email verification, complete data deletion, and persistent database storage.
- CV evaluation uses three static role profiles. Live vacancies, payments and university administration are deferred. The application tracker API is present, but its interface is deferred.
- `/api/evaluate` returns `evaluation_id` for the exact saved result. Use that ID for `/api/roadmap/{evaluation_id}` instead of inferring it from the newest history entry.
- The career score starts from role match and is adjusted by CV quality (structure, ATS and impact). It never exceeds the selected role's match score. A match below 35 displays a low-fit warning. Previous history scores are snapshots; upload the CV again to apply a new scoring version.
- New evaluations reuse results only within the same account. Deleting or pruning a history entry removes its saved roadmap and checkmarks. Cached CV excerpts need a separate retention and deletion policy before use with real CVs.
- Existing weekly plans keep their 30/60/90-day labels. The 7, 14 and 21 day views show successive phases of one plan and share saved checkmarks.
