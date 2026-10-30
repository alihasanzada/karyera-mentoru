import re
import unicodedata
from dataclasses import dataclass

SCORING_VERSION = "3.0"

_FOLD = str.maketrans({"ı": "i", "ə": "e"})


def norm(text: str) -> str:
    """Case, accent and punctuation insensitive form used for all text matching."""
    text = unicodedata.normalize("NFKD", text.casefold())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.translate(_FOLD)
    text = re.sub(r"[^\w\s]|_", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def has_phrase(norm_text: str, norm_phrase: str) -> bool:
    return bool(norm_phrase) and f" {norm_phrase} " in f" {norm_text} "


def quote_supported(quote: str, cv_tokens: set[str]) -> bool:
    """A quote is accepted when at least 80% of its meaningful words occur in the CV."""
    tokens = norm(quote).split()
    words = [t for t in tokens if len(t) >= 3] or tokens
    if not words:
        return False
    return sum(1 for t in words if t in cv_tokens) / len(words) >= 0.8


@dataclass(frozen=True)
class Criterion:
    id: str
    category: str
    label: str
    weight: int
    fix: str
    kind: str = "code"
    question: str = ""


@dataclass(frozen=True)
class Check:
    ratio: float
    evidence: str = ""
    fix_extra: str = ""


CRITERIA = (
    Criterion("s_email", "structure", "E-poçt ünvanı", 10,
              "CV-nin yuxarı hissəsində e-poçt ünvanını göstər."),
    Criterion("s_phone", "structure", "Telefon nömrəsi", 10,
              "Telefon nömrəsini beynəlxalq formatda (+994 ...) əlavə et."),
    Criterion("s_link", "structure", "LinkedIn, GitHub və ya portfolio linki", 10,
              "LinkedIn və ya GitHub profil linkini əlavə et."),
    Criterion("s_summary", "structure", "Qısa peşəkar xülasə", 10,
              "2-3 cümləlik qısa peşəkar xülasə bölməsi əlavə et."),
    Criterion("s_experience", "structure", "İş təcrübəsi və ya layihələr bölməsi", 15,
              "İş təcrübəsi və ya layihələr üçün ayrıca bölmə yarat."),
    Criterion("s_education", "structure", "Təhsil bölməsi", 10,
              "Təhsil məlumatlarını ayrıca bölmədə göstər."),
    Criterion("s_skills", "structure", "Bacarıqlar bölməsi", 15,
              "Texniki bacarıqları ayrıca, aydın başlıqlı bölmədə qruplaşdır."),
    Criterion("s_languages", "structure", "Dil biliyi", 5,
              "Dil biliklərini səviyyə ilə göstər (məs: İngilis dili - B2)."),
    Criterion("s_length", "structure", "Uyğun uzunluq (1-2 səhifə)", 15,
              "CV-ni 1-2 səhifəyə sığdır, ən vacib məlumatları saxla."),

    Criterion("a_headings", "ats", "Standart bölmə başlıqları", 25,
              "Bölmələri standart başlıqlarla adlandır: İş təcrübəsi, Təhsil, Bacarıqlar."),
    Criterion("a_dates", "ats", "Tarixlərin aydın göstərilməsi", 15,
              "İş və təhsil tarixlərini il ilə açıq yaz (məs: 2021 - 2024)."),
    Criterion("a_text", "ats", "Mətnin təmiz oxunması", 10,
              "İkon şriftlərindən və xüsusi simvollardan istifadə etmə, sadə mətn yaz."),
    Criterion("a_keywords", "ats", "Sahəyə aid açar sözlər", 50,
              "Hədəf sahənin açar sözlərini bacarıqlar və təcrübə bölməsində təbii şəkildə işlət."),

    Criterion("i_metrics", "impact", "Rəqəmlərlə ifadə olunmuş nəticələr", 30,
              "Nailiyyətləri rəqəm və faizlərlə yaz (məs: insident cavab vaxtını 30% azaltdım)."),
    Criterion("i_outcomes", "impact", "Vəzifələr yox, nəticələr", 25,
              "Hər təcrübə bəndini görülən işin nəticəsi ilə tamamla.", "llm",
              "Experience or project entries describe outcomes and achievements (what changed or improved), not only a list of duties."),
    Criterion("i_tools", "impact", "Konkret alət və texnologiyalar", 20,
              "İstifadə etdiyin alət və texnologiyaları təcrübə və layihə təsvirlərində adla qeyd et.", "llm",
              "Specific tools, technologies or methods are named inside experience or project descriptions, not only in a skills list."),
    Criterion("i_scope", "impact", "İşin miqyasının göstərilməsi", 10,
              "Komanda ölçüsü, sistem və ya istifadəçi sayı kimi miqyas göstəricilərini əlavə et.", "llm",
              "The scope or scale of the work is stated (team size, number of systems, users, incidents, budget or similar)."),
    Criterion("i_practice", "impact", "Praktiki təcrübə və layihələr", 15,
              "Şəxsi layihə, müsabiqə, laboratoriya və ya açıq mənbə fəaliyyətini CV-də göstər.", "llm",
              "The CV shows hands-on practice beyond job duties: personal projects, competitions, labs, open-source work or practical certifications."),
)

_RAW_SECTION_WORDS = {
    "summary": ["summary", "profile", "about me", "objective", "xülasə", "peşəkar xülasə",
                "haqqımda", "məqsəd", "профиль", "о себе"],
    "experience": ["experience", "work experience", "employment", "work history", "iş təcrübəsi",
                   "təcrübə", "əmək fəaliyyəti", "опыт работы", "опыт"],
    "education": ["education", "təhsil", "образование"],
    "skills": ["skills", "technical skills", "key skills", "bacarıqlar", "texniki bacarıqlar", "навыки"],
    "languages": ["languages", "language skills", "dillər", "dil biliyi", "языки"],
    "projects": ["projects", "layihələr", "проекты"],
}
SECTION_WORDS = {k: [norm(w) for w in words] for k, words in _RAW_SECTION_WORDS.items()}
SECTION_NAMES = {"experience": "İş təcrübəsi", "education": "Təhsil", "skills": "Bacarıqlar"}

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\s().-]?){9,15}(?!\d)")
LINK_RE = re.compile(r"(linkedin|github|gitlab|behance|kaggle|tryhackme|hackthebox|portfolio|https?://)", re.I)
YEAR_RE = re.compile(r"(?<!\d)(?:19|20)\d{2}(?!\d)")
_URL_RE = re.compile(r"https?://\S+|www\.\S+")
_DATE_RE = re.compile(r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}/\d{4}")
_METRIC_RE = re.compile(
    r"\d+\s*%|\d+\s*\+|(?<!\d)\d{2,}(?!\d)|(?<!\d)[1-9]\s*(?:il|ay|saat|years?|months?|hours?)\b",
    re.IGNORECASE,
)


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def _sections_found(lines: list[str]) -> set[str]:
    found: set[str] = set()
    for ln in lines:
        n = norm(ln)
        if not n:
            continue
        short = len(n.split()) <= 4
        for section, words in SECTION_WORDS.items():
            if section in found:
                continue
            for w in words:
                inline = n.startswith(w + " ") and ":" in ln[:40]
                if (short and has_phrase(n, w)) or inline:
                    found.add(section)
                    break
    return found


def _quantified_lines(text: str) -> int:
    count = 0
    for line in text.splitlines():
        if len(line.strip()) < 25:
            continue
        cleaned = line
        for pattern in (EMAIL_RE, _URL_RE, PHONE_RE, _DATE_RE, YEAR_RE):
            cleaned = pattern.sub(" ", cleaned)
        if _METRIC_RE.search(cleaned):
            count += 1
    return count


def run_code_checks(text: str, pages: int, ats_keywords: list[str]) -> dict[str, Check]:
    """Objective criteria computed purely from the extracted text."""
    sections = _sections_found(_lines(text))
    n_text = norm(text)

    def flag(found: bool) -> Check:
        return Check(1.0 if found else 0.0, "Tapıldı." if found else "")

    checks: dict[str, Check] = {
        "s_email": flag(bool(EMAIL_RE.search(text))),
        "s_phone": flag(bool(PHONE_RE.search(text))),
        "s_link": flag(bool(LINK_RE.search(text))),
        "s_summary": flag("summary" in sections),
        "s_experience": flag("experience" in sections or "projects" in sections),
        "s_education": flag("education" in sections),
        "s_skills": flag("skills" in sections),
        "s_languages": flag("languages" in sections),
    }

    length_ratio = 1.0 if pages <= 2 else 0.5 if pages == 3 else 0.0
    checks["s_length"] = Check(length_ratio, f"{pages} səhifə")

    required = ("experience", "education", "skills")
    found = [s for s in required if s in sections]
    missing = [SECTION_NAMES[s] for s in required if s not in sections]
    checks["a_headings"] = Check(
        len(found) / len(required),
        f"{len(found)}/{len(required)} standart başlıq tapıldı.",
        f"Çatışan başlıqlar: {', '.join(missing)}." if missing else "",
    )

    years = set(YEAR_RE.findall(text))
    checks["a_dates"] = Check(min(1.0, len(years) / 3), f"{len(years)} fərqli il tapıldı.")

    bad = sum(1 for ch in text if ch == "\ufffd" or unicodedata.category(ch) in ("Co", "Cn"))
    bad_ratio = bad / max(1, len(text))
    text_ratio = 1.0 if bad_ratio <= 0.002 else 0.5 if bad_ratio <= 0.01 else 0.0
    checks["a_text"] = Check(text_ratio, "" if text_ratio == 1.0 else f"{bad} qeyri-standart simvol tapıldı.")

    if ats_keywords:
        hits = [k for k in ats_keywords if has_phrase(n_text, norm(k))]
        ratio = min(1.0, (len(hits) / len(ats_keywords)) / 0.5)
        absent = [k for k in ats_keywords if k not in hits][:6]
        extra = (
            f"Sahə üçün açar sözlər (yalnız həqiqətən bildiklərini əlavə et): {', '.join(absent)}."
            if absent and ratio < 1.0 else ""
        )
        checks["a_keywords"] = Check(ratio, f"{len(hits)}/{len(ats_keywords)} açar söz tapıldı.", extra)
    else:
        checks["a_keywords"] = Check(1.0, "")

    n = _quantified_lines(text)
    checks["i_metrics"] = Check(min(1.0, n / 3), f"{n} rəqəmlə ifadə olunmuş sətir tapıldı.")
    return checks
