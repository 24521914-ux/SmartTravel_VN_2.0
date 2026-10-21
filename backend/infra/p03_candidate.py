"""Bind P03 evidence to exact source bytes, including uncommitted source files.

The manifest deliberately excludes local credentials, evidence and build outputs.
It does not depend on Git's index, timestamps, platform path separators or checkout
location. Callers must treat an unreadable file or an escaping symlink as failure.
"""
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_IGNORED_DIRS = {'.git', '.local', '__pycache__', 'target', 'node_modules',
                 'dist', 'build', '.vite', 'coverage', '.pytest_cache'}
_SECRET_SUFFIXES = {'.pem', '.key', '.p12', '.pfx', '.jks', '.keystore'}
_OUTPUT_SUFFIXES = {'.pyc', '.pyo', '.class', '.jar', '.war', '.log', '.tmp'}
_CONFIG_SUFFIXES = {'.py', '.java', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
                    '.sh', '.cmd', '.bat', '.ps1', '.sql', '.json', '.xml', '.yaml',
                    '.yml', '.properties', '.conf', '.toml', '.ini', '.cfg'}


def _excluded(path):
    name = path.name.lower()
    return (name == '.env' or name.startswith('.env.')
            or name in {'credentials', 'credentials.json', 'secrets.json'}
            or path.suffix.lower() in _SECRET_SUFFIXES | _OUTPUT_SUFFIXES)


def _selected(path):
    """Explicit application roots plus source/config used to build and verify them."""
    parts = path.parts
    name = path.name
    if parts[:2] == ('backend', 'contracts'):
        return True
    if parts[:2] == ('backend', 'services'):
        return ('src' in parts[2:] or name in {'pom.xml', 'Dockerfile', '.dockerignore'}
                or path.suffix.lower() in {'.py', '.sh', '.cmd', '.ps1'})
    if parts[:3] == ('backend', 'platform', 'api-gateway'):
        return 'src' in parts[3:] or name in {'pom.xml', 'Dockerfile', '.dockerignore'}
    if parts[:2] in {('backend', 'infra'), ('backend', 'platform')}:
        return (path.suffix.lower() in _CONFIG_SUFFIXES
                or name in {'Dockerfile', '.dockerignore', 'requirements-validation.txt'})
    if parts[:2] == ('backend', '.mvn'):
        return True
    if path.as_posix() in {'backend/mvnw', 'backend/mvnw.cmd', 'backend/pom.xml'}:
        return True
    if path.as_posix() == 'docs/operations/p03-non-ai-runbook.md':
        return True
    if parts[:2] == ('.github', 'workflows'):
        return path.suffix.lower() in {'.yml', '.yaml'}
    if parts[0] == 'plan':
        # Freeze acceptance policy, while allowing measured progress/status notes
        # to be written after an exercise without changing application identity.
        return path.as_posix() in {'plan/P00-DECISIONS.md', 'plan/P00-POLICIES.md',
                                  'plan/02-source-mapping.md', 'plan/04-api-events.md',
                                  'plan/phases/P03-non-ai-execution.md'}
    if parts[0] == 'frontend':
        return (len(parts) > 2 and parts[1] in {'src', 'scripts'} or
                len(parts) == 2 and (name == 'index.html' or
                    name.startswith('package') and name.endswith('.json') or
                    name.startswith('tsconfig') and name.endswith('.json') or
                    name.startswith('vite.config.')))
    return False


def _scan_error(error):
    raise error


def candidate_manifest(root=ROOT):
    """Return {'sha256': digest, 'files': {POSIX relative path: file digest}}.

    The outer digest is SHA256 over UTF-8 canonical JSON of the sorted files map
    (sort_keys=True, separators=(',', ':'), ensure_ascii=True). No file content is
    exposed. Missing optional roots are allowed; additions/deletions change the
    digest. Source symlinks are rejected rather than following mutable targets.
    """
    root = Path(root).resolve(strict=True)
    files = {}
    roots = ['backend/services', 'backend/platform', 'backend/contracts',
             'backend/infra', 'backend/.mvn', 'frontend', '.github/workflows', 'plan']
    candidates = [root / 'backend' / name for name in ('mvnw', 'mvnw.cmd', 'pom.xml')]
    candidates.append(root / 'docs/operations/p03-non-ai-runbook.md')
    for relative in roots:
        base = root / relative
        if base.is_symlink():
            raise ValueError('Candidate source roots must not be symlinks')
        if not base.exists():
            continue
        for current, dirs, names in os.walk(base, followlinks=False, onerror=_scan_error):
            dirs[:] = sorted(d for d in dirs if d.lower() not in _IGNORED_DIRS)
            for directory in dirs:
                if (Path(current) / directory).is_symlink():
                    raise ValueError('Candidate source directories must not be symlinks')
            candidates.extend(Path(current) / name for name in names)
    for path in candidates:
        relative = path.relative_to(root)
        if _excluded(relative) or not _selected(relative):
            continue
        if path.is_symlink():
            raise ValueError('Candidate source files must not be symlinks')
        if path.is_file():
            files[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    files = dict(sorted(files.items()))
    canonical = json.dumps(files, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    return {'sha256': hashlib.sha256(canonical.encode('utf-8')).hexdigest(), 'files': files}


def candidate_matches(report, root=ROOT):
    """Fail closed if report lacks the current complete candidate fingerprint."""
    if not isinstance(report, dict):
        return False
    try:
        manifest = candidate_manifest(root)
        return bool(manifest['files']) and report.get('candidate_sha256') == manifest['sha256']
    except (OSError, ValueError):
        return False
