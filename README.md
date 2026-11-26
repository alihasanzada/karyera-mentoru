# Karyera Mentoru

AI career mentor for the Azerbaijani market. Upload a CV (PDF), get an explainable score from Gemini, compare it with your specialty (122 specialties in 7 groups, the same list as the site design) and receive a 7/14/21 day roadmap.

## Local beta on Windows

From the repository root in PowerShell with Python 3.12:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8679
```

Open [the canonical beta](http://127.0.0.1:8679/dizayn/). Use `/dizayn/` for browser tests and the presentation, and `/dizayn/#kabinet` for the signed-in dashboard. The API docs are at `/docs`, and `/` serves the original interface. On other platforms create the virtual environment with `python3.12 -m venv .venv` and use `.venv/bin/python` for the same commands.

In VS Code, press **Ctrl+Shift+B** or select **Tasks: Run Task → Start Karyera Mentoru Beta**. The workspace task uses `.venv`, starts FastAPI on port 8679 and opens `/dizayn/`. If a matching beta is already running, it opens that server. If a different service occupies the port, the task reports the conflict. Use **Tasks: Terminate Task** to stop a server started by the task.

For live AI features, set the existing approved `GEMINI_API_KEY` and `GEMINI_MODEL` in the ignored `.env` file. If setting `GEMINI_MODELS`, its list takes precedence over `GEMINI_MODEL`. Use a fictional text PDF for the demonstration. Profiles and saved history work independently of Gemini after email verification. An optional `DATABASE_PATH` points to a separate SQLite file for a clean demo. The default database is `karyera.db` at the repository root. Reuse the same database path on restarts to keep the same accounts and data.

### Email verification

Both `/` and `/dizayn/` require an email code after the password check. Set these variables in the backend's Git-ignored `.env` and restart the server.

| Variable | Value |
| --- | --- |
| `OTP_SECRET` | A dedicated random secret at least 32 bytes long. Generate it locally with `python -c "import secrets; print(secrets.token_urlsafe(32))"` and keep it stable across restarts. |
| `SMTP_HOST` | Your provider's SMTP hostname. For Gmail use `smtp.gmail.com`. |
| `SMTP_SECURITY` and `SMTP_PORT` | `starttls` with port `587` or `ssl` with port `465`. Set the port explicitly when your provider uses another TLS port. |
| `SMTP_FROM` | The sender's email address authorized by the provider. |
| `SMTP_USERNAME` and `SMTP_PASSWORD` | Provider SMTP credentials. For Gmail use the full email address and an eligible Google App Password after enabling 2-Step Verification. Some organizational accounts restrict App Passwords. A trusted SMTP relay can leave both variables empty. |

Codes expire after 5 minutes, can be tried 5 times, and can be resent after 60 seconds. A successful resend replaces the earlier code. Login requires successful delivery and verification. Users with older password-only sessions sign in again after upgrading. Serve production deployments over HTTPS for secure cookies. The file-opened design preview supports anonymous demo analysis only.

[Google App Passwords](https://support.google.com/accounts/answer/185833)

## Tests
```bash
cd backend && pytest -q
```
Frontend request-flow tests (Node.js 22 or newer, from the repository root):
```bash
node --test frontend/tests/*.test.cjs
```
Tests mock SMTP and Gemini. To avoid opening your normal SQLite file during app setup, set `DATABASE_PATH=:memory:` before running pytest (`$env:DATABASE_PATH=':memory:'` in PowerShell).

## Add a specialty
Specialties live in `backend/app/data/specialties.json` (group → specialty `id`, `name`, `profile`). Each specialty points to a skill profile in `backend/app/data/profiles/<profile>.json` (`role`, `required_skills`, `preferred_skills`, `ats_keywords`). Both lists mirror `PROFILES` and `SPECIALTY_GROUPS` in `dizayn/js/script.js`; change them together, then restart the server. The ids `frontend`, `cybersecurity` and `data_science` are kept for earlier history entries.

## Notes
- The original PDF and full extracted CV text are not stored. Analysis results, including quoted CV excerpts and filenames, are saved in the local SQLite database (`karyera.db`). The evaluation cache also stores excerpts, with filenames removed.
- Signup requires an 8-character password, first name, surname, specialty, email and consent. Sign in after creating the account. The design and dashboard UIs use one profile store. Existing design account fields are copied only when there is no saved profile. Legacy columns are left intact.
- CV analysis sends text to Gemini. Mentor context uses selected profile fields, scores, role skills, roadmap progress and up to three recent turns. Successful mentor turns are saved to the account in SQLite and the chat shows up to 50 recent turns. Use fictional CVs for the beta.
- The catalog covers 122 specialties mapped to shared skills profiles. Scores are beta estimates; coverage and scoring accuracy have not been individually validated for every specialty.
- The applications tracker is available in the dashboard. Pricing, Google sign-in, partnership, newsletter and listings are previews. The payment preview cannot collect card information.
- The local beta uses per-IP limits for login, signup and AI calls. Existing anonymous browser history is not transferred automatically. Public hosting needs account recovery, persistent storage and a complete data deletion policy.
- `/api/evaluate` returns `evaluation_id` for the exact saved result. Use that ID for `/api/roadmap/{evaluation_id}` instead of inferring it from the newest history entry.
- The career score starts from role match and is adjusted by CV quality (structure, ATS and impact). It never exceeds the selected role's match score. A match below 35 displays a low-fit warning. Previous history scores are snapshots; upload the CV again to apply a new scoring version.
- New evaluations reuse results only within the same account. Deleting or pruning a history entry removes its saved roadmap and checkmarks. Cached CV excerpts need a separate retention and deletion policy before use with real CVs.
- Existing weekly plans keep their 30/60/90-day labels. The 7, 14 and 21 day views show successive phases of one plan and share saved checkmarks.
