import unittest
from app import app

class TestFlaskEndpoints(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_index_health_check(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "Voice AI Backend")

if __name__ == "__main__":
    unittest.main()

