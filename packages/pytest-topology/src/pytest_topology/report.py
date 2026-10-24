from __future__ import annotations

import os
import re
from typing import Any, Iterable, Mapping, Optional

INTENT_KEY_RE = re.compile(r"^\[?([A-Z][A-Z0-9]*-\d+)\]?(?:[:\s]|$)")
EXECUTION_PROTOCOL_VERSION = 1


def intent_key_from_title(title: str) -> Optional[str]:
    match = INTENT_KEY_RE.match(title.strip())
    return match.group(1) if match else None


def map_outcome(outcome: str) -> str:
    if outcome in ("passed", "failed", "skipped"):
        return outcome
    return "error"


def result_from_test(
    *,
    nodeid: str,
    title: str,
    outcome: str,
    duration_ms: Optional[float] = None,
    error_message: Optional[str] = None,
    intent_key: Optional[str] = None,
    intent_from_title: bool = True,
) -> dict[str, Any]:
    mapped: dict[str, Any] = {
        "status": map_outcome(outcome),
        "title": title,
        "externalKey": nodeid,
        "artifacts": [],
    }
    if duration_ms is not None:
        mapped["durationMs"] = max(0, int(duration_ms))
    key = intent_key or (intent_key_from_title(title) if intent_from_title else None)
    if key:
        mapped["intentKey"] = key
    if error_message:
        mapped["errorMessage"] = error_message
    return mapped


def build_execution_report(
    results: Iterable[Mapping[str, Any]],
    *,
    env: Optional[Mapping[str, str]] = None,
) -> dict[str, Any]:
    env = env or os.environ
    commit = (
        (env.get("TOPOLOGY_COMMIT_SHA") or env.get("CI_COMMIT_SHA") or env.get("GITHUB_SHA") or "")
        .strip()
        or None
    )
    branch = (
        (
            env.get("TOPOLOGY_BRANCH")
            or env.get("CI_COMMIT_REF_NAME")
            or env.get("GITHUB_REF_NAME")
            or ""
        ).strip()
        or None
    )
    external_id = (
        (
            env.get("TOPOLOGY_RUN_EXTERNAL_ID")
            or env.get("CI_PIPELINE_ID")
            or env.get("GITHUB_RUN_ID")
            or ""
        ).strip()
        or None
    )
    report: dict[str, Any] = {
        "version": EXECUTION_PROTOCOL_VERSION,
        "results": list(results),
    }
    run: dict[str, str] = {}
    if external_id:
        run["externalId"] = external_id
    if commit:
        run["commitSha"] = commit
    if branch:
        run["branch"] = branch
    if run:
        report["run"] = run
    return report
