from pathlib import Path
from uuid import uuid4

def pytest_configure(config):
    # This Windows account has an inaccessible pre-existing global pytest directory.
    # Use a new checkout-local scratch directory; never alter another run's files.
    if config.option.basetemp is None:
        config.option.basetemp = str(Path(__file__).resolve().parents[2] / '.sites-runtime' / ('pytest-' + uuid4().hex))
