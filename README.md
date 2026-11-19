# Karyera Mentoru

AI career mentor for the Azerbaijani market. Upload a CV (PDF), get an explainable score from Gemini, compare it with your specialty (122 specialties in 7 groups, the same list as the site design) and receive a 7/14/21 day roadmap.

## Installation
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
```

## Startup
```bash
cd backend
uvicorn app.main:app --reload
```
In the browser: http://localhost:8000 (API documentation: /docs)

The landing-page site from `dizayn/` is served at http://localhost:8000/dizayn/. Served this way it uses the real API (sign-up/login, CV evaluation, history, 7/14/21 day roadmap). Opened directly as a file it runs in demo mode with sample data.

## Tests
```bash
cd backend && pytest -q
```
Frontend request-flow tests (Node.js 22 or newer, from the repository root):
```bash
node --test frontend/tests/*.test.cjs
```
Tests use a temporary database and mocked AI responses; no API key or paid calls are needed.

## Add a specialty
Specialties live in `backend/app/data/specialties.json` (group → specialty `id`, `name`, `profile`). Each specialty points to a skill profile in `backend/app/data/profiles/<profile>.json` (`role`, `required_skills`, `preferred_skills`, `ats_keywords`). Both lists mirror `PROFILES` and `SPECIALTY_GROUPS` in `dizayn/js/script.js`; change them together, then restart the server. The ids `frontend`, `cybersecurity` and `data_science` are kept for earlier history entries.

## Notes
- The original PDF and full extracted CV text are not stored. Analysis results, including quoted CV excerpts and filenames, are saved in the local SQLite database (`karyera.db`). The evaluation cache also stores excerpts, with filenames removed.
- CV text is sent to Gemini for analysis. Review this data flow and retention policy before accepting real users' CVs.
- Sign up with first name, last name, specialty, email, a password of at least 8 characters and consent, then sign in (signup does not create a session). Name and specialty can be changed on the Profile page (`PATCH /api/auth/me`). Older databases get the new user columns automatically on startup. Password hashes and seven-day login sessions are stored in SQLite. A session cookie is HttpOnly, SameSite=Strict and Secure on HTTPS. Users only see their own analysis history and roadmaps. A roadmap can be opened for any saved evaluation at `#/roadmap/<evaluation_id>`.
- Existing history from the earlier anonymous `X-Client-Id` version is not transferred automatically. Keep the old local database as a backup, then upload the CV again in the new account.
- Add login rate limits, password reset/email verification, CSRF defenses for cross-origin deployments, data deletion, and persistent database storage before opening the site to the public.
- CV evaluation, static specialty profiles, history, and roadmap generation are implemented. The applications tracker (status, next step, notes) is available in the app. Vacancies and mentor chat are placeholders; there is no live job-market feed yet.
- `/api/evaluate` returns `evaluation_id` for the exact saved result. Use that ID for `/api/roadmap/{evaluation_id}` instead of inferring it from the newest history entry.
- The career score starts from role match and is adjusted by CV quality (structure, ATS and impact). It never exceeds the selected role's match score. A match below 35 displays a low-fit warning. Previous history scores are snapshots; upload the CV again to apply a new scoring version.
- Deleting or pruning a history entry removes its saved roadmap. Evaluation-cache retention and deletion still need a separate policy.
