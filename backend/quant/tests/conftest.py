from pathlib import Path
from uuid import uuid4


def pytest_configure(config):
    # Use a separate checkout-local scratch directory for every test run.
    if config.option.basetemp is None:
        runtime = Path(__file__).resolve().parents[3] / ".sites-runtime"
        runtime.mkdir(exist_ok=True)
        config.option.basetemp = str(runtime / ("pytest-" + uuid4().hex))
