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

## Running the tests

Run these from `backend/` with the virtual environment active:

```powershell
pytest              # all tests
pytest tests/unit   # only one folder
pytest -v           # show each test by name
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
