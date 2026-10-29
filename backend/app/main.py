"""LunaPulse API. Research/demo prototype on synthetic data — not medical advice."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import data, insights
from app.api.errors import register_error_handlers, reject_oversized_bodies
from app.config import Settings
from app.db import init_db, make_engine, make_session_factory
from app.pipeline import gemini_chat_factory


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
        title="LunaPulse API",
        description="Your wearable data, explained with evidence. Synthetic data only; not medical advice.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.session_factory = make_session_factory(engine)
    # None = fallback mode. Tests replace this with a scripted fake; the real key never leaves the backend.
    app.state.chat_factory = gemini_chat_factory(settings)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"]
    )
    register_error_handlers(app)
    reject_oversized_bodies(app)
    app.include_router(data.router)
    app.include_router(insights.router)
    return app


app = create_app()
