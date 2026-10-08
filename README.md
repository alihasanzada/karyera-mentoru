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

## Add field
Add a new JSON file to the `backend/app/data/roles/` folder (copy it from existing files) and restart the server.

## Notes
- The CV text is not stored; only the analysis result and the file name are saved in the local SQLite database (`karyera.db`).
- There is no user account yet; the history is tied to the browser. Add authentication before making it accessible online.