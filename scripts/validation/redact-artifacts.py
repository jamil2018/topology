"""Redact textual browser artifacts before they leave an isolated invocation.
Trace screenshots are disabled; failure screenshots mask secret-bearing inputs.
"""
import json
import base64
import io
import os
from pathlib import Path
import re
import sys
import zipfile

secrets = sorted(filter(None, json.loads(os.environ.get("VALIDATION_REDACT_SECRETS", "[]"))), key=len, reverse=True)

def text(value):
    for secret in secrets:
        value = value.replace(secret, "[redacted]")
    value = re.sub(r"postgres(?:ql)?://[^\s\"'<>]+", "[database URL redacted]", value)
    value = re.sub(r"(?i)(\b(?:set-cookie|cookie):\s*)[^\r\n]+", r"\1[redacted]", value)
    value = re.sub(r"authjs\.[a-z.-]+=[^;\s\"\']+", "authjs.[redacted]", value)
    value = re.sub(r"(?i)(Bearer\s+)[^\s\"'<>]+", r"\1[redacted]", value)
    value = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?", "[signed token redacted]", value)
    return re.sub(r"\btopo_[A-Za-z0-9_-]{16,}", "[API token redacted]", value)

def clean(value):
    if isinstance(value, list):
        return [clean(item) for item in value]
    if isinstance(value, dict):
        if isinstance(value.get("body"), str) and (str(value.get("contentType", "")).startswith("text/") or "json" in str(value.get("contentType", ""))):
            try:
                value = {**value, "body": base64.b64encode(content(base64.b64decode(value["body"], validate=True))).decode()}
            except (ValueError, TypeError):
                pass
        if str(value.get("name", "")).lower() in {"authorization", "cookie", "set-cookie"} and "value" in value:
            return {**value, "value": "[redacted]"}
        return {key: "[redacted]" if key.lower() in {"password", "token", "plaintext", "secret", "authorization", "cookie", "set-cookie"} else clean(item) for key, item in value.items()}
    if isinstance(value, str):
        if value.lstrip().startswith(("{", "[")):
            try:
                return json.dumps(clean(json.loads(value)))
            except (json.JSONDecodeError, ValueError):
                pass
        return text(value)
    return value

def content(data):
    try:
        original = data.decode("utf-8")
    except UnicodeDecodeError:
        return data
    try:
        return json.dumps(clean(json.loads(original))).encode()
    except (json.JSONDecodeError, ValueError):
        # Playwright HTML embeds a report ZIP. Redact its JSON/attachments too.
        def embedded(match):
            stream = io.BytesIO()
            with zipfile.ZipFile(io.BytesIO(base64.b64decode(match[1]))) as source:
                with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as target:
                    for entry in source.infolist():
                        target.writestr(entry, content(source.read(entry)))
            return "data:application/zip;base64," + base64.b64encode(stream.getvalue()).decode()
        original = re.sub(r"data:application/zip;base64,([A-Za-z0-9+/=]+)", embedded, original)
        lines = []
        for line in original.splitlines(keepends=True):
            try:
                lines.append(json.dumps(clean(json.loads(line))) + "\n")
            except (json.JSONDecodeError, ValueError):
                lines.append(text(line))
        return "".join(lines).encode()

for artifact in Path(sys.argv[1]).rglob("*"):
    if not artifact.is_file():
        continue
    if artifact.suffix == ".zip":
        with zipfile.ZipFile(artifact) as archive:
            entries = [(entry, content(archive.read(entry))) for entry in archive.infolist()]
        temporary = artifact.with_suffix(".redacted.zip")
        with zipfile.ZipFile(temporary, "w") as archive:
            for entry, data in entries:
                archive.writestr(entry, data)
        temporary.replace(artifact)
    elif artifact.suffix in {".json", ".log", ".md", ".html", ".txt"}:
        artifact.write_bytes(content(artifact.read_bytes()))
