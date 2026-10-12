"""Convert the supplied N4 Anki package to the application's vocabulary schema.

Uses only the standard library. Card templates, scripts and media are not executed.
"""
import argparse
import hashlib
import json
import re
import sqlite3
import tempfile
import zipfile
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


BOOK_ID = "anki-n4"
FIELDS = ("tuVung", "hanViet", "cachDoc", "nghia", "viDu", "viDuDich")
CATEGORIES = {
    "Danh Từ": "名詞", "Động Từ": "動詞", "Tính Từ đuôi (i)": "形容詞（い）",
    "Tính Từ đuôi (na)": "形容詞（な）", "Trợ Từ": "Trợ từ",
    "Trạng Từ": "Trạng từ", "Katakana": "カタカナ",
}


class FieldText(HTMLParser):
    def __init__(self, japanese=False):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.japanese = japanese
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        elif not self.hidden and tag in ("br", "p", "div"):
            self.parts.append("" if self.japanese else " ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_text(value, japanese=False):
    parser = FieldText(japanese)
    parser.feed(value)
    return re.sub(r"\s+", " ", "".join(parser.parts)).strip()


def extract_dataset(package):
    package = Path(package)
    checksum = hashlib.sha256(package.read_bytes()).hexdigest()
    source = {"kind": "user_supplied_anki", "file_name": package.name, "sha256": checksum}
    source_url = f"urn:sha256:{checksum}"
    with zipfile.ZipFile(package) as archive, tempfile.TemporaryDirectory() as directory:
        # Legacy collection.anki2 is a placeholder in this export; prefer anki21.
        member = next((name for name in ("collection.anki21", "collection.anki2")
                       if name in archive.namelist()), None)
        if member is None:
            raise ValueError("No supported SQLite collection in package.")
        database = Path(directory) / "collection.sqlite"
        database.write_bytes(archive.read(member))
        connection = sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)
        try:
            models_json, decks_json = connection.execute("SELECT models, decks FROM col").fetchone()
            models, decks = json.loads(models_json), json.loads(decks_json)
            notes = connection.execute("SELECT id, mid, flds FROM notes ORDER BY id").fetchall()
            cards = connection.execute("SELECT nid, did FROM cards").fetchall()
        finally:
            connection.close()
    memberships = {}
    for note_id, deck_id in cards:
        memberships.setdefault(note_id, set()).add(str(deck_id))
    groups = {category: [] for category in CATEGORIES}
    warnings = []
    for number, (note_id, model_id, raw) in enumerate(notes, 1):
        names = [field["name"] for field in models[str(model_id)]["flds"]]
        values = raw.split("\x1f")
        if len(names) != len(values) or not set(FIELDS).issubset(names):
            raise ValueError(f"Unexpected fields on note {note_id}.")
        fields = dict(zip(names, values))
        deck_ids = memberships.get(note_id, set())
        if len(deck_ids) != 1:
            raise ValueError(f"Expected one source deck for note {note_id}.")
        deck_id = next(iter(deck_ids))
        deck_name = decks[deck_id]["name"]
        category = deck_name.split("::")[-1]
        if category not in groups:
            raise ValueError(f"Unexpected N4 deck: {deck_name}.")
        word = plain_text(fields["tuVung"], True)
        reading = plain_text(fields["cachDoc"], True)
        meaning = plain_text(fields["nghia"])
        reading_method = "anki_field"
        if not reading and re.fullmatch(r"[\u3040-\u30ffー 〜～/／]+", word):
            reading, reading_method = word, "kana_spelling"
        sentence = plain_text(fields["viDu"], True)
        translation = plain_text(fields["viDuDich"])
        if not all((word, reading, meaning, sentence, translation)):
            raise ValueError(f"Missing required content on note {note_id}.")
        item = {
            "id": f"{BOOK_ID}-note-{note_id}", "number": number,
            "word": word, "reading": reading, "meaning_vi": meaning,
            "han_viet": plain_text(fields["hanViet"]) or None,
            "segments": [{"text": word, "reading": reading if reading != word else None}],
            "examples": [{"japanese": sentence, "reading": "", "meaning_vi": translation,
                          "segments": [{"text": sentence, "reading": None}]}],
            "related": [],
            "source": {**source, "note_id": note_id, "deck_id": deck_id,
                       "deck_name": deck_name, "reading_method": reading_method},
        }
        groups[category].append(item)
    if not notes:
        raise ValueError("Empty collection.")
    units = []
    for unit_number, (category, words) in enumerate(groups.items(), 1):
        if not words:
            continue
        lessons = []
        for offset in range(0, len(words), 25):
            lesson_number = offset // 25 + 1
            lessons.append({
                "id": f"{BOOK_ID}-u{unit_number:02d}-l{lesson_number:02d}",
                "unit_number": unit_number, "unit_title": CATEGORIES[category],
                "lesson_number": lesson_number, "title": f"{category} – Bài {lesson_number}",
                "source_url": source_url, "audio_urls": [], "words": words[offset:offset + 25],
            })
        units.append({"number": unit_number, "title": CATEGORIES[category], "lessons": lessons})
    duplicates = Counter((item["word"], item["reading"]) for words in groups.values() for item in words)
    warnings.extend({"word": word, "reading": reading, "count": count,
                     "reason": "repeated_source_notes_preserved"}
                    for (word, reading), count in duplicates.items() if count > 1)
    return {
        "schema_version": 1, "assembled_at": datetime.now(timezone.utc).isoformat(),
        "textbook": {"id": BOOK_ID, "title": "Từ vựng N4", "jlpt_level": "N4", "source_url": source_url},
        "sources": [source], "units": units,
        "counts": {"units": len(units), "lessons": sum(len(unit["lessons"]) for unit in units),
                   "words": len(notes), "examples": len(notes), "related": 0},
        "coverage": {"complete": True, "source_notes": len(notes), "imported_notes": len(notes)},
        "quality_warnings": warnings,
        "source_review": {"proofread": False, "note": "Source text retained; HTML formatting removed. Lessons are app-created groups of up to 25 notes, not textbook chapters."},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apkg", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data/vocabulary/anki-n4.json")
    args = parser.parse_args()
    dataset = extract_dataset(args.apkg)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Saved {args.output}: {dataset['counts']}")


if __name__ == "__main__":
    main()
