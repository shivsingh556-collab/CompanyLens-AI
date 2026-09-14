import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import server

class WorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        server.DB = Path(cls.directory.name) / 'test.sqlite3'
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.directory.cleanup()

    def payload(self):
        return {'company': 'Example', 'objective': 'Prepare discovery', 'persona': 'BDM', 'evidence': []}

    def post(self, payload, **headers):
        request = Request(self.url + '/api/briefs', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', **headers})
        with urlopen(request) as response:
            return json.load(response)

    def test_no_invented_evidence(self):
        report = server.build_report(self.payload())
        self.assertEqual(report['review_coverage'], 0)
        self.assertEqual(report['evidence'], [])
        self.assertEqual(report['source_count'], 0)

    def test_review_coverage_excludes_hypotheses(self):
        data = self.payload()
        data['evidence'] = [{'claim': 'Reviewed claim', 'url': 'https://example.com/news', 'status': 'reviewed'}, {'claim': 'Pending claim', 'url': 'https://example.com/careers', 'status': 'unreviewed'}, {'claim': 'Needs discovery', 'status': 'hypothesis'}]
        report = server.build_report(data)
        self.assertEqual(report['review_coverage'], 50)
        self.assertEqual(report['hypothesis_count'], 1)

    def test_persistent_roundtrip(self):
        report = self.post(self.payload())
        with urlopen(self.url + '/api/briefs/' + report['id']) as response:
            self.assertEqual(json.load(response), report)
        with server.connection() as conn:
            self.assertEqual(json.loads(conn.execute('SELECT body FROM briefs WHERE id = ?', (report['id'],)).fetchone()[0]), report)

    def test_invalid_inputs_are_rejected(self):
        for change in [{'company': ''}, {'persona': []}, {'evidence': [{}]}, {'website': 'javascript:alert(1)'}, {'evidence': [{'claim': 'Test', 'status': 'reviewed'}]}, {'evidence': [{'claim': 'Test', 'status': 'hypothesis', 'observed_at': '2099-01-01'}]}]:
            with self.subTest(change=change), self.assertRaises(HTTPError) as raised:
                self.post({**self.payload(), **change})
            self.assertEqual(raised.exception.code, 400)

    def test_cross_origin_write_rejected(self):
        with self.assertRaises(HTTPError) as raised:
            self.post(self.payload(), Origin='https://unrelated.example')
        self.assertEqual(raised.exception.code, 403)

    def test_database_is_not_served(self):
        for path in ['/server.py', '/data/companylens.sqlite3', '/../server.py']:
            with self.subTest(path=path), self.assertRaises(HTTPError) as raised:
                urlopen(self.url + path)
            self.assertEqual(raised.exception.code, 404)

if __name__ == '__main__':
    unittest.main()
