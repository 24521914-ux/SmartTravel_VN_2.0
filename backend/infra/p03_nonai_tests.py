"""Run P03 tooling regressions without invoking deferred AI quality evaluation."""
from pathlib import Path
import unittest


def suite():
    loader = unittest.TestLoader()
    result = unittest.TestSuite()
    for path in sorted(Path(__file__).parent.glob('test_p03*.py')):
        if path.name != 'test_p03_quality.py':
            result.addTests(loader.loadTestsFromName(path.stem))
    return result


if __name__ == '__main__':
    raise SystemExit(not unittest.TextTestRunner(verbosity=1).run(suite()).wasSuccessful())
