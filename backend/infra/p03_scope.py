"""Explicit P03 acceptance scopes; full acceptance remains the default."""
from copy import deepcopy

SCOPES = ('full', 'non-ai')
DEFERRED_COMPONENTS = frozenset({'F05', 'F08', 'ml', 'quality', 'admin_data_model'})
NON_AI_E2E_CASES = frozenset({'F01', 'F02', 'F03', 'F04', 'F06', 'F07', 'F09', 'F10', 'F11',
                              'business', 'import'})


def validate_scope(scope):
    if scope not in SCOPES:
        raise ValueError('Unknown P03 scope')
    return scope


def load_profile(profile, scope='full'):
    """Preserve frozen throughput/dataset/latency targets; redistribute AI traffic."""
    validate_scope(scope)
    result = deepcopy(profile)
    if scope == 'non-ai':
        mix = result['mix']
        mix.pop('basic_recommendation')
        remaining = sum(mix.values())
        result['mix'] = {name: fraction / remaining for name, fraction in mix.items()}
        result.pop('interactions', None)
    return result


def quality_deferred(report):
    components = report.get('deferred_components')
    return (report.get('status') == 'DEFERRED'
            and isinstance(components, list)
            and all(isinstance(value, str) for value in components)
            and len(components) == len(DEFERRED_COMPONENTS)
            and set(components) == DEFERRED_COMPONENTS
            and isinstance(report.get('reason'), str) and bool(report['reason'].strip()))
