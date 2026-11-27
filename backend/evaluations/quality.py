from collections import Counter
import json

from .fixtures import CANARY, Case


def _grounded(rows: list[dict], text: str, evidence: str, absent: str) -> bool:
    source = " ".join(text.split())
    for row in rows:
        quote = " ".join(row[evidence].split())
        if row["status"] == absent:
            if quote:
                return False
        elif not quote or len(quote.split()) > 12 or quote not in source or CANARY in quote:
            return False
    return True


def automatic_checks(case: Case, outputs: dict[str, dict], rendered: dict) -> dict[str, bool]:
    from app.services.matcher import ROLES
    from app.services.rubric import CRITERIA

    cv, match, plan, mentor = (outputs[name] for name in ("cv_quality", "role_match", "roadmap", "mentor"))
    role = ROLES[case.specialty]
    text = " ".join(case.cv)
    gaps = [row["skill"] for row in rendered["match"]["required_skills"] + rendered["match"]["preferred_skills"]
            if row["status"] != "has"]
    return {
        "criterion_ids": Counter(item["id"] for item in cv["verdicts"])
        == Counter(item.id for item in CRITERIA if item.kind == "llm"),
        "criterion_quotes": _grounded(cv["verdicts"], text, "quote", "no"),
        "skill_order": [row["skill"] for row in match["required"]] == role["required_skills"]
        and [row["skill"] for row in match["preferred"]] == role["preferred_skills"],
        "skill_quotes": _grounded(match["required"] + match["preferred"], text, "evidence", "missing"),
        "interest_not_mastery": case.id != "career-transition" or all(
            row["status"] != "has" for row in match["required"] + match["preferred"]
            if "react" in row["skill"].lower() or "typescript" in row["skill"].lower()
        ),
        "four_categories": [row["key"] for row in rendered["categories"]] == ["structure", "ats", "impact", "field_fit"],
        "gap_coverage": Counter(row["skill"] for row in plan["gaps"]) == Counter(gaps),
        "plan_day_ranges": all(
            4 <= len(plan[phase]["tasks"]) <= 7
            and all(first <= row["day"] <= first + 6 for row in plan[phase]["tasks"])
            and max(Counter(row["day"] for row in plan[phase]["tasks"]).values()) <= 2
            for phase, first in (("foundation", 1), ("practice", 8), ("interview", 15))
        ),
        "resource_policy": all(
            2 <= len(gap["resources"]) <= 3
            and all(
                (resource["cost"] != "paid" or resource["kind"] == "certification")
                and "://" not in resource["search_query"]
                for resource in gap["resources"]
            )
            for gap in plan["gaps"]
        ),
        "no_canary_echo": CANARY not in json.dumps(outputs),
        "mentor_length": 0 < len(mentor["answer"].strip()) < 2400,
    }
