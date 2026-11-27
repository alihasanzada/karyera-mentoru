import argparse
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from getpass import GetPassWarning, getpass
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import warnings

from .fixtures import CASES, MENTOR_BOUNDARY_QUESTION, fictional_pdf
from .plan import MODEL, REQUESTS, plan

EVALUATION_KEY = "KARYERA_EVAL_GEMINI_API_KEY"


class WorkflowError(Exception):
    def __init__(self, stage: str, status: int):
        self.stage = stage
        self.status = status


def expect(response, status: int, stage: str):
    if response.status_code != status:
        raise WorkflowError(stage, response.status_code)
    return response.json()


@asynccontextmanager
async def evaluation_account(app, index: int, field: str) -> AsyncIterator:
    import httpx

    transport = httpx.ASGITransport(app=app, client=(f"127.0.0.{index + 2}", 50000))
    async with httpx.AsyncClient(transport=transport, base_url="https://evaluation.test", trust_env=False) as http:
        credentials = {"email": f"eval-{index}@example.test", "password": "fictional-evaluation-password"}
        expect(await http.post("/api/auth/signup", json={
            **credentials, "first_name": "Sınaq", "last_name": "Namizəd",
            "specialty_id": field, "consent": True,
        }), 201, "signup")
        expect(await http.post("/api/auth/login", json=credentials), 200, "login")
        yield http


async def run_suite(app, provider) -> list[dict]:
    from app.services import ai_analyzer as ai

    from .quality import automatic_checks

    results = []
    # Limit only this stand-alone process to the approved one-model/one-attempt path.
    with patch.multiple(ai, get_client=lambda: provider.client, _call=provider.call, ROUNDS=1), \
            patch.multiple(ai.settings, gemini_models=MODEL, auth_mode="password"):
        async with app.router.lifespan_context(app):
            for index, case in enumerate(CASES):
                provider.case = case.id
                row = {"case": case.id, "human_review": case.review}
                results.append(row)
                try:
                    async with evaluation_account(app, index, case.specialty) as http:
                        cv = expect(await http.post("/api/evaluate", data={"field_id": case.specialty},
                                                   files={"file": ("fictional.pdf", fictional_pdf(case.cv))}),
                                    200, "cv")
                        evaluation_id = cv["evaluation_id"]
                        path = f"/api/roadmap/{evaluation_id}"
                        roadmap = expect(await http.post(path), 200, "roadmap")
                        task = await http.put(f"{path}/tasks/foundation-0", json={"completed": True})
                        saved = expect(task, 200, "completion")
                        question = {"question": case.question, "evaluation_id": evaluation_id}
                        answer = expect(await http.post("/api/mentor", json=question), 200, "mentor")
                        history = expect(await http.get("/api/mentor/history"), 200, "mentor_history")
                        outputs = {stage: data for (case_id, stage), data in provider.outputs.items()
                                   if case_id == case.id}
                        row["automated_checks"] = automatic_checks(case, outputs, cv) | {
                            "saved_roadmap": roadmap["generated"] and "foundation-0" in saved["completed_task_ids"],
                            "saved_mentor": bool(history) and history[-1]["answer"] == answer["answer"],
                        }
                        row["status"] = "complete"
                except WorkflowError as error:
                    row.update(status="incomplete", failed_stage=error.stage, http_status=error.status)

            for index, name in enumerate(("mentor-boundary", "legacy-cv"), start=len(CASES)):
                provider.case = name
                row = {"case": name, "status": "complete"}
                results.append(row)
                try:
                    async with evaluation_account(app, index, CASES[0].specialty) as http:
                        if name == "mentor-boundary":
                            answer = expect(await http.post("/api/mentor", json={"question": MENTOR_BOUNDARY_QUESTION}),
                                            200, "mentor")
                            row["automated_checks"] = {"mentor_length": 0 < len(answer["answer"].strip()) < 2400}
                            row["human_review"] = "Check for a concise Azerbaijani refusal and career redirection."
                        else:
                            cv = expect(await http.post("/api/cv/analyze", files={
                                "file": ("fictional.pdf", fictional_pdf(CASES[0].cv)),
                            }), 200, "legacy_cv")
                            row["automated_checks"] = {"score_in_range": 0 <= cv["analysis"]["cv_score"] <= 100}
                            row["human_review"] = "Check Azerbaijani feedback and absence of invented experience."
                except WorkflowError as error:
                    row.update(status="incomplete", failed_stage=error.stage, http_status=error.status)
    return results


async def run_live(key: str) -> dict:
    import httpx

    # Set these before app import. The stand-alone process uses disposable data and no app credential.
    with TemporaryDirectory(prefix="karyera-gemini-eval-") as directory:
        with patch.dict(os.environ, {
            "DATABASE_PATH": str(Path(directory) / "evaluation.sqlite"), "GEMINI_API_KEY": "",
            "SMTP_HOST": "", "SMTP_PASSWORD": "", "AUTH_MODE": "password",
        }):
            from app.db.database import engine
            from app.main import app
            from app.routers.mentor import MENTOR
            from app.services.ai_analyzer import LEGACY_CV
            from app.services.evaluator import CV_QUALITY
            from app.services.matcher import ROLE_MATCH
            from app.services.roadmap import ROADMAP

            from .provider import ProviderRun, RequestBudget, evaluation_client

            if engine.url.database != os.environ["DATABASE_PATH"]:
                raise RuntimeError("Evaluation requires a fresh SQLite engine")
            transport = RequestBudget(httpx.AsyncHTTPTransport(retries=0, trust_env=False))
            client = evaluation_client(key, transport)
            stages = {task.schema: task.name for task in (CV_QUALITY, ROLE_MATCH, ROADMAP, MENTOR, LEGACY_CV)}
            provider = ProviderRun(client, transport, stages)
            report = {"mode": "live", "plan": plan(), "human_quality_review": "pending"}
            try:
                report["cases"] = await run_suite(app, provider)
            except Exception as error:
                report["suite_error"] = type(error).__name__
            finally:
                await client.aio.aclose()
                client.close()
                engine.dispose()
            return report | provider.report()


def main() -> int:
    parser = argparse.ArgumentParser(description="Plan or run the synthetic Gemini evaluation suite.")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--approved-requests", type=int)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if not args.live:
        print(json.dumps({"mode": "offline-plan", **plan()}, indent=2))
        return 0
    if args.approved_requests != REQUESTS or args.report is None:
        parser.error(f"Live mode requires the API owner's approval for {REQUESTS} requests and a new --report path.")
    with warnings.catch_warnings():
        warnings.simplefilter("error", GetPassWarning)
        try:
            key = (os.environ.get(EVALUATION_KEY) or getpass("Approved evaluation API key: ")).strip()
        except GetPassWarning:
            parser.error(f"Use a terminal with hidden input or inject {EVALUATION_KEY} through a secret manager.")
    if not key:
        parser.error("Supply a separate evaluation credential.")
    with args.report.open("x", encoding="utf-8") as handle:
        try:
            result = asyncio.run(run_live(key))
        except Exception as error:
            result = {"mode": "live", "plan": plan(), "suite_error": type(error).__name__}
        json.dump(result, handle, indent=2, ensure_ascii=False)
    print(json.dumps({k: result.get(k) for k in ("mode", "requests_sent", "suite_error")}))
    cases = result.get("cases", [])
    return int("suite_error" in result or result.get("requests_sent") != REQUESTS or any(
        row["status"] != "complete" or not all(row.get("automated_checks", {}).values()) for row in cases
    ))


if __name__ == "__main__":
    raise SystemExit(main())
