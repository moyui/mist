# mist-skills Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an independent `mist-skills` repository implementing 3 Anthropic Agent Skills (chan-theory, technical-indicators, data-query) that call the mist backend REST API.

**Architecture:** 3 Skills grouped by domain, each with a SKILL.md and Python scripts that call mist REST endpoints via a shared HTTP client. Shared module provides config and response parsing. Scripts output JSON to stdout for agent consumption.

**Tech Stack:** Python 3.10+, `requests`, `pytest`, `unittest.mock`

**Spec:** `docs/superpowers/specs/2026-04-13-mist-skills-design.md`

**Note on unified response format:** The mist backend uses `statusCode` (not `code`) in its unified response format `{success, statusCode, message, data, timestamp, requestId}`. The spec incorrectly references `code` — the plan uses the correct field name from the actual `TransformInterceptor`.

---

## File Structure

```
/Users/xiyugao/code/mist/mist-skills/     ← NEW independent repo
├── pyproject.toml
├── shared/
│   ├── __init__.py
│   ├── config.py                          # MIST_API_BASE_URL, timeout
│   └── mist_client.py                     # HTTP client, error handling
├── skills/
│   ├── chan-theory/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── merge_k.py
│   │       ├── create_bi.py
│   │       ├── get_fenxing.py
│   │       └── analyze_chan.py
│   ├── technical-indicators/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       ├── macd.py
│   │       ├── kdj.py
│   │       └── rsi.py
│   └── data-query/
│       ├── SKILL.md
│       └── scripts/
│           ├── list_indices.py
│           ├── get_index_info.py
│           ├── get_kline_data.py
│           └── get_daily_kline.py
├── tests/
│   ├── __init__.py
│   ├── test_config.py
│   ├── test_mist_client.py
│   ├── test_data_query.py
│   ├── test_technical_indicators.py
│   └── test_chan_theory.py
└── README.md
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `/Users/xiyugao/code/mist/mist-skills/pyproject.toml`
- Create: `/Users/xiyugao/code/mist/mist-skills/shared/__init__.py`
- Create: `/Users/xiyugao/code/mist/mist-skills/skills/chan-theory/scripts/` (directory)
- Create: `/Users/xiyugao/code/mist/mist-skills/skills/technical-indicators/scripts/` (directory)
- Create: `/Users/xiyugao/code/mist/mist-skills/skills/data-query/scripts/` (directory)
- Create: `/Users/xiyugao/code/mist/mist-skills/tests/__init__.py`

- [ ] **Step 1: Create repo and directory structure**

```bash
mkdir -p /Users/xiyugao/code/mist/mist-skills
cd /Users/xiyugao/code/mist/mist-skills
git init
mkdir -p shared skills/chan-theory/scripts skills/technical-indicators/scripts skills/data-query/scripts tests
touch shared/__init__.py tests/__init__.py
```

- [ ] **Step 2: Create pyproject.toml**

```toml
[project]
name = "mist-skills"
version = "0.1.0"
description = "Anthropic Agent Skills for mist stock analysis backend"
requires-python = ">=3.10"
dependencies = [
    "requests>=2.31",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 3: Create .gitignore**

```
__pycache__/
*.pyc
.pytest_cache/
*.egg-info/
dist/
.venv/
.env
```

- [ ] **Step 4: Create virtual environment and install dependencies**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

- [ ] **Step 5: Commit scaffold**

```bash
cd /Users/xiyugao/code/mist/mist-skills
echo ".venv/" >> .gitignore
git add -A
git commit -m "chore: scaffold mist-skills repository"
```

---

### Task 2: Shared Config

**Files:**
- Create: `shared/config.py`
- Create: `tests/test_config.py`

- [ ] **Step 1: Write failing test for config**

```python
# tests/test_config.py
import os
from unittest.mock import patch


def test_default_config():
    """Config uses sensible defaults when no env vars set."""
    with patch.dict(os.environ, {}, clear=True):
        # Re-import to pick up clean env
        import importlib
        import shared.config as cfg
        importlib.reload(cfg)

        assert cfg.get_base_url() == "http://127.0.0.1:8001"
        assert cfg.get_timeout() == 30


def test_config_from_env():
    """Config reads from environment variables."""
    with patch.dict(os.environ, {
        "MIST_API_BASE_URL": "http://mist:9000",
        "MIST_API_TIMEOUT": "60",
    }):
        import importlib
        import shared.config as cfg
        importlib.reload(cfg)

        assert cfg.get_base_url() == "http://mist:9000"
        assert cfg.get_timeout() == 60
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_config.py -v
```

Expected: FAIL (module `shared.config` not found)

- [ ] **Step 3: Implement config**

```python
# shared/config.py
import os


def get_base_url() -> str:
    return os.environ.get("MIST_API_BASE_URL", "http://127.0.0.1:8001")


def get_timeout() -> int:
    return int(os.environ.get("MIST_API_TIMEOUT", "30"))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_config.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/xiyugao/code/mist/mist-skills
git add shared/config.py tests/test_config.py
git commit -m "feat: add shared config with env-based defaults"
```

---

### Task 3: Shared HTTP Client (TDD)

**Files:**
- Create: `shared/mist_client.py`
- Create: `tests/test_mist_client.py`

- [ ] **Step 1: Write failing tests for HTTP client**

```python
# tests/test_mist_client.py
import json
import pytest
from unittest.mock import patch, MagicMock
from shared.mist_client import MistClient, MistApiError, MistConnectionError


@pytest.fixture
def client():
    return MistClient()


@pytest.fixture
def success_response():
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {
        "success": True,
        "statusCode": 200,
        "message": "SUCCESS",
        "data": {"key": "value"},
        "timestamp": "2026-04-13T00:00:00Z",
        "requestId": "req-1",
    }
    return resp


def test_get_success(client, success_response):
    """GET request returns data on success."""
    with patch("shared.mist_client.requests.get", return_value=success_response):
        result = client.get("/security/v1/all")
    assert result == {"key": "value"}


def test_post_success(client, success_response):
    """POST request returns data on success."""
    success_response.json.return_value["data"] = [{"macd": 1.0}]
    with patch("shared.mist_client.requests.post", return_value=success_response):
        result = client.post("/indicator/macd", {"code": "000001", "period": "daily"})
    assert result == [{"macd": 1.0}]


def test_post_sends_json_body(client, success_response):
    """POST sends body as JSON."""
    with patch("shared.mist_client.requests.post", return_value=success_response) as mock_post:
        client.post("/indicator/macd", {"code": "000001"})
    _, kwargs = mock_post.call_args
    assert kwargs["json"] == {"code": "000001"}


def test_api_error_on_success_false(client):
    """Raises MistApiError when response has success=false."""
    resp = MagicMock()
    resp.status_code = 400
    resp.json.return_value = {
        "success": False,
        "statusCode": 2001,
        "message": "Symbol not found",
        "data": None,
        "timestamp": "...",
        "requestId": "req-2",
    }
    with patch("shared.mist_client.requests.get", return_value=resp):
        with pytest.raises(MistApiError) as exc_info:
            client.get("/security/v1/INVALID")
    assert "Symbol not found" in str(exc_info.value)
    assert exc_info.value.error_code == 2001


def test_connection_error(client):
    """Raises MistConnectionError on connection failure."""
    import requests
    with patch("shared.mist_client.requests.get", side_effect=requests.ConnectionError("Connection refused")):
        with pytest.raises(MistConnectionError):
            client.get("/security/v1/all")


def test_timeout_error(client):
    """Raises MistConnectionError on timeout."""
    import requests
    with patch("shared.mist_client.requests.get", side_effect=requests.Timeout("Timed out")):
        with pytest.raises(MistConnectionError):
            client.get("/security/v1/all")


def test_base_url_from_config(client):
    """Client uses base URL from config."""
    assert "8001" in client.base_url
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_mist_client.py -v
```

Expected: FAIL (module `shared.mist_client` not found)

- [ ] **Step 3: Implement HTTP client**

```python
# shared/mist_client.py
import requests
from shared.config import get_base_url, get_timeout


class MistConnectionError(Exception):
    """Raised when unable to connect to mist backend."""
    pass


class MistApiError(Exception):
    """Raised when mist backend returns a business error."""
    def __init__(self, message: str, error_code: int):
        super().__init__(message)
        self.error_code = error_code


class MistClient:
    def __init__(self, base_url: str | None = None, timeout: int | None = None):
        self.base_url = (base_url or get_base_url()).rstrip("/")
        self.timeout = timeout or get_timeout()

    def get(self, path: str) -> dict | list:
        url = f"{self.base_url}{path}"
        try:
            resp = requests.get(url, timeout=self.timeout)
        except (requests.ConnectionError, requests.Timeout) as e:
            raise MistConnectionError(f"Cannot connect to mist backend: {e}") from e
        return self._parse_response(resp)

    def post(self, path: str, body: dict) -> dict | list:
        url = f"{self.base_url}{path}"
        try:
            resp = requests.post(url, json=body, timeout=self.timeout)
        except (requests.ConnectionError, requests.Timeout) as e:
            raise MistConnectionError(f"Cannot connect to mist backend: {e}") from e
        return self._parse_response(resp)

    def _parse_response(self, resp: requests.Response) -> dict | list:
        data = resp.json()
        if not data.get("success", False):
            raise MistApiError(
                message=data.get("message", "Unknown error"),
                error_code=data.get("statusCode", 0),
            )
        return data["data"]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_mist_client.py -v
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/xiyugao/code/mist/mist-skills
git add shared/mist_client.py tests/test_mist_client.py
git commit -m "feat: add MistClient with error handling for mist API"
```

---

### Task 4: data-query Skill

**Files:**
- Create: `skills/data-query/SKILL.md`
- Create: `skills/data-query/scripts/list_indices.py`
- Create: `skills/data-query/scripts/get_index_info.py`
- Create: `skills/data-query/scripts/get_kline_data.py`
- Create: `skills/data-query/scripts/get_daily_kline.py`
- Create: `tests/test_data_query.py`

- [ ] **Step 1: Write data-query SKILL.md**

```markdown
---
name: data-query
description: Market data discovery and retrieval for A-shares. List available securities, get security details, and query K-line data across intraday and daily periods from the mist backend.
---

# Data Query

Retrieve market data from the mist stock analysis backend.

## Available Scripts

### list_indices
List all available securities (stocks, indices, funds).
```bash
python scripts/list_indices.py
```
Returns: Array of `{id, symbol, name, type}` objects.

### get_index_info
Get details for a specific security by code.
```bash
python scripts/get_index_info.py --code 000001.SH
```
Parameters:
- `--code` (required): Security code, e.g. `000001.SH`, `399006.SZ`

### get_kline_data
Query intraday K-line data.
```bash
python scripts/get_kline_data.py --code 000001.SH --period 5min --start-date "2026-01-01" --end-date "2026-04-13"
```
Parameters:
- `--code` (required): Security code
- `--period` (required): One of `1min`, `5min`, `15min`, `30min`, `60min`
- `--start-date` (required): Start date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
- `--end-date` (required): End date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
- `--source` (optional): Data source — `ef` (East Money), `tdx` (TongDaXin), `mqmt` (MaQiMaTe)

### get_daily_kline
Query daily K-line data.
```bash
python scripts/get_daily_kline.py --code 000001.SH --start-date "2026-01-01" --end-date "2026-04-13"
```
Parameters:
- `--code` (required): Security code
- `--start-date` (required): Start date
- `--end-date` (required): End date
- `--source` (optional): Data source

## Usage Pattern

1. Run `list_indices` first to discover available securities
2. Use `get_index_info` to verify a specific symbol
3. Query K-line data with `get_kline_data` (intraday) or `get_daily_kline` (daily)

## Response Fields

K-line data returns: `id`, `symbol`, `time`, `amount`, `open`, `close`, `highest`, `lowest`.
```

- [ ] **Step 2: Write failing tests for data-query scripts**

```python
# tests/test_data_query.py
import json
import sys
import os
import pytest
from unittest.mock import patch, MagicMock
from shared.mist_client import MistClient

# Add scripts dirs to path for import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "skills", "data-query", "scripts"))


def _mock_client_success(data):
    client = MagicMock(spec=MistClient)
    client.get.return_value = data
    client.post.return_value = data
    return client


@pytest.fixture
def securities_data():
    return [
        {"id": 1, "code": "000001.SH", "name": "上证指数", "type": "INDEX"},
        {"id": 2, "code": "399006.SZ", "name": "创业板指", "type": "INDEX"},
    ]


@pytest.fixture
def kline_data():
    return [
        {"id": 1, "symbol": "000001.SH", "time": "2026-04-13", "open": 3300, "close": 3310, "highest": 3320, "lowest": 3290, "amount": 100000},
    ]


def test_list_indices(securities_data):
    import list_indices
    with patch.object(list_indices, "MistClient", return_value=_mock_client_success(securities_data)):
        result = list_indices.main()
    assert len(result) == 2
    assert result[0]["symbol"] == "000001.SH"


def test_get_index_info(securities_data):
    import get_index_info
    data = securities_data[0]
    with patch.object(get_index_info, "MistClient", return_value=_mock_client_success(data)):
        result = get_index_info.main(code="000001.SH")
    assert result["symbol"] == "000001.SH"


def test_get_kline_data(kline_data):
    import get_kline_data
    with patch.object(get_kline_data, "MistClient", return_value=_mock_client_success(kline_data)):
        result = get_kline_data.main(code="000001.SH", period="5min", start_date="2026-01-01", end_date="2026-04-13")
    assert len(result) == 1
    assert result[0]["open"] == 3300


def test_get_kline_data_rejects_daily():
    """get_kline_data should reject daily period."""
    import get_kline_data
    with pytest.raises(SystemExit):
        get_kline_data.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")


def test_get_daily_kline(kline_data):
    import get_daily_kline
    with patch.object(get_daily_kline, "MistClient", return_value=_mock_client_success(kline_data)):
        result = get_daily_kline.main(code="000001.SH", start_date="2026-01-01", end_date="2026-04-13")
    assert len(result) == 1


def test_get_daily_kline_sends_daily_period(kline_data):
    """get_daily_kline hardcodes period=daily."""
    import get_daily_kline
    client = _mock_client_success(kline_data)
    with patch.object(get_daily_kline, "MistClient", return_value=client):
        get_daily_kline.main(code="000001.SH", start_date="2026-01-01", end_date="2026-04-13")
    client.post.assert_called_once()
    call_args = client.post.call_args
    assert call_args[0][1]["period"] == "daily"
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_data_query.py -v
```

Expected: FAIL (modules not found)

- [ ] **Step 4: Implement list_indices.py**

```python
# skills/data-query/scripts/list_indices.py
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main() -> list:
    client = MistClient()
    return client.get("/security/v1/all")


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 5: Implement get_index_info.py**

```python
# skills/data-query/scripts/get_index_info.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main(code: str) -> dict:
    client = MistClient()
    return client.get(f"/security/v1/{code}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get security details by code")
    parser.add_argument("--code", required=True, help="Security code (e.g., 000001.SH)")
    args = parser.parse_args()
    result = main(args.code)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 6: Implement get_kline_data.py**

```python
# skills/data-query/scripts/get_kline_data.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient

INTRADAY_PERIODS = ("1min", "5min", "15min", "30min", "60min")


def main(code: str, period: str, start_date: str, end_date: str,
         source: str | None = None) -> list:
    if period not in INTRADAY_PERIODS:
        print(f"Error: period must be one of {INTRADAY_PERIODS}", file=sys.stderr)
        sys.exit(1)

    body = {"code": code, "period": period, "startDate": start_date, "endDate": end_date}
    if source:
        body["source"] = source

    client = MistClient()
    return client.post("/indicator/k", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get intraday K-line data")
    parser.add_argument("--code", required=True, help="Security code")
    parser.add_argument("--period", required=True, help="Period (1min/5min/15min/30min/60min)")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--source", help="Data source (ef/tdx/mqmt)")
    args = parser.parse_args()
    result = main(args.code, args.period, args.start_date, args.end_date, args.source)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 7: Implement get_daily_kline.py**

```python
# skills/data-query/scripts/get_daily_kline.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main(code: str, start_date: str, end_date: str,
         source: str | None = None) -> list:
    body = {"code": code, "period": "daily", "startDate": start_date, "endDate": end_date}
    if source:
        body["source"] = source

    client = MistClient()
    return client.post("/indicator/k", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get daily K-line data")
    parser.add_argument("--code", required=True, help="Security code")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--source", help="Data source (ef/tdx/mqmt)")
    args = parser.parse_args()
    result = main(args.code, args.start_date, args.end_date, args.source)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_data_query.py -v
```

Expected: All 6 tests PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/xiyugao/code/mist/mist-skills
git add skills/data-query/ tests/test_data_query.py
git commit -m "feat: add data-query skill with list_indices, get_index_info, get_kline_data, get_daily_kline"
```

---

### Task 5: technical-indicators Skill

**Files:**
- Create: `skills/technical-indicators/SKILL.md`
- Create: `skills/technical-indicators/scripts/macd.py`
- Create: `skills/technical-indicators/scripts/kdj.py`
- Create: `skills/technical-indicators/scripts/rsi.py`
- Create: `tests/test_technical_indicators.py`

- [ ] **Step 1: Write technical-indicators SKILL.md**

```markdown
---
name: technical-indicators
description: Technical indicator calculations for A-shares including MACD trend analysis, KDJ stochastic oscillator, and RSI relative strength index. Returns time-series data with indicator values for each period.
---

# Technical Indicators

Calculate technical indicators using the mist stock analysis backend.

## Available Scripts

### macd
MACD (Moving Average Convergence Divergence) — trend-following momentum indicator.
Default parameters: fast=12, slow=26, signal=9.
```bash
python scripts/macd.py --code 000001.SH --period daily --start-date "2026-01-01" --end-date "2026-04-13"
```
Returns: Array of `{macd, signal, histogram, symbol, time, close}`.

### kdj
KDJ Stochastic Oscillator — identifies overbought/oversold conditions.
Default parameters: period=14, kSmoothing=3, dSmoothing=3.
```bash
python scripts/kdj.py --code 000001.SH --period daily --start-date "2026-01-01" --end-date "2026-04-13"
```
Returns: Array of `{k, d, j, symbol, time, close}`.

### rsi
RSI (Relative Strength Index) — measures momentum and divergence.
Default period: 14.
```bash
python scripts/rsi.py --code 000001.SH --period daily --start-date "2026-01-01" --end-date "2026-04-13"
```
Returns: Array of `{rsi, symbol, time, close}`.

## Common Parameters

All indicator scripts accept:
- `--code` (required): Security code, e.g. `000001.SH`
- `--period` (required): Time period — `1min`, `5min`, `15min`, `30min`, `60min`, `daily`
- `--start-date` (required): Start date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
- `--end-date` (required): End date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
- `--source` (optional): Data source — `ef`, `tdx`, `mqmt`

## Choosing an Indicator

- **MACD**: Trend direction, momentum shifts, crossovers
- **KDJ**: Overbought (>80) / oversold (<20) conditions, short-term reversals
- **RSI**: Momentum strength (0-100), divergence detection, overbought (>70) / oversold (<30)
```

- [ ] **Step 2: Write failing tests for technical-indicators scripts**

```python
# tests/test_technical_indicators.py
import json
import sys
import os
import pytest
from unittest.mock import patch, MagicMock
from shared.mist_client import MistClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "skills", "technical-indicators", "scripts"))


def _mock_client(data):
    client = MagicMock(spec=MistClient)
    client.post.return_value = data
    return client


@pytest.fixture
def macd_data():
    return [
        {"macd": 10.5, "signal": 8.3, "histogram": 2.2, "symbol": "000001.SH", "time": "2026-04-10", "close": 3310},
        {"macd": 11.0, "signal": 9.0, "histogram": 2.0, "symbol": "000001.SH", "time": "2026-04-11", "close": 3320},
    ]


@pytest.fixture
def kdj_data():
    return [
        {"k": 75.2, "d": 70.1, "j": 85.4, "symbol": "000001.SH", "time": "2026-04-10", "close": 3310},
    ]


@pytest.fixture
def rsi_data():
    return [
        {"rsi": 65.3, "symbol": "000001.SH", "time": "2026-04-10", "close": 3310},
    ]


def test_macd(macd_data):
    import macd
    with patch.object(macd, "MistClient", return_value=_mock_client(macd_data)):
        result = macd.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert len(result) == 2
    assert result[0]["macd"] == 10.5


def test_macd_endpoint(macd_data):
    """macd calls POST /indicator/macd."""
    import macd
    client = _mock_client(macd_data)
    with patch.object(macd, "MistClient", return_value=client):
        macd.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    client.post.assert_called_once()
    assert client.post.call_args[0][0] == "/indicator/macd"


def test_kdj(kdj_data):
    import kdj
    with patch.object(kdj, "MistClient", return_value=_mock_client(kdj_data)):
        result = kdj.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert result[0]["k"] == 75.2


def test_kdj_endpoint(kdj_data):
    """kdj calls POST /indicator/kdj."""
    import kdj
    client = _mock_client(kdj_data)
    with patch.object(kdj, "MistClient", return_value=client):
        kdj.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert client.post.call_args[0][0] == "/indicator/kdj"


def test_rsi(rsi_data):
    import rsi
    with patch.object(rsi, "MistClient", return_value=_mock_client(rsi_data)):
        result = rsi.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert result[0]["rsi"] == 65.3


def test_rsi_endpoint(rsi_data):
    """rsi calls POST /indicator/rsi."""
    import rsi
    client = _mock_client(rsi_data)
    with patch.object(rsi, "MistClient", return_value=client):
        rsi.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert client.post.call_args[0][0] == "/indicator/rsi"


def test_indicator_body_params(macd_data):
    """Scripts pass all optional params when provided."""
    import macd
    client = _mock_client(macd_data)
    with patch.object(macd, "MistClient", return_value=client):
        macd.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13", source="tdx")
    body = client.post.call_args[0][1]
    assert body["code"] == "000001.SH"
    assert body["period"] == "daily"
    assert body["startDate"] == "2026-01-01"
    assert body["endDate"] == "2026-04-13"
    assert body["source"] == "tdx"
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_technical_indicators.py -v
```

Expected: FAIL (modules not found)

- [ ] **Step 4: Implement macd.py**

```python
# skills/technical-indicators/scripts/macd.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main(code: str, period: str, start_date: str, end_date: str,
         source: str | None = None) -> list:
    body = {"code": code, "period": period, "startDate": start_date, "endDate": end_date}
    if source:
        body["source"] = source

    client = MistClient()
    return client.post("/indicator/macd", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Calculate MACD indicator")
    parser.add_argument("--code", required=True, help="Security code")
    parser.add_argument("--period", required=True, help="Period (1min/5min/15min/30min/60min/daily)")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--source", help="Data source (ef/tdx/mqmt)")
    args = parser.parse_args()
    result = main(args.code, args.period, args.start_date, args.end_date, args.source)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 5: Implement kdj.py**

```python
# skills/technical-indicators/scripts/kdj.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main(code: str, period: str, start_date: str, end_date: str,
         source: str | None = None) -> list:
    body = {"code": code, "period": period, "startDate": start_date, "endDate": end_date}
    if source:
        body["source"] = source

    client = MistClient()
    return client.post("/indicator/kdj", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Calculate KDJ indicator")
    parser.add_argument("--code", required=True, help="Security code")
    parser.add_argument("--period", required=True, help="Period (1min/5min/15min/30min/60min/daily)")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--source", help="Data source (ef/tdx/mqmt)")
    args = parser.parse_args()
    result = main(args.code, args.period, args.start_date, args.end_date, args.source)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 6: Implement rsi.py**

```python
# skills/technical-indicators/scripts/rsi.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main(code: str, period: str, start_date: str, end_date: str,
         source: str | None = None) -> list:
    body = {"code": code, "period": period, "startDate": start_date, "endDate": end_date}
    if source:
        body["source"] = source

    client = MistClient()
    return client.post("/indicator/rsi", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Calculate RSI indicator")
    parser.add_argument("--code", required=True, help="Security code")
    parser.add_argument("--period", required=True, help="Period (1min/5min/15min/30min/60min/daily)")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--source", help="Data source (ef/tdx/mqmt)")
    args = parser.parse_args()
    result = main(args.code, args.period, args.start_date, args.end_date, args.source)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_technical_indicators.py -v
```

Expected: All 8 tests PASS

- [ ] **Step 8: Commit**

```bash
cd /Users/xiyugao/code/mist/mist-skills
git add skills/technical-indicators/ tests/test_technical_indicators.py
git commit -m "feat: add technical-indicators skill with macd, kdj, rsi"
```

---

### Task 6: chan-theory Skill

**Files:**
- Create: `skills/chan-theory/SKILL.md`
- Create: `skills/chan-theory/scripts/merge_k.py`
- Create: `skills/chan-theory/scripts/create_bi.py`
- Create: `skills/chan-theory/scripts/get_fenxing.py`
- Create: `skills/chan-theory/scripts/analyze_chan.py`
- Create: `tests/test_chan_theory.py`

- [ ] **Step 1: Write chan-theory SKILL.md**

```markdown
---
name: chan-theory
description: Chan Theory analysis for A-shares. Merge K-lines by containment, identify strokes (bi), fractals (fenxing), and channels. Supports step-by-step or combined full analysis pipeline.
---

# Chan Theory (缠论) Analysis

Analyze market data using Chan Theory (缠论) via the mist backend.

## Analysis Pipeline

Chan Theory analysis follows a sequential pipeline:

```
merge_k → create_bi → get_fenxing → channel
```

1. **merge_k**: Merge raw K-lines by containment relationship
2. **create_bi**: Identify strokes (笔) from merged K-lines
3. **get_fenxing**: Find fractals (分型) — top/bottom turning points
4. **channel**: Build channels and identify consolidation zones (中枢)

## Available Scripts

### merge_k
Merge K-lines based on containment relationships.
```bash
python scripts/merge_k.py --code 000001.SH --period daily --start-date "2026-01-01" --end-date "2026-04-13"
```
Returns: Array of merged K-line groups with `{startTime, endTime, highest, lowest, trend, mergedCount}`.

### create_bi
Identify strokes (笔) from K-line data.
```bash
python scripts/create_bi.py --code 000001.SH --period daily --start-date "2026-01-01" --end-date "2026-04-13"
```
Returns: Bi (stroke) data derived from merged K-lines.

### get_fenxing
Identify fractals (分型) — top and bottom turning points.
```bash
python scripts/get_fenxing.py --code 000001.SH --period daily --start-date "2026-01-01" --end-date "2026-04-13"
```
Returns: Fenxing data marking potential reversal points.

### analyze_chan
Full Chan Theory analysis in one call. Runs the complete pipeline: merge → bi → fenxing → channel.
```bash
python scripts/analyze_chan.py --code 000001.SH --period daily --start-date "2026-01-01" --end-date "2026-04-13"
```
Returns: Channel data with consolidation zones.

## Common Parameters

All chan-theory scripts accept:
- `--code` (required): Security code, e.g. `000001.SH`
- `--period` (required): Time period — `1min`, `5min`, `15min`, `30min`, `60min`, `daily`
- `--start-date` (required): Start date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
- `--end-date` (required): End date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
- `--source` (optional): Data source — `ef`, `tdx`, `mqmt`

## Step-by-Step vs Combined

Use `analyze_chan` for a quick overview. Use individual scripts when you need to inspect intermediate results (e.g., examine merged K-lines before running bi analysis).
```

- [ ] **Step 2: Write failing tests for chan-theory scripts**

```python
# tests/test_chan_theory.py
import json
import sys
import os
import pytest
from unittest.mock import patch, MagicMock
from shared.mist_client import MistClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "skills", "chan-theory", "scripts"))


def _mock_client(data):
    client = MagicMock(spec=MistClient)
    client.post.return_value = data
    return client


@pytest.fixture
def merged_k_data():
    return [
        {"startTime": "2026-04-10", "endTime": "2026-04-11", "highest": 3320, "lowest": 3290, "trend": "UP", "mergedCount": 2},
    ]


@pytest.fixture
def bi_data():
    return [{"k": [{"id": 1, "highest": 3320, "lowest": 3290}]}]


@pytest.fixture
def fenxing_data():
    return [{"type": "TOP", "price": 3320, "time": "2026-04-10"}]


@pytest.fixture
def channel_data():
    return [{"bi": [{"id": 1, "direction": "UP"}]}]


def test_merge_k(merged_k_data):
    import merge_k
    with patch.object(merge_k, "MistClient", return_value=_mock_client(merged_k_data)):
        result = merge_k.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert result[0]["trend"] == "UP"


def test_merge_k_endpoint(merged_k_data):
    import merge_k
    client = _mock_client(merged_k_data)
    with patch.object(merge_k, "MistClient", return_value=client):
        merge_k.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert client.post.call_args[0][0] == "/chan/merge-k"


def test_create_bi(bi_data):
    import create_bi
    with patch.object(create_bi, "MistClient", return_value=_mock_client(bi_data)):
        result = create_bi.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert len(result) > 0


def test_create_bi_endpoint(bi_data):
    import create_bi
    client = _mock_client(bi_data)
    with patch.object(create_bi, "MistClient", return_value=client):
        create_bi.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert client.post.call_args[0][0] == "/chan/bi"


def test_get_fenxing(fenxing_data):
    import get_fenxing
    with patch.object(get_fenxing, "MistClient", return_value=_mock_client(fenxing_data)):
        result = get_fenxing.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert result[0]["type"] == "TOP"


def test_get_fenxing_endpoint(fenxing_data):
    import get_fenxing
    client = _mock_client(fenxing_data)
    with patch.object(get_fenxing, "MistClient", return_value=client):
        get_fenxing.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert client.post.call_args[0][0] == "/chan/fenxing"


def test_analyze_chan(channel_data):
    import analyze_chan
    with patch.object(analyze_chan, "MistClient", return_value=_mock_client(channel_data)):
        result = analyze_chan.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert len(result) > 0


def test_analyze_chan_endpoint(channel_data):
    import analyze_chan
    client = _mock_client(channel_data)
    with patch.object(analyze_chan, "MistClient", return_value=client):
        analyze_chan.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13")
    assert client.post.call_args[0][0] == "/chan/channel"


def test_chan_body_params(merged_k_data):
    """Chan scripts pass all optional params."""
    import merge_k
    client = _mock_client(merged_k_data)
    with patch.object(merge_k, "MistClient", return_value=client):
        merge_k.main(code="000001.SH", period="daily", start_date="2026-01-01", end_date="2026-04-13", source="tdx")
    body = client.post.call_args[0][1]
    assert body["code"] == "000001.SH"
    assert body["period"] == "daily"
    assert body["startDate"] == "2026-01-01"
    assert body["endDate"] == "2026-04-13"
    assert body["source"] == "tdx"
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_chan_theory.py -v
```

Expected: FAIL (modules not found)

- [ ] **Step 4: Implement merge_k.py**

```python
# skills/chan-theory/scripts/merge_k.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main(code: str, period: str, start_date: str, end_date: str,
         source: str | None = None) -> list:
    body = {"code": code, "period": period, "startDate": start_date, "endDate": end_date}
    if source:
        body["source"] = source

    client = MistClient()
    return client.post("/chan/merge-k", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Merge K-lines by containment")
    parser.add_argument("--code", required=True, help="Security code")
    parser.add_argument("--period", required=True, help="Period (1min/5min/15min/30min/60min/daily)")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--source", help="Data source (ef/tdx/mqmt)")
    args = parser.parse_args()
    result = main(args.code, args.period, args.start_date, args.end_date, args.source)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 5: Implement create_bi.py**

```python
# skills/chan-theory/scripts/create_bi.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main(code: str, period: str, start_date: str, end_date: str,
         source: str | None = None) -> list:
    body = {"code": code, "period": period, "startDate": start_date, "endDate": end_date}
    if source:
        body["source"] = source

    client = MistClient()
    return client.post("/chan/bi", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create strokes (笔) from K-line data")
    parser.add_argument("--code", required=True, help="Security code")
    parser.add_argument("--period", required=True, help="Period (1min/5min/15min/30min/60min/daily)")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--source", help="Data source (ef/tdx/mqmt)")
    args = parser.parse_args()
    result = main(args.code, args.period, args.start_date, args.end_date, args.source)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 6: Implement get_fenxing.py**

```python
# skills/chan-theory/scripts/get_fenxing.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main(code: str, period: str, start_date: str, end_date: str,
         source: str | None = None) -> list:
    body = {"code": code, "period": period, "startDate": start_date, "endDate": end_date}
    if source:
        body["source"] = source

    client = MistClient()
    return client.post("/chan/fenxing", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Get fractals (分型) from K-line data")
    parser.add_argument("--code", required=True, help="Security code")
    parser.add_argument("--period", required=True, help="Period (1min/5min/15min/30min/60min/daily)")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--source", help="Data source (ef/tdx/mqmt)")
    args = parser.parse_args()
    result = main(args.code, args.period, args.start_date, args.end_date, args.source)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 7: Implement analyze_chan.py**

```python
# skills/chan-theory/scripts/analyze_chan.py
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from shared.mist_client import MistClient


def main(code: str, period: str, start_date: str, end_date: str,
         source: str | None = None) -> list:
    body = {"code": code, "period": period, "startDate": start_date, "endDate": end_date}
    if source:
        body["source"] = source

    client = MistClient()
    return client.post("/chan/channel", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Full Chan Theory analysis (merge → bi → fenxing → channel)")
    parser.add_argument("--code", required=True, help="Security code")
    parser.add_argument("--period", required=True, help="Period (1min/5min/15min/30min/60min/daily)")
    parser.add_argument("--start-date", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--source", help="Data source (ef/tdx/mqmt)")
    args = parser.parse_args()
    result = main(args.code, args.period, args.start_date, args.end_date, args.source)
    print(json.dumps(result, ensure_ascii=False))
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest tests/test_chan_theory.py -v
```

Expected: All 10 tests PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/xiyugao/code/mist/mist-skills
git add skills/chan-theory/ tests/test_chan_theory.py
git commit -m "feat: add chan-theory skill with merge_k, create_bi, get_fenxing, analyze_chan"
```

---

### Task 7: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# mist-skills

Anthropic Agent Skills for the mist stock analysis backend. Provides 3 Skills covering Chan Theory, technical indicators, and market data queries for A-shares.

## Skills

| Skill | Description | Scripts |
|-------|-------------|---------|
| `chan-theory` | Chan Theory analysis | merge_k, create_bi, get_fenxing, analyze_chan |
| `technical-indicators` | MACD, KDJ, RSI | macd, kdj, rsi |
| `data-query` | Market data retrieval | list_indices, get_index_info, get_kline_data, get_daily_kline |

## Setup

```bash
pip install -e ".[dev]"
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MIST_API_BASE_URL` | `http://127.0.0.1:8001` | mist backend URL |
| `MIST_API_TIMEOUT` | `30` | Request timeout (seconds) |

## Testing

```bash
pytest
```

## Usage with AstrBot

Add this repository as a Skills source in your AstrBot configuration. AstrBot will discover and load the three Skills automatically.
```

- [ ] **Step 2: Run all tests**

```bash
cd /Users/xiyugao/code/mist/mist-skills
python -m pytest -v
```

Expected: All tests across all test files PASS (33 tests total: 2 config + 7 client + 6 data-query + 8 indicators + 10 chan)

- [ ] **Step 3: Commit**

```bash
cd /Users/xiyugao/code/mist/mist-skills
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```
