"""Seed clearly-labeled demo signals via real Gateway APIs so Recommendation Ranking
(Basic ratings, Popularity, Item-based CF, Context + Open-Meteo Weather) can be demonstrated
end-to-end, AND create an UNLABELED Human Evaluation Benchmark Pool from real DB places.

Rules strictly upheld:
- Never writes directly to another service's DB (uses Gateway HTTP APIs only).
- Never prints passwords or tokens.
- Never pre-fills human relevance grades or uses Hybrid scores to build the labeling pool.
- Never auto-marks any config/artifact as QUALITY_VALIDATED.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GATEWAY = os.environ.get("P02_GATEWAY_URL", "http://127.0.0.1:58080").rstrip("/")


def load_env() -> dict[str, str]:
    env_path = ROOT / os.environ.get("P02_ENV_FILE", ".env")
    values: dict[str, str] = {}
    if env_path.exists():
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
                v = v[1:-1]
            values[k.strip()] = v
    return values


def api(method: str, path: str, body=None, token: str | None = None, headers: dict[str, str] | None = None):
    req_headers = {"Accept": "application/json"}
    if body is not None:
        req_headers["Content-Type"] = "application/json"
    if method in ("POST", "PUT", "PATCH"):
        req_headers["Idempotency-Key"] = str(uuid.uuid4())
    if token:
        req_headers["Authorization"] = f"Bearer {token}"
    if headers:
        req_headers.update(headers)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"{GATEWAY}{path}", data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = {"raw": raw}
        return e.code, parsed


def login(email: str, password: str) -> str:
    st, data = api("POST", "/api/identity/api/v1/auth/login", {"email": email, "password": password})
    if st != 200 or not data.get("access_token"):
        raise RuntimeError(f"Login failed for {email}: HTTP {st}")
    return data["access_token"]


def ensure_demo_user(email: str, display_name: str, password: str) -> str:
    st, data = api("POST", "/api/identity/api/v1/auth/login", {"email": email, "password": password})
    if st == 200 and data.get("access_token"):
        return data["access_token"]
    reg_st, _ = api(
        "POST",
        "/api/identity/api/v1/auth/register",
        {"email": email, "password": password, "display_name": display_name},
    )
    if reg_st not in (200, 201, 202, 409):
        raise RuntimeError(f"Register failed for {email}: HTTP {reg_st}")
    return login(email, password)


def enable_personalization(token: str, category_ids: list[str]):
    st, prefs = api("GET", "/api/identity/api/v1/me/preferences", token=token)
    if st != 200:
        return
    ver = prefs.get("version", 1)
    api(
        "PUT",
        "/api/identity/api/v1/me/preferences",
        {
            "category_ids": category_ids[:2],
            "travel_styles": ["CULTURE", "NATURE"],
            "budget_level": "MEDIUM",
            "personalization_enabled": True,
        },
        token=token,
        headers={"If-Match": f'"{ver}"'},
    )


def main():
    env = load_env()
    pw = env.get("IDENTITY_FIXTURE_PASSWORD")
    if not pw:
        print("Missing IDENTITY_FIXTURE_PASSWORD in .env", file=sys.stderr)
        sys.exit(1)

    admin_token = login("fixture-admin@example.invalid", pw)
    print("Admin login: OK")

    # 1. Fetch real published places & categories from Catalog
    st, cat_res = api("GET", "/api/catalog/api/v1/categories?limit=50")
    categories = cat_res.get("items", []) if st == 200 else []
    cat_ids = [c.get("category_id") or c.get("id") for c in categories if (c.get("category_id") or c.get("id"))]

    st, place_res = api("GET", "/api/catalog/api/v1/places?limit=100")
    places = [
        p for p in (place_res.get("items", []) if st == 200 else [])
        if p.get("latitude") is not None and p.get("longitude") is not None
        and 8.0 <= float(p["latitude"]) <= 24.0
        and 102.0 <= float(p["longitude"]) <= 110.0
    ]
    if len(places) < 12:
        raise RuntimeError(f"Expected >= 12 published Vietnam places in Catalog, got {len(places)}")
    print(f"Found {len(places)} published Vietnam places and {len(cat_ids)} categories.")

    # 2. Prepare 6 consented demo users (fixture-u1, fixture-u2 + 4 demo users)
    user_tokens: list[tuple[str, str]] = []
    for email, name in [
        ("fixture-u1@example.invalid", "Synthetic u1"),
        ("fixture-u2@example.invalid", "Synthetic u2"),
        ("ranking-demo-u1@demo.smarttravel.invalid", "Demo Ranking User 1"),
        ("ranking-demo-u2@demo.smarttravel.invalid", "Demo Ranking User 2"),
        ("ranking-demo-u3@demo.smarttravel.invalid", "Demo Ranking User 3"),
        ("ranking-demo-u4@demo.smarttravel.invalid", "Demo Ranking User 4"),
    ]:
        tok = ensure_demo_user(email, name, pw)
        enable_personalization(tok, cat_ids)
        user_tokens.append((email, tok))
    print(f"Prepared {len(user_tokens)} consented demo users.")

    # 3. Submit & approve real demo reviews on 12 Vietnam places so BasicScorer has valid rating priors
    target_places = places[:12]
    reviews_created = 0
    reviews_approved = 0
    for idx, place in enumerate(target_places):
        pid = place["place_id"]
        # 2-3 reviews per place across demo users with realistic varied ratings (3..5)
        for u_idx in range(min(3, len(user_tokens))):
            _, utok = user_tokens[(idx + u_idx) % len(user_tokens)]
            rating_val = 5 if (idx + u_idx) % 3 == 0 else (4 if (idx + u_idx) % 2 == 0 else 3)
            st_r, r_data = api(
                "POST",
                f"/api/community/api/v1/places/{pid}/reviews",
                {
                    "rating": rating_val,
                    "content": f"[Dữ liệu demo ranking] Trải nghiệm thực tế tại {place.get('name', 'địa điểm')} - đánh giá mẫu #{idx + 1}-{u_idx + 1}.",
                    "media_keys": [],
                },
                token=utok,
            )
            if st_r in (200, 201) and (r_data.get("review_id") or r_data.get("id")):
                reviews_created += 1
                rid = r_data.get("review_id") or r_data.get("id")
                ver = r_data.get("version", 1)
                st_m, _ = api(
                    "POST",
                    f"/api/community/api/v1/admin/reviews/{rid}/moderate",
                    {"action": "APPROVE", "reason": "Demo ranking seed approval"},
                    token=admin_token,
                    headers={"If-Match": f'"{ver}"'},
                )
                if st_m in (200, 202, 204):
                    reviews_approved += 1
    # Also approve any pending demo reviews from previous runs
    st_pr, pr_res = api("GET", "/api/community/api/v1/admin/reviews?status=PENDING&limit=100", token=admin_token)
    if st_pr == 200:
        for rev in pr_res.get("items", []):
            if "[Dữ liệu demo ranking]" in str(rev.get("content", "")):
                rid = rev.get("review_id") or rev.get("id")
                ver = rev.get("version", 1)
                if rid:
                    st_m, _ = api(
                        "POST",
                        f"/api/community/api/v1/admin/reviews/{rid}/moderate",
                        {"action": "APPROVE", "reason": "Demo ranking seed approval"},
                        token=admin_token,
                        headers={"If-Match": f'"{ver}"'},
                    )
                    if st_m in (200, 202, 204):
                        reviews_approved += 1
    print(f"Demo reviews: created={reviews_created}, approved={reviews_approved}")

    # 4. Add overlapping favorites across all 6 users on first 8 places so CF reaches >=5 common users
    fav_places = target_places[:8]
    fav_ok = 0
    for email, utok in user_tokens:
        for place in fav_places:
            st_f, _ = api("PUT", f"/api/community/api/v1/me/favorites/{place['place_id']}", {}, token=utok)
            if st_f in (200, 201, 204):
                fav_ok += 1
    print(f"Demo favorites synced: {fav_ok} calls")

    # 5. Wait briefly for outbox/RabbitMQ propagation, then trigger projection sync + cohort recompute
    time.sleep(3)
    st_s, s_data = api("POST", "/api/intelligence/api/v1/admin/ranking/projections/sync", {}, token=admin_token)
    print(f"Projection sync: HTTP {st_s} -> {s_data.get('status')}")
    time.sleep(5)
    st_c, c_data = api("POST", "/api/intelligence/api/v1/admin/ranking/cohort-snapshots/recompute?windowDays=30&minSample=5", {}, token=admin_token)
    print(f"Cohort recompute: HTTP {st_c} -> sample={c_data.get('global_rating_sample')}, prior={c_data.get('global_rating_prior')}, pop_p95={c_data.get('global_pop_p95')}")

    # 6. Trigger Item-based CF build job (does NOT auto-activate)
    st_cf, cf_data = api("POST", "/api/intelligence/api/v1/admin/ranking/cf/jobs", {"lambda": 10.0, "top_k": 50, "is_demo_fixture": True}, token=admin_token)
    print(f"CF build enqueued: HTTP {st_cf} -> job_id={cf_data.get('job_id')}")

    # 7. Create UNLABELED Human Evaluation Benchmark Pool from real DB places (idempotent check)
    st_ds, ds_list = api("GET", "/api/intelligence/api/v1/admin/ranking/datasets", token=admin_token)
    existing_human_pools = [
        d for d in (ds_list.get("items", []) if st_ds == 200 else [])
        if d.get("provenance_tier") == "HUMAN_LABELED" and "Human Evaluation Benchmark Pool" in str(d.get("name", ""))
    ]
    if existing_human_pools:
        pool = existing_human_pools[0]
        print(f"Existing Human Evaluation Benchmark Pool reused: id={pool.get('eval_dataset_id')}, queries={pool.get('query_count')}, rows={pool.get('row_count')}, labeled={pool.get('labeled_count')}, unlabeled={pool.get('unlabeled_count')}")
    else:
        st_p, p_data = api(
            "POST",
            "/api/intelligence/api/v1/admin/ranking/datasets/create-labeling-pool",
            {"name": "Human Evaluation Benchmark Pool (VN Real Catalog)", "candidates_per_query": 8},
            token=admin_token,
        )
        print(f"Human Labeling Pool created: HTTP {st_p} -> id={p_data.get('eval_dataset_id')}, queries={p_data.get('query_count')}, rows={p_data.get('row_count')}, labeled={p_data.get('labeled_count')}, unlabeled={p_data.get('unlabeled_count')}, splits={p_data.get('split_counts')}")


if __name__ == "__main__":
    main()
