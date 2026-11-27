"""Deploy SmartTravel VN 2.0 onto Azure Container Apps (Plan B1 — Scale-to-Zero Consumption).

Reads runtime credentials from local `.env` (never prints or commits secrets), initializes
CloudAMQP shared-vhost topology when `CLOUDAMQP_URL` is configured, and creates/updates the
7 Container Apps (`identity`, `catalog`, `community`, `trip`, `ingestion`, `intelligence`,
`gateway`) using GHCR images, Azure File mounts, Neon/Atlas DBs, Cloudinary, and KEDA scalers.

Usage:
  python backend/platform/azure/deploy_b1.py --check
  python backend/platform/azure/deploy_b1.py --apply [--image-owner 24521914-ux] [--image-tag azure-b1]
  python backend/platform/azure/deploy_b1.py --init-cloudamqp
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RG = "rg-smarttravel-b1"
DEFAULT_ENV = "cae-smarttravel-b1"
DEFAULT_LOC = "malaysiawest"
DEFAULT_IMAGE_OWNER = "24521914-ux"
DEFAULT_IMAGE_TAG = "azure-b1"

SERVICE_PORTS = {
    "identity": 8101,
    "catalog": 8102,
    "community": 8103,
    "trip": 8104,
    "ingestion": 8105,
    "intelligence": 8106,
    "gateway": 8080,
}

# Volume mounts backed by Azure File Shares configured in cae-smarttravel-b1.
VOLUME_MOUNTS = {
    "identity": ("identity-keys", "/run/identity"),
    "community": ("community-media", "/app/.local"),
    "intelligence": ("intelligence-artifacts", "/app/artifacts"),
}

# Queue names monitored by KEDA RabbitMQ scaler when CLOUDAMQP_URL is set.
INBOX_QUEUES = {
    "identity": "identity.inbox",
    "catalog": "catalog.inbox",
    "community": "community.inbox",
    "trip": "trip.inbox",
    "ingestion": "ingestion.inbox",
    "intelligence": "intelligence.inbox",
}


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


def load_dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        raise SystemExit(f"Missing env file: {path}")
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


def parse_cloudamqp(url: str) -> dict[str, str]:
    parsed = urlparse(url)
    if parsed.scheme not in ("amqp", "amqps"):
        raise SystemExit("CLOUDAMQP_URL must start with amqp:// or amqps://")
    host = parsed.hostname or ""
    port = str(parsed.port or (5671 if parsed.scheme == "amqps" else 5672))
    user = unquote(parsed.username or "")
    password = unquote(parsed.password or "")
    vhost = unquote((parsed.path or "/").lstrip("/")) or "/"
    if not host or not user or not password:
        raise SystemExit("CLOUDAMQP_URL is missing host, username, or password")
    return {
        "scheme": parsed.scheme,
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "vhost": vhost,
        "ssl": "true" if parsed.scheme == "amqps" else "false",
        "api_url": f"https://{host}",
    }


def run_az(az: str, args: list[str], capture: bool = False) -> str:
    cmd = [az, *args, "--only-show-errors"]
    res = subprocess.run(cmd, text=True, capture_output=capture, check=False)
    if res.returncode != 0:
        msg = (res.stderr or res.stdout or "").strip() if capture else f"az exited with {res.returncode}"
        raise SystemExit(f"Azure CLI error on `az {' '.join(args[:4])}`: {msg}")
    return (res.stdout or "").strip() if capture else ""


def init_cloudamqp_topology(env_vars: dict[str, str]) -> None:
    url = env_vars.get("CLOUDAMQP_URL", "").strip()
    if not url:
        raise SystemExit("CLOUDAMQP_URL is not set in .env")
    amqp = parse_cloudamqp(url)
    sys.path.insert(0, str(ROOT / "backend" / "platform" / "init"))
    import broker_topology  # noqa: PLC0415

    registry = json.loads((ROOT / "backend" / "contracts" / "registry.json").read_text(encoding="utf-8"))
    call = broker_topology.client(amqp["api_url"], amqp["user"], amqp["password"])
    reqs = broker_topology.plan(registry, {}, vhost=amqp["vhost"], shared_vhost=True)
    for method, path, body in reqs:
        call(path, body, method)
    print(f"CloudAMQP topology applied: {len(reqs)} idempotent requests on vhost '{amqp['vhost']}' ({amqp['host']})")


def build_app_spec(
    name: str,
    env_vars: dict[str, str],
    image: str,
    managed_env_id: str,
    location: str,
    cloudamqp: dict[str, str] | None,
    cors_origins: str,
    ghcr_username: str | None = None,
    ghcr_token: str | None = None,
) -> dict:
    port = SERVICE_PORTS[name]
    is_gateway = name == "gateway"
    transport_enabled = "true" if cloudamqp is not None else "false"

    secrets: list[dict[str, str]] = []
    envs: list[dict[str, str]] = []

    def add_secret(s_name: str, s_val: str) -> None:
        if not s_val:
            return
        secrets.append({"name": s_name, "value": s_val})

    def add_env(k: str, v: str) -> None:
        envs.append({"name": k, "value": v})

    def add_secret_env(k: str, s_name: str) -> None:
        envs.append({"name": k, "secretRef": s_name})

    registries = []
    if ghcr_username and ghcr_token:
        add_secret("ghcr-pat", ghcr_token)
        registries.append({"server": "ghcr.io", "username": ghcr_username, "passwordSecretRef": "ghcr-pat"})

    # Internal ACA short DNS: http://<app-name> resolves over ACA private mesh port 80 -> targetPort.
    internal_identity = "http://identity"
    internal_catalog = "http://catalog"
    internal_community = "http://community"
    internal_trip = "http://trip"
    internal_ingestion = "http://ingestion"
    internal_intelligence = "http://intelligence"

    add_env("PORT", str(port))
    add_env("SPRING_PROFILES_ACTIVE", "p02-local")
    add_env(
        "JAVA_TOOL_OPTIONS",
        "-XX:+UseSerialGC -Xms48m -Xmx224m -XX:MaxMetaspaceSize=112m -Xss256k -XX:ReservedCodeCacheSize=48m",
    )

    if is_gateway:
        add_secret("gateway-exchange-secret", env_vars["GATEWAY_EXCHANGE_SECRET"])
        add_env("JWT_ISSUER", internal_identity)
        add_env("JWT_JWKS_URI", f"{internal_identity}/.well-known/jwks.json")
        add_secret_env("GATEWAY_EXCHANGE_SECRET", "gateway-exchange-secret")
        add_env("GATEWAY_IDENTITY_EXCHANGE_URI", f"{internal_identity}/internal/v1/security/exchange")
        add_env("GATEWAY_IDENTITY_EXCHANGE_TIMEOUT_SECONDS", "25")
        add_env("GATEWAY_IDENTITY_EXCHANGE_CONNECT_TIMEOUT_MS", "5000")
        add_env("GATEWAY_CONNECT_TIMEOUT_MS", "10000")
        add_env("GATEWAY_RESPONSE_TIMEOUT", "30s")
        add_env("CORS_ALLOWED_ORIGINS", cors_origins)
        add_env("AI_ENABLED", env_vars.get("AI_ENABLED", "true"))
        add_env("IDENTITY_URL", internal_identity)
        add_env("CATALOG_URL", internal_catalog)
        add_env("COMMUNITY_URL", internal_community)
        add_env("TRIP_URL", internal_trip)
        add_env("INGESTION_URL", internal_ingestion)
        add_env("INTELLIGENCE_URL", internal_intelligence)
    else:
        add_secret("gateway-exchange-secret", env_vars["GATEWAY_EXCHANGE_SECRET"])
        add_secret("catalog-cursor-key", env_vars["CATALOG_CURSOR_KEY"])
        add_env("JWT_ISSUER", internal_identity)
        add_env("JWT_JWKS_URI", f"{internal_identity}/.well-known/jwks.json")
        add_env("JWT_AUDIENCE", name)
        add_env("IDENTITY_SESSION_URI", f"{internal_identity}/internal/v1/security/session")
        add_env("IDENTITY_SESSION_CACHE_SECONDS", env_vars.get("IDENTITY_SESSION_CACHE_SECONDS", "15"))
        add_env("WORKLOAD_TOKEN_URI", f"{internal_identity}/internal/v1/security/workload-token")
        add_secret_env("GATEWAY_EXCHANGE_SECRET", "gateway-exchange-secret")
        add_env("CATALOG_BASE_URL", internal_catalog)
        add_env("CATALOG_URL", internal_catalog)
        add_env("INGESTION_URL", internal_ingestion)
        add_env("IDENTITY_URL", internal_identity)
        add_env("COMMUNITY_URL", internal_community)
        add_env("TRIP_URL", internal_trip)
        add_env("INTERNAL_HTTP_TIMEOUT_SECONDS", "20")
        # Low-memory Tomcat + Neon-friendly Hikari (minimum-idle=0 & keepalive=0 so Neon scales to zero).
        add_env("SERVER_TOMCAT_THREADS_MAX", "20")
        add_env("SERVER_TOMCAT_THREADS_MIN_SPARE", "4")
        add_env("SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE", "5")
        add_env("SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE", "0")
        add_env("SPRING_DATASOURCE_HIKARI_KEEPALIVE_TIME", "0")
        add_env("SPRING_DATASOURCE_HIKARI_IDLE_TIMEOUT", "60000")
        add_env(
            "SPRING_APPLICATION_JSON",
            json.dumps(
                {
                    "catalog.base-url": internal_catalog,
                    "ingestion.base-url": internal_ingestion,
                    "intelligence.community-url": internal_community,
                    "intelligence.identity-url": internal_identity,
                    "intelligence.trip-url": internal_trip,
                }
            ),
        )

        # Broker configuration (CloudAMQP Little Lemur shared vhost when available).
        add_env("TRANSPORT_ENABLED", transport_enabled)
        add_env(f"{name.upper()}_TRANSPORT_ENABLED", transport_enabled)
        if cloudamqp is not None:
            add_secret("broker-password", cloudamqp["password"])
            add_env("BROKER_HOST", cloudamqp["host"])
            add_env("BROKER_PORT", cloudamqp["port"])
            add_env("BROKER_VHOST", cloudamqp["vhost"])
            add_env("BROKER_USERNAME", cloudamqp["user"])
            add_env("CATALOG_BROKER_USER", cloudamqp["user"])
            add_env("COMMUNITY_BROKER_USER", cloudamqp["user"])
            add_secret_env("BROKER_PASSWORD", "broker-password")
            add_secret_env(f"{name.upper()}_BROKER_PASSWORD", "broker-password")
            add_env("SPRING_RABBITMQ_SSL_ENABLED", cloudamqp["ssl"])
            add_env("SPRING_RABBITMQ_CONNECTION_TIMEOUT", "10s")
            # Poll outbox every 5s while awake to stay gentle on Neon/Atlas.
            add_env(f"{name.upper()}_TRANSPORT_POLL_MS", "5000")
        else:
            # Exclude rabbit health when broker not yet connected so readiness still succeeds.
            add_env("MANAGEMENT_HEALTH_RABBIT_ENABLED", "false")
            add_env("SPRING_RABBITMQ_LISTENER_SIMPLE_AUTO_STARTUP", "false")

        if name == "identity":
            add_secret("db-url", env_vars["IDENTITY_DB_URL"])
            add_secret("db-password", env_vars["IDENTITY_RUNTIME_PASSWORD"])
            add_secret("db-mig-password", env_vars["IDENTITY_MIGRATION_PASSWORD"])
            add_secret("mail-key", env_vars["IDENTITY_MAIL_KEY"])
            add_secret("fixture-password", env_vars["IDENTITY_FIXTURE_PASSWORD"])
            add_secret_env("DB_URL", "db-url")
            add_env("DB_USER", "identity_runtime")
            add_secret_env("DB_PASSWORD", "db-password")
            add_env("DB_MIGRATION_USER", "identity_migrator")
            add_secret_env("DB_MIGRATION_PASSWORD", "db-mig-password")
            add_env("IDENTITY_KEYS_FILE", "/run/identity/keys.json")
            add_env("IDENTITY_ACTIVE_KID", "p02-identity-1")
            add_secret_env("IDENTITY_MAIL_KEY", "mail-key")
            add_secret_env("IDENTITY_FIXTURE_PASSWORD", "fixture-password")
            add_env("IDENTITY_FIXTURES_ENABLED", "false")
            add_env("IDENTITY_NOTIFICATION_EMAIL_ENABLED", env_vars.get("IDENTITY_NOTIFICATION_EMAIL_ENABLED", "false"))
            add_env("IDENTITY_EMAIL_VERIFICATION_REQUIRED", env_vars.get("IDENTITY_EMAIL_VERIFICATION_REQUIRED", "false"))
            add_env("IDENTITY_MAIL_FROM", env_vars.get("IDENTITY_MAIL_FROM", "no-reply@smarttravel.invalid"))
            if env_vars.get("MAIL_HOST"):
                add_env("MAIL_HOST", env_vars["MAIL_HOST"])
                add_env("MAIL_PORT", env_vars.get("MAIL_PORT", "587"))
                add_env("MAIL_USERNAME", env_vars.get("MAIL_USERNAME", ""))
                add_secret("mail-password", env_vars.get("MAIL_PASSWORD", ""))
                if env_vars.get("MAIL_PASSWORD"):
                    add_secret_env("MAIL_PASSWORD", "mail-password")
                add_env("MAIL_AUTH", "true")
                add_env("MAIL_TLS_REQUIRED", "true")
            if env_vars.get("GOOGLE_CLIENT_ID"):
                add_env("GOOGLE_CLIENT_ID", env_vars["GOOGLE_CLIENT_ID"])
            if env_vars.get("FACEBOOK_APP_ID"):
                add_env("FACEBOOK_APP_ID", env_vars["FACEBOOK_APP_ID"])
            if env_vars.get("FACEBOOK_APP_SECRET"):
                add_secret("fb-secret", env_vars["FACEBOOK_APP_SECRET"])
                add_secret_env("FACEBOOK_APP_SECRET", "fb-secret")
            for svc in ("catalog", "community", "trip", "ingestion", "intelligence"):
                sec_key = f"{svc}-workload-secret"
                add_secret(sec_key, env_vars[f"{svc.upper()}_WORKLOAD_SECRET"])
                add_secret_env(f"{svc.upper()}_WORKLOAD_SECRET", sec_key)

        elif name == "catalog":
            add_secret("db-url", env_vars["CATALOG_DB_URL"])
            add_secret("db-password", env_vars["CATALOG_RUNTIME_PASSWORD"])
            add_secret("db-mig-password", env_vars["CATALOG_MIGRATION_PASSWORD"])
            add_secret("workload-secret", env_vars["CATALOG_WORKLOAD_SECRET"])
            add_secret_env("DB_URL", "db-url")
            add_env("DB_USER", "catalog_runtime")
            add_secret_env("DB_PASSWORD", "db-password")
            add_env("DB_MIGRATION_USER", "catalog_migrator")
            add_secret_env("DB_MIGRATION_PASSWORD", "db-mig-password")
            add_secret_env("CATALOG_CURSOR_KEY", "catalog-cursor-key")
            add_env("WORKLOAD_CLIENT_ID", "catalog")
            add_secret_env("WORKLOAD_CLIENT_SECRET", "workload-secret")
            add_env("CATALOG_MEDIA_PROVIDER", env_vars.get("CATALOG_MEDIA_PROVIDER", "cloudinary"))
            add_env("CLOUDINARY_CLOUD_NAME", env_vars.get("CLOUDINARY_CLOUD_NAME", ""))
            add_env("CLOUDINARY_FOLDER", env_vars.get("CLOUDINARY_FOLDER", "smarttravel"))
            if env_vars.get("CLOUDINARY_API_KEY"):
                add_secret("cloudinary-key", env_vars["CLOUDINARY_API_KEY"])
                add_secret_env("CLOUDINARY_API_KEY", "cloudinary-key")
            if env_vars.get("CLOUDINARY_API_SECRET"):
                add_secret("cloudinary-secret", env_vars["CLOUDINARY_API_SECRET"])
                add_secret_env("CLOUDINARY_API_SECRET", "cloudinary-secret")
            add_env("CATALOG_MEDIA_SCANNER_URL", env_vars.get("CATALOG_MEDIA_SCANNER_URL", "http://127.0.0.1:8199"))

        elif name == "community":
            add_secret("mongodb-uri", env_vars["COMMUNITY_MONGODB_URI"])
            add_secret("workload-secret", env_vars["COMMUNITY_WORKLOAD_SECRET"])
            add_secret_env("MONGODB_URI", "mongodb-uri")
            add_env("WORKLOAD_CLIENT_ID", "community")
            add_secret_env("WORKLOAD_CLIENT_SECRET", "workload-secret")

        elif name == "trip":
            add_secret("db-url", env_vars["TRIP_DB_URL"])
            add_secret("db-password", env_vars["TRIP_RUNTIME_PASSWORD"])
            add_secret("db-mig-password", env_vars["TRIP_MIGRATION_PASSWORD"])
            add_secret("workload-secret", env_vars["TRIP_WORKLOAD_SECRET"])
            add_secret_env("DB_URL", "db-url")
            add_env("DB_USER", "trip_runtime")
            add_secret_env("DB_PASSWORD", "db-password")
            add_env("DB_MIGRATION_USER", "trip_migrator")
            add_secret_env("DB_MIGRATION_PASSWORD", "db-mig-password")
            add_env("WORKLOAD_CLIENT_ID", "trip")
            add_secret_env("WORKLOAD_CLIENT_SECRET", "workload-secret")

        elif name == "ingestion":
            add_secret("db-url", env_vars["INGESTION_DB_URL"])
            add_secret("db-password", env_vars["INGESTION_RUNTIME_PASSWORD"])
            add_secret("db-mig-password", env_vars["INGESTION_MIGRATION_PASSWORD"])
            add_secret("workload-secret", env_vars["INGESTION_WORKLOAD_SECRET"])
            add_secret_env("DB_URL", "db-url")
            add_env("DB_USER", "ingestion_runtime")
            add_secret_env("DB_PASSWORD", "db-password")
            add_env("DB_MIGRATION_USER", "ingestion_migrator")
            add_secret_env("DB_MIGRATION_PASSWORD", "db-mig-password")
            add_env("WORKLOAD_CLIENT_ID", "ingestion")
            add_secret_env("WORKLOAD_CLIENT_SECRET", "workload-secret")
            add_env("WORKER_ENABLED", "true")
            add_env("CONNECTOR_ALLOWED_HOSTS", env_vars.get("CONNECTOR_ALLOWED_HOSTS", "none.invalid"))

        elif name == "intelligence":
            add_secret("db-url", env_vars["INTELLIGENCE_DB_URL"])
            add_secret("db-password", env_vars["INTELLIGENCE_RUNTIME_PASSWORD"])
            add_secret("db-mig-password", env_vars["INTELLIGENCE_MIGRATION_PASSWORD"])
            add_secret("workload-secret", env_vars["INTELLIGENCE_WORKLOAD_SECRET"])
            add_secret_env("DB_URL", "db-url")
            add_env("DB_USER", "intelligence_runtime")
            add_secret_env("DB_PASSWORD", "db-password")
            add_env("DB_MIGRATION_USER", "intelligence_migrator")
            add_secret_env("DB_MIGRATION_PASSWORD", "db-mig-password")
            add_env("WORKLOAD_CLIENT_ID", "intelligence")
            add_secret_env("WORKLOAD_CLIENT_SECRET", "workload-secret")
            # Disable 1s legacy ML training poll by default; Hybrid Ranking B/C/F/X works via PostgreSQL.
            add_env("INTELLIGENCE_WORKERS_ENABLED", "false")

    # Scale rules: scale-to-zero (minReplicas=0), HTTP concurrency + optional KEDA RabbitMQ scaler.
    scale_rules: list[dict] = [
        {
            "name": "http-scaler",
            "http": {"metadata": {"concurrentRequests": "20"}},
        }
    ]
    if cloudamqp is not None and name in INBOX_QUEUES:
        add_secret("cloudamqp-url", env_vars["CLOUDAMQP_URL"])
        scale_rules.append(
            {
                "name": "rabbitmq-inbox-scaler",
                "custom": {
                    "type": "rabbitmq",
                    "metadata": {
                        "protocol": "amqp",
                        "queueName": INBOX_QUEUES[name],
                        "mode": "QueueLength",
                        "value": "1",
                    },
                    "auth": [{"secretRef": "cloudamqp-url", "triggerParameter": "host"}],
                },
            }
        )

    volumes = []
    volume_mounts = []
    if name in VOLUME_MOUNTS:
        storage_name, mount_path = VOLUME_MOUNTS[name]
        volumes.append({"name": storage_name, "storageType": "AzureFile", "storageName": storage_name})
        volume_mounts.append({"volumeName": storage_name, "mountPath": mount_path})

    probe_path = "/actuator/health" if is_gateway else "/actuator/health/liveness"
    container: dict = {
        "name": name,
        "image": image,
        "resources": {"cpu": 0.25, "memory": "0.5Gi"},
        "env": envs,
        "probes": [
            {
                "type": "Startup",
                "httpGet": {"path": probe_path, "port": port},
                "initialDelaySeconds": 5,
                "periodSeconds": 3,
                "timeoutSeconds": 3,
                "failureThreshold": 30,
            }
        ],
    }
    if volume_mounts:
        container["volumeMounts"] = volume_mounts

    spec = {
        "location": location,
        "properties": {
            "managedEnvironmentId": managed_env_id,
            "workloadProfileName": "Consumption",
            "configuration": {
                "activeRevisionsMode": "Single",
                "ingress": {
                    "external": is_gateway,
                    "targetPort": port,
                    "transport": "auto",
                    "allowInsecure": not is_gateway,
                },
                "secrets": secrets,
                "registries": registries,
            },
            "template": {
                "containers": [container],
                "scale": {
                    "minReplicas": 0,
                    "maxReplicas": 2 if name in ("gateway", "catalog", "identity") else 1,
                    "cooldownPeriod": 300,
                    "pollingInterval": 60,
                    "rules": scale_rules,
                },
                "volumes": volumes,
            },
        },
    }
    return spec


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy SmartTravel B1 to Azure Container Apps")
    parser.add_argument("--env-file", default=str(ROOT / ".env"))
    parser.add_argument("--rg", default=DEFAULT_RG)
    parser.add_argument("--env-name", default=DEFAULT_ENV)
    parser.add_argument("--location", default=DEFAULT_LOC)
    parser.add_argument("--image-owner", default=DEFAULT_IMAGE_OWNER)
    parser.add_argument("--image-tag", default=DEFAULT_IMAGE_TAG)
    parser.add_argument("--cors-origins", default="")
    parser.add_argument("--ghcr-username", default=os.environ.get("GHCR_USERNAME", ""))
    parser.add_argument("--ghcr-token", default=os.environ.get("GHCR_TOKEN", ""))
    parser.add_argument("--check", action="store_true", help="Validate Azure env and .env readiness without deploying")
    parser.add_argument("--init-cloudamqp", action="store_true", help="Apply SmartTravel exchanges/bindings on CloudAMQP")
    parser.add_argument("--apply", action="store_true", help="Create/update all 7 Azure Container Apps")
    args = parser.parse_args()

    env_vars = load_dotenv(Path(args.env_file))
    cloudamqp = parse_cloudamqp(env_vars["CLOUDAMQP_URL"]) if env_vars.get("CLOUDAMQP_URL", "").strip() else None

    if args.init_cloudamqp:
        init_cloudamqp_topology(env_vars)
        if not args.apply:
            return

    az = find_az()
    managed_env = json.loads(
        run_az(az, ["containerapp", "env", "show", "-g", args.rg, "-n", args.env_name, "-o", "json"], capture=True)
    )
    managed_env_id = managed_env["id"]
    default_domain = managed_env["properties"]["defaultDomain"]
    cors = args.cors_origins.strip() or env_vars.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173")

    print(f"Azure Environment: {args.env_name} ({managed_env['location']}) -> domain *.{default_domain}")
    print(f"CloudAMQP configured: {'YES (' + cloudamqp['host'] + ')' if cloudamqp else 'NO (transport disabled until CLOUDAMQP_URL is set)'}")
    print(f"Image prefix: ghcr.io/{args.image_owner.lower()}/smarttravel-<service>:{args.image_tag}")

    if args.check or not args.apply:
        print("Check complete (no container apps modified). Pass --apply to deploy.")
        return

    if cloudamqp is not None:
        init_cloudamqp_topology(env_vars)

    order = ["identity", "catalog", "community", "trip", "ingestion", "intelligence", "gateway"]
    for name in order:
        image = f"ghcr.io/{args.image_owner.lower()}/smarttravel-{name}:{args.image_tag}"
        spec = build_app_spec(
            name=name,
            env_vars=env_vars,
            image=image,
            managed_env_id=managed_env_id,
            location=managed_env["location"],
            cloudamqp=cloudamqp,
            cors_origins=cors,
            ghcr_username=args.ghcr_username or None,
            ghcr_token=args.ghcr_token or None,
        )
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp:
            json.dump(spec, tmp)
            tmp_path = tmp.name
        try:
            exists = subprocess.run(
                [az, "containerapp", "show", "-g", args.rg, "-n", name, "-o", "none", "--only-show-errors"],
                capture_output=True,
                check=False,
            ).returncode == 0
            verb = "update" if exists else "create"
            print(f"{'Updating' if exists else 'Creating'} Container App `{name}` ({image}) [minReplicas=0, 0.25vCPU/0.5Gi]...")
            run_az(az, ["containerapp", verb, "-g", args.rg, "-n", name, "--yaml", tmp_path, "-o", "none"])
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    gw_fqdn = run_az(
        az,
        ["containerapp", "show", "-g", args.rg, "-n", "gateway", "--query", "properties.configuration.ingress.fqdn", "-o", "tsv"],
        capture=True,
    )
    print(f"\nDeployment complete! Public Gateway URL: https://{gw_fqdn}")
    print(f"Health endpoint: https://{gw_fqdn}/actuator/health")


if __name__ == "__main__":
    main()
