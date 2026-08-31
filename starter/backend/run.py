import asyncio
import selectors

import uvicorn


def selector_event_loop():
    return asyncio.SelectorEventLoop(selectors.SelectSelector())


if __name__ == "__main__":
    config = uvicorn.Config(
        "app.main:app",
        host="127.0.0.1",
        port=8001,
        loop="asyncio",
    )

    server = uvicorn.Server(config)

    asyncio.run(
        server.serve(),
        loop_factory=selector_event_loop,
    )