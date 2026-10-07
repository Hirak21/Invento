FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# curl for the container healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

EXPOSE 8000

# Single worker: enough for an MVP client tool on a small VPS.
# Raise --workers if the box has 2GB+ RAM and traffic grows.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
