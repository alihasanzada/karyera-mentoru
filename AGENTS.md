# Karyera Mentoru

- Follow the existing FastAPI, SQLAlchemy/SQLite, Gemini and plain JavaScript architecture. The beta UI lives in `dizayn/` and is served by FastAPI at `/dizayn/`. Preserve the existing design and coordinate changes to shared UI files.
- Keep user-facing copy in Azerbaijani. Provide realistic career guidance without guaranteeing employment. New plans cover days 1–7, 8–14 and 15–21. Keep saved weekly plans in their original 30/60/90-day format.
- The backend owns validation, scoring, account isolation and persistence. Derive account ownership from the authenticated session. Render model and user text as text, and send the mentor only the context needed for the question.
- Use synthetic CVs and mock Gemini for routine checks. Treat credentials, CVs, database files and quoted CV text as private. Ask before sending real user data to a provider or making chargeable calls.
- Run focused pytest and Node checks for the behavior changed. Use Playwright for affected desktop and mobile flows and run focused security checks for account and data handling changes. Report which provider behavior was mocked.
- Look up current library APIs through Context7 when needed. Use focused Cortex recall and save concise, verified project decisions. Never store credentials or CV content in memory. Limit tool output to useful evidence and delegate only separable work that benefits from a specialist.
- Develop on a feature branch. Preserve teammate commits and get approval before pushing, merging, deploying or connecting Trello.
