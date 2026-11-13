# API SIMEE : FastAPI + poppler (pdf2image). Servie derrière Caddy, jamais exposée directement.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# upgrade : correctifs de sécurité Debian parus depuis la publication de l'image de base
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN useradd --create-home --uid 10001 sime \
    && mkdir -p logs && chown sime logs
USER sime

EXPOSE 8000
# --proxy-headers : IP réelle du client transmise par Caddy (seul à joindre ce port)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
