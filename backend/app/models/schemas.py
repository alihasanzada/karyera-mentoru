from typing import Literal
from pydantic import BaseModel, Field

class UploadResponse(BaseModel):
    filename: str
    pages: int
    characters: int
    text: str

class Recommendation(BaseModel):
    title: str = Field(description="Tövsiyənin qısa başlığı")
    details: str = Field(description="Nə etmək lazımdır, 1-3 cümlə, konkret addımlarla")
    priority: Literal["high", "medium", "low"]


class CVAnalysis(BaseModel):
    summary: str = Field(description="CV haqqında 2-3 cümləlik ümumi qiymətləndirmə")
    cv_score: int = Field(description="CV-nin keyfiyyət balı, 0-dan 100-ə qədər")
    detected_skills: list[str] = Field(description="CV-də tapılan bacarıqlar")
    strengths: list[str]
    weaknesses: list[str]
    missing_skills: list[str] = Field(description="Profilə görə çatışan bacarıqlar")
    recommendations: list[Recommendation]


class AnalyzeResponse(BaseModel):
    filename: str
    pages: int
    analysis: CVAnalysis

class SkillCheck(BaseModel):
    skill: str = Field(description="Bacarığın adı (rol faylındakı kimi, dəyişdirmədən)")
    status: Literal["has", "partial", "missing"]
    evidence: str = Field(description="CV-dən qısa dəlil. Yoxdursa boş sətir.")


class ActionStep(BaseModel):
    title: str
    details: str = Field(description="Konkret nə etmək lazımdır, 1-3 cümlə")
    timeframe: str = Field(description="Təxmini müddət, məs: 2 həftə")


class MatchLLMOutput(BaseModel):
    """Gemini-nin qaytardığı hissə (bal burada YOXDUR, kod hesablayır)."""
    required: list[SkillCheck]
    preferred: list[SkillCheck]
    summary: str = Field(description="Namizədin bu sahəyə hazırlığı haqqında 2-3 cümlə")
    action_plan: list[ActionStep]


class FieldInfo(BaseModel):
    id: str
    name: str
    level: str
    description: str


class MatchResponse(BaseModel):
    filename: str
    pages: int
    field_id: str
    field_name: str
    match_score: int
    readiness: Literal["ready", "almost_ready", "needs_work"]
    required_skills: list[SkillCheck]
    preferred_skills: list[SkillCheck]
    summary: str
    action_plan: list[ActionStep]

class HistoryItem(BaseModel):
    id: int
    kind: Literal["match", "cv"]
    field_id: str | None = None
    filename: str
    score: int | None = None
    created_at: str


class HistoryDetail(HistoryItem):
    result: dict