import time
from collections import Counter

import httpx
from google import genai
from google.genai import types

from app.services.ai_analyzer import generation_config, parse_response

from .plan import BUDGET, MODEL, REQUESTS, usd

HOST = "generativelanguage.googleapis.com"


class RequestBudget(httpx.AsyncBaseTransport):
    def __init__(self, downstream: httpx.AsyncBaseTransport):
        self.downstream = downstream
        self.attempts = 0

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if (request.method != "POST" or request.url.scheme != "https" or request.url.host != HOST
                or request.url.port not in (None, 443)
                or request.url.path != f"/v1beta/models/{MODEL}:generateContent"):
            raise RuntimeError("Unexpected evaluation provider destination or operation")
        if self.attempts >= REQUESTS:
            raise RuntimeError("Evaluation request limit reached")
        self.attempts += 1
        return await self.downstream.handle_async_request(request)

    async def aclose(self) -> None:
        await self.downstream.aclose()


def evaluation_client(key: str, transport: RequestBudget) -> genai.Client:
    # Explicit destination and client prevent use of ambient Vertex, proxy or SDK retry settings.
    http = httpx.AsyncClient(transport=transport, trust_env=False, follow_redirects=False)
    return genai.Client(
        api_key=key, vertexai=False,
        http_options=types.HttpOptions(
            base_url=f"https://{HOST}", api_version="v1beta",
            httpx_async_client=http, retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )


class ProviderRun:
    def __init__(self, client: genai.Client, transport: RequestBudget, stages: dict):
        self.client = client
        self.transport = transport
        self.stages = stages
        self.case = ""
        self.counts = Counter()
        self.measurements: list[dict] = []
        self.outputs: dict[tuple[str, str], dict] = {}

    async def call(self, model, prompt, contents, schema):
        stage = self.stages[schema]
        budget = BUDGET[stage]
        if model != MODEL or self.counts[stage] >= budget.requests:
            raise RuntimeError("Evaluation task budget or model mismatch")
        key = (self.case, stage)
        if any(row["case"] == self.case and row["task"] == stage for row in self.measurements):
            raise RuntimeError("A case may attempt each evaluation task once")
        self.counts[stage] += 1
        row = {"case": self.case, "task": stage}
        self.measurements.append(row)
        start = time.monotonic()
        try:
            response = await self.client.aio.models.generate_content(
                model=model, contents=contents,
                config=generation_config(prompt, schema, max_output_tokens=budget.max_output),
            )
            usage = response.usage_metadata
            row["usage"] = ({
                "input": usage.prompt_token_count,
                "output": usage.candidates_token_count,
                "thinking": usage.thoughts_token_count,
                "total": usage.total_token_count,
            } if usage else None)
            row["finish_reason"] = (
                response.candidates[0].finish_reason.value
                if response.candidates and response.candidates[0].finish_reason else None
            )
            result = parse_response(response, schema)
            self.outputs[key] = result.model_dump(mode="json")
            row["status"] = "parsed"
            return result
        except BaseException as error:
            # SDK exceptions can contain provider diagnostics. Keep only class and numeric status.
            row["status"] = type(error).__name__
            code = getattr(error, "code", None)
            if isinstance(code, int):
                row["provider_status"] = code
            raise
        finally:
            row["latency_ms"] = round((time.monotonic() - start) * 1000)

    def report(self) -> dict:
        priced = [row["usage"] for row in self.measurements if row.get("usage")
                  and row["usage"]["input"] is not None and row["usage"]["output"] is not None]
        inputs = sum(item["input"] for item in priced)
        output = sum(item["output"] + (item["thinking"] or 0) for item in priced)
        return {
            "requests_sent": self.transport.attempts,
            "usage_records": len(priced),
            "recorded_input_tokens": inputs,
            "recorded_billable_output_tokens": output,
            "estimated_usd_for_recorded_usage": usd(inputs, output) if priced else None,
            "requests": self.measurements,
            "structured_outputs": [{"case": case, "task": task, "value": value}
                                   for (case, task), value in self.outputs.items()],
        }
