import unittest

from pytest_topology.report import (
    build_execution_report,
    intent_key_from_title,
    map_outcome,
    result_from_test,
)


class ReportTests(unittest.TestCase):
    def test_intent_key_from_title(self) -> None:
        self.assertEqual(intent_key_from_title("AUTH-001: login"), "AUTH-001")
        self.assertEqual(intent_key_from_title("[PAY-010] checkout"), "PAY-010")
        self.assertIsNone(intent_key_from_title("no key here"))

    def test_map_outcome(self) -> None:
        self.assertEqual(map_outcome("passed"), "passed")
        self.assertEqual(map_outcome("failed"), "failed")
        self.assertEqual(map_outcome("skipped"), "skipped")
        self.assertEqual(map_outcome("error"), "error")

    def test_build_execution_report(self) -> None:
        result = result_from_test(
            nodeid="tests/test_auth.py::test_login",
            title="AUTH-001: login",
            outcome="passed",
            duration_ms=12,
        )
        report = build_execution_report(
            [result],
            env={
                "TOPOLOGY_COMMIT_SHA": "abc",
                "TOPOLOGY_BRANCH": "main",
                "CI_PIPELINE_ID": "44",
            },
        )
        self.assertEqual(report["version"], 1)
        self.assertEqual(report["run"]["commitSha"], "abc")
        self.assertEqual(report["run"]["branch"], "main")
        self.assertEqual(report["run"]["externalId"], "44")
        self.assertEqual(report["results"][0]["intentKey"], "AUTH-001")
        self.assertEqual(
            report["results"][0]["externalKey"],
            "tests/test_auth.py::test_login",
        )


if __name__ == "__main__":
    unittest.main()
