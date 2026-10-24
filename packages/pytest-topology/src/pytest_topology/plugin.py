from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

import pytest

from .report import build_execution_report, result_from_test

_results: list[dict[str, Any]] = []


def pytest_addoption(parser: Any) -> None:
    group = parser.getgroup("topology")
    group.addoption(
        "--topology-dry-run",
        action="store_true",
        default=False,
        help="Build a Topology execution report without uploading.",
    )
    group.addoption(
        "--topology-url",
        action="store",
        default=None,
        help="Override TOPOLOGY_URL for this run.",
    )
    group.addoption(
        "--topology-token",
        action="store",
        default=None,
        help="Override TOPOLOGY_API_TOKEN for this run.",
    )


def pytest_configure(config: Any) -> None:
    config.addinivalue_line(
        "markers",
        "topology(intent_key=...): set Topology intentKey for a test",
    )


def pytest_sessionstart(session: Any) -> None:  # noqa: ARG001
    _results.clear()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item: Any, call: Any):  # noqa: ARG001
    outcome = yield
    report = outcome.get_result()
    marker = item.get_closest_marker("topology")
    if marker:
        report.topology_intent_key = marker.kwargs.get("intent_key") or marker.kwargs.get(
            "intentKey"
        )


def pytest_runtest_logreport(report: Any) -> None:
    if report.when == "setup" and report.skipped:
        _store(report, outcome="skipped")
        return
    if report.when != "call":
        return
    _store(report, outcome=report.outcome or "error")


def _store(report: Any, *, outcome: str) -> None:
    longrepr = report.longreprtext if getattr(report, "longreprtext", None) else None
    title = getattr(report, "head_line", None) or report.nodeid.rsplit("::", 1)[-1]
    _results.append(
        result_from_test(
            nodeid=report.nodeid,
            title=title,
            outcome=outcome,
            duration_ms=(report.duration or 0) * 1000,
            error_message=longrepr or None,
            intent_key=getattr(report, "topology_intent_key", None),
        )
    )


def pytest_sessionfinish(session: Any, exitstatus: Any) -> None:  # noqa: ARG001
    if not _results:
        print("[topology] No test results to upload.")
        return

    config = session.config
    dry_run = bool(config.getoption("--topology-dry-run")) or os.environ.get(
        "TOPOLOGY_DRY_RUN", ""
    ) in ("1", "true", "True")
    report = build_execution_report(_results)

    if dry_run:
        print(f"[topology] dry-run: {len(report['results'])} result(s), not uploaded")
        return

    token = (
        config.getoption("--topology-token")
        or os.environ.get("TOPOLOGY_API_TOKEN")
        or ""
    ).strip()
    base_url = (
        config.getoption("--topology-url")
        or os.environ.get("TOPOLOGY_URL")
        or "http://127.0.0.1:4317"
    ).rstrip("/")
    if not token:
        print("[topology] TOPOLOGY_API_TOKEN is required to upload execution reports")
        return

    payload = json.dumps(report).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/executions",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(
                f"[topology] uploaded {len(report['results'])} result(s) → {base_url}/api/executions ({resp.status})"
            )
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        print(f"[topology] upload failed: HTTP {err.code} {body}")
    except urllib.error.URLError as err:
        print(f"[topology] upload failed: {err.reason}")
