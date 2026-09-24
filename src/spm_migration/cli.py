"""Command line entry point: python -m spm_migration.cli <command>"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

from . import canonical, classify, reconcile, transform, validate
from .common import load_settings, parse_date


def _today(settings: dict) -> date:
    return parse_date(settings.get("as_of_date")) or date.today()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="spm_migration")
    p.add_argument("command", choices=["extract-asana", "extract-adaptive", "describe-adaptive", "normalize",
                                       "classify", "transform", "run-all", "validate-fields", "reconcile", "build-workbook",
                                       "transform-map-spec", "push", "user-stories"])
    p.add_argument("--settings", default="config/settings.yaml")
    p.add_argument("--rules", default="config/classification.yaml")
    p.add_argument("--overrides", default="config/overrides.csv")
    p.add_argument("--mapping", default="config/target_mapping.yaml")
    p.add_argument("--value-maps", default="mapping/value_maps.csv")
    p.add_argument("--execute", action="store_true", help="push: actually send rows (default is a dry run)")
    p.add_argument("--only", nargs="*", help="push: limit to these target tables, e.g. pm_project")
    p.add_argument("--limit", type=int, help="push: first N rows per file (for smoke tests)")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    log = logging.getLogger("spm_migration")

    if args.command == "transform-map-spec":
        from .servicenow import transform_map_spec
        rows = transform_map_spec(args.mapping, "mapping/servicenow_transform_maps.csv")
        log.info("Wrote mapping/servicenow_transform_maps.csv (%d field maps)", len(rows))
        return 0
    if args.command == "user-stories":
        from .stories import build as build_stories
        from .servicenow import transform_map_spec
        transform_map_spec(args.mapping, "mapping/servicenow_transform_maps.csv")
        for out in build_stories("config/user_stories.yaml", "mapping/servicenow_transform_maps.csv",
                                 "mapping/decisions.csv", "mapping/servicenow_user_stories.xlsx",
                                 "docs/09_servicenow_user_stories.md"):
            log.info("Wrote %s", out)
        return 0
    if args.command == "build-workbook":
        from .workbook import build
        log.info("Wrote %s", build("mapping", "mapping/mapping_workbook.xlsx"))
        return 0

    settings = load_settings(args.settings)
    raw = Path(settings["paths"]["raw"])
    today = _today(settings)

    if args.command == "extract-asana":
        from .asana_extract import extract
        log.info("Asana extract: %s", extract(settings, raw / "asana"))
    elif args.command == "extract-adaptive":
        from .adaptive_extract import extract
        log.info("Adaptive extract: %s", extract(settings, raw / "adaptive"))
    elif args.command == "describe-adaptive":
        from .adaptive_extract import describe
        out = Path(settings["paths"]["reference"]) / "adaptive_metadata.json"
        describe(settings, out)
        log.info("Wrote %s", out)
    elif args.command == "validate-fields":
        issues = validate.run(settings, args.mapping, args.value_maps)
        errors = [i for i in issues if i["severity"] == "ERROR"]
        for i in issues:
            log.log(logging.ERROR if i["severity"] == "ERROR" else logging.INFO,
                    "%s.%s: %s", i["table"], i["column"], i["issue"])
        log.info("%d errors, %d info (see data/staging/field_validation.csv)", len(errors), len(issues) - len(errors))
        return 1 if errors else 0
    elif args.command == "push":
        from .servicenow import push
        summary = push(settings, args.mapping, args.only, args.execute, args.limit)
        if not args.execute:
            log.info("Dry run only - add --execute to send %d files to ServiceNow", len(summary))
    elif args.command == "reconcile":
        for row in reconcile.run(settings, args.mapping):
            log.info("%(table)s: expected=%(expected)s in_servicenow=%(in_servicenow)s "
                     "missing=%(missing)s unexpected=%(unexpected)s %(note)s", row)
    else:
        if args.command in ("normalize", "run-all"):
            log.info("Normalize: %s", canonical.normalize(settings, today))
        if args.command in ("classify", "run-all"):
            log.info("Classify: %s", classify.run(settings, args.rules, args.overrides, today))
        if args.command in ("transform", "run-all"):
            log.info("Transform: %s", transform.run(settings, args.mapping, args.value_maps))
    return 0


if __name__ == "__main__":
    sys.exit(main())
