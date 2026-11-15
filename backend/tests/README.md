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
