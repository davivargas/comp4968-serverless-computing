# Backend tests

## Setup

Run these from `backend/` in PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
```

If PowerShell refuses to run `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once and try again.

To check the setup worked, run `python -c "import pg8000, pytest; print('ok')"`. It should print `ok`.

### Docker, for the database tests

The tests in `tests/db/` need [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and **running** before you start pytest. pytest starts and removes the database container itself, but it can't start Docker for you.

To check that Docker is running, run `docker version`. It should list both a `Client` and a `Server` section; if the `Server` part shows an error, open Docker Desktop and wait until it says it's running.

If Docker isn't running, pytest **skips** the database tests instead of failing: they show as `s` in the output and the summary ends with something like `470 passed, 49 skipped`. Everything else still runs, but the SQL hasn't been tested. Run `pytest -rs` to see why tests were skipped.

## Running the tests

Run these from `backend/` with the virtual environment active:

```powershell
pytest              # all tests
pytest tests/unit   # only one folder
pytest tests/db     # only the database tests (needs Docker running)
pytest -v           # show each test by name
pytest -rs          # explain any skipped tests
```

The settings are in `backend/pytest.ini`:
- pytest only looks for tests inside `tests/`.
- `tests/` and `layers/common/python/` are on the import path, so tests can import `helpers` and `payroll_common` directly.
- Test files in different folders can have the same name without clashing.

## Shared helpers

`tests/helpers/` has building blocks for new tests:

- `events.py`: `api_event()` and `sqs_event()` build the events AWS sends to a Lambda.
- `lambdas.py`: `load_lambda("employee-pay")` imports that Lambda's `lambda_function.py`.
- `fakes.py`: `FakeDB` answers SQL by text fragment and records every statement. `FakeCognito` records Cognito admin calls.

Swap these in with pytest's `monkeypatch`. Don't replace modules in `sys.modules`: that leaks into every other test file in the run.

## Database tests

`tests/db/` runs the real SQL against a real PostgreSQL 16 (the same major version as RDS). With Docker running (see Setup), pytest starts a temporary Postgres container, gives each test its own fresh copy of `db/schema.sql`, and removes the container when it finishes. The first run downloads the `postgres:16-alpine` image (about 100 MB); after that, the container starts in a few seconds.

`tests/helpers/pg.py` has small helpers for these tests: `insert()` adds a row and returns it, and `sqlstate()` reads the Postgres error code, e.g. `helpers.pg.UNIQUE` for a duplicate.
