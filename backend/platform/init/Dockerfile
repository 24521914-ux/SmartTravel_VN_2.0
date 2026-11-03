# platform-tools: one-shot init jobs for the local stack (docker compose).
#   key-init:   python identity_keys.py   (run as root to own the key volume for UID 10001)
#   rabbit-init: python broker_topology.py (mount backend/contracts at /contracts:ro)
# No secrets are baked in; every credential comes from the environment.
FROM python:3.12-slim
WORKDIR /tools
RUN pip install --no-cache-dir cryptography==46.0.3
COPY broker_topology.py identity_keys.py /tools/
USER 10001:10001
CMD ["python", "broker_topology.py"]
