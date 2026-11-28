"""Provision Azure Monitor Workbook & Cost/Log Guardrails for SmartTravel VN 2.0 (Plan B1).

Implements Plan 1 observability on Azure ($0 cost, zero container RAM overhead):
  1. Deploys/updates an Azure Monitor Workbook (`workbook_b1.json`) into `rg-smarttravel-b1`.
  2. Verifies/enforces Log Analytics daily cap (0.15 GB/day <= 5 GB/month free allowance)
     and 30-day retention on `law-smarttravel-b1`.
  3. Configures multi-threshold email notifications (25%, 50%, 80%, 100%) on `budget-smarttravel-b1`
     when `--alert-email` is supplied.

Usage:
  python backend/platform/azure/setup_monitoring.py --check
  python backend/platform/azure/setup_monitoring.py --apply-workbook
  python backend/platform/azure/setup_monitoring.py --apply-all --alert-email you@example.com
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
WORKBOOK_TEMPLATE = HERE / "workbook_b1.json"

DEFAULT_RG = "rg-smarttravel-b1"
DEFAULT_LAW = "law-smarttravel-b1"
DEFAULT_BUDGET = "budget-smarttravel-b1"
DEFAULT_WORKBOOK_DISPLAY_NAME = "SmartTravel VN 2.0 — Ops & Cost Dashboard (B1)"
# Deterministic UUID so repeated runs update the same Workbook instead of creating duplicates.
WORKBOOK_NAMESPACE = uuid.UUID("7f3f9f60-2b91-4d7c-9c12-1b8f9c2a4e01")


def find_az() -> str:
    found = shutil.which("az")
    if found:
        return found
    for candidate in (
        r"C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd",
        r"C:\Program Files (x86)\Microsoft SDKs\Azure\CLI2\wbin\az.cmd",
    ):
        if Path(candidate).exists():
            return candidate
    raise SystemExit("Azure CLI (`az`) not found. Install Microsoft.AzureCLI first.")


def run_az(az: str, args: list[str], capture: bool = True) -> str:
    cmd = [az, *args, "--only-show-errors"]
    res = subprocess.run(cmd, text=True, capture_output=capture, check=False)
    if res.returncode != 0:
        msg = (res.stderr or res.stdout or "").strip() if capture else f"az exited with {res.returncode}"
        raise SystemExit(f"Azure CLI error on `az {' '.join(args[:4])}`: {msg}")
    return (res.stdout or "").strip() if capture else ""


def deterministic_workbook_id(subscription_id: str, resource_group: str) -> str:
    return str(uuid.uuid5(WORKBOOK_NAMESPACE, f"{subscription_id.lower()}/{resource_group.lower()}/b1-ops"))


def build_workbook_arm_payload(
    subscription_id: str,
    resource_group: str,
    location: str,
    law_id: str,
    display_name: str = DEFAULT_WORKBOOK_DISPLAY_NAME,
    template_path: Path = WORKBOOK_TEMPLATE,
) -> dict[str, Any]:
    template = json.loads(template_path.read_text(encoding="utf-8"))
    template["fallbackResourceIds"] = [law_id]

    for item in template.get("items", []):
        if item.get("type") == 9:
            for param in item.get("content", {}).get("parameters", []):
                if param.get("name") == "Subscription":
                    param["value"] = f"/subscriptions/{subscription_id}"
                elif param.get("name") == "ResourceGroup":
                    param["value"] = resource_group

    return {
        "location": location,
        "kind": "shared",
        "properties": {
            "displayName": display_name,
            "category": "workbook",
            "sourceId": law_id,
            "serializedData": json.dumps(template, ensure_ascii=False),
            "version": "1.0",
        },
        "tags": {
            "project": "smarttravel-vn",
            "plan": "b1",
            "managed-by": "setup_monitoring.py",
        },
    }


def build_budget_payload(
    amount_usd: float,
    alert_emails: list[str],
    start_date: str | None = None,
    end_date: str | None = None,
    thresholds: tuple[int, ...] = (25, 50, 80, 100),
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    if not start_date:
        start_date = now.strftime("%Y-%m-01T00:00:00Z")
    if not end_date:
        end_date = f"{now.year + 2}-12-31T00:00:00Z"

    notifications: dict[str, Any] = {}
    if alert_emails:
        for pct in thresholds:
            notifications[f"Actual_{pct}pct"] = {
                "enabled": True,
                "operator": "GreaterThanOrEqualTo",
                "threshold": pct,
                "thresholdType": "Actual",
                "contactEmails": alert_emails,
            }
        notifications["Forecasted_100pct"] = {
            "enabled": True,
            "operator": "GreaterThanOrEqualTo",
            "threshold": 100,
            "thresholdType": "Forecasted",
            "contactEmails": alert_emails,
        }

    return {
        "properties": {
            "category": "Cost",
            "amount": amount_usd,
            "timeGrain": "Monthly",
            "timePeriod": {
                "startDate": start_date,
                "endDate": end_date,
            },
            "notifications": notifications,
        }
    }


def az_rest_json(az: str, method: str, url: str, body: dict[str, Any] | None = None) -> Any:
    args = ["rest", "--method", method, "--url", url, "-o", "json"]
    tmp_path: str | None = None
    try:
        if body is not None:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp:
                json.dump(body, tmp, ensure_ascii=False)
                tmp_path = tmp.name
            args.extend(["--body", f"@{tmp_path}"])
        raw = run_az(az, args, capture=True)
        return json.loads(raw) if raw else {}
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


def inspect_environment(az: str, rg: str, law_name: str, budget_name: str) -> dict[str, Any]:
    account = json.loads(run_az(az, ["account", "show", "-o", "json"]))
    sub_id = account["id"]
    law = json.loads(
        run_az(az, ["monitor", "log-analytics", "workspace", "show", "-g", rg, "-n", law_name, "-o", "json"])
    )
    wb_guid = deterministic_workbook_id(sub_id, rg)
    wb_url = (
        f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{rg}"
        f"/providers/Microsoft.Insights/workbooks/{wb_guid}?api-version=2023-06-01"
    )
    wb_exists = subprocess.run(
        [az, "rest", "--method", "get", "--url", wb_url, "-o", "none", "--only-show-errors"],
        capture_output=True,
        check=False,
    ).returncode == 0

    budgets_raw = az_rest_json(
        az,
        "get",
        f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{rg}"
        f"/providers/Microsoft.Consumption/budgets?api-version=2023-11-01",
    )
    budget = next((b for b in budgets_raw.get("value", []) if b.get("name") == budget_name), None)

    return {
        "subscription_id": sub_id,
        "subscription_name": account.get("name", ""),
        "tenant_id": account.get("tenantId", ""),
        "resource_group": rg,
        "location": law.get("location", "malaysiawest"),
        "law_id": law["id"],
        "law_name": law_name,
        "law_daily_quota_gb": (law.get("workspaceCapping") or {}).get("dailyQuotaGb"),
        "law_retention_days": law.get("retentionInDays"),
        "workbook_guid": wb_guid,
        "workbook_exists": wb_exists,
        "budget": budget,
    }


def workbook_portal_url(tenant_id: str, workbook_resource_id: str) -> str:
    encoded_id = quote(workbook_resource_id, safe="")
    return f"https://portal.azure.com/#@{tenant_id}/resource{workbook_resource_id}/overview?id={encoded_id}"


def ensure_provider_registered(az: str, namespace: str) -> None:
    state = run_az(az, ["provider", "show", "-n", namespace, "--query", "registrationState", "-o", "tsv"])
    if state.lower() == "registered":
        return
    print(f"Registering Azure resource provider `{namespace}` (current state: {state or 'NotRegistered'})...")
    run_az(az, ["provider", "register", "--namespace", namespace, "--wait"], capture=False)


def apply_workbook(az: str, info: dict[str, Any]) -> str:
    ensure_provider_registered(az, "Microsoft.Insights")
    sub_id = info["subscription_id"]
    rg = info["resource_group"]
    wb_guid = info["workbook_guid"]
    payload = build_workbook_arm_payload(
        subscription_id=sub_id,
        resource_group=rg,
        location=info["location"],
        law_id=info["law_id"],
    )
    url = (
        f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{rg}"
        f"/providers/Microsoft.Insights/workbooks/{wb_guid}?api-version=2023-06-01"
    )
    result = az_rest_json(az, "put", url, payload)
    wb_id = result.get("id", f"/subscriptions/{sub_id}/resourceGroups/{rg}/providers/Microsoft.Insights/workbooks/{wb_guid}")
    return wb_id


def ensure_guardrails(
    az: str,
    info: dict[str, Any],
    daily_cap_gb: float,
    retention_days: int,
    budget_name: str,
    budget_amount: float,
    alert_emails: list[str],
) -> None:
    rg = info["resource_group"]
    law_name = info["law_name"]
    if info["law_daily_quota_gb"] != daily_cap_gb or info["law_retention_days"] != retention_days:
        print(f"Updating Log Analytics `{law_name}`: dailyQuotaGb={daily_cap_gb}, retentionInDays={retention_days}...")
        run_az(
            az,
            [
                "monitor",
                "log-analytics",
                "workspace",
                "update",
                "-g",
                rg,
                "-n",
                law_name,
                "--quota",
                str(daily_cap_gb),
                "--retention-time",
                str(retention_days),
                "-o",
                "none",
            ],
            capture=False,
        )
    else:
        print(f"Log Analytics `{law_name}` guardrails already optimal (dailyQuotaGb={daily_cap_gb}, retention={retention_days}d).")

    if alert_emails:
        existing = info.get("budget") or {}
        props = existing.get("properties") or {}
        tp = props.get("timePeriod") or {}
        payload = build_budget_payload(
            amount_usd=budget_amount,
            alert_emails=alert_emails,
            start_date=tp.get("startDate"),
            end_date=tp.get("endDate"),
        )
        sub_id = info["subscription_id"]
        url = (
            f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{rg}"
            f"/providers/Microsoft.Consumption/budgets/{budget_name}?api-version=2023-11-01"
        )
        az_rest_json(az, "put", url, payload)
        print(f"Updated budget `{budget_name}` (${budget_amount:.2f}/mo) with 25/50/80/100% email alerts.")
    else:
        print(f"Budget `{budget_name}` notifications skipped (pass --alert-email <email> to configure alerts).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Setup Azure Monitor Workbook & Guardrails for SmartTravel B1")
    parser.add_argument("--rg", default=DEFAULT_RG)
    parser.add_argument("--law", default=DEFAULT_LAW)
    parser.add_argument("--budget-name", default=DEFAULT_BUDGET)
    parser.add_argument("--budget-amount", type=float, default=15.0)
    parser.add_argument("--daily-cap-gb", type=float, default=0.15)
    parser.add_argument("--retention-days", type=int, default=30)
    parser.add_argument("--alert-email", action="append", default=[], help="Email for budget alerts (repeatable)")
    parser.add_argument("--check", action="store_true", help="Inspect current monitoring & guardrail state only")
    parser.add_argument("--apply-workbook", action="store_true", help="Create or update Azure Monitor Workbook")
    parser.add_argument("--ensure-guardrails", action="store_true", help="Apply LAW cap/retention & optional budget alerts")
    parser.add_argument("--apply-all", action="store_true", help="Apply both Workbook and Guardrails")
    args = parser.parse_args()

    az = find_az()
    info = inspect_environment(az, args.rg, args.law, args.budget_name)

    print(f"Subscription : {info['subscription_name']} ({info['subscription_id']})")
    print(f"ResourceGroup: {info['resource_group']} ({info['location']})")
    print(f"Log Analytics: {info['law_name']} | dailyQuotaGb={info['law_daily_quota_gb']} | retention={info['law_retention_days']}d")
    print(f"Workbook B1  : {'EXISTS' if info['workbook_exists'] else 'NOT DEPLOYED YET'} ({info['workbook_guid']})")
    if info["budget"]:
        bprops = info["budget"].get("properties", {})
        spend = (bprops.get("currentSpend") or {}).get("amount", 0.0)
        notifs = list((bprops.get("notifications") or {}).keys())
        print(f"Budget       : {args.budget_name} | ${spend:.2f} / ${bprops.get('amount', 0):.2f} | alerts={notifs or 'NONE'}")
    else:
        print(f"Budget       : {args.budget_name} | NOT FOUND")

    if args.check or not (args.apply_workbook or args.ensure_guardrails or args.apply_all):
        print("\nRead-only check complete. Use --apply-workbook or --apply-all to provision.")
        return

    if args.apply_workbook or args.apply_all:
        wb_id = apply_workbook(az, info)
        print(f"\nWorkbook deployed: {DEFAULT_WORKBOOK_DISPLAY_NAME}")
        print(f"Resource ID      : {wb_id}")
        print(f"Open in Portal   : https://portal.azure.com/#@{info['tenant_id']}/resource{wb_id}")

    if args.ensure_guardrails or args.apply_all:
        ensure_guardrails(
            az=az,
            info=info,
            daily_cap_gb=args.daily_cap_gb,
            retention_days=args.retention_days,
            budget_name=args.budget_name,
            budget_amount=args.budget_amount,
            alert_emails=args.alert_email,
        )


if __name__ == "__main__":
    main()
