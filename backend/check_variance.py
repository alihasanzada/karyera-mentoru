import sys
import time

import httpx

BASE_URL = "http://localhost:8000"


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit("usage: python check_variance.py CV.pdf FIELD_ID [RUNS] [refresh]")
    path, field = sys.argv[1], sys.argv[2]
    runs = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 3
    refresh = "refresh" in sys.argv[3:]

    with open(path, "rb") as fh:
        pdf = fh.read()

    totals = []
    for i in range(1, runs + 1):
        started = time.time()
        resp = httpx.post(
            f"{BASE_URL}/api/evaluate",
            params={"refresh": str(refresh).lower()},
            headers={"X-Client-Id": "variance-test-1"},
            files={"file": ("cv.pdf", pdf, "application/pdf")},
            data={"field_id": field},
            timeout=200,
        )
        resp.raise_for_status()
        data = resp.json()
        scores = {c["key"]: c["score"] for c in data["categories"]}
        totals.append(data["overall_score"])
        print(f"run {i}: overall={data['overall_score']} {scores} ({time.time() - started:.1f}s)")
    print(f"overall min={min(totals)} max={max(totals)} spread={max(totals) - min(totals)}")


main()