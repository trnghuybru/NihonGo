import copy
import json
import unittest

from sqlalchemy import func, select

import test_speaking as fixtures
from extensions import db
from video_examples import init_video_examples
from video_examples.importer import DEFAULT_SOURCE, import_dataset
from video_examples.models import CaptionSegment, ExampleVideo

PATH = "/api/vocabulary/video-examples"


class VideoExamplesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SpeakingTests.setUpClass.__func__(cls)
        init_video_examples(cls.app)

    tearDownClass = classmethod(fixtures.SpeakingTests.tearDownClass.__func__)
    setUp = fixtures.SpeakingTests.setUp
    tearDown = fixtures.SpeakingTests.tearDown
    scenario = fixtures.SpeakingTests.scenario
    get = fixtures.SpeakingTests.get

    def dataset(self):
        return json.loads(DEFAULT_SOURCE.read_text(encoding="utf-8"))

    def test_real_snapshot_searches_with_video_and_timestamp(self):
        result = import_dataset(self.dataset())
        self.assertEqual(result["segments"], 327)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(ExampleVideo)), 1)
        for query, count, start in (("社会", 13, 60.75), ("日本", 11, 102.73), ("人生", 4, 727.27)):
            result = self.get(PATH, query_string={"q": query}).json
            self.assertEqual(len(result["items"]), count)
            self.assertFalse(result["has_more"])
            self.assertEqual(result["items"][0]["start_seconds"], start)
            self.assertEqual(result["items"][0]["video"]["youtube_id"], "cjtmDEG-B7U")
            self.assertIn(f"&t={int(start)}s", result["items"][0]["watch_url"])

    def test_requires_auth_and_rejects_invalid_queries(self):
        self.assertEqual(self.client.get(PATH + "?q=社会").status_code, 401)
        for args in ({"q": ""}, {"q": "a" * 101}, {"q": "社会", "page_size": "x"},
                     {"q": "社会", "page_size": 0}, {"q": "社会", "page_size": 41},
                     {"q": "社会", "after": "invalid"}, {"q": "\x00"}):
            self.assertEqual(self.get(PATH, query_string=args).status_code, 400)

    def test_cursor_pagination_has_no_duplicates_and_is_bound_to_query(self):
        import_dataset(self.dataset())
        first = self.get(PATH, query_string={"q": "社会", "page_size": 2}).json
        self.assertTrue(first["has_more"])
        self.assertEqual(self.get(PATH, query_string={"q": "日本", "after": first["next_cursor"]}).status_code, 400)
        items, result = list(first["items"]), first
        while result["has_more"]:
            result = self.get(PATH, query_string={"q": "社会", "page_size": 2, "after": result["next_cursor"]}).json
            items.extend(result["items"])
        self.assertEqual(len(items), 13)
        self.assertEqual(len({item["id"] for item in items}), 13)
        self.assertIsNone(result["next_cursor"])

    def test_literal_wildcards_nfkc_and_no_implicit_lemma_expansion(self):
        dataset = self.dataset()
        dataset["segments"] = dataset["segments"][:1]
        dataset["segment_count"] = 1
        dataset["segments"][0]["text"] = "パンを食べます。 １００％＿テスト\\"
        import_dataset(dataset)
        for query in ("パン", "１００", "100", "%", "_", "\\"):
            self.assertEqual(len(self.get(PATH, query_string={"q": query}).json["items"]), 1)
        for query in ("食べる", "not-in-video", "%不存在"):
            self.assertEqual(self.get(PATH, query_string={"q": query}).json["items"], [])

    def test_reimport_updates_and_replaces_snapshot_without_duplicates(self):
        dataset = self.dataset()
        import_dataset(dataset)
        import_dataset(dataset)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(CaptionSegment)), 327)
        dataset["segments"] = dataset["segments"][:1]
        dataset["segment_count"] = 1
        dataset["video"]["title"] = "Updated title"
        dataset["segments"][0]["text"] = "新しい例文。"
        import_dataset(dataset)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(CaptionSegment)), 1)
        self.assertEqual(self.get(PATH, query_string={"q": "新しい"}).json["items"][0]["video"]["title"], "Updated title")

    def test_invalid_import_preserves_existing_snapshot(self):
        dataset = self.dataset()
        import_dataset(dataset)
        for mutate in (
            lambda d: d.update(segment_count=1),
            lambda d: d["segments"][-1].update(start_seconds=float("nan")),
            lambda d: d["segments"][1].update(sequence=1),
            lambda d: d["video"].update(youtube_id="invalid"),
        ):
            invalid = copy.deepcopy(dataset)
            mutate(invalid)
            with self.assertRaises(ValueError):
                import_dataset(invalid)
        self.assertEqual(db.session.scalar(select(func.count()).select_from(CaptionSegment)), 327)
