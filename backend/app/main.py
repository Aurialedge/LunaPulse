"""PulseLens API. Research/demo prototype on synthetic data — not medical advice."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import data
from app.api.errors import register_error_handlers
from app.config import Settings
from app.db import init_db, make_engine, make_session_factory


def create_app(settings: Settings | None = None, seed_users: bool = True) -> FastAPI:
    settings = settings or Settings()
    engine = make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        init_db(engine)
        if seed_users:
            with app.state.session_factory() as session:
                data.seed_missing_users(session)
        yield
        engine.dispose()

    app = FastAPI(
        title="PulseLens API",
        description="Your wearable data, explained with evidence. Synthetic data only; not medical advice.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.session_factory = make_session_factory(engine)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"]
    )
    register_error_handlers(app)
    app.include_router(data.router)
    return app


app = create_app()
