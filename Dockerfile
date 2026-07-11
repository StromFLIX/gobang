FROM node:22-alpine AS frontend

ARG VITE_LEGAL_OPERATOR_NAME
ARG VITE_LEGAL_COUNTRY
ARG VITE_LEGAL_EMAIL
ARG VITE_LEGAL_REGISTER_ENTRY
ARG VITE_LEGAL_VAT_ID
ARG VITE_LEGAL_HOSTING_PROVIDER
ARG VITE_LEGAL_HOSTING_LOCATION

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY env.d.ts index.html tsconfig*.json vite.config.ts eslint.config.ts .prettierrc.json ./
COPY src ./src
COPY public ./public
RUN npm run build-only


FROM python:3.12-slim-bookworm AS runtime

COPY --from=ghcr.io/astral-sh/uv:0.7.19 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

COPY backend/app ./app
COPY --from=frontend /build/dist ./frontend_dist

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --start-interval=1s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
