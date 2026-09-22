"""Extract entities from Adaptive Work (fka Clarizen) via the REST v2 CZQL query endpoint.

Output: data/raw/adaptive/<Entity>.jsonl, one file per entity in settings.adaptive.entities.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Iterator

import requests

from .common import write_jsonl

log = logging.getLogger(__name__)

DISCOVERY_URL = "https://api.clarizen.com/v2.0/services/authentication/getServerDefinition"


class AdaptiveClient:
    def __init__(self, cfg: dict, max_retries: int = 6):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json", "Accept": "application/json"})
        self.max_retries = max_retries
        self.base_url = (cfg.get("base_url") or "").rstrip("/")
        if cfg.get("api_key"):
            self.session.headers["Authorization"] = f"ApiKey {cfg['api_key']}"
            if not self.base_url:
                raise ValueError("adaptive.base_url is required with api_key auth "
                                 "(e.g. https://api2.clarizen.com/v2.0/services)")
        elif cfg.get("username"):
            self._login(cfg["username"], cfg.get("password", ""))
        else:
            raise ValueError("Set adaptive.api_key (preferred) or adaptive.username/password")

    def _login(self, username: str, password: str) -> None:
        creds = {"userName": username, "password": password}
        if not self.base_url:
            resp = self.session.post(DISCOVERY_URL, json=creds, timeout=60)
            resp.raise_for_status()
            self.base_url = resp.json()["serverLocation"].rstrip("/")
        resp = self.session.post(f"{self.base_url}/authentication/login", json=creds, timeout=60)
        resp.raise_for_status()
        self.session.headers["Authorization"] = f"Session {resp.json()['sessionId']}"

    def _post(self, path: str, body: dict) -> dict:
        for attempt in range(self.max_retries):
            resp = self.session.post(f"{self.base_url}{path}", json=body, timeout=120)
            if resp.status_code == 429 or resp.status_code >= 500:
                wait = int(resp.headers.get("Retry-After", 2 ** attempt))
                log.warning("Adaptive %s on %s; retrying in %ss", resp.status_code, path, wait)
                time.sleep(wait)
                continue
            if resp.status_code >= 400:
                raise RuntimeError(f"Adaptive {resp.status_code} on {path}: {resp.text[:500]}")
            return resp.json()
        raise RuntimeError(f"Adaptive request failed after {self.max_retries} retries: {path}")

    def query(self, czql: str, page_size: int = 1000) -> Iterator[dict]:
        paging = {"from": 0, "limit": page_size}
        while True:
            body = self._post("/data/query", {"q": czql, "paging": paging})
            yield from body.get("entities", [])
            paging = body.get("paging") or {}
            if not paging.get("hasMore"):
                return

    def describe(self, entity_names: list[str]) -> dict:
        return self._post("/metadata/describeEntities", {"typeNames": entity_names})


def build_query(entity: str, spec: dict) -> str:
    fields = ", ".join(spec["fields"])
    where = f" WHERE {spec['where']}" if spec.get("where") else ""
    return f"SELECT {fields} FROM {entity}{where}"


def extract(settings: dict, out_dir: str | Path) -> dict[str, int]:
    cfg = settings["adaptive"]
    client = AdaptiveClient(cfg)
    out = Path(out_dir)
    counts = {}
    for entity, spec in cfg["entities"].items():
        czql = build_query(entity, spec)
        log.info("Adaptive: %s", czql)
        counts[entity] = write_jsonl(out / f"{entity}.jsonl", client.query(czql, cfg.get("page_size", 1000)))
        log.info("Adaptive: %s -> %d rows", entity, counts[entity])
    return counts


def describe(settings: dict, out_path: str | Path) -> None:
    import json
    client = AdaptiveClient(settings["adaptive"])
    result = client.describe(list(settings["adaptive"]["entities"].keys()))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(result, indent=2), encoding="utf-8")
