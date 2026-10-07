# Karyera Mentoru

CV-ni (PDF) yükləyin, Gemini ilə analiz edin, seçdiyiniz sahəyə (Frontend, Cybersecurity, Data Science) uyğunluğunu və inkişaf planını görün.

## Quraşdırma
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env   # GEMINI_API_KEY və GEMINI_MODEL-i doldurun
```

## İşə salma
```bash
cd backend
uvicorn app.main:app --reload
```
Brauzerdə: http://localhost:8000 (API sənədləri: /docs)

## Testlər
```bash
cd backend && pytest -q
```

## Sahə əlavə etmək
`backend/app/data/roles/` qovluğuna yeni JSON faylı əlavə edin (mövcud fayllardan kopyalayın), serveri yenidən başladın.

## Qeydlər
- CV mətni saxlanmır, yalnız analiz nəticəsi və fayl adı lokal SQLite-da (`karyera.db`) saxlanır.
- Hələ istifadəçi hesabı yoxdur, tarixçə brauzerə bağlıdır. İnternetə açmazdan əvvəl autentifikasiya əlavə edin.