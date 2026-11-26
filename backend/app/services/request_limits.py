from collections import OrderedDict
from time import monotonic

from fastapi import Request
from starlette.responses import JSONResponse

AUTH_PATHS = {
    "/api/auth/login", "/api/auth/signup", "/api/auth/otp/verify", "/api/auth/otp/resend", "/api/auth/otp/cancel",
}
AI_PATHS = {"/api/evaluate", "/api/cv/analyze", "/api/match/analyze", "/api/mentor"}


class BetaRequestLimits:
    """One minute request windows for the single-process local beta."""

    def __init__(self):
        self.windows: OrderedDict[tuple[str, str], tuple[float, int]] = OrderedDict()

    async def __call__(self, request: Request, call_next):
        path = request.url.path.rstrip("/")
        if path.startswith("/api/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            if origin and origin != f"{request.url.scheme}://{request.url.netloc}":
                return JSONResponse({"detail": "Sorğu bu saytın ünvanından göndərilməlidir."}, status_code=403)

        if request.method == "POST":
            is_auth = path in AUTH_PATHS
            is_ai = path in AI_PATHS or path.startswith("/api/roadmap/")
            if is_auth or is_ai:
                key = ("auth" if is_auth else "ai", request.client.host if request.client else "unknown")
                now = monotonic()
                while self.windows and next(iter(self.windows.values()))[0] <= now:
                    self.windows.popitem(last=False)
                if key not in self.windows:
                    if len(self.windows) >= 4096:
                        return JSONResponse({"detail": "Server məşğuldur. Bir az sonra cəhd et."}, status_code=503)
                    self.windows[key] = (now + 60, 0)
                deadline, count = self.windows[key]
                if count >= (12 if is_auth else 10):
                    return JSONResponse({"detail": "Sorğu limiti doldu. Bir az sonra yenidən cəhd et."},
                                        status_code=429, headers={"Retry-After": str(max(1, int(deadline - now) + 1))})
                self.windows[key] = (deadline, count + 1)
        return await call_next(request)
