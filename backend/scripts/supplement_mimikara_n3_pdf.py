"""Complete N3 from a user-supplied Seko vocabulary PDF, without network requests.

Install requirements-pdf.txt, then pass --pdf. Existing website words are retained.
"""
import argparse
import hashlib
import json
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

if __package__:
    from .crawl_mimikara_n2 import SOURCES, build_dataset, parse_index
else:
    from crawl_mimikara_n2 import SOURCES, build_dataset, parse_index

DATA = Path(__file__).resolve().parents[1] / "data/vocabulary"
PDF_LESSON_RANGES = {
    "mimikara-n3-u03-l05": (299, 310),
    "mimikara-n3-u08-l01": (591, 601),
    "mimikara-n3-u11-l01": (796, 835),
    "mimikara-n3-u11-l02": (836, 845),
    "mimikara-n3-u12-l01": (846, 856),
    "mimikara-n3-u12-l02": (857, 867),
    "mimikara-n3-u12-l03": (868, 876),
    "mimikara-n3-u12-l04": (877, 880),
}


def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def cell_text(words, bounds):
    if bounds is None:
        return None
    x0, y0, x1, y1 = bounds
    lines = {}
    for word in words:
        x, y = (word[0] + word[2]) / 2, (word[1] + word[3]) / 2
        if x0 <= x <= x1 and y0 <= y <= y1:
            lines.setdefault((word[5], word[6]), []).append(word)
    ordered = sorted(lines.values(), key=lambda line: min(word[1] for word in line))
    return "\n".join(" ".join(word[4] for word in sorted(line, key=lambda word: word[0]))
                     for line in ordered)


def extract_rows(pdf):
    import pymupdf

    rows = {}
    with pymupdf.open(pdf) as document:
        page_count = len(document)
        for page in document:
            # The large Seko watermark overlays table cells. Exclude its glyphs,
            # rather than trying to remove Vietnamese substrings from actual data.
            words = [word for word in page.get_text("words") if word[3] - word[1] < 25]
            for table in page.find_tables().tables:
                for row in table.rows:
                    cells = [cell_text(words, bounds) for bounds in row.cells]
                    if not cells or not (cells[0] or "").isdigit():
                        continue
                    number = int(cells[0])
                    if number in rows:
                        raise ValueError(f"Duplicate PDF entry {number}.")
                    rows[number] = {"page": page.number + 1, "cells": cells}
    if set(rows) != set(range(1, 881)):
        raise ValueError("The supplied PDF must contain exactly the numbered entries 1–880.")
    return rows, page_count


def pdf_word(number, row, lesson_id, document_source):
    cells = row["cells"]
    if len(cells) != 7:
        raise ValueError(f"Expected seven columns for PDF entry {number}.")
    _, spelling, reading, han_viet, meaning, sentence, translation = cells
    spelling, reading, meaning = clean(spelling), clean(reading), clean(meaning)
    reading_method = "pdf_reading_column"
    if not reading and re.fullmatch(r"[\u30a0-\u30ff]+", spelling):
        reading, reading_method = spelling, "katakana_spelling"
    if not spelling or not reading or not meaning:
        raise ValueError(f"Missing spelling, reading or meaning for PDF entry {number}.")
    source = {**document_source, "page": row["page"], "reading_method": reading_method}
    sentence = "".join((sentence or "").splitlines()).strip()
    translation = clean(translation)
    if bool(sentence) != bool(translation):
        raise ValueError(f"Unpaired example/translation for PDF entry {number}.")
    examples = []
    if sentence:
        examples.append({"japanese": sentence, "reading": "", "meaning_vi": translation,
                         "segments": [{"text": sentence, "reading": None}]})
    return {
        "id": f"{lesson_id}-w{number:04d}", "number": number,
        "word": spelling, "reading": reading,
        "segments": [{"text": spelling, "reading": reading if reading != spelling else None}],
        "han_viet": clean(han_viet) or None, "meaning_vi": meaning,
        "examples": examples, "related": [], "source": source,
    }


def assemble_dataset(base, index, rows, document_source):
    if base["textbook"]["jlpt_level"] != "N3":
        raise ValueError("Only an N3 base dataset is supported.")
    lessons = {lesson["id"]: lesson for unit in base["units"] for lesson in unit["lessons"]}
    supplied_lessons = []
    for metadata in index:
        lesson_id = metadata["id"]
        if lesson_id in lessons:
            continue
        if lesson_id not in PDF_LESSON_RANGES:
            raise ValueError(f"No reviewed PDF range for lesson {lesson_id}.")
        first, last = PDF_LESSON_RANGES[lesson_id]
        words = [pdf_word(number, rows[number], lesson_id, document_source)
                 for number in range(first, last + 1)]
        pages = sorted({word["source"]["page"] for word in words})
        lessons[lesson_id] = {
            **metadata,
            "source_url": f"urn:sha256:{document_source['sha256']}#page={pages[0]}",
            "reference_url": metadata["source_url"], "source_pages": pages,
            "audio_urls": [], "words": words,
        }
        supplied_lessons.append(lessons[lesson_id])
    if set(lessons) != {lesson["id"] for lesson in index}:
        raise ValueError("The base dataset/index contains unexpected lesson IDs.")
    ordered = sorted(lessons.values(), key=lambda lesson: (lesson["unit_number"], lesson["lesson_number"]))
    dataset = build_dataset(ordered, "N3")
    numbers = sorted(word["number"] for lesson in ordered for word in lesson["words"])
    if numbers != list(range(1, 881)):
        raise ValueError("Combined dataset must contain each entry 1–880 exactly once.")
    dataset["crawled_at"] = base["crawled_at"]
    dataset["assembled_at"] = datetime.now(timezone.utc).isoformat()
    dataset["sources"] = [{"kind": "website", "url": SOURCES["N3"]}, document_source]
    dataset["coverage"] = {
        "complete": True, "expected_lessons": len(index), "assembled_lessons": len(ordered),
        "crawled_lessons": len(ordered) - len(supplied_lessons),
        "supplied_document_lessons": len(supplied_lessons),
        "supplied_document_words": sum(len(lesson["words"]) for lesson in supplied_lessons),
        "failures": [],
    }
    dataset["quality_warnings"].extend({
        "word_id": word["id"], "field": "examples", "reason": "missing_from_supplied_pdf",
    } for lesson in supplied_lessons for word in lesson["words"] if not word["examples"])
    dataset["source_review"] = {
        "pdf_examples": "verbatim; only layout line breaks removed",
        "proofread": False,
        "note": "The supplied PDF contains typographical errors; examples were not silently corrected.",
    }
    return dataset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--base", type=Path, default=DATA / "mimikara-n3.partial.json")
    parser.add_argument("--output", type=Path, default=DATA / "mimikara-n3.json")
    parser.add_argument("--index-html", type=Path)
    args = parser.parse_args()
    index_file = args.index_html or (Path(tempfile.gettempdir()) / "datn-mimikara-n3-cache" /
                                    (hashlib.sha256(SOURCES["N3"].encode()).hexdigest() + ".html"))
    document_source = {
        "kind": "user_supplied_pdf", "file_name": args.pdf.name,
        "sha256": hashlib.sha256(args.pdf.read_bytes()).hexdigest(),
    }
    rows, page_count = extract_rows(args.pdf)
    document_source["page_count"] = page_count
    dataset = assemble_dataset(json.loads(args.base.read_text(encoding="utf-8")),
                               parse_index(index_file.read_text(encoding="utf-8"), "N3"),
                               rows, document_source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Saved {args.output}: {dataset['counts']}; warnings: {len(dataset['quality_warnings'])}")


if __name__ == "__main__":
    main()
