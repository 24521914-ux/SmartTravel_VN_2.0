"""Unified Ops & Cost Monitor (CLI + Local Web Dashboard) for SmartTravel VN 2.0 (Plan B1).

All-in-one live telemetry across EVERY platform without leaving the dashboard:
  - Azure Container Apps (7 services: live replicas, CPU, RAM, Requests, Latency, Restarts)
  - Azure for Students $100 Credit Balance & Expiration (via MCA Billing API)
  - Azure Cost Management & Budgets (MTD spend by meter/resource, ACA Free Grant estimate)
  - Azure Log Analytics (`law-smarttravel-b1`: errors, KEDA scale events, MTD ingestion)
  - GitHub Actions (`deploy-b1.yml`: recent deployments)
  - CloudAMQP (via `.env` `CLOUDAMQP_URL`: connections, queues, `*.inbox` & `*.dlq`, msg rates)
  - Cloudinary (via `.env` `CLOUDINARY_*`: credits / 25, storage, bandwidth, transforms, objects)
  - Neon PostgreSQL (optional read-only `NEON_API_KEY`: CU-hours / 100, storage, egress, idle/active)
  - Cloudflare Pages (optional read-only `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`: deploys & Functions analytics)
  - MongoDB Atlas (optional read-only `ATLAS_PUBLIC_KEY` + `ATLAS_PRIVATE_KEY` + `ATLAS_GROUP_ID`: clusters & alerts)

Zero external dependencies (Python 3 stdlib only). Never prints or exposes secrets/tokens.

Usage:
  python backend/platform/azure/ops_monitor.py                    # One-shot terminal dashboard
  python backend/platform/azure/ops_monitor.py --watch            # Auto-refresh terminal every 60s
  python backend/platform/azure/ops_monitor.py --web              # Open local Web Control Center
  python backend/platform/azure/ops_monitor.py --json             # Machine-readable JSON output
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DASHBOARD_HTML = HERE / "ops_dashboard.html"
DB_PROBE_JAVA = HERE / "DbStatsProbe.java"

DEFAULT_RG = "rg-smarttravel-b1"
DEFAULT_LAW = "law-smarttravel-b1"
DEFAULT_BUDGET = "budget-smarttravel-b1"
DEFAULT_GITHUB_REPO = "24521914-ux/SmartTravel_VN_2.0"
DEFAULT_PUBLIC_SITE = "https://smarttravel-vn.pages.dev"
DEFAULT_CF_PROJECT = "smarttravel-vn"
DEFAULT_SERVICE_ORDER = ["gateway", "identity", "catalog", "community", "trip", "ingestion", "intelligence"]
NEON_SERVICES = ("identity", "catalog", "trip", "ingestion", "intelligence")

# In-memory cache of last manual Neon SQL probe (prevents auto-refresh from waking Neon repeatedly).
_LAST_NEON_SQL_PROBE: dict[str, Any] | None = None

# ACA Consumption permanent monthly Free Grant.
ACA_FREE_VCPU_SECONDS = 180_000.0
ACA_FREE_GIB_SECONDS = 360_000.0
ACA_FREE_REQUESTS = 2_000_000.0

# External platform Free Tier reference limits.
NEON_FREE_CU_HOURS = 100.0
NEON_FREE_STORAGE_MB = 1024.0
NEON_FREE_EGRESS_MB = 5120.0
ATLAS_FREE_STORAGE_MB = 512.0
CLOUDINARY_FREE_CREDITS = 25.0


def redact_secrets(text: str) -> str:
    """Scrub credential-bearing URIs or obvious secret assignments from diagnostic messages."""
    if not text:
        return ""
    cleaned = re.sub(r"([a-zA-Z0-9+.-]+://)([^:@/\s]+):([^@/\s]+)@", r"\1***:***@", text)
    cleaned = re.sub(r"(?i)(Bearer\s+)[A-Za-z0-9._\-]+", r"\1***", cleaned)
    cleaned = re.sub(r"(?i)(Basic\s+)[A-Za-z0-9+/=]+", r"\1***", cleaned)
    return cleaned


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
    raise SystemExit("Azure CLI (`az`) not found. Install Microsoft.AzureCLI and run `az login`.")


def load_dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        values[key.strip()] = val
    return values


def run_cmd(cmd: list[str], timeout: int = 30, cwd: str | None = None) -> tuple[int, str, str]:
    res = subprocess.run(cmd, cwd=cwd, text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=timeout, check=False)
    return res.returncode, (res.stdout or "").strip(), (res.stderr or "").strip()


def get_az_tokens(az: str) -> dict[str, str]:
    """Fetch ARM + Log Analytics bearer tokens + subscription info in parallel."""
    def _az_json(args: list[str]) -> dict[str, Any]:
        rc, out, err = run_cmd([az, *args, "--only-show-errors", "-o", "json"])
        if rc != 0:
            raise RuntimeError(f"Azure CLI failed (`az {' '.join(args[:3])}`): {redact_secrets(err or out)}")
        return json.loads(out)

    with ThreadPoolExecutor(max_workers=3) as pool:
        f_acc = pool.submit(_az_json, ["account", "show"])
        f_arm = pool.submit(_az_json, ["account", "get-access-token", "--resource", "https://management.azure.com"])
        f_law = pool.submit(_az_json, ["account", "get-access-token", "--resource", "https://api.loganalytics.io"])
        acc = f_acc.result()
        arm = f_arm.result()
        law = f_law.result()

    return {
        "subscription_id": acc["id"],
        "subscription_name": acc.get("name", ""),
        "tenant_id": acc.get("tenantId", ""),
        "arm_token": arm["accessToken"],
        "law_token": law["accessToken"],
    }


def http_json(
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    timeout: int = 20,
) -> Any:
    req_headers = {"Accept": "application/json", "User-Agent": "SmartTravel-OpsMonitor/1.0"}
    if headers:
        req_headers.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {exc.code}: {redact_secrets(err_body)}") from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(redact_secrets(str(exc))) from exc


def http_digest_json(
    url: str,
    username: str,
    password: str,
    headers: dict[str, str] | None = None,
    timeout: int = 15,
) -> Any:
    pwd_mgr = urllib.request.HTTPPasswordMgrWithDefaultRealm()
    pwd_mgr.add_password(None, url, username, password)
    opener = urllib.request.build_opener(urllib.request.HTTPDigestAuthHandler(pwd_mgr))
    req_headers = {"Accept": "application/vnd.atlas.2023-01-01+json", "User-Agent": "SmartTravel-OpsMonitor/1.0"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers, method="GET")
    try:
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {exc.code}: {redact_secrets(err_body)}") from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(redact_secrets(str(exc))) from exc


def choose_metric_interval(hours: int) -> str:
    if hours <= 1:
        return "PT1M"
    if hours <= 6:
        return "PT5M"
    if hours <= 24:
        return "PT15M"
    return "PT1H"


def parse_azure_metrics_response(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    """Aggregate Azure Monitor metrics payload into summary KPIs and chart time-series."""
    summary: dict[str, Any] = {
        "cpuAvgPct": 0.0,
        "cpuMaxPct": 0.0,
        "ramAvgMib": 0.0,
        "ramMaxMib": 0.0,
        "ramMaxPct": 0.0,
        "requestsTotal": 0,
        "responseTimeAvgMs": None,
        "replicasMax": 0,
        "restartsMax": 0,
        "rxBytesTotal": 0,
        "txBytesTotal": 0,
    }
    series: dict[str, list[dict[str, Any]]] = {"cpu": [], "ramMib": [], "requests": [], "replicas": []}

    for metric in payload.get("value", []):
        name = (metric.get("name") or {}).get("value", "")
        ts_list = metric.get("timeseries") or []
        points = ts_list[0].get("data", []) if ts_list else []

        if name == "CpuPercentage":
            avgs = [p["average"] for p in points if p.get("average") is not None]
            maxs = [p.get("maximum", p.get("average")) for p in points if p.get("maximum") is not None or p.get("average") is not None]
            if avgs:
                summary["cpuAvgPct"] = round(sum(avgs) / len(avgs), 2)
            if maxs:
                summary["cpuMaxPct"] = round(max(maxs), 2)
            series["cpu"] = [{"t": p["timeStamp"], "v": round(p["average"], 2)} for p in points if p.get("average") is not None]

        elif name == "WorkingSetBytes":
            avgs = [p["average"] / (1024 * 1024) for p in points if p.get("average") is not None]
            maxs = [
                (p.get("maximum") if p.get("maximum") is not None else p.get("average")) / (1024 * 1024)
                for p in points
                if p.get("maximum") is not None or p.get("average") is not None
            ]
            if avgs:
                summary["ramAvgMib"] = round(sum(avgs) / len(avgs), 1)
            if maxs:
                summary["ramMaxMib"] = round(max(maxs), 1)
            series["ramMib"] = [
                {"t": p["timeStamp"], "v": round(p["average"] / (1024 * 1024), 1)}
                for p in points
                if p.get("average") is not None
            ]

        elif name == "MemoryPercentage":
            maxs = [p.get("maximum", p.get("average")) for p in points if p.get("maximum") is not None or p.get("average") is not None]
            if maxs:
                summary["ramMaxPct"] = round(max(maxs), 1)

        elif name == "Requests":
            totals = [p["total"] for p in points if p.get("total") is not None]
            summary["requestsTotal"] = int(round(sum(totals)))
            series["requests"] = [{"t": p["timeStamp"], "v": int(round(p["total"]))} for p in points if p.get("total") is not None]

        elif name == "ResponseTime":
            avgs = [p["average"] for p in points if p.get("average") is not None and p["average"] > 0]
            if avgs:
                summary["responseTimeAvgMs"] = round(sum(avgs) / len(avgs), 1)

        elif name == "Replicas":
            maxs = [p.get("maximum", p.get("average")) for p in points if p.get("maximum") is not None or p.get("average") is not None]
            if maxs:
                summary["replicasMax"] = int(round(max(maxs)))
            series["replicas"] = [
                {"t": p["timeStamp"], "v": int(round(p.get("maximum", p.get("average", 0))))}
                for p in points
                if p.get("maximum") is not None or p.get("average") is not None
            ]

        elif name == "RestartCount":
            maxs = [p.get("maximum", p.get("total", 0)) for p in points if p.get("maximum") is not None or p.get("total") is not None]
            if maxs:
                summary["restartsMax"] = int(round(max(maxs)))

        elif name == "RxBytes":
            summary["rxBytesTotal"] = int(round(sum(p["total"] for p in points if p.get("total") is not None)))

        elif name == "TxBytes":
            summary["txBytesTotal"] = int(round(sum(p["total"] for p in points if p.get("total") is not None)))

    return summary, series


def parse_kql_table(resp: dict[str, Any]) -> list[dict[str, Any]]:
    tables = resp.get("tables") or []
    if not tables:
        return []
    cols = [c["name"] for c in tables[0].get("columns", [])]
    return [dict(zip(cols, row)) for row in tables[0].get("rows", [])]


def query_log_analytics(law_customer_id: str, law_token: str, kql: str, timespan: str = "P1D") -> list[dict[str, Any]]:
    url = f"https://api.loganalytics.io/v1/workspaces/{law_customer_id}/query"
    resp = http_json(
        url,
        method="POST",
        headers={"Authorization": f"Bearer {law_token}"},
        body={"query": kql, "timespan": timespan},
        timeout=25,
    )
    return parse_kql_table(resp)


def compute_mtd_free_grant_from_metrics(per_app_mtd: list[dict[str, Any]], bucket_seconds: float = 3600.0) -> dict[str, Any]:
    """Compute Month-to-Date vCPU-s, GiB-s, and Requests from Azure Monitor Replicas & Requests metrics."""
    total_vcpu_s = 0.0
    total_gib_s = 0.0
    total_reqs = 0
    per_service = []
    for item in per_app_mtd:
        cpu = float(item.get("cpu") or 0.25)
        mem_gib = float(item.get("memGib") or 0.5)
        rep_avg_sum = float(item.get("replicaAvgSum") or 0.0)
        reqs = int(item.get("requestsTotal") or 0)
        vcpu_s = round(rep_avg_sum * bucket_seconds * cpu, 1)
        gib_s = round(rep_avg_sum * bucket_seconds * mem_gib, 1)
        total_vcpu_s += vcpu_s
        total_gib_s += gib_s
        total_reqs += reqs
        per_service.append(
            {
                "service": item.get("service", ""),
                "estVcpuSeconds": vcpu_s,
                "estGibSeconds": gib_s,
                "requestsTotal": reqs,
            }
        )
    per_service.sort(key=lambda x: (x["estVcpuSeconds"], x["requestsTotal"]), reverse=True)
    total_vcpu_s = round(total_vcpu_s, 1)
    total_gib_s = round(total_gib_s, 1)
    return {
        "source": "azure-monitor-metrics-mtd",
        "estVcpuSeconds": total_vcpu_s,
        "estGibSeconds": total_gib_s,
        "requestsTotal": total_reqs,
        "vcpuFreeLimit": ACA_FREE_VCPU_SECONDS,
        "gibFreeLimit": ACA_FREE_GIB_SECONDS,
        "requestsFreeLimit": ACA_FREE_REQUESTS,
        "vcpuRemaining": round(max(0.0, ACA_FREE_VCPU_SECONDS - total_vcpu_s), 1),
        "gibRemaining": round(max(0.0, ACA_FREE_GIB_SECONDS - total_gib_s), 1),
        "requestsRemaining": int(max(0, ACA_FREE_REQUESTS - total_reqs)),
        "vcpuPct": round(min(100.0, (total_vcpu_s / ACA_FREE_VCPU_SECONDS) * 100.0), 2),
        "gibPct": round(min(100.0, (total_gib_s / ACA_FREE_GIB_SECONDS) * 100.0), 2),
        "requestsPct": round(min(100.0, (total_reqs / ACA_FREE_REQUESTS) * 100.0), 4),
        "perService": per_service,
    }


def parse_memory_gib(mem_str: str) -> float:
    s = (mem_str or "0.5Gi").strip().lower()
    if s.endswith("gi"):
        try:
            return float(s[:-2])
        except ValueError:
            return 0.5
    if s.endswith("mi"):
        try:
            return float(s[:-2]) / 1024.0
        except ValueError:
            return 0.5
    return 0.5


def estimate_free_grant_usage(active_minutes_rows: list[dict[str, Any]], cpu_per_app: float = 0.25, mem_gib_per_app: float = 0.5) -> dict[str, Any]:
    total_minutes = sum(float(r.get("ActiveMinutes") or 0) for r in active_minutes_rows)
    vcpu_s = round(total_minutes * 60.0 * cpu_per_app, 1)
    gib_s = round(total_minutes * 60.0 * mem_gib_per_app, 1)
    return {
        "source": "log-analytics-fallback",
        "activeMinutesMtd": int(round(total_minutes)),
        "estVcpuSeconds": vcpu_s,
        "estGibSeconds": gib_s,
        "requestsTotal": 0,
        "vcpuFreeLimit": ACA_FREE_VCPU_SECONDS,
        "gibFreeLimit": ACA_FREE_GIB_SECONDS,
        "requestsFreeLimit": ACA_FREE_REQUESTS,
        "vcpuRemaining": round(max(0.0, ACA_FREE_VCPU_SECONDS - vcpu_s), 1),
        "gibRemaining": round(max(0.0, ACA_FREE_GIB_SECONDS - gib_s), 1),
        "requestsRemaining": int(ACA_FREE_REQUESTS),
        "vcpuPct": round(min(100.0, (vcpu_s / ACA_FREE_VCPU_SECONDS) * 100.0), 2),
        "gibPct": round(min(100.0, (gib_s / ACA_FREE_GIB_SECONDS) * 100.0), 2),
        "requestsPct": 0.0,
        "perService": [
            {
                "service": r.get("Service", ""),
                "activeMinutes": int(r.get("ActiveMinutes") or 0),
                "estVcpuSeconds": round(float(r.get("ActiveMinutes") or 0) * 60.0 * cpu_per_app, 1),
                "estGibSeconds": round(float(r.get("ActiveMinutes") or 0) * 60.0 * mem_gib_per_app, 1),
                "requestsTotal": 0,
            }
            for r in active_minutes_rows
        ],
    }


def fetch_azure_credit_balance(arm_headers: dict[str, str]) -> dict[str, Any]:
    """Query Azure MCA Billing API for exact Azure for Students $100 credit balance & expiration."""
    try:
        accounts = http_json(
            "https://management.azure.com/providers/Microsoft.Billing/billingAccounts?api-version=2024-04-01",
            headers=arm_headers,
            timeout=15,
        ).get("value", [])
        if not accounts:
            return {"available": False, "error": "Không tìm thấy Billing Account"}

        mca = next(
            (a for a in accounts if (a.get("properties") or {}).get("agreementType") == "MicrosoftCustomerAgreement"),
            accounts[0],
        )
        ba_name = urllib.parse.quote(mca["name"], safe=":")
        profiles = http_json(
            f"https://management.azure.com/providers/Microsoft.Billing/billingAccounts/{ba_name}/billingProfiles?api-version=2024-04-01",
            headers=arm_headers,
            timeout=15,
        ).get("value", [])
        if not profiles:
            return {"available": False, "error": "Không tìm thấy Billing Profile"}

        bp_name = urllib.parse.quote(profiles[0]["name"], safe="")
        base = f"https://management.azure.com/providers/Microsoft.Billing/billingAccounts/{ba_name}/billingProfiles/{bp_name}/providers/Microsoft.Consumption"

        with ThreadPoolExecutor(max_workers=2) as pool:
            f_sum = pool.submit(http_json, f"{base}/credits/balanceSummary?api-version=2023-11-01", "GET", arm_headers, None, 15)
            f_lots = pool.submit(http_json, f"{base}/lots?api-version=2023-11-01", "GET", arm_headers, None, 15)
            summary_raw = f_sum.result()
            lots_raw = f_lots.result()

        s_props = summary_raw.get("properties") or {}
        bal = s_props.get("balanceSummary") or {}
        current_bal = float((bal.get("currentBalance") or {}).get("value") or 0.0)
        est_bal = float((bal.get("estimatedBalance") or {}).get("value") or current_bal)
        pending_charges = float((s_props.get("pendingEligibleCharges") or {}).get("value") or 0.0)
        expired_credit = float((s_props.get("expiredCredit") or {}).get("value") or 0.0)
        currency = s_props.get("creditCurrency") or "USD"

        lots = []
        original_total = 0.0
        nearest_expiry: str | None = None
        primary_source = "Azure Credit"
        for lot in lots_raw.get("value", []):
            lp = lot.get("properties") or {}
            orig = float((lp.get("originalAmount") or {}).get("value") or 0.0)
            closed = float((lp.get("closedBalance") or {}).get("value") or 0.0)
            exp = lp.get("expirationDate")
            start = lp.get("startDate")
            src = lp.get("source") or "Azure Credit"
            original_total += orig
            if exp and (nearest_expiry is None or exp < nearest_expiry):
                nearest_expiry = exp
                primary_source = src
            lots.append(
                {
                    "source": src,
                    "originalAmount": round(orig, 2),
                    "remainingAmount": round(closed, 2),
                    "startDate": start,
                    "expirationDate": exp,
                }
            )

        if original_total <= 0:
            original_total = max(current_bal, 100.0)
        used = max(0.0, round(original_total - est_bal, 4))
        days_remaining = None
        if nearest_expiry:
            try:
                exp_dt = datetime.fromisoformat(nearest_expiry.replace("Z", "+00:00"))
                days_remaining = max(0, (exp_dt - datetime.now(timezone.utc)).days)
            except Exception:  # noqa: BLE001
                days_remaining = None

        return {
            "available": True,
            "currency": currency,
            "source": primary_source,
            "billingProfile": profiles[0]["name"],
            "originalAmountUsd": round(original_total, 2),
            "currentBalanceUsd": round(current_bal, 2),
            "estimatedBalanceUsd": round(est_bal, 2),
            "usedUsd": round(used, 2),
            "usedPct": round(min(100.0, (used / original_total) * 100.0), 2),
            "pendingChargesUsd": round(pending_charges, 4),
            "expiredCreditUsd": round(expired_credit, 2),
            "expirationDate": nearest_expiry,
            "daysRemaining": days_remaining,
            "lots": lots,
        }
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "error": redact_secrets(str(exc))}


def fetch_cloudinary_usage(env_vars: dict[str, str]) -> dict[str, Any]:
    """Fetch live Cloudinary credits, storage, bandwidth, transforms & object counts."""
    cloud_name = env_vars.get("CLOUDINARY_CLOUD_NAME", "").strip()
    api_key = env_vars.get("CLOUDINARY_API_KEY", "").strip()
    api_secret = env_vars.get("CLOUDINARY_API_SECRET", "").strip()
    if not (cloud_name and api_key and api_secret):
        return {"configured": False, "requiredVars": ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]}

    auth = base64.b64encode(f"{api_key}:{api_secret}".encode("utf-8")).decode("ascii")
    try:
        d = http_json(
            f"https://api.cloudinary.com/v1_1/{urllib.parse.quote(cloud_name, safe='')}/usage",
            headers={"Authorization": f"Basic {auth}"},
            timeout=12,
        )
        credits = d.get("credits") or {}
        storage = d.get("storage") or {}
        bw = d.get("bandwidth") or {}
        trans = d.get("transformations") or {}
        objs = d.get("objects") or {}
        limit = float(credits.get("limit") or CLOUDINARY_FREE_CREDITS)
        used = float(credits.get("usage") or 0.0)
        return {
            "configured": True,
            "cloudName": cloud_name,
            "plan": d.get("plan", "Free"),
            "lastUpdated": d.get("last_updated", ""),
            "creditsUsed": round(used, 2),
            "creditsLimit": round(limit, 2),
            "creditsPct": round(float(credits.get("used_percent") or (used / limit * 100.0 if limit else 0.0)), 2),
            "storageMb": round(float(storage.get("usage") or 0.0) / (1024 * 1024), 2),
            "storageCredits": round(float(storage.get("credits_usage") or 0.0), 2),
            "bandwidthMb": round(float(bw.get("usage") or 0.0) / (1024 * 1024), 2),
            "bandwidthCredits": round(float(bw.get("credits_usage") or 0.0), 2),
            "transformations": int(trans.get("usage") or 0),
            "transformationsCredits": round(float(trans.get("credits_usage") or 0.0), 2),
            "objects": int(objs.get("usage") or d.get("resources") or 0),
            "requests": int(d.get("requests") or 0),
        }
    except Exception as exc:  # noqa: BLE001
        return {"configured": True, "cloudName": cloud_name, "error": redact_secrets(str(exc))}


def extract_neon_db_inventory(env_vars: dict[str, str]) -> list[dict[str, str]]:
    """Extract safe (host + db name only, zero credentials) Neon DB list from .env."""
    dbs = []
    for svc in ("identity", "catalog", "trip", "ingestion", "intelligence"):
        raw = env_vars.get(f"{svc.upper()}_DB_URL", "").strip()
        if not raw:
            continue
        norm = raw[5:] if raw.startswith("jdbc:") else raw
        parsed = urllib.parse.urlparse(norm)
        dbs.append(
            {
                "service": svc,
                "host": parsed.hostname or "",
                "database": (parsed.path or "").lstrip("/") or f"{svc}_db",
            }
        )
    return dbs


def find_wrangler() -> str | None:
    """Locate Cloudflare Wrangler binary (PATH, frontend/node_modules, or npx cache)."""
    found = shutil.which("wrangler")
    if found:
        return found
    local_name = "wrangler.cmd" if os.name == "nt" else "wrangler"
    fe_bin = ROOT / "frontend" / "node_modules" / ".bin" / local_name
    if fe_bin.exists():
        return str(fe_bin)
    cache_roots = []
    if os.environ.get("LOCALAPPDATA"):
        cache_roots.append(Path(os.environ["LOCALAPPDATA"]) / "npm-cache" / "_npx")
    cache_roots.append(Path.home() / ".npm" / "_npx")
    for base in cache_roots:
        if base.exists():
            matches = sorted(base.glob(f"*/node_modules/.bin/{local_name}"), reverse=True)
            if matches:
                return str(matches[0])
    return None


def find_m2_db_classpath() -> list[str]:
    """Locate PostgreSQL + MongoDB Java driver JARs already cached in local ~/.m2/repository."""
    m2 = Path.home() / ".m2" / "repository"
    if not m2.exists():
        return []
    jars: list[str] = []

    def _latest_jar(rel_dir: str, prefix: str) -> Path | None:
        base = m2 / rel_dir
        if not base.exists():
            return None
        candidates = [
            p for p in base.rglob(f"{prefix}-*.jar")
            if not p.name.endswith(("-sources.jar", "-javadoc.jar", "-tests.jar"))
        ]
        if not candidates:
            return None
        candidates.sort(key=lambda p: p.parent.name, reverse=True)
        return candidates[0]

    pg = _latest_jar("org/postgresql/postgresql", "postgresql")
    if pg:
        jars.append(str(pg))

    # Pick a consistent MongoDB driver version across sync/core/bson/record-codec.
    sync_jar = _latest_jar("org/mongodb/mongodb-driver-sync", "mongodb-driver-sync")
    if sync_jar:
        ver = sync_jar.parent.name
        for artifact in ("mongodb-driver-sync", "mongodb-driver-core", "bson", "bson-record-codec"):
            p = m2 / "org" / "mongodb" / artifact / ver / f"{artifact}-{ver}.jar"
            if p.exists():
                jars.append(str(p))
    return jars


def run_java_db_probe(mode: str, extra_env: dict[str, str], timeout: int = 30) -> dict[str, Any]:
    java = shutil.which("java")
    if not java:
        return {"ok": False, "error": "Java 21 not found in PATH"}
    jars = find_m2_db_classpath()
    if len(jars) < 5 or not DB_PROBE_JAVA.exists():
        return {"ok": False, "error": "Local Maven PG/MongoDB JARs not found in ~/.m2/repository"}
    env = os.environ.copy()
    env.update(extra_env)
    cp = os.pathsep.join(jars)
    res = subprocess.run(
        [java, "-cp", cp, DB_PROBE_JAVA.name, mode],
        cwd=str(HERE),
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    out = (res.stdout or "").strip()
    if res.returncode != 0 or not out:
        err = redact_secrets((res.stderr or out or f"exit {res.returncode}")[:300])
        return {"ok": False, "error": err}
    # Take the last JSON line in case driver prints logging lines before JSON.
    for line in reversed(out.splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            return json.loads(line)
    return {"ok": False, "error": "Invalid JSON output from DbStatsProbe"}


def probe_mongo_direct(env_vars: dict[str, str]) -> dict[str, Any]:
    """Query live MongoDB Atlas M0 dbStats directly via COMMUNITY_MONGODB_URI in .env."""
    uri = env_vars.get("COMMUNITY_MONGODB_URI", "").strip()
    if not uri:
        return {"ok": False, "error": "COMMUNITY_MONGODB_URI not set in .env"}
    data = run_java_db_probe("mongo", {"PROBE_MONGODB_URI": uri}, timeout=25)
    if data.get("ok"):
        total_mb = float(data.get("totalSizeMb") or 0.0)
        data["quotaLimitMb"] = ATLAS_FREE_STORAGE_MB
        data["quotaPct"] = round(min(100.0, (total_mb / ATLAS_FREE_STORAGE_MB) * 100.0), 2)
        data["probedAt"] = datetime.now(timezone.utc).isoformat()
    return data


def probe_neon_postgres_direct(env_vars: dict[str, str]) -> dict[str, Any]:
    """On-demand SQL probe of all 5 Neon PostgreSQL DBs using .env JDBC URLs & runtime passwords."""
    global _LAST_NEON_SQL_PROBE  # noqa: PLW0603
    extra_env: dict[str, str] = {"PROBE_PG_SERVICES": ",".join(NEON_SERVICES)}
    for svc in NEON_SERVICES:
        key = svc.upper()
        extra_env[f"PROBE_PG_URL_{key}"] = env_vars.get(f"{key}_DB_URL", "").strip()
        extra_env[f"PROBE_PG_USER_{key}"] = f"{svc}_runtime"
        extra_env[f"PROBE_PG_PASSWORD_{key}"] = env_vars.get(f"{key}_RUNTIME_PASSWORD", "").strip()
    data = run_java_db_probe("postgres", extra_env, timeout=35)
    if data.get("ok"):
        dbs = data.get("databases") or []
        for db in dbs:
            if db.get("ok"):
                sz = float(db.get("sizeMb") or 0.0)
                db["storageLimitMb"] = NEON_FREE_STORAGE_MB
                db["storagePct"] = round(min(100.0, (sz / NEON_FREE_STORAGE_MB) * 100.0), 2)
        data["probedAt"] = datetime.now(timezone.utc).isoformat()
        data["totalSizeMb"] = round(sum(float(d.get("sizeMb") or 0.0) for d in dbs if d.get("ok")), 2)
        data["totalTables"] = sum(int(d.get("tables") or 0) for d in dbs if d.get("ok"))
        data["totalLiveRows"] = sum(int(d.get("liveRows") or 0) for d in dbs if d.get("ok"))
        _LAST_NEON_SQL_PROBE = data
    return data


def fetch_neon_status(env_vars: dict[str, str], run_sql_probe: bool = False) -> dict[str, Any]:
    """Fetch Neon PostgreSQL telemetry via Neon API (if NEON_API_KEY set) and/or direct SQL probe."""
    configured_dbs = extract_neon_db_inventory(env_vars)
    sql_probe = probe_neon_postgres_direct(env_vars) if run_sql_probe else _LAST_NEON_SQL_PROBE
    api_key = (env_vars.get("NEON_API_KEY") or os.environ.get("NEON_API_KEY", "")).strip()
    if not api_key:
        return {
            "configured": False,
            "configuredDbs": configured_dbs,
            "requiredVars": ["NEON_API_KEY"],
            "projects": [],
            "sqlProbe": sql_probe,
        }

    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        resp = http_json("https://console.neon.tech/api/v2/projects?limit=20", headers=headers, timeout=15)
        raw_projects = resp.get("projects") or []

        def _enrich_project(p: dict[str, Any]) -> dict[str, Any]:
            pid = p.get("id", "")
            ep_states: list[str] = []
            try:
                eps = http_json(f"https://console.neon.tech/api/v2/projects/{pid}/endpoints", headers=headers, timeout=12)
                ep_states = [e.get("current_state", "unknown") for e in eps.get("endpoints", [])]
            except Exception:  # noqa: BLE001
                ep_states = []
            cu_hours = round(float(p.get("compute_time_seconds") or 0.0) / 3600.0, 2)
            active_hours = round(float(p.get("active_time_seconds") or 0.0) / 3600.0, 2)
            storage_mb = round(float(p.get("synthetic_storage_size") or 0.0) / (1024 * 1024), 2)
            egress_mb = round(float(p.get("data_transfer_bytes") or 0.0) / (1024 * 1024), 2)
            state = "active" if any(s == "active" for s in ep_states) else (ep_states[0] if ep_states else "idle")
            return {
                "id": pid,
                "name": p.get("name", pid),
                "regionId": p.get("region_id", ""),
                "pgVersion": p.get("pg_version"),
                "state": state,
                "computeCuHours": cu_hours,
                "computeLimitHours": NEON_FREE_CU_HOURS,
                "computePct": round(min(100.0, (cu_hours / NEON_FREE_CU_HOURS) * 100.0), 2),
                "activeHours": active_hours,
                "storageMb": storage_mb,
                "storageLimitMb": NEON_FREE_STORAGE_MB,
                "storagePct": round(min(100.0, (storage_mb / NEON_FREE_STORAGE_MB) * 100.0), 2),
                "egressMb": egress_mb,
                "egressLimitMb": NEON_FREE_EGRESS_MB,
                "quotaResetAt": p.get("quota_reset_at", ""),
            }

        with ThreadPoolExecutor(max_workers=5) as pool:
            projects = list(pool.map(_enrich_project, raw_projects))
        projects.sort(key=lambda x: x["name"])
        return {
            "configured": True,
            "configuredDbs": configured_dbs,
            "projectCount": len(projects),
            "activeCount": sum(1 for p in projects if p["state"] == "active"),
            "maxComputePct": max((p["computePct"] for p in projects), default=0.0),
            "totalStorageMb": round(sum(p["storageMb"] for p in projects), 2),
            "projects": projects,
            "sqlProbe": sql_probe,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "configured": True,
            "configuredDbs": configured_dbs,
            "error": redact_secrets(str(exc)),
            "projects": [],
            "sqlProbe": sql_probe,
        }


def fetch_cloudflare_via_wrangler(project: str) -> dict[str, Any] | None:
    wrangler = find_wrangler()
    if not wrangler:
        return None
    fe_cwd = str(ROOT / "frontend") if (ROOT / "frontend").exists() else None
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            f_deps = pool.submit(run_cmd, [wrangler, "pages", "deployment", "list", "--project-name", project, "--json"], 20, fe_cwd)
            f_proj = pool.submit(run_cmd, [wrangler, "pages", "project", "list", "--json"], 20, fe_cwd)
            rc_d, out_d, err_d = f_deps.result()
            rc_p, out_p, _ = f_proj.result()
        if rc_d != 0 or not out_d:
            return None
        raw_deps = json.loads(out_d)
        deployments = [
            {
                "id": str(d.get("Id", ""))[:8],
                "environment": str(d.get("Environment", "")).lower(),
                "status": "success",
                "branch": d.get("Branch", ""),
                "commitHash": str(d.get("Source", ""))[:7],
                "commitMessage": f"{d.get('Environment', 'Production')} · {d.get('Branch', 'main')}",
                "createdOn": d.get("Status", ""),
                "url": d.get("Deployment", ""),
            }
            for d in raw_deps[:6]
        ]
        domains = ""
        last_modified = ""
        if rc_p == 0 and out_p:
            for proj in json.loads(out_p):
                if proj.get("Project Name") == project:
                    domains = proj.get("Project Domains", "")
                    last_modified = proj.get("Last Modified", "")
                    break
        return {
            "configured": True,
            "source": "wrangler-cli",
            "project": project,
            "domains": domains,
            "lastModified": last_modified,
            "deployments": deployments,
            "error": None,
            "analytics": {"available": False, "note": "Thêm CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID để xem GraphQL Function invocations"},
        }
    except Exception:  # noqa: BLE001
        return None


def fetch_cloudflare_status(env_vars: dict[str, str], project_name: str, hours: int) -> dict[str, Any]:
    """Fetch Cloudflare Pages deployments & analytics via API token, falling back to local Wrangler OAuth."""
    token = (env_vars.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN", "")).strip()
    account_id = (env_vars.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")).strip()
    project = (env_vars.get("CF_PAGES_PROJECT") or project_name or DEFAULT_CF_PROJECT).strip()
    if not (token and account_id):
        via_cli = fetch_cloudflare_via_wrangler(project)
        if via_cli is not None:
            return via_cli
        return {
            "configured": False,
            "project": project,
            "requiredVars": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
            "deployments": [],
        }

    headers = {"Authorization": f"Bearer {token}"}
    deployments: list[dict[str, Any]] = []
    dep_error = ""
    try:
        dep_resp = http_json(
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}/pages/projects/{project}/deployments?per_page=6",
            headers=headers,
            timeout=15,
        )
        for d in dep_resp.get("result") or []:
            meta = (d.get("deployment_trigger") or {}).get("metadata") or {}
            stage = d.get("latest_stage") or {}
            deployments.append(
                {
                    "id": (d.get("short_id") or d.get("id", ""))[:8],
                    "environment": d.get("environment", ""),
                    "status": stage.get("status", ""),
                    "branch": meta.get("branch", ""),
                    "commitHash": (meta.get("commit_hash") or "")[:7],
                    "commitMessage": (meta.get("commit_message") or "").splitlines()[0][:70] if meta.get("commit_message") else "",
                    "createdOn": d.get("created_on", ""),
                    "url": d.get("url", ""),
                }
            )
    except Exception as exc:  # noqa: BLE001
        dep_error = redact_secrets(str(exc))

    analytics: dict[str, Any] = {"available": False}
    try:
        now = datetime.now(timezone.utc)
        since = (now - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
        until = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        gql = {
            "query": (
                "query($acct: String!, $since: Time!, $until: Time!) {"
                " viewer { accounts(filter: {accountTag: $acct}) {"
                "  pagesFunctionsInvocationsAdaptiveGroups(limit: 10, filter: {datetime_geq: $since, datetime_leq: $until}) {"
                "   sum { requests errors subrequests duration }"
                "  }"
                " } }"
                "}"
            ),
            "variables": {"acct": account_id, "since": since, "until": until},
        }
        g_resp = http_json("https://api.cloudflare.com/client/v4/graphql", method="POST", headers=headers, body=gql, timeout=15)
        accts = ((g_resp.get("data") or {}).get("viewer") or {}).get("accounts") or []
        groups = (accts[0].get("pagesFunctionsInvocationsAdaptiveGroups") or []) if accts else []
        reqs = sum(int((g.get("sum") or {}).get("requests") or 0) for g in groups)
        errs = sum(int((g.get("sum") or {}).get("errors") or 0) for g in groups)
        subs = sum(int((g.get("sum") or {}).get("subrequests") or 0) for g in groups)
        analytics = {
            "available": True,
            "functionRequests": reqs,
            "functionErrors": errs,
            "subrequests": subs,
            "dailyFreeLimit": 100_000,
        }
    except Exception as exc:  # noqa: BLE001
        analytics = {"available": False, "note": redact_secrets(str(exc))}

    return {
        "configured": True,
        "source": "cloudflare-api",
        "project": project,
        "deployments": deployments,
        "error": dep_error or None,
        "analytics": analytics,
    }


def parse_atlas_uri_safe(uri: str) -> dict[str, str]:
    if not uri:
        return {"host": "", "database": ""}
    parsed = urllib.parse.urlparse(uri)
    return {
        "host": parsed.hostname or "",
        "database": (parsed.path or "").lstrip("/") or "community_db",
    }


def fetch_atlas_status(env_vars: dict[str, str]) -> dict[str, Any]:
    """Fetch live MongoDB Atlas M0 stats directly via COMMUNITY_MONGODB_URI (+ optional Atlas Admin API)."""
    safe_uri = parse_atlas_uri_safe(env_vars.get("COMMUNITY_MONGODB_URI", "").strip())
    direct_stats = probe_mongo_direct(env_vars) if env_vars.get("COMMUNITY_MONGODB_URI", "").strip() else None

    pub = (env_vars.get("ATLAS_PUBLIC_KEY") or os.environ.get("ATLAS_PUBLIC_KEY", "")).strip()
    priv = (env_vars.get("ATLAS_PRIVATE_KEY") or os.environ.get("ATLAS_PRIVATE_KEY", "")).strip()
    group_id = (env_vars.get("ATLAS_GROUP_ID") or os.environ.get("ATLAS_GROUP_ID", "")).strip()
    if not (pub and priv and group_id):
        return {
            "configured": bool(direct_stats and direct_stats.get("ok")),
            "source": "mongodb-direct" if (direct_stats and direct_stats.get("ok")) else "unconfigured",
            "clusterHost": safe_uri["host"],
            "database": safe_uri["database"],
            "storageLimitMb": ATLAS_FREE_STORAGE_MB,
            "directStats": direct_stats,
            "requiredVars": ["ATLAS_PUBLIC_KEY", "ATLAS_PRIVATE_KEY", "ATLAS_GROUP_ID"],
            "clusters": [],
            "alerts": [],
        }

    try:
        base = f"https://cloud.mongodb.com/api/atlas/v2/groups/{urllib.parse.quote(group_id, safe='')}"
        with ThreadPoolExecutor(max_workers=2) as pool:
            f_clusters = pool.submit(http_digest_json, f"{base}/clusters", pub, priv)
            f_alerts = pool.submit(http_digest_json, f"{base}/alerts?status=OPEN", pub, priv)
            clusters_raw = f_clusters.result()
            alerts_raw = f_alerts.result()

        clusters = []
        for c in clusters_raw.get("results") or []:
            ps = c.get("providerSettings") or {}
            tier = ps.get("instanceSizeName") or ""
            region = ps.get("regionName") or ""
            provider = ps.get("backingProviderName") or ps.get("providerName") or ""
            if not tier:
                reps = c.get("replicationSpecs") or []
                if reps:
                    rc = (reps[0].get("regionConfigs") or [{}])[0]
                    tier = ((rc.get("electableSpecs") or {}).get("instanceSize") or rc.get("providerName") or "M0")
                    region = region or rc.get("regionName") or ""
                    provider = provider or rc.get("backingProviderName") or rc.get("providerName") or ""
            disk_gb = float(c.get("diskSizeGB") or 0.5)
            clusters.append(
                {
                    "name": c.get("name", ""),
                    "stateName": c.get("stateName", ""),
                    "mongoDBVersion": c.get("mongoDBVersion", ""),
                    "tier": tier or "M0",
                    "provider": provider,
                    "region": region,
                    "diskLimitMb": round(disk_gb * 1024.0, 0),
                    "paused": bool(c.get("paused")),
                }
            )

        alerts = [
            {
                "id": a.get("id", ""),
                "eventTypeName": a.get("eventTypeName", ""),
                "status": a.get("status", ""),
                "created": a.get("created", ""),
            }
            for a in (alerts_raw.get("results") or [])[:10]
        ]
        return {
            "configured": True,
            "source": "atlas-api+direct",
            "clusterHost": safe_uri["host"],
            "database": safe_uri["database"],
            "storageLimitMb": ATLAS_FREE_STORAGE_MB,
            "directStats": direct_stats,
            "clusters": clusters,
            "openAlertCount": len(alerts),
            "alerts": alerts,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "configured": bool(direct_stats and direct_stats.get("ok")),
            "source": "mongodb-direct",
            "clusterHost": safe_uri["host"],
            "database": safe_uri["database"],
            "storageLimitMb": ATLAS_FREE_STORAGE_MB,
            "directStats": direct_stats,
            "error": redact_secrets(str(exc)),
            "clusters": [],
            "alerts": [],
        }


def fetch_cloudamqp_status(cloudamqp_url: str) -> dict[str, Any]:
    if not cloudamqp_url:
        return {"configured": False, "queues": []}
    parsed = urllib.parse.urlparse(cloudamqp_url)
    host = parsed.hostname or ""
    user = urllib.parse.unquote(parsed.username or "")
    password = urllib.parse.unquote(parsed.password or "")
    vhost = urllib.parse.unquote((parsed.path or "/").lstrip("/")) or "/"
    if not host or not user or not password:
        return {"configured": False, "queues": []}

    auth_b64 = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    headers = {"Authorization": f"Basic {auth_b64}"}
    try:
        overview = http_json(f"https://{host}/api/overview", headers=headers, timeout=12)
        vhost_enc = urllib.parse.quote(vhost, safe="")
        queues_raw = http_json(f"https://{host}/api/queues/{vhost_enc}", headers=headers, timeout=12)
        totals = overview.get("object_totals") or {}
        mstats = overview.get("message_stats") or {}
        queues = [
            {
                "name": q.get("name", ""),
                "state": q.get("state", "running"),
                "messages": int(q.get("messages") or 0),
                "messagesReady": int(q.get("messages_ready") or 0),
                "messagesUnacked": int(q.get("messages_unacknowledged") or 0),
                "consumers": int(q.get("consumers") or 0),
            }
            for q in queues_raw
        ]
        queues.sort(key=lambda x: x["name"])
        return {
            "configured": True,
            "host": host,
            "vhost": vhost,
            "rabbitmqVersion": overview.get("rabbitmq_version", ""),
            "connections": int(totals.get("connections") or 0),
            "channels": int(totals.get("channels") or 0),
            "exchanges": int(totals.get("exchanges") or 0),
            "queueCount": len(queues),
            "totalMessagesReady": sum(q["messagesReady"] for q in queues),
            "totalDlqMessages": sum(q["messages"] for q in queues if q["name"].endswith(".dlq")),
            "publishTotal": int(mstats.get("publish") or 0),
            "deliverTotal": int(mstats.get("deliver_get") or 0),
            "publishRate": round(float((mstats.get("publish_details") or {}).get("rate") or 0.0), 2),
            "deliverRate": round(float((mstats.get("deliver_get_details") or {}).get("rate") or 0.0), 2),
            "queues": queues,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "configured": True,
            "host": host,
            "vhost": vhost,
            "error": redact_secrets(str(exc)),
            "queues": [],
        }


def fetch_github_deploys(repo: str, limit: int = 10) -> tuple[list[dict[str, Any]], str]:
    gh = shutil.which("gh")
    if gh:
        rc, out, err = run_cmd(
            [
                gh,
                "run",
                "list",
                "--repo",
                repo,
                "--workflow",
                "deploy-b1.yml",
                "--limit",
                str(limit),
                "--json",
                "databaseId,displayTitle,headSha,headBranch,status,conclusion,createdAt,updatedAt,url,event",
            ],
            timeout=15,
        )
        if rc == 0 and out:
            return json.loads(out), ""
    headers: dict[str, str] = {}
    gh_token = os.environ.get("GITHUB_TOKEN", "").strip()
    if gh_token:
        headers["Authorization"] = f"Bearer {gh_token}"
    try:
        data = http_json(
            f"https://api.github.com/repos/{repo}/actions/workflows/deploy-b1.yml/runs?per_page={limit}",
            headers=headers,
            timeout=12,
        )
        runs = [
            {
                "databaseId": r.get("id"),
                "displayTitle": r.get("display_title") or r.get("name"),
                "headSha": r.get("head_sha", ""),
                "headBranch": r.get("head_branch", ""),
                "status": r.get("status", ""),
                "conclusion": r.get("conclusion", ""),
                "createdAt": r.get("created_at", ""),
                "updatedAt": r.get("updated_at", ""),
                "url": r.get("html_url", ""),
                "event": r.get("event", ""),
            }
            for r in data.get("workflow_runs", [])
        ]
        return runs, ""
    except Exception as exc:  # noqa: BLE001
        return [], f"Không lấy được lịch sử GitHub Actions ({redact_secrets(str(exc))})"


def probe_http_url(url: str, timeout: int = 15) -> dict[str, Any]:
    t0 = time.perf_counter()
    req = urllib.request.Request(url, headers={"User-Agent": "SmartTravel-OpsMonitor/1.0"}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            ms = int((time.perf_counter() - t0) * 1000)
            return {"ok": 200 <= resp.status < 400, "statusCode": resp.status, "latencyMs": ms, "url": url}
    except urllib.error.HTTPError as exc:
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": False, "statusCode": exc.code, "latencyMs": ms, "url": url, "error": f"HTTP {exc.code}"}
    except Exception as exc:  # noqa: BLE001
        ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": False, "statusCode": None, "latencyMs": ms, "url": url, "error": redact_secrets(str(exc))}


def extract_image_tag(image: str) -> str:
    if not image:
        return "-"
    if ":" in image.rsplit("/", 1)[-1]:
        tag = image.rsplit(":", 1)[-1]
        return tag[:12] if len(tag) >= 32 else tag
    return image.rsplit("/", 1)[-1]


def collect_snapshot(
    rg: str = DEFAULT_RG,
    law_name: str = DEFAULT_LAW,
    budget_name: str = DEFAULT_BUDGET,
    github_repo: str = DEFAULT_GITHUB_REPO,
    public_site: str = DEFAULT_PUBLIC_SITE,
    env_file: Path = ROOT / ".env",
    hours: int = 24,
    probe_neon_sql: bool = False,
) -> dict[str, Any]:
    t_start = time.perf_counter()
    az = find_az()
    tokens = get_az_tokens(az)
    sub = tokens["subscription_id"]
    arm_headers = {"Authorization": f"Bearer {tokens['arm_token']}"}
    env_vars = load_dotenv(env_file)

    now = datetime.now(timezone.utc)
    start_dt = now - timedelta(hours=hours)
    timespan = f"{start_dt.strftime('%Y-%m-%dT%H:%M:%SZ')}/{now.strftime('%Y-%m-%dT%H:%M:%SZ')}"
    interval = choose_metric_interval(hours)

    # Phase 1: Parallel top-level fetches across ALL platforms.
    def _get_apps() -> list[dict[str, Any]]:
        url = f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.App/containerApps?api-version=2024-03-01"
        return http_json(url, headers=arm_headers).get("value", [])

    def _get_law() -> dict[str, Any]:
        url = f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.OperationalInsights/workspaces/{law_name}?api-version=2023-09-01"
        return http_json(url, headers=arm_headers)

    def _get_cost() -> dict[str, Any]:
        url = f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
        body = {
            "type": "Usage",
            "timeframe": "MonthToDate",
            "dataset": {
                "granularity": "None",
                "aggregation": {"totalCost": {"name": "Cost", "function": "Sum"}},
                "grouping": [
                    {"type": "Dimension", "name": "MeterSubCategory"},
                    {"type": "Dimension", "name": "ResourceId"},
                ],
            },
        }
        try:
            raw = http_json(url, method="POST", headers=arm_headers, body=body, timeout=20)
            props = raw.get("properties") or {}
            cols = [c["name"] for c in props.get("columns", [])]
            breakdown = []
            total_usd = 0.0
            for row in props.get("rows", []):
                rec = dict(zip(cols, row))
                cost_val = float(rec.get("Cost") or 0.0)
                total_usd += cost_val
                res_id = str(rec.get("ResourceId") or "")
                breakdown.append(
                    {
                        "meterSubCategory": rec.get("MeterSubCategory") or "Other",
                        "resourceName": res_id.rsplit("/", 1)[-1] if res_id else "-",
                        "costUsd": round(cost_val, 4),
                    }
                )
            breakdown.sort(key=lambda x: x["costUsd"], reverse=True)
            return {"totalUsd": round(total_usd, 4), "breakdown": breakdown}
        except Exception as exc:  # noqa: BLE001
            return {"totalUsd": 0.0, "breakdown": [], "error": redact_secrets(str(exc))}

    def _get_budget() -> dict[str, Any] | None:
        url = f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Consumption/budgets?api-version=2023-11-01"
        try:
            vals = http_json(url, headers=arm_headers).get("value", [])
            b = next((x for x in vals if x.get("name") == budget_name), vals[0] if vals else None)
            if not b:
                return None
            props = b.get("properties") or {}
            return {
                "name": b.get("name", ""),
                "amountUsd": float(props.get("amount") or 0.0),
                "currentSpendUsd": float((props.get("currentSpend") or {}).get("amount") or 0.0),
                "alertCount": len(props.get("notifications") or {}),
            }
        except Exception:  # noqa: BLE001
            return None

    with ThreadPoolExecutor(max_workers=12) as pool:
        f_apps = pool.submit(_get_apps)
        f_law = pool.submit(_get_law)
        f_cost = pool.submit(_get_cost)
        f_budget = pool.submit(_get_budget)
        f_credit = pool.submit(fetch_azure_credit_balance, arm_headers)
        f_deploys = pool.submit(fetch_github_deploys, github_repo)
        f_mq = pool.submit(fetch_cloudamqp_status, env_vars.get("CLOUDAMQP_URL", "").strip())
        f_cld = pool.submit(fetch_cloudinary_usage, env_vars)
        f_neon = pool.submit(fetch_neon_status, env_vars, probe_neon_sql)
        f_cf = pool.submit(fetch_cloudflare_status, env_vars, DEFAULT_CF_PROJECT, hours)
        f_atlas = pool.submit(fetch_atlas_status, env_vars)
        f_fe = pool.submit(probe_http_url, f"{public_site.rstrip('/')}/kham-pha", 12)

        apps_raw = f_apps.result()
        law_raw = f_law.result()
        cost_data = f_cost.result()
        budget_data = f_budget.result()
        credit_data = f_credit.result()
        deploys, deploys_note = f_deploys.result()
        cloudamqp = f_mq.result()
        cloudinary = f_cld.result()
        neon = f_neon.result()
        cloudflare = f_cf.result()
        atlas = f_atlas.result()
        fe_probe = f_fe.result()

    law_customer_id = (law_raw.get("properties") or {}).get("customerId", "")
    law_info = {
        "name": law_raw.get("name", law_name),
        "id": law_raw.get("id", ""),
        "customerId": law_customer_id,
        "dailyQuotaGb": ((law_raw.get("properties") or {}).get("workspaceCapping") or {}).get("dailyQuotaGb"),
        "retentionDays": (law_raw.get("properties") or {}).get("retentionInDays"),
        "ingestedMbMtd": 0.0,
    }

    # Phase 2: Per-app replicas + metrics + Month-To-Date Free Grant metrics + Log Analytics KQL in parallel.
    metric_names = "CpuPercentage,MemoryPercentage,WorkingSetBytes,Requests,ResponseTime,Replicas,RestartCount,RxBytes,TxBytes"
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    mtd_timespan = f"{month_start.strftime('%Y-%m-%dT%H:%M:%SZ')}/{now.strftime('%Y-%m-%dT%H:%M:%SZ')}"
    mtd_interval = "PT1H"
    mtd_bucket_sec = 3600.0

    def _fetch_app_details(app: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        name = app["name"]
        props = app.get("properties") or {}
        tpl = props.get("template") or {}
        containers = tpl.get("containers") or [{}]
        c0 = containers[0]
        scale = tpl.get("scale") or {}
        ingress = (props.get("configuration") or {}).get("ingress") or {}

        rev_name = props.get("latestReadyRevisionName") or props.get("latestRevisionName") or ""
        rep_url = (
            f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.App/containerApps/{name}"
            f"/revisions/{urllib.parse.quote(rev_name, safe='')}/replicas?api-version=2024-03-01"
            if rev_name
            else ""
        )
        met_url = (
            f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.App/containerApps/{name}"
            f"/providers/Microsoft.Insights/metrics?api-version=2023-10-01"
            f"&metricnames={metric_names}&timespan={timespan}&interval={interval}&aggregation=Average,Maximum,Total"
        )
        mtd_url = (
            f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.App/containerApps/{name}"
            f"/providers/Microsoft.Insights/metrics?api-version=2023-10-01"
            f"&metricnames=Replicas,Requests&timespan={mtd_timespan}&interval={mtd_interval}&aggregation=Average,Total"
        )
        active_replicas = 0
        replica_details: list[dict[str, str]] = []
        if rep_url:
            try:
                rep_resp = http_json(rep_url, headers=arm_headers, timeout=15)
                for rep in rep_resp.get("value") or []:
                    rprops = rep.get("properties") or {}
                    rstate = str(rprops.get("runningState") or "Running")
                    replica_details.append(
                        {
                            "name": rep.get("name", ""),
                            "state": rstate,
                            "createdTime": str(rprops.get("createdTime") or ""),
                        }
                    )
                    if rstate.lower() not in ("stopped", "terminated", "failed"):
                        active_replicas += 1
            except Exception:  # noqa: BLE001
                active_replicas = 0

        try:
            met_resp = http_json(met_url, headers=arm_headers, timeout=20)
            met_summary, met_series = parse_azure_metrics_response(met_resp)
        except Exception:  # noqa: BLE001
            met_summary, met_series = parse_azure_metrics_response({})

        # Month-to-Date Replicas & Requests for exact Free Grant usage.
        mtd_rep_sum = 0.0
        mtd_reqs = 0
        try:
            mtd_resp = http_json(mtd_url, headers=arm_headers, timeout=20)
            for m_item in mtd_resp.get("value") or []:
                m_name = (m_item.get("name") or {}).get("value", "")
                pts = (m_item.get("timeseries") or [{}])[0].get("data", []) if m_item.get("timeseries") else []
                if m_name == "Replicas":
                    mtd_rep_sum = sum(float(p["average"]) for p in pts if p.get("average") is not None)
                elif m_name == "Requests":
                    mtd_reqs = int(round(sum(float(p["total"]) for p in pts if p.get("total") is not None)))
        except Exception:  # noqa: BLE001
            pass

        image = c0.get("image", "")
        cpu_alloc = float((c0.get("resources") or {}).get("cpu") or 0.25)
        mem_str = str((c0.get("resources") or {}).get("memory") or "0.5Gi")
        app_obj = {
            "name": name,
            "activeReplicas": active_replicas,
            "replicas": replica_details,
            "runningStatus": props.get("runningStatus", ""),
            "latestRevisionName": props.get("latestRevisionName", ""),
            "latestReadyRevisionName": props.get("latestReadyRevisionName", ""),
            "image": image,
            "imageTag": extract_image_tag(image),
            "cpu": cpu_alloc,
            "memory": mem_str,
            "minReplicas": scale.get("minReplicas", 0),
            "maxReplicas": scale.get("maxReplicas", 1),
            "externalIngress": bool(ingress.get("external")),
            "fqdn": ingress.get("fqdn", ""),
            "metrics": met_summary,
            "series": met_series,
        }
        mtd_obj = {
            "service": name,
            "cpu": cpu_alloc,
            "memGib": parse_memory_gib(mem_str),
            "replicaAvgSum": mtd_rep_sum,
            "requestsTotal": mtd_reqs,
        }
        return app_obj, mtd_obj

    def _fetch_logs_bundle() -> tuple[dict[str, Any], float, dict[str, Any]]:
        if not law_customer_id:
            return {"consoleErrors": [], "systemEvents": [], "note": "Không tìm thấy Log Analytics customerId."}, 0.0, estimate_free_grant_usage([])
        kql_errors = (
            "ContainerAppConsoleLogs_CL "
            "| extend parsed = parse_json(Log_s) "
            "| extend level = coalesce(tostring(parsed.level), iff(Log_s contains 'ERROR', 'ERROR', iff(Log_s contains 'WARN', 'WARN', 'INFO'))) "
            "| extend msg = coalesce(tostring(parsed.message), Log_s) "
            "| where level in ('ERROR', 'WARN') or Log_s has_any ('Exception', 'OutOfMemoryError', '503', '502') "
            "| project TimeGenerated, Service = ContainerAppName_s, Level = level, Message = substring(msg, 0, 260) "
            "| order by TimeGenerated desc | take 30"
        )
        kql_sys = (
            "ContainerAppSystemLogs_CL "
            "| project TimeGenerated, Service = ContainerAppName_s, Reason = Reason_s, Message = substring(Log_s, 0, 260) "
            "| order by TimeGenerated desc | take 30"
        )
        kql_usage = (
            "Usage | where TimeGenerated >= startofmonth(now()) "
            "| summarize IngestedMB = round(sum(Quantity), 2)"
        )
        kql_active = (
            "ContainerAppConsoleLogs_CL | where TimeGenerated >= startofmonth(now()) "
            "| summarize ActiveMinutes = dcount(bin(TimeGenerated, 1m)) by Service = ContainerAppName_s"
        )
        log_span = f"PT{hours}H" if hours <= 48 else f"P{max(1, hours // 24)}D"
        errors_list, sys_list = [], []
        ingested_mb = 0.0
        active_rows: list[dict[str, Any]] = []
        note = ""
        try:
            with ThreadPoolExecutor(max_workers=4) as lpool:
                fe = lpool.submit(query_log_analytics, law_customer_id, tokens["law_token"], kql_errors, log_span)
                fs = lpool.submit(query_log_analytics, law_customer_id, tokens["law_token"], kql_sys, log_span)
                fu = lpool.submit(query_log_analytics, law_customer_id, tokens["law_token"], kql_usage, "P31D")
                fa = lpool.submit(query_log_analytics, law_customer_id, tokens["law_token"], kql_active, "P31D")
                for row in fe.result():
                    errors_list.append({
                        "time": row.get("TimeGenerated", ""),
                        "service": row.get("Service", ""),
                        "level": row.get("Level", "ERROR"),
                        "message": redact_secrets(str(row.get("Message", ""))),
                    })
                for row in fs.result():
                    sys_list.append({
                        "time": row.get("TimeGenerated", ""),
                        "service": row.get("Service", ""),
                        "reason": row.get("Reason", "System"),
                        "message": redact_secrets(str(row.get("Message", ""))),
                    })
                u_rows = fu.result()
                if u_rows:
                    ingested_mb = float(u_rows[0].get("IngestedMB") or 0.0)
                active_rows = fa.result()
        except Exception as exc:  # noqa: BLE001
            note = f"Log Analytics chưa có bảng hoặc lỗi truy vấn: {redact_secrets(str(exc))}"
        return (
            {"consoleErrors": errors_list, "systemEvents": sys_list, "note": note},
            ingested_mb,
            estimate_free_grant_usage(active_rows),
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        app_futures = [pool.submit(_fetch_app_details, app) for app in apps_raw]
        f_logs = pool.submit(_fetch_logs_bundle)
        app_pairs = [f.result() for f in app_futures]
        services = [p[0] for p in app_pairs]
        mtd_list = [p[1] for p in app_pairs]
        logs_bundle, ingested_mb, law_free_grant = f_logs.result()

    metrics_free_grant = compute_mtd_free_grant_from_metrics(mtd_list, bucket_seconds=mtd_bucket_sec)
    free_grant = (
        metrics_free_grant
        if (metrics_free_grant["estVcpuSeconds"] > 0 or metrics_free_grant["requestsTotal"] > 0)
        else law_free_grant
    )

    order_index = {n: i for i, n in enumerate(DEFAULT_SERVICE_ORDER)}
    services.sort(key=lambda s: (order_index.get(s["name"], 99), s["name"]))
    law_info["ingestedMbMtd"] = round(ingested_mb, 2)
    cost_data["budget"] = budget_data

    elapsed_ms = int((time.perf_counter() - t_start) * 1000)
    return {
        "generatedAt": now.isoformat(),
        "hours": hours,
        "meta": {
            "subscriptionId": sub,
            "subscriptionName": tokens["subscription_name"],
            "resourceGroup": rg,
            "githubRepo": github_repo,
            "publicSite": public_site,
            "elapsedMs": elapsed_ms,
        },
        "services": services,
        "azureCredit": credit_data,
        "cost": cost_data,
        "freeGrant": free_grant,
        "logAnalytics": law_info,
        "logs": logs_bundle,
        "deploys": deploys,
        "deploysNote": deploys_note,
        "cloudamqp": cloudamqp,
        "cloudinary": cloudinary,
        "neon": neon,
        "cloudflare": cloudflare,
        "atlas": atlas,
        "frontendProbe": fe_probe,
    }


def fetch_service_console_logs(
    service: str,
    rg: str = DEFAULT_RG,
    law_name: str = DEFAULT_LAW,
    hours: int = 24,
    limit: int = 80,
) -> list[dict[str, Any]]:
    if not re.fullmatch(r"[a-z0-9-]+", service):
        raise ValueError("Invalid service name")
    az = find_az()
    tokens = get_az_tokens(az)
    sub = tokens["subscription_id"]
    law_url = f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.OperationalInsights/workspaces/{law_name}?api-version=2023-09-01"
    law_raw = http_json(law_url, headers={"Authorization": f"Bearer {tokens['arm_token']}"})
    customer_id = (law_raw.get("properties") or {}).get("customerId", "")
    if not customer_id:
        return []
    kql = (
        f"ContainerAppConsoleLogs_CL "
        f"| where ContainerAppName_s == '{service}' "
        f"| extend parsed = parse_json(Log_s) "
        f"| extend level = coalesce(tostring(parsed.level), iff(Log_s contains 'ERROR', 'ERROR', iff(Log_s contains 'WARN', 'WARN', 'INFO'))) "
        f"| extend msg = coalesce(tostring(parsed.message), Log_s) "
        f"| project TimeGenerated, Revision = RevisionName_s, Level = level, Message = substring(msg, 0, 400) "
        f"| order by TimeGenerated desc | take {int(limit)}"
    )
    log_span = f"PT{hours}H" if hours <= 48 else f"P{max(1, hours // 24)}D"
    rows = query_log_analytics(customer_id, tokens["law_token"], kql, log_span)
    return [
        {
            "time": r.get("TimeGenerated", ""),
            "revision": r.get("Revision", ""),
            "level": r.get("Level", "INFO"),
            "message": redact_secrets(str(r.get("Message", ""))),
        }
        for r in rows
    ]


def render_cli_report(snap: dict[str, Any]) -> str:
    lines: list[str] = []
    meta = snap["meta"]
    lines.append("=" * 100)
    lines.append(
        f" SmartTravel VN 2.0 — All-in-One Ops & Cost Monitor | Window: {snap['hours']}h | {snap['generatedAt'][:19]}Z ({meta['elapsedMs']}ms)"
    )
    lines.append(
        f" Subscription: {meta['subscriptionName']} | RG: {meta['resourceGroup']} | LAW Cap: {snap['logAnalytics'].get('dailyQuotaGb')} GB/day"
    )
    lines.append("=" * 100)

    lines.append(
        f"{'SERVICE':<14} {'STATE':<13} {'TAG':<12} {'CPU(A/M)':<13} {'RAM MiB(A/M)':<15} {'REQS':>7} {'LAT ms':>8} {'REST':>5}"
    )
    lines.append("-" * 100)
    for s in snap["services"]:
        m = s["metrics"]
        st = f"RUNNING ({s['activeReplicas']})" if s["activeReplicas"] > 0 else "SLEEPING (0)"
        cpu_str = f"{m['cpuAvgPct']:.1f}/{m['cpuMaxPct']:.1f}%"
        ram_str = f"{m['ramAvgMib']:.0f}/{m['ramMaxMib']:.0f}"
        lat_str = f"{m['responseTimeAvgMs']:.0f}" if m["responseTimeAvgMs"] is not None else "-"
        lines.append(
            f"{s['name']:<14} {st:<13} {s['imageTag']:<12} {cpu_str:<13} {ram_str:<15} {m['requestsTotal']:>7} {lat_str:>8} {m['restartsMax']:>5}"
        )

    lines.append("-" * 100)
    cr = snap.get("azureCredit") or {}
    if cr.get("available"):
        exp_str = (cr.get("expirationDate") or "")[:10]
        lines.append(
            f" Azure Credit ({cr.get('source')}): ${cr['estimatedBalanceUsd']:.2f} / ${cr['originalAmountUsd']:.2f} remaining "
            f"(used ${cr['usedUsd']:.2f}, pending ${cr['pendingChargesUsd']:.2f}, expires {exp_str}, {cr.get('daysRemaining')}d left)"
        )
    cost = snap["cost"]
    fg = snap["freeGrant"]
    law = snap["logAnalytics"]
    b = cost.get("budget")
    budget_txt = f"{b['name']} ${b['currentSpendUsd']:.2f} / ${b['amountUsd']:.2f} (alerts={b['alertCount']})" if b else "N/A"
    lines.append(
        f" Cost MTD: ${cost.get('totalUsd', 0):.4f} | Budget: {budget_txt} | Log Analytics MTD: {law.get('ingestedMbMtd', 0):.2f} / 5120 MB"
    )
    lines.append(
        f" ACA Free Grant MTD: vCPU {fg['estVcpuSeconds']:.0f}/{fg['vcpuFreeLimit']:.0f}s ({fg['vcpuPct']}%) | "
        f"GiB {fg['estGibSeconds']:.0f}/{fg['gibFreeLimit']:.0f}s ({fg['gibPct']}%) | "
        f"Reqs {fg.get('requestsTotal', 0)}/{fg['requestsFreeLimit']:.0f} ({fg.get('requestsPct', 0)}%)"
    )

    lines.append("-" * 100)
    mq = snap.get("cloudamqp") or {}
    if mq.get("configured") and not mq.get("error"):
        lines.append(
            f" CloudAMQP ({mq.get('host')}): conns={mq.get('connections')}/20 | queues={mq.get('queueCount')}/100 | ready={mq.get('totalMessagesReady')} | DLQ={mq.get('totalDlqMessages', 0)}"
        )
    cld = snap.get("cloudinary") or {}
    if cld.get("configured") and not cld.get("error"):
        lines.append(
            f" Cloudinary ({cld.get('cloudName')}): {cld['creditsUsed']:.2f}/{cld['creditsLimit']:.0f} credits ({cld['creditsPct']}%) | "
            f"storage={cld['storageMb']}MB | bw={cld['bandwidthMb']}MB | objects={cld['objects']} | reqs={cld['requests']}"
        )
    neon = snap.get("neon") or {}
    if neon.get("configured") and not neon.get("error"):
        lines.append(
            f" Neon PostgreSQL: {neon.get('projectCount', 0)} projects ({neon.get('activeCount', 0)} active) | max CU={neon.get('maxComputePct', 0)}% | storage={neon.get('totalStorageMb', 0)}MB"
        )
    elif (neon.get("sqlProbe") or {}).get("ok"):
        sp = neon["sqlProbe"]
        lines.append(
            f" Neon PostgreSQL (SQL direct): {len(sp.get('databases') or [])} DBs | totalSize={sp.get('totalSizeMb', 0)}MB | tables={sp.get('totalTables', 0)} | liveRows={sp.get('totalLiveRows', 0)}"
        )
    else:
        lines.append(f" Neon PostgreSQL: {len(neon.get('configuredDbs') or [])} DBs in .env (pass --probe-neon for live SQL size/rows or set NEON_API_KEY for CU-hours)")
    atlas = snap.get("atlas") or {}
    ds = atlas.get("directStats") or {}
    if ds.get("ok"):
        lines.append(
            f" MongoDB Atlas ({ds.get('database')} @ {ds.get('replicaSet')}): {ds.get('totalSizeMb', 0)}/{ds.get('quotaLimitMb', 512):.0f} MiB ({ds.get('quotaPct', 0)}%) | "
            f"colls={ds.get('collections', 0)} | docs={ds.get('objects', 0)} | latency={ds.get('latencyMs', 0)}ms"
        )
    elif atlas.get("configured") and not atlas.get("error"):
        c_summary = ", ".join(f"{c['name']}({c['tier']}:{c['stateName']})" for c in atlas.get("clusters", []))
        lines.append(f" MongoDB Atlas: {c_summary or 'no clusters'} | openAlerts={atlas.get('openAlertCount', 0)}")
    else:
        lines.append(f" MongoDB Atlas ({atlas.get('clusterHost') or '-'}): {ds.get('error') or 'unconfigured'}")
    cf = snap.get("cloudflare") or {}
    fe = snap.get("frontendProbe") or {}
    cf_extra = (
        f" | {cf.get('source', 'api')}: {len(cf.get('deployments') or [])} deploys (latest {(cf.get('deployments') or [{}])[0].get('commitHash', '-')})"
        if cf.get("configured") and not cf.get("error")
        else " (run wrangler login or set CLOUDFLARE_API_TOKEN)"
    )
    lines.append(
        f" Cloudflare Pages ({fe.get('url')}): {'OK' if fe.get('ok') else 'ERR'} HTTP {fe.get('statusCode')} ({fe.get('latencyMs')}ms){cf_extra}"
    )

    deploys = snap.get("deploys") or []
    if deploys:
        lines.append("-" * 100)
        lines.append(" Recent Deploys (GitHub Actions deploy-b1.yml):")
        for d in deploys[:5]:
            lines.append(
                f"   - [{(d.get('conclusion') or d.get('status') or ''):<11}] {(d.get('headSha') or '')[:7]}  {d.get('createdAt', '')[:19]}Z  {d.get('displayTitle', '')[:60]}"
            )

    errs = (snap.get("logs") or {}).get("consoleErrors") or []
    if errs:
        lines.append("-" * 100)
        lines.append(f" Recent Console Errors/Warnings ({len(errs)}):")
        for e in errs[:5]:
            lines.append(f"   - {e['time'][:19]}Z [{e['service']}] {e['level']}: {e['message'][:90]}")

    lines.append("=" * 100)
    return "\n".join(lines)


def create_http_handler(cfg: dict[str, Any]):
    class OpsHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            return

        def _send_json(self, code: int, payload: Any) -> None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:  # noqa: N802
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            if parsed.path in ("/", "/index.html"):
                html = DASHBOARD_HTML.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(html)))
                self.end_headers()
                self.wfile.write(html)
                return

            if parsed.path == "/api/snapshot":
                try:
                    hours = max(1, min(168, int((qs.get("hours") or ["24"])[0])))
                    snap = collect_snapshot(
                        rg=cfg["rg"],
                        law_name=cfg["law"],
                        budget_name=cfg["budget"],
                        github_repo=cfg["github_repo"],
                        public_site=cfg["public_site"],
                        env_file=cfg["env_file"],
                        hours=hours,
                    )
                    self._send_json(200, snap)
                except Exception as exc:  # noqa: BLE001
                    self._send_json(500, {"error": redact_secrets(str(exc))})
                return

            if parsed.path == "/api/logs":
                try:
                    svc = (qs.get("service") or [""])[0].strip()
                    hours = max(1, min(168, int((qs.get("hours") or ["24"])[0])))
                    rows = fetch_service_console_logs(svc, rg=cfg["rg"], law_name=cfg["law"], hours=hours)
                    self._send_json(200, {"service": svc, "rows": rows})
                except Exception as exc:  # noqa: BLE001
                    self._send_json(400, {"error": redact_secrets(str(exc))})
                return

            self._send_json(404, {"error": "Not found"})

        def do_POST(self) -> None:  # noqa: N802
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/api/probe-gateway":
                try:
                    az = find_az()
                    rc, fqdn, err = run_cmd(
                        [
                            az,
                            "containerapp",
                            "show",
                            "-g",
                            cfg["rg"],
                            "-n",
                            "gateway",
                            "--query",
                            "properties.configuration.ingress.fqdn",
                            "-o",
                            "tsv",
                            "--only-show-errors",
                        ]
                    )
                    if rc != 0 or not fqdn:
                        raise RuntimeError(err or "Cannot resolve gateway FQDN")
                    res = probe_http_url(f"https://{fqdn}/actuator/health", timeout=35)
                    self._send_json(200, res)
                except Exception as exc:  # noqa: BLE001
                    self._send_json(500, {"ok": False, "error": redact_secrets(str(exc))})
                return
            if parsed.path == "/api/probe-neon":
                try:
                    env_vars = load_dotenv(cfg["env_file"])
                    res = probe_neon_postgres_direct(env_vars)
                    self._send_json(200 if res.get("ok") else 500, res)
                except Exception as exc:  # noqa: BLE001
                    self._send_json(500, {"ok": False, "error": redact_secrets(str(exc))})
                return
            self._send_json(404, {"error": "Not found"})

    return OpsHandler


def serve_web(cfg: dict[str, Any], port: int, open_browser: bool) -> None:
    server = ThreadingHTTPServer(("127.0.0.1", port), create_http_handler(cfg))
    url = f"http://127.0.0.1:{port}"
    print(f"SmartTravel All-in-One Ops & Cost Control Center running at {url}")
    print("Press Ctrl+C to stop (local-only 127.0.0.1, never exposes secrets/tokens).")
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped Ops Control Center.")
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="SmartTravel VN 2.0 All-in-One Ops & Cost Monitor (Plan B1)")
    parser.add_argument("--rg", default=DEFAULT_RG)
    parser.add_argument("--law", default=DEFAULT_LAW)
    parser.add_argument("--budget", default=DEFAULT_BUDGET)
    parser.add_argument("--github-repo", default=DEFAULT_GITHUB_REPO)
    parser.add_argument("--public-site", default=DEFAULT_PUBLIC_SITE)
    parser.add_argument("--env-file", default=str(ROOT / ".env"))
    parser.add_argument("--hours", type=int, default=24, help="Metric lookback window in hours (1..168)")
    parser.add_argument("--probe-neon", action="store_true", help="Also run on-demand SQL size/row probe across all 5 Neon DBs (wakes Neon briefly)")
    parser.add_argument("--json", action="store_true", help="Print JSON snapshot")
    parser.add_argument("--watch", action="store_true", help="Auto-refresh terminal report")
    parser.add_argument("--interval", type=int, default=60, help="Watch refresh interval in seconds")
    parser.add_argument("--web", action="store_true", help="Start local Web Control Center UI")
    parser.add_argument("--port", type=int, default=8787, help="Local port for --web")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open browser with --web")
    args = parser.parse_args()

    cfg = {
        "rg": args.rg,
        "law": args.law,
        "budget": args.budget,
        "github_repo": args.github_repo,
        "public_site": args.public_site,
        "env_file": Path(args.env_file),
    }

    if args.web:
        serve_web(cfg, args.port, open_browser=not args.no_browser)
        return

    if args.watch:
        try:
            while True:
                snap = collect_snapshot(
                    rg=args.rg,
                    law_name=args.law,
                    budget_name=args.budget,
                    github_repo=args.github_repo,
                    public_site=args.public_site,
                    env_file=Path(args.env_file),
                    hours=args.hours,
                )
                os.system("cls" if os.name == "nt" else "clear")
                print(render_cli_report(snap))
                print(f"\nRefreshing in {args.interval}s... (Ctrl+C to exit)")
                time.sleep(max(10, args.interval))
        except KeyboardInterrupt:
            return

    snap = collect_snapshot(
        rg=args.rg,
        law_name=args.law,
        budget_name=args.budget,
        github_repo=args.github_repo,
        public_site=args.public_site,
        env_file=Path(args.env_file),
        hours=args.hours,
        probe_neon_sql=args.probe_neon,
    )
    if args.json:
        print(json.dumps(snap, ensure_ascii=False, indent=2))
    else:
        print(render_cli_report(snap))


if __name__ == "__main__":
    main()
