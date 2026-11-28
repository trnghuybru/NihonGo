import type { ExamQuestion, ExamSection } from './jlptService';

export type ExamEntry = {
  section: ExamSection;
  question: ExamQuestion;
  index: number;
};

export type ExamUnit = {
  entries: ExamEntry[];
  first: number;
  last: number;
  sharedImages: ExamQuestion['images'];
};

// A mondai can contain several unrelated reading passages. Keep each passage and
// its own questions together; a shared information sheet also forms one unit.
export function groupExamEntries(entries: ExamEntry[]): ExamUnit[] {
  const units: ExamUnit[] = [];
  for (const entry of entries) {
    const previous = units[units.length - 1];
    const anchor = previous?.entries[0];
    const passage = entry.question.passage?.trim();
    const anchorPassage = anchor?.question.passage?.trim();
    const sharedImages = anchor
      ? previous.sharedImages.filter(image =>
          entry.question.images.some(other => other.id === image.id),
        )
      : [];
    const join =
      anchor &&
      entry.section.id.includes('reading') &&
      anchor.section.id === entry.section.id &&
      anchor.question.group === entry.question.group &&
      ((passage && passage === anchorPassage) ||
        (!passage && !anchorPassage && sharedImages.length > 0));
    if (join) {
      previous.entries.push(entry);
      previous.last = entry.index;
      previous.sharedImages = sharedImages;
    } else {
      units.push({
        entries: [entry],
        first: entry.index,
        last: entry.index,
        sharedImages: entry.question.images,
      });
    }
  }
  return units.map(unit => ({
    ...unit,
    sharedImages: unit.entries.length > 1 ? unit.sharedImages : [],
  }));
}
