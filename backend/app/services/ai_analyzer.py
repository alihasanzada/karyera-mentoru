import asyncio
import logging
import time
from pathlib import Path
from typing import TypeVar

from google import genai
from google.genai import errors, types
import httpx
import httpx2
from pydantic import BaseModel

from app.config import settings
from app.models.schemas import CVAnalysis

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "analyze_cv.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")
MAX_CV_CHARS = 15000

CALL_TIMEOUT = 45
TOTAL_BUDGET = 150
ROUNDS = 2
SEED = 42

T = TypeVar("T", bound=BaseModel)
_client: genai.Client | None = None
logger = logging.getLogger(__name__)


class AIAnalysisError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise AIAnalysisError("GEMINI_API_KEY təyin olunmayıb.", 500)
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
            temperature=0.0,
            seed=SEED,
        ),
    )
    result = response.parsed
    if not isinstance(result, schema):
        raise AIAnalysisError("AI cavabı gözlənilən formatda gəlmədi.", 502)
    return result


async def generate_structured(system_prompt: str, contents: str, schema: type[T]) -> T:
    """It checks the models sequentially. If one returns a 503/timeout, it immediately moves on to the next one.."""
    # Fail immediately on local configuration errors, preserving the useful message.
    get_client()
    chain = settings.model_chain
    dead: set[str] = set()  # Models returning 400/403/404 errors are not re-checked
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
                logger.info("Gemini OK: %s (%.1f seconds)", model, time.monotonic() - started)
                return result
                
            except TimeoutError:
                last_code = 504
                logger.warning("Gemini timeout: %s", model)
            except (httpx.TransportError, httpx2.TransportError):
                last_code = 503
                logger.warning("Gemini connection failed: %s", model)
            except AIAnalysisError as e:  # The model returned a response in an incorrect format
                if e.status_code != 502:
                    raise
                last_code = 502
                logger.warning("Gemini response format error: %s", model)
            except errors.APIError as e:
                last_code = e.code
                logger.warning("Gemini API error: %s (%s)", model, e.code)
                if e.code in (400, 403, 404):  # Model or key problem; repeating it is pointless.
                    dead.add(model)

        if all(model in dead for model in chain):
            break
        if round_no < ROUNDS - 1 and deadline - time.monotonic() > 10:
            await asyncio.sleep(3)
        else:
            break

    if last_code in (429, 503, 504):
        raise AIAnalysisError(
            "AI xidməti hazırda əlçatan deyil. 1–2 dəqiqə sonra yenidən cəhd et.", 503
        )
    raise AIAnalysisError("AI xidməti ilə əlaqə zamanı xəta baş verdi. Model və API açarı sazlamalarını yoxla.", 502)


async def analyze_cv(cv_text: str) -> CVAnalysis:
    contents = f"<cv>\n{cv_text[:MAX_CV_CHARS]}\n</cv>\n\nYuxarıdakı CV-ni analiz et."
    return await generate_structured(SYSTEM_PROMPT, contents, CVAnalysis)
