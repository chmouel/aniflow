import os

from aniflow import export


def pytest_configure(config):
    config.addinivalue_line("markers", "chrome: drives a real Chrome, slow")


def pytest_collection_modifyitems(config, items):
    """Tests marked chrome only run with ANIFLOW_EXPORT_E2E=1 and Chrome installed; they
    are deselected otherwise, so a normal run neither pays for them nor reports them."""
    if os.environ.get("ANIFLOW_EXPORT_E2E") == "1" and export.chrome() is not None:
        return
    chrome = [item for item in items if item.get_closest_marker("chrome")]
    if chrome:
        items[:] = [item for item in items if item not in chrome]
        config.hook.pytest_deselected(items=chrome)
