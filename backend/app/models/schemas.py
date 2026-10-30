from typing import Literal

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    filename: str
    pages: int
    characters: int
    text: str


class Recommendation(BaseModel):
    title: str = Field(description="Short recommendation title")
    details: str = Field(description="What to do, 1-3 sentences with concrete steps")
    priority: Literal["high", "medium", "low"]


class CVAnalysis(BaseModel):
    summary: str = Field(description="Overall assessment of the CV in 2-3 sentences")
    cv_score: int = Field(description="CV quality score as an integer from 0 to 100")
    detected_skills: list[str] = Field(description="Skills found in the CV")
    strengths: list[str]
    weaknesses: list[str]
    missing_skills: list[str] = Field(description="Skills missing for the candidate's profile")
    recommendations: list[Recommendation]


class AnalyzeResponse(BaseModel):
    filename: str
    pages: int
    analysis: CVAnalysis


class SkillCheck(BaseModel):
    skill: str = Field(description="Skill name exactly as written in the role file")
    status: Literal["has", "partial", "missing"]
    evidence: str = Field(description="Verbatim CV excerpt supporting the status, empty if missing")


class ActionStep(BaseModel):
    title: str
    details: str = Field(description="Concrete actions, 1-3 sentences")
    timeframe: str = Field(description="Approximate duration, for example 2 weeks")


class MatchLLMOutput(BaseModel):
    required: list[SkillCheck]
    preferred: list[SkillCheck]
    summary: str = Field(description="2-3 sentences on the candidate's readiness for this field")
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
    kind: Literal["match", "cv", "evaluation"]
    field_id: str | None = None
    filename: str
    score: int | None = None
    created_at: str


class HistoryDetail(HistoryItem):
    result: dict


class ScoreCategory(BaseModel):
    score: int = Field(description="Integer from 0 to 100")
    reasoning: str
    positives: list[str]
    issues: list[str]
    fixes: list[str]


class CriterionResult(BaseModel):
    id: str = ""
    label: str
    status: Literal["has", "partial", "missing"]
    weight: int = 0
    evidence: str = ""


class CategoryResult(ScoreCategory):
    key: Literal["structure", "ats", "impact", "field_fit"]
    label: str
    criteria: list[CriterionResult] = []


class CriterionVerdict(BaseModel):
    id: str = Field(description="Criterion id copied exactly from the input")
    status: Literal["yes", "partial", "no"]
    quote: str = Field(description="Verbatim CV excerpt of at most 12 words, empty when status is no")


class EvaluationLLMOutput(BaseModel):
    summary: str
    detected_skills: list[str]
    verdicts: list[CriterionVerdict]


class EvaluationResponse(BaseModel):
    evaluation_id: int | None = None
    filename: str
    pages: int
    field_id: str
    field_name: str
    overall_score: int
    readiness: Literal["ready", "almost_ready", "needs_work"]
    summary: str
    categories: list[CategoryResult]
    detected_skills: list[str]
    strengths: list[str]
    weaknesses: list[str]
    recommendations: list[Recommendation]
    match: MatchResponse


class ResourceItem(BaseModel):
    title: str = Field(description="Resource name, for example a playlist, documentation or certification name")
    kind: Literal["video", "docs", "course", "certification", "practice"]
    provider: str = Field(description="Platform or publisher, for example YouTube or Cisco Networking Academy")
    cost: Literal["free", "freemium", "paid"]
    search_query: str = Field(description="Short English query that finds this resource on a search engine")


class GapInsight(BaseModel):
    skill: str = Field(description="Skill name copied exactly from the input")
    why_it_matters: str
    resources: list[ResourceItem]


class WeeklyTask(BaseModel):
    week: int
    title: str
    details: str
    deliverable: str = Field(description="Measurable output of the task")


class PhasePlan(BaseModel):
    goal: str
    milestone: str
    tasks: list[WeeklyTask]


class RoadmapLLMOutput(BaseModel):
    summary: str
    gaps: list[GapInsight]
    foundation: PhasePlan
    practice: PhasePlan
    interview: PhasePlan


class GapSkill(BaseModel):
    skill: str
    tier: Literal["required", "preferred"]
    status: Literal["has", "partial", "missing"]
    evidence: str
    priority: Literal["critical", "important", "nice_to_have"] | None = None
    why_it_matters: str = ""
    resources: list[ResourceItem] = []


class CareerGap(BaseModel):
    required_coverage: int
    preferred_coverage: int
    skills: list[GapSkill]


class RoadmapPhaseResult(BaseModel):
    key: Literal["foundation", "practice", "interview"]
    label: str
    days: str
    goal: str
    milestone: str
    tasks: list[WeeklyTask]


class RoadmapResponse(BaseModel):
    evaluation_id: int
    field_id: str
    field_name: str
    generated: bool
    summary: str
    career_gap: CareerGap
    roadmap: list[RoadmapPhaseResult]
