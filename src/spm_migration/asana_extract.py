"""Extract projects, tasks (with nested subtasks), portfolio items and status updates from Asana.

Output: data/raw/asana/{projects,tasks,portfolio_items,status_updates}.jsonl
Comments (stories) and attachments are deliberately not pulled; see docs/02_source_asana.md.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Iterator

import requests

from .common import write_jsonl

log = logging.getLogger(__name__)

BASE_URL = "https://app.asana.com/api/1.0"

PROJECT_FIELDS = ",".join([
    "name", "notes", "archived", "completed", "completed_at", "created_at", "modified_at",
    "start_on", "due_on", "permalink_url", "owner.email", "owner.name", "team.name",
    "current_status_update.status_type", "current_status_update.title",
    "custom_fields.name", "custom_fields.display_value",
    "custom_fields.people_value.email", "custom_fields.people_value.name",
])
TASK_FIELDS = ",".join([
    "name", "notes", "completed", "completed_at", "created_at", "modified_at",
    "start_on", "due_on", "due_at", "permalink_url", "resource_subtype", "num_subtasks",
    "assignee.email", "created_by.email", "parent.gid",
    "memberships.project.gid", "memberships.section.gid", "memberships.section.name",
    "dependencies.gid", "followers.email", "tags.name",
    "custom_fields.name", "custom_fields.display_value",
    "custom_fields.people_value.email", "custom_fields.people_value.name",
])
STATUS_FIELDS = "status_type,title,text,created_at,author.email"


class AsanaClient:
    def __init__(self, token: str, page_size: int = 100, max_retries: int = 6):
        if not token:
            raise ValueError("Asana token is empty; set ASANA_PAT or asana.token in settings.yaml")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}", "Accept": "application/json"})
        self.page_size = page_size
        self.max_retries = max_retries

    def _get(self, path: str, params: dict) -> dict:
        for attempt in range(self.max_retries):
            resp = self.session.get(f"{BASE_URL}{path}", params=params, timeout=60)
            if resp.status_code == 429 or resp.status_code >= 500:
                wait = int(resp.headers.get("Retry-After", 2 ** attempt))
                log.warning("Asana %s on %s; retrying in %ss", resp.status_code, path, wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        raise RuntimeError(f"Asana request failed after {self.max_retries} retries: {path}")

    def paginate(self, path: str, **params) -> Iterator[dict]:
        params = {**params, "limit": self.page_size}
        while True:
            body = self._get(path, params)
            yield from body.get("data", [])
            next_page = body.get("next_page")
            if not next_page or not next_page.get("offset"):
                return
            params["offset"] = next_page["offset"]


def extract(settings: dict, out_dir: str | Path) -> dict[str, int]:
    cfg = settings["asana"]
    client = AsanaClient(cfg.get("token", ""), cfg.get("page_size", 100))
    out = Path(out_dir)
    project_filter = set(str(g) for g in cfg.get("project_gids") or [])

    projects = [
        p for p in client.paginate(f"/workspaces/{cfg['workspace_gid']}/projects", opt_fields=PROJECT_FIELDS)
        if not project_filter or p["gid"] in project_filter
    ]
    log.info("Asana: %d projects", len(projects))

    portfolio_items = []
    for pf in cfg.get("portfolios") or []:
        for item in client.paginate(f"/portfolios/{pf['gid']}/items", opt_fields="name,resource_type"):
            portfolio_items.append({"portfolio_gid": str(pf["gid"]), "portfolio_name": pf["name"],
                                    "item_gid": item["gid"], "item_type": item.get("resource_type")})

    tasks, statuses = [], []
    for i, project in enumerate(projects, 1):
        pgid = project["gid"]
        for task in client.paginate(f"/projects/{pgid}/tasks", opt_fields=TASK_FIELDS):
            task["_project_gid"] = pgid
            tasks.append(task)
            if task.get("num_subtasks"):
                tasks.extend(_subtasks(client, task["gid"], pgid))
        if cfg.get("include_status_updates", True):
            for su in client.paginate("/status_updates", parent=pgid, opt_fields=STATUS_FIELDS):
                su["_project_gid"] = pgid
                statuses.append(su)
        if i % 50 == 0:
            log.info("Asana: %d/%d projects, %d tasks so far", i, len(projects), len(tasks))

    return {
        "projects": write_jsonl(out / "projects.jsonl", projects),
        "tasks": write_jsonl(out / "tasks.jsonl", tasks),
        "portfolio_items": write_jsonl(out / "portfolio_items.jsonl", portfolio_items),
        "status_updates": write_jsonl(out / "status_updates.jsonl", statuses),
    }


def _subtasks(client: AsanaClient, parent_gid: str, project_gid: str) -> Iterator[dict]:
    for sub in client.paginate(f"/tasks/{parent_gid}/subtasks", opt_fields=TASK_FIELDS):
        sub["_project_gid"] = project_gid
        yield sub
        if sub.get("num_subtasks"):
            yield from _subtasks(client, sub["gid"], project_gid)
