from dataclasses import dataclass
from decimal import Decimal

from .fixtures import CASES

MODEL = "gemini-3.5-flash-lite"
INPUT_USD_PER_M = Decimal("0.30")
OUTPUT_USD_PER_M = Decimal("2.50")


@dataclass(frozen=True)
class Budget:
    requests: int
    estimated_input: int
    max_output: int


BUDGET = {
    "cv_quality": Budget(len(CASES), 6400, 2048),
    "role_match": Budget(len(CASES), 5000, 3072),
    "roadmap": Budget(len(CASES), 16000, 8192),
    "mentor": Budget(len(CASES) + 1, 8500, 2048),
    "legacy_cv": Budget(1, 4500, 2048),
}
REQUESTS = sum(item.requests for item in BUDGET.values())


def usd(input_tokens: int, output_tokens: int) -> str:
    return str(((input_tokens * INPUT_USD_PER_M + output_tokens * OUTPUT_USD_PER_M)
                / 1_000_000).quantize(Decimal("0.000001")))


def plan() -> dict:
    input_tokens = sum(item.requests * item.estimated_input for item in BUDGET.values())
    output_tokens = sum(item.requests * item.max_output for item in BUDGET.values())
    return {
        "model": MODEL,
        "complete_run_requests": REQUESTS,
        "estimated_input_tokens": input_tokens,
        "configured_output_tokens_total": output_tokens,
        "estimated_total_tokens": input_tokens + output_tokens,
        "estimated_paid_usd": usd(input_tokens, output_tokens),
        "cases": [case.id for case in CASES] + ["mentor-boundary", "legacy-cv"],
        "tasks": {name: vars(item) for name, item in BUDGET.items()},
    }
