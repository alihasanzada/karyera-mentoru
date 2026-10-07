import asyncio
import time
from pathlib import Path
from typing import TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from app.config import settings
from app.models.schemas import CVAnalysis

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "analyze_cv.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")
MAX_CV_CHARS = 15000

CALL_TIMEOUT = 45    # saniyə: bir Gemini sorğusu üçün maksimum gözləmə
TOTAL_BUDGET = 150   # saniyə: bütün cəhdlər üçün ümumi vaxt (frontend 180 san gözləyir)
ROUNDS = 2           # model sırası ən çox neçə dəfə keçilsin

T = TypeVar("T", bound=BaseModel)
_client: genai.Client | None = None


class AIAnalysisError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise AIAnalysisError("GEMINI_API_KEY .env faylında təyin olunmayıb.", 500)
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


async def _call(model: str, system_prompt: str, contents: str, schema: type[T]) -> T:
    response = await get_client().aio.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.3,
        ),
    )
    result = response.parsed
    if not isinstance(result, schema):
        raise AIAnalysisError("AI cavabı gözlənilən formatda gəlmədi.", 502)
    return result


async def generate_structured(system_prompt: str, contents: str, schema: type[T]) -> T:
    """Modelləri sıra ilə yoxlayır. Biri 503/timeout verərsə, dərhal növbətiyə keçir."""
    chain = settings.model_chain
    dead: set[str] = set()  # 400/403/404 verən modellər, təkrar yoxlanmır
    last_code: int | None = None
    deadline = time.monotonic() + TOTAL_BUDGET

    for round_no in range(ROUNDS):
        for model in chain:
            if model in dead:
                continue
            remaining = deadline - time.monotonic()
            if remaining < 8:
                break
            timeout = min(CALL_TIMEOUT, remaining)

            started = time.monotonic()
            try:
                result = await asyncio.wait_for(
                    _call(model, system_prompt, contents, schema), timeout=timeout
                )
                print(f"Gemini OK: {model} ({time.monotonic() - started:.1f} san)")
                return result
                
            except TimeoutError:
                last_code = 504
                print(f"Gemini timeout ({model}): {timeout:.0f} san ərzində cavab gəlmədi")
            except AIAnalysisError as e:  # model səhv formatda cavab qaytardı
                last_code = 502
                print(f"Gemini format xətası ({model}): {e}")
            except errors.APIError as e:
                last_code = e.code
                print(f"Gemini xətası ({model}): {e.code} {e.message}")
                if e.code in (400, 403, 404):  # model və ya açar problemi, təkrar mənasızdır
                    dead.add(model)

        if round_no < ROUNDS - 1 and deadline - time.monotonic() > 10:
            await asyncio.sleep(3)
        else:
            break

    if last_code in (429, 503, 504):
        raise AIAnalysisError(
            "AI xidməti hazırda çox yüklüdür. 1-2 dəqiqə sonra yenidən cəhd et.", 503
        )
    raise AIAnalysisError("AI xidməti ilə əlaqədə xəta baş verdi.", 502)


async def analyze_cv(cv_text: str) -> CVAnalysis:
    contents = f"<cv>\n{cv_text[:MAX_CV_CHARS]}\n</cv>\n\nYuxarıdakı CV-ni analiz et."
    return await generate_structured(SYSTEM_PROMPT, contents, CVAnalysis)