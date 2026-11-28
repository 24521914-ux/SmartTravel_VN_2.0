"""Unit tests for SmartTravel Plan B1 Azure monitoring tools (Workbook, setup_monitoring, ops_monitor)."""
from __future__ import annotations

import json
import sys
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import ops_monitor  # noqa: E402
import setup_monitoring  # noqa: E402


class WorkbookAndSetupTests(unittest.TestCase):
    def test_workbook_template_is_valid_json_with_four_tabs(self) -> None:
        raw = setup_monitoring.WORKBOOK_TEMPLATE.read_text(encoding="utf-8")
        data = json.loads(raw)
        self.assertEqual(data["version"], "Notebook/1.0")
        nav = next(i for i in data["items"] if i.get("name") == "navigation-tabs")
        tabs = [lnk["subTarget"] for lnk in nav["content"]["links"]]
        self.assertEqual(tabs, ["overview", "resources", "logs", "cost"])
        # Must not contain embedded credentials or tokens.
        self.assertNotIn("password", raw.lower())
        self.assertNotIn("sharedkey", raw.lower())

    def test_build_workbook_arm_payload_injects_subscription_and_law(self) -> None:
        sub = "11111111-2222-3333-4444-555555555555"
        law = f"/subscriptions/{sub}/resourceGroups/rg-smarttravel-b1/providers/Microsoft.OperationalInsights/workspaces/law-smarttravel-b1"
        payload = setup_monitoring.build_workbook_arm_payload(sub, "rg-smarttravel-b1", "malaysiawest", law)
        self.assertEqual(payload["kind"], "shared")
        self.assertEqual(payload["properties"]["sourceId"], law)
        inner = json.loads(payload["properties"]["serializedData"])
        self.assertEqual(inner["fallbackResourceIds"], [law])
        param_item = next(i for i in inner["items"] if i["type"] == 9)
        sub_param = next(p for p in param_item["content"]["parameters"] if p["name"] == "Subscription")
        self.assertEqual(sub_param["value"], f"/subscriptions/{sub}")

    def test_deterministic_workbook_id_is_stable(self) -> None:
        a = setup_monitoring.deterministic_workbook_id("SUB-1", "rg-smarttravel-b1")
        b = setup_monitoring.deterministic_workbook_id("sub-1", "RG-SMARTTRAVEL-B1")
        self.assertEqual(a, b)

    def test_build_budget_payload_adds_multi_threshold_alerts(self) -> None:
        payload = setup_monitoring.build_budget_payload(15.0, ["dev@example.invalid"])
        notifs = payload["properties"]["notifications"]
        self.assertEqual(payload["properties"]["amount"], 15.0)
        self.assertIn("Actual_25pct", notifs)
        self.assertIn("Actual_50pct", notifs)
        self.assertIn("Actual_80pct", notifs)
        self.assertIn("Actual_100pct", notifs)
        self.assertIn("Forecasted_100pct", notifs)
        self.assertEqual(notifs["Actual_80pct"]["contactEmails"], ["dev@example.invalid"])


class OpsMonitorTests(unittest.TestCase):
    def test_redact_secrets_masks_uris_and_bearer_tokens(self) -> None:
        raw = "Failed connecting amqps://user1:superSecret99@host.rmq.cloudamqp.com/vh with Bearer eyJhbGciOi.abc.def and Basic dXNlcjpwYXNz"
        cleaned = ops_monitor.redact_secrets(raw)
        self.assertNotIn("superSecret99", cleaned)
        self.assertNotIn("eyJhbGciOi", cleaned)
        self.assertNotIn("dXNlcjpwYXNz", cleaned)
        self.assertIn("amqps://***:***@host.rmq.cloudamqp.com/vh", cleaned)
        self.assertIn("Bearer ***", cleaned)
        self.assertIn("Basic ***", cleaned)

    def test_fetch_azure_credit_balance_parses_mca_summary_and_lots(self) -> None:
        def fake_http_json(url: str, *args, **kwargs):
            if "billingAccounts?" in url:
                return {"value": [{"name": "ba-1", "properties": {"agreementType": "MicrosoftCustomerAgreement"}}]}
            if "billingProfiles?" in url:
                return {"value": [{"name": "bp-1"}]}
            if "credits/balanceSummary" in url:
                return {
                    "properties": {
                        "creditCurrency": "USD",
                        "balanceSummary": {"currentBalance": {"value": 97.5}, "estimatedBalance": {"value": 97.5}},
                        "pendingEligibleCharges": {"value": 0.25},
                        "expiredCredit": {"value": 0.0},
                    }
                }
            if "/lots?" in url:
                return {
                    "value": [
                        {
                            "properties": {
                                "source": "Azure for students credit",
                                "originalAmount": {"value": 100.0},
                                "closedBalance": {"value": 97.5},
                                "startDate": "2026-11-27T00:00:00Z",
                                "expirationDate": "2027-11-27T00:00:00Z",
                            }
                        }
                    ]
                }
            raise AssertionError(f"Unexpected URL: {url}")

        with mock.patch.object(ops_monitor, "http_json", side_effect=fake_http_json):
            res = ops_monitor.fetch_azure_credit_balance({"Authorization": "Bearer fake"})
        self.assertTrue(res["available"])
        self.assertEqual(res["estimatedBalanceUsd"], 97.5)
        self.assertEqual(res["originalAmountUsd"], 100.0)
        self.assertEqual(res["usedUsd"], 2.5)
        self.assertEqual(res["pendingChargesUsd"], 0.25)
        self.assertEqual(res["source"], "Azure for students credit")

    def test_fetch_cloudinary_and_neon_and_cf_and_atlas_collectors(self) -> None:
        # 1. Cloudinary
        fake_cld = {
            "plan": "Free",
            "last_updated": "2026-11-28",
            "credits": {"usage": 1.25, "limit": 25.0, "used_percent": 5.0},
            "storage": {"usage": 100 * 1024 * 1024, "credits_usage": 0.1},
            "bandwidth": {"usage": 200 * 1024 * 1024, "credits_usage": 0.2},
            "transformations": {"usage": 50, "credits_usage": 0.05},
            "objects": {"usage": 120},
            "requests": 900,
        }
        with mock.patch.object(ops_monitor, "http_json", return_value=fake_cld):
            cld = ops_monitor.fetch_cloudinary_usage(
                {"CLOUDINARY_CLOUD_NAME": "demo", "CLOUDINARY_API_KEY": "k", "CLOUDINARY_API_SECRET": "s"}
            )
        self.assertTrue(cld["configured"])
        self.assertEqual(cld["creditsUsed"], 1.25)
        self.assertEqual(cld["storageMb"], 100.0)
        self.assertEqual(cld["objects"], 120)

        # 2. Neon (unconfigured extracts safe DB host/name without credentials)
        neon_unconf = ops_monitor.fetch_neon_status(
            {"CATALOG_DB_URL": "jdbc:postgresql://ep-abc.neon.tech:5432/catalog_db?sslmode=verify-full"}
        )
        self.assertFalse(neon_unconf["configured"])
        self.assertEqual(neon_unconf["configuredDbs"][0]["host"], "ep-abc.neon.tech")
        self.assertEqual(neon_unconf["configuredDbs"][0]["database"], "catalog_db")

        # 3. Neon (configured)
        def fake_neon(url: str, *args, **kwargs):
            if url.endswith("/endpoints"):
                return {"endpoints": [{"current_state": "idle"}]}
            return {
                "projects": [
                    {
                        "id": "p1",
                        "name": "smarttravel-catalog",
                        "region_id": "aws-ap-southeast-1",
                        "pg_version": 16,
                        "compute_time_seconds": 36000,
                        "active_time_seconds": 7200,
                        "synthetic_storage_size": 50 * 1024 * 1024,
                        "data_transfer_bytes": 100 * 1024 * 1024,
                    }
                ]
            }

        with mock.patch.object(ops_monitor, "http_json", side_effect=fake_neon):
            neon = ops_monitor.fetch_neon_status({"NEON_API_KEY": "neon_fake"})
        self.assertTrue(neon["configured"])
        self.assertEqual(neon["projects"][0]["computeCuHours"], 10.0)
        self.assertEqual(neon["projects"][0]["storageMb"], 50.0)
        self.assertEqual(neon["projects"][0]["state"], "idle")

        # 4. Cloudflare Pages
        def fake_cf(url: str, *args, **kwargs):
            if "deployments" in url:
                return {
                    "result": [
                        {
                            "short_id": "dep12345",
                            "environment": "production",
                            "latest_stage": {"status": "success"},
                            "deployment_trigger": {"metadata": {"branch": "main", "commit_hash": "abcdef123", "commit_message": "Deploy UI"}},
                            "created_on": "2026-11-28T08:00:00Z",
                            "url": "https://smarttravel-vn.pages.dev",
                        }
                    ]
                }
            return {"data": {"viewer": {"accounts": [{"pagesFunctionsInvocationsAdaptiveGroups": [{"sum": {"requests": 250, "errors": 1, "subrequests": 250}}]}]}}}

        with mock.patch.object(ops_monitor, "http_json", side_effect=fake_cf):
            cf = ops_monitor.fetch_cloudflare_status({"CLOUDFLARE_API_TOKEN": "tok", "CLOUDFLARE_ACCOUNT_ID": "acc"}, "smarttravel-vn", 24)
        self.assertTrue(cf["configured"])
        self.assertEqual(cf["deployments"][0]["commitHash"], "abcdef1")
        self.assertEqual(cf["analytics"]["functionRequests"], 250)

        # 5. MongoDB Atlas
        def fake_atlas(url: str, *args, **kwargs):
            if "/clusters" in url:
                return {"results": [{"name": "Cluster0", "stateName": "IDLE", "mongoDBVersion": "8.0", "diskSizeGB": 0.5, "providerSettings": {"instanceSizeName": "M0", "regionName": "AP_SOUTHEAST_1", "backingProviderName": "AWS"}}]}
            return {"results": []}

        with mock.patch.object(ops_monitor, "http_digest_json", side_effect=fake_atlas):
            at = ops_monitor.fetch_atlas_status({"ATLAS_PUBLIC_KEY": "pk", "ATLAS_PRIVATE_KEY": "sk", "ATLAS_GROUP_ID": "g1"})
        self.assertTrue(at["configured"])
        self.assertEqual(at["clusters"][0]["name"], "Cluster0")
        self.assertEqual(at["openAlertCount"], 0)

        # 6. Direct MongoDB Atlas probe & Cloudflare Wrangler fallback
        fake_mongo = {"ok": True, "database": "community_db", "replicaSet": "atlas-abc", "collections": 19, "objects": 1700, "dataSizeMb": 1.2, "storageSizeMb": 2.0, "indexSizeMb": 0.8, "totalSizeMb": 2.8, "latencyMs": 120, "topCollections": []}
        with mock.patch.object(ops_monitor, "run_java_db_probe", return_value=fake_mongo):
            at_direct = ops_monitor.fetch_atlas_status({"COMMUNITY_MONGODB_URI": "mongodb+srv://u:p@cluster.mongodb.net/community_db"})
        self.assertTrue(at_direct["configured"])
        self.assertEqual(at_direct["source"], "mongodb-direct")
        self.assertEqual(at_direct["directStats"]["objects"], 1700)

        with mock.patch.object(ops_monitor, "find_wrangler", return_value="wrangler"), mock.patch.object(
            ops_monitor,
            "run_cmd",
            side_effect=[
                (0, json.dumps([{"Id": "122bc560-xxxx", "Environment": "Production", "Branch": "main", "Source": "7197adc", "Deployment": "https://122bc560.smarttravel-vn.pages.dev", "Status": "1h ago"}]), ""),
                (0, json.dumps([{"Project Name": "smarttravel-vn", "Project Domains": "smarttravel-vn.pages.dev", "Last Modified": "1h ago"}]), ""),
            ],
        ):
            cf_cli = ops_monitor.fetch_cloudflare_status({}, "smarttravel-vn", 24)
        self.assertTrue(cf_cli["configured"])
        self.assertEqual(cf_cli["source"], "wrangler-cli")
        self.assertEqual(cf_cli["deployments"][0]["commitHash"], "7197adc")

    def test_parse_azure_metrics_response_computes_kpis_and_series(self) -> None:
        sample = {
            "value": [
                {
                    "name": {"value": "CpuPercentage"},
                    "timeseries": [{"data": [
                        {"timeStamp": "2026-11-28T08:00:00Z", "average": 10.0, "maximum": 25.0},
                        {"timeStamp": "2026-11-28T08:15:00Z", "average": 20.0, "maximum": 40.0},
                    ]}],
                },
                {
                    "name": {"value": "WorkingSetBytes"},
                    "timeseries": [{"data": [
                        {"timeStamp": "2026-11-28T08:00:00Z", "average": 200 * 1024 * 1024, "maximum": 300 * 1024 * 1024},
                    ]}],
                },
                {
                    "name": {"value": "Requests"},
                    "timeseries": [{"data": [
                        {"timeStamp": "2026-11-28T08:00:00Z", "total": 12},
                        {"timeStamp": "2026-11-28T08:15:00Z", "total": 30},
                    ]}],
                },
                {
                    "name": {"value": "ResponseTime"},
                    "timeseries": [{"data": [
                        {"timeStamp": "2026-11-28T08:00:00Z", "average": 180.0},
                        {"timeStamp": "2026-11-28T08:15:00Z", "average": 220.0},
                    ]}],
                },
                {
                    "name": {"value": "RestartCount"},
                    "timeseries": [{"data": [{"timeStamp": "2026-11-28T08:00:00Z", "maximum": 1}]}],
                },
            ]
        }
        summary, series = ops_monitor.parse_azure_metrics_response(sample)
        self.assertEqual(summary["cpuAvgPct"], 15.0)
        self.assertEqual(summary["cpuMaxPct"], 40.0)
        self.assertEqual(summary["ramAvgMib"], 200.0)
        self.assertEqual(summary["ramMaxMib"], 300.0)
        self.assertEqual(summary["requestsTotal"], 42)
        self.assertEqual(summary["responseTimeAvgMs"], 200.0)
        self.assertEqual(summary["restartsMax"], 1)
        self.assertEqual(len(series["cpu"]), 2)
        self.assertEqual(len(series["requests"]), 2)

    def test_estimate_free_grant_usage_math(self) -> None:
        rows = [{"Service": "gateway", "ActiveMinutes": 100}, {"Service": "catalog", "ActiveMinutes": 60}]
        fg = ops_monitor.estimate_free_grant_usage(rows)
        self.assertEqual(fg["activeMinutesMtd"], 160)
        # 160 min * 60s * 0.25 vCPU = 2400 vCPU-s; * 0.5 GiB = 4800 GiB-s
        self.assertEqual(fg["estVcpuSeconds"], 2400.0)
        self.assertEqual(fg["estGibSeconds"], 4800.0)
        self.assertAlmostEqual(fg["vcpuPct"], 1.33, places=2)

        mtd = ops_monitor.compute_mtd_free_grant_from_metrics(
            [
                {"service": "gateway", "cpu": 0.25, "memGib": 0.5, "replicaAvgSum": 4.0, "requestsTotal": 500},
                {"service": "catalog", "cpu": 0.25, "memGib": 0.5, "replicaAvgSum": 2.0, "requestsTotal": 300},
            ],
            bucket_seconds=3600.0,
        )
        # 6 replica-hours * 3600s * 0.25 vCPU = 5400 vCPU-s; * 0.5 GiB = 10800 GiB-s; 800 reqs
        self.assertEqual(mtd["estVcpuSeconds"], 5400.0)
        self.assertEqual(mtd["estGibSeconds"], 10800.0)
        self.assertEqual(mtd["requestsTotal"], 800)
        self.assertEqual(mtd["requestsRemaining"], 1999200)
        self.assertEqual(mtd["vcpuPct"], 3.0)

    def test_cli_report_and_local_web_server_with_mock_snapshot(self) -> None:
        fake_snap = {
            "generatedAt": "2026-11-28T08:30:00+00:00",
            "hours": 24,
            "meta": {
                "subscriptionId": "sub-1",
                "subscriptionName": "Azure for Students",
                "resourceGroup": "rg-smarttravel-b1",
                "githubRepo": "24521914-ux/SmartTravel_VN_2.0",
                "elapsedMs": 420,
            },
            "links": {"publicSite": "https://smarttravel-vn.pages.dev"},
            "services": [
                {
                    "name": "gateway",
                    "activeReplicas": 1,
                    "imageTag": "azure-b1",
                    "latestRevisionName": "gateway--rev1",
                    "minReplicas": 0,
                    "maxReplicas": 2,
                    "externalIngress": True,
                    "metrics": {
                        "cpuAvgPct": 5.2,
                        "cpuMaxPct": 18.0,
                        "ramAvgMib": 180.0,
                        "ramMaxMib": 240.0,
                        "ramMaxPct": 46.9,
                        "requestsTotal": 120,
                        "responseTimeAvgMs": 145.0,
                        "restartsMax": 0,
                    },
                    "series": {"cpu": [], "ramMib": [], "requests": [], "replicas": []},
                }
            ],
            "cost": {"totalUsd": 0.0, "breakdown": [], "budget": {"name": "budget-smarttravel-b1", "amountUsd": 15.0, "currentSpendUsd": 0.0, "alertCount": 0}},
            "freeGrant": ops_monitor.estimate_free_grant_usage([{"Service": "gateway", "ActiveMinutes": 10}]),
            "logAnalytics": {"name": "law-smarttravel-b1", "dailyQuotaGb": 0.15, "retentionDays": 30, "ingestedMbMtd": 12.5},
            "logs": {"consoleErrors": [], "systemEvents": [], "note": ""},
            "deploys": [{"databaseId": 1, "displayTitle": "Test deploy", "headSha": "abcdef1234567", "headBranch": "main", "status": "completed", "conclusion": "success", "createdAt": "2026-11-28T08:00:00Z", "url": "https://example.invalid"}],
            "cloudamqp": {"configured": False, "queues": []},
            "frontendProbe": {"ok": True, "statusCode": 200, "latencyMs": 95, "url": "https://smarttravel-vn.pages.dev/kham-pha"},
        }

        text = ops_monitor.render_cli_report(fake_snap)
        self.assertIn("gateway", text)
        self.assertIn("RUNNING (1)", text)
        self.assertIn("budget-smarttravel-b1", text)

        cfg = {
            "rg": "rg-smarttravel-b1",
            "law": "law-smarttravel-b1",
            "budget": "budget-smarttravel-b1",
            "github_repo": "24521914-ux/SmartTravel_VN_2.0",
            "public_site": "https://smarttravel-vn.pages.dev",
            "env_file": HERE / "nonexistent.env",
        }
        with mock.patch.object(ops_monitor, "collect_snapshot", return_value=fake_snap):
            server = ThreadingHTTPServer(("127.0.0.1", 0), ops_monitor.create_http_handler(cfg))
            port = server.server_address[1]
            t = threading.Thread(target=server.serve_forever, daemon=True)
            t.start()
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=5) as r:
                    html = r.read().decode("utf-8")
                    self.assertEqual(r.status, 200)
                    self.assertIn("SmartTravel VN 2.0", html)
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/snapshot?hours=6", timeout=5) as r:
                    data = json.loads(r.read().decode("utf-8"))
                    self.assertEqual(r.status, 200)
                    self.assertEqual(data["services"][0]["name"], "gateway")
            finally:
                server.shutdown()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
