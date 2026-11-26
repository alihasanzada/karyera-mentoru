import asyncio
from collections.abc import Awaitable, Callable, Hashable
from typing import Generic, TypeVar

T = TypeVar("T")


class InFlight(Generic[T]):
    """Share unfinished work within one event loop, without coupling caller cancellation."""

    def __init__(self) -> None:
        self._tasks: dict[Hashable, asyncio.Task[T]] = {}

    async def run(self, key: Hashable, work: Callable[[], Awaitable[T]]) -> T:
        task = self._tasks.get(key)
        if task is None or task.done():
            task = asyncio.create_task(work())
            self._tasks[key] = task
            task.add_done_callback(lambda done: self._finish(key, done))
        return await asyncio.shield(task)

    def _finish(self, key: Hashable, task: asyncio.Task[T]) -> None:
        if self._tasks.get(key) is task:
            del self._tasks[key]
        if not task.cancelled():
            task.exception()  # A disconnected client may leave no waiter.

    async def close(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
