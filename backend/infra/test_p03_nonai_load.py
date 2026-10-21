"""Safety and allocation tests independent from Docker and private fixtures."""
import unittest
from unittest.mock import Mock, patch
from p03_nonai_load import validate_project, validate_mounts, traffic_class, summarize, load
from collections import Counter


class NonAiLoadTests(unittest.TestCase):
    def test_mix_exact_at_pacing_scale(self):
        counts = Counter(traffic_class(i) for i in range(1200))
        self.assertEqual(counts, {'catalog_read':750,'trip_read':225,'authenticated_write':225})
        self.assertNotIn('basic_recommendation',counts)

    def test_reject_shared_project(self):
        for project in ('smarttravel-p02','smarttravel-p03-load','other','smarttravel-p03-load-../x'):
            with self.assertRaises(ValueError): validate_project(project)

    def test_mount_isolation(self):
        project = 'smarttravel-p03-load-12345678'
        item = {'Config':{'Labels':{'com.docker.compose.project':project}},
                'Mounts':[{'RW':True,'Type':'volume','Name':project+'_identity-data'}]}
        validate_mounts(project,[item])
        item['Mounts'][0]['Name'] = 'smarttravel-p02_identity-data'
        with self.assertRaises(ValueError): validate_mounts(project,[item])
        item['Mounts'] = [{'RW':True,'Type':'bind','Source':'D:/data'}]
        with self.assertRaises(ValueError): validate_mounts(project,[item])
        item['Mounts'][0]['RW'] = False
        validate_mounts(project,[item])

    def test_empty_and_wrong_label_rejected(self):
        with self.assertRaises(ValueError): validate_mounts('smarttravel-p03-load-12345678',[])
        with self.assertRaises(ValueError): validate_mounts('smarttravel-p03-load-12345678',[{'Config':{'Labels':{}}}])

    def test_errors_cannot_hide_in_percentile(self):
        report = summarize([(200,2),(200,3),(500,1),(0,1)])
        self.assertEqual(report['errors'],2)
        self.assertEqual(report['error_rate'],.5)
        self.assertEqual(report['status_counts'],{'200':2,'500':1,'0':1})
        self.assertEqual(report['p95_ms'],3)

    def test_wrong_gateway_rejected_before_http_or_counts(self):
        env = Mock()
        env.compose.return_value = '127.0.0.1:59080'
        with patch('p03_nonai_load.request') as http, patch('p03_nonai_load.counts') as counts:
            with self.assertRaises(ValueError): load(env,'http://127.0.0.1:58080',60)
            http.assert_not_called()
            counts.assert_not_called()


if __name__ == '__main__': unittest.main()
