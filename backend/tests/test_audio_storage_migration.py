import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from botocore.exceptions import ClientError

from speaking.storage_migration import transfer


class MemoryStorage:
    def __init__(self):
        self.objects = {}
        self.writes = 0

    def head_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise ClientError({'Error': {'Code': '404'}}, 'HeadObject')
        return {'ContentLength': len(self.objects[Key])}

    def put_object(self, *, Bucket, Key, Body, **kwargs):
        self.objects[Key] = Body.read()
        self.writes += 1

    def get_object(self, *, Bucket, Key):
        return {'Body': io.BytesIO(self.objects[Key])}


class AudioStorageMigrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.key = 'sessions/' + 'a' * 36 + '/' + 'b' * 36 + '.wav'
        self.path = self.root / self.key
        self.path.parent.mkdir(parents=True)
        self.path.write_bytes(b'original recording')
        self.asset = SimpleNamespace(storage_key=self.key, size_bytes=self.path.stat().st_size)
        self.storage = MemoryStorage()

    def test_copies_once_verifies_bytes_and_keeps_original(self):
        result = transfer(self.storage, 'test', self.root, [self.asset], copy=True)
        self.assertEqual(result['verified'], 1)
        self.assertEqual(self.storage.objects[self.key], self.path.read_bytes())
        self.assertTrue(self.path.exists())
        result = transfer(self.storage, 'test', self.root, [self.asset], copy=True)
        self.assertEqual(result['copied'], 0)
        self.assertEqual(self.storage.writes, 1)

    def test_verify_only_never_uploads(self):
        with self.assertRaisesRegex(ValueError, 'not yet copied'):
            transfer(self.storage, 'test', self.root, [self.asset])
        self.assertEqual(self.storage.writes, 0)

    def test_equal_size_corruption_is_detected_without_overwriting(self):
        self.storage.objects[self.key] = b'X' * self.asset.size_bytes
        with self.assertRaisesRegex(ValueError, 'checksum differs'):
            transfer(self.storage, 'test', self.root, [self.asset], copy=True)
        self.assertEqual(self.storage.writes, 0)
        self.assertEqual(self.path.read_bytes(), b'original recording')

    def test_missing_local_data_and_unsafe_keys_fail_before_upload(self):
        self.path.unlink()
        with self.assertRaisesRegex(ValueError, 'missing'):
            transfer(self.storage, 'test', self.root, [self.asset], copy=True)
        self.asset.storage_key = '../outside.wav'
        with self.assertRaisesRegex(ValueError, 'Invalid recording key'):
            transfer(self.storage, 'test', self.root, [self.asset], copy=True)
        self.assertEqual(self.storage.writes, 0)
