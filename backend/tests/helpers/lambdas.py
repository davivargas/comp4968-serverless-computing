import importlib.util
from pathlib import Path

"""Loads Lambda handlers for tests. Every function folder uses the same
file name (lambda_function.py), so each is imported under its own name.
"""

BACKEND = Path(__file__).resolve().parents[2]
FUNCTIONS = BACKEND / "functions"
DB_DIR = BACKEND / "db"


def load_lambda(name):
    """Imports functions/<name>/lambda_function.py as module fn_<name>."""
    path = FUNCTIONS / name / "lambda_function.py"
    module_name = "fn_" + name.replace("-", "_")
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
