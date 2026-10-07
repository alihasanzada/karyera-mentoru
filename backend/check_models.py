import asyncio
import time

from google import genai
from google.genai import errors

from app.config import settings

SKIP = ("image", "tts", "audio", "live", "embedding", "robotics", "computer", "veo", "imagen")


async def probe(client, name):
    start = time.time()
    try:
        await asyncio.wait_for(
            client.aio.models.generate_content(model=name, contents="Salam de."), timeout=20
        )
        status = "OK"
    except TimeoutError:
        status = "TIMEOUT"
    except errors.APIError as e:
        status = str(e.code)
    return name, status, time.time() - start


async def main():
    client = genai.Client(api_key=settings.gemini_api_key)
    names = [m.name.replace("models/", "") for m in client.models.list()]
    names = [n for n in names if "flash" in n and not any(s in n for s in SKIP)]
    results = await asyncio.gather(*(probe(client, n) for n in names))
    for name, status, secs in sorted(results, key=lambda r: (r[1] != "OK", r[2])):
        print(f"{status:8} {secs:5.1f} san  {name}")


asyncio.run(main())