"""Configuration commune : rend le code de sime-backend-main importable et charge son .env."""
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2] / "sime-backend-main"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES_DIR
