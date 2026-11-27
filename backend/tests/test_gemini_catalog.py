import asyncio
from collections import Counter
import json

import httpx
from google import genai
from google.genai import types
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import main
from app.db.database import get_db
from app.routers.mentor import MENTOR
from app.services import ai_analyzer
from app.services.evaluator import CV_QUALITY
from app.services.matcher import DATA_DIR, ROLE_MATCH, ROLES
from app.services.roadmap import ROADMAP
from app.services.rubric import CRITERIA, norm
from evaluations.fixtures import fictional_pdf
from evaluations.gemini import evaluation_account
from test_gemini_evaluation import _mock_result


def test_entire_catalog_through_mocked_sdk_and_real_app(tmp_path, monkeypatch):
    entries = [item for group in json.loads((DATA_DIR / "specialties.json").read_text(encoding="utf-8"))
               for item in group["items"]]
    profiles = {path.stem: json.loads(path.read_text(encoding="utf-8"))
                for path in (DATA_DIR / "profiles").glob("*.json")}
    assert len(entries) == len(ROLES) == 122
    assert len(profiles) == 54
    engine = create_engine(f"sqlite:///{tmp_path / 'catalog.sqlite'}")
    monkeypatch.setattr(main, "engine", engine)

    def isolated_db():
        with Session(engine) as db:
            yield db

    monkeypatch.setitem(main.app.dependency_overrides, get_db, isolated_db)
    by_prompt = {task.prompt: task.name for task in (CV_QUALITY, ROLE_MATCH, ROADMAP, MENTOR)}
    criteria = [criterion for criterion in CRITERIA if criterion.kind == "llm"]
    seen_profiles, finished = set(), set()
    counts = Counter()
    error_counts = Counter()
    expected, failure = {}, None
    malformed = ("json", "schema", "throttle", "unavailable")
    stages = ("cv_quality", "role_match", "roadmap", "mentor")
    bad_quote = "documents Reviewed 12"

    def respond(request):
        nonlocal failure
        body = json.loads(request.content)
        stage = by_prompt[body["systemInstruction"]["parts"][0]["text"]]
        data = json.loads(body["contents"][0]["parts"][0]["text"])
        assert request.url.path.endswith("/models/catalog-test:generateContent")
        assert body["generationConfig"]["responseMimeType"] == "application/json"
        counts[stage] += 1
        if failure and stage == failure[0]:
            kind = failure[1]
            failure = None
            error_counts[stage, kind] += 1
            if kind in {"throttle", "unavailable"}:
                code = 429 if kind == "throttle" else 503
                return httpx.Response(code, json={"error": {"code": code, "message": "private test diagnostic"}})
            payload = "invalid JSON" if kind == "json" else "{}"
        else:
            result = _mock_result(data)
            if stage == "cv_quality":
                assert data["criteria"] == [{"id": c.id, "question": c.question} for c in criteria]
                assert expected["marker"] in data["cv"]
                result["detected_skills"] = [expected["excerpt"], "FabricatedSkill"]
                result["verdicts"][0].update(status="yes", quote="Reviewed 12 documents")
                result["verdicts"][1].update(status="yes", quote=bad_quote)
            elif stage == "role_match":
                assert expected["marker"] in data["cv"]
                assert data["role"] == {
                    "specialty": expected["field"], "position": expected["role"], "level": expected["level"],
                    "required_skills": expected["required"], "preferred_skills": expected["preferred"],
                }
                result["required"][0].update(status="has", evidence=expected["excerpt"])
                result["required"][1].update(status="has", evidence=bad_quote)
            elif stage == "roadmap":
                assert expected["marker"] not in json.dumps(data)
                assert data["field"] == expected["field"] and data["role"] == expected["role"]
                assert data["skills_already_have"] == expected["required"][:1]
                assert [gap["skill"] for gap in data["skills_to_close"]] == expected["gaps"]
            else:
                assert all(value not in json.dumps(data) for value in
                           (expected["marker"], "private-fixture.pdf", "@example.test", "private test diagnostic"))
                context = data["context"]
                assert context["profile"]["field"] == expected["field"]
                assert context["profile"]["role"] == expected["role"]
                assert context["profile"]["skills"] == ["Practice portfolio"]
                if "evaluation" not in context:
                    assert context["profile"]["required_skills"] == expected["required"]
                    assert "plan" not in context and data["history"] == []
                else:
                    assert context["evaluation"]["field"] == expected["field"]
                    assert [skill["skill"] for skill in context["evaluation"]["skills"]] == expected["all_skills"]
                    assert context["plan"]["phases"][0]["completed"] == 1
                result["answer"] = "Bu gün portfolion üçün bir nümunə hazırla."
            payload = json.dumps(result)
        return httpx.Response(200, json={"candidates": [{
            "content": {"role": "model", "parts": [{"text": payload}]}, "finishReason": "STOP",
        }]})

    async def check():
        nonlocal failure
        transport = httpx.AsyncClient(transport=httpx.MockTransport(respond), trust_env=False)
        sdk = genai.Client(api_key="mock-catalog-key", vertexai=False,
                           http_options=types.HttpOptions(httpx_async_client=transport,
                                                          retry_options=types.HttpRetryOptions(attempts=1)))
        monkeypatch.setattr(ai_analyzer, "_client", sdk)
        monkeypatch.setattr(ai_analyzer, "ROUNDS", 1)
        monkeypatch.setattr(ai_analyzer.settings, "gemini_models", "catalog-test")
        monkeypatch.setattr(ai_analyzer.settings, "auth_mode", "password")
        previous = None
        try:
            async with main.app.router.lifespan_context(main.app):
                for index, entry in enumerate(entries):
                    field, profile = entry["id"], entry["profile"]
                    config = profiles[profile]
                    required, preferred = config["required_skills"], config["preferred_skills"]
                    label = entry["name"]
                    role = (label.removesuffix("müəllimliyi") + "müəllimi"
                            if label.endswith("müəllimliyi") else config["role"])
                    expected.update(field=label, role=role, level=config["level"], required=required,
                                    preferred=preferred, all_skills=required + preferred, gaps=required[1:] + preferred,
                                    marker=f"Private-Fictional-Case-{index}", excerpt=norm(required[0]))
                    first_profile = profile not in seen_profiles
                    error = None
                    if first_profile:
                        position = len(seen_profiles)
                        error = (stages[position % len(stages)], malformed[(position // len(stages)) % len(malformed)])
                    seen_profiles.add(profile)
                    async with evaluation_account(main.app, index, field) as client:
                        profile_response = await client.put("/api/profile", json={
                            "field_id": field, "skills": ["Practice portfolio"], "interests": "Sınaq layihəsi",
                        })
                        assert profile_response.status_code == 200, field
                        if previous is not None:
                            blocked = await client.post("/api/mentor", json={
                                "question": "Nədən başlayım?", "evaluation_id": previous,
                            })
                            assert blocked.status_code == 404, field
                        if first_profile:
                            assert (await client.post("/api/mentor", json={"question": "Nədən başlayım?"})).status_code == 200, field

                        pdf = fictional_pdf((expected["marker"], "Reviewed 12 documents", "Portfolio project",
                                             expected["excerpt"]))
                        async def post_cv():
                            return await client.post("/api/evaluate", data={"field_id": field},
                                                     files={"file": ("private-fixture.pdf", pdf)})

                        async def reject(send):
                            nonlocal failure
                            failure = error
                            response = await send()
                            assert failure is None, (field, error)
                            assert response.status_code == (503 if error[1] in {"throttle", "unavailable"} else 502), (
                                field, error, response.status_code)
                            assert "private test diagnostic" not in response.text

                        if error and error[0] in {"cv_quality", "role_match"}:
                            await reject(post_cv)
                            assert (await client.get("/api/history")).json() == [], field
                        response = await post_cv()
                        assert response.status_code == 200, field
                        cv = response.json()
                        assert cv["field_id"] == field
                        assert [row["key"] for row in cv["categories"]] == ["structure", "ats", "impact", "field_fit"]
                        verdicts = {row["id"]: row for cat in cv["categories"] for row in cat["criteria"]}
                        assert verdicts[criteria[0].id]["evidence"] == "Reviewed 12 documents"
                        assert verdicts[criteria[1].id]["evidence"] == ""
                        assert cv["detected_skills"] == [expected["excerpt"]]
                        skills = cv["match"]["required_skills"]
                        assert [s["status"] for s in skills] == ["has", "partial"] + ["missing"] * (len(required) - 2)
                        assert skills[1]["evidence"] == ""
                        assert cv["match"]["match_score"] == round(100 * (0.75 * (1.5 / len(required))))
                        assert 0 <= cv["overall_score"] <= 100

                        previous = cv["evaluation_id"]
                        url = f"/api/roadmap/{previous}"
                        if error and error[0] == "roadmap":
                            await reject(lambda: client.post(url))
                            assert not (await client.get(url)).json()["generated"], field
                        response = await client.post(url)
                        assert response.status_code == 200, field
                        plan = response.json()
                        assert [phase["days"] for phase in plan["roadmap"]] == ["1-7", "8-14", "15-21"]
                        gaps = plan["career_gap"]["skills"]
                        assert [s["skill"] for s in gaps if s["status"] != "has"] == expected["gaps"]
                        assert all(item["resources"] for item in gaps if item["status"] != "has")
                        checked = await client.put(f"{url}/tasks/foundation-0", json={"completed": True})
                        assert checked.json()["completed_task_ids"] == ["foundation-0"]
                        def post_mentor():
                            return client.post("/api/mentor", json={"question": "Növbəti addım?", "evaluation_id": previous})

                        if error and error[0] == "mentor":
                            await reject(post_mentor)
                            assert len((await client.get("/api/mentor/history")).json()) == 1, field
                        assert (await post_mentor()).status_code == 200, field
                        assert len((await client.get("/api/mentor/history")).json()) == 1 + first_profile, field
                    finished.add(field)
        finally:
            await sdk.aio.aclose()
            sdk.close()
            engine.dispose()

    asyncio.run(check())
    assert seen_profiles == set(profiles)
    assert finished == set(ROLES)
    assert len(error_counts) == 16 and sum(error_counts.values()) == 54
    assert sum(counts.values()) == 624
