import fs from 'fs';
import path from 'path';
import { groupExamEntries, ExamEntry } from '../src/services/jlptLayout';
import type { Exam, ExamQuestion } from '../src/services/jlptService';

function entries(exam: Pick<Exam, 'sections'>): ExamEntry[] {
  return exam.sections
    .flatMap(examSection =>
      examSection.questions.map(examQuestion => ({
        section: examSection,
        question: examQuestion,
      })),
    )
    .map((entry, index) => ({ ...entry, index }));
}
function question(
  number: number,
  passage: string | null,
  images: string[] = [],
  group = 11,
): ExamQuestion {
  return {
    id: `q${number}`,
    number,
    group,
    prompt: '問い',
    instruction: '選んでください',
    passage,
    options: ['一', '二', '三', '四'],
    images: images.map(id => ({
      id,
      image_data_url: id,
      width_px: 100,
      height_px: 100,
    })),
  };
}
function section(id: string, questions: ExamQuestion[]) {
  return { id, label: id, original_label: id, questions };
}

test('keeps separate passages within the same mondai and never groups listening or vocabulary by image', () => {
  const exam = {
    sections: [
      section('language-reading', [
        question(57, '本文A'),
        question(58, '本文A'),
        question(59, '本文B'),
        question(60, '本文B'),
        question(61, '本文B', [], 12),
      ]),
      section('listening', [
        question(1, '同じ文章', ['picture']),
        question(2, '同じ文章', ['picture']),
      ]),
      section('vocabulary', [
        question(1, null, ['page']),
        question(2, null, ['page']),
      ]),
    ],
  };
  expect(
    groupExamEntries(entries(exam)).map(unit =>
      unit.entries.map(e => e.question.id),
    ),
  ).toEqual([
    ['q57', 'q58'],
    ['q59', 'q60'],
    ['q61'],
    ['q1'],
    ['q2'],
    ['q1'],
    ['q2'],
  ]);
});

test('shows a shared information sheet once and keeps a question-specific table separate', () => {
  const units = groupExamEntries(
    entries({
      sections: [
        section('language-reading', [
          question(70, null, ['information', 'applicants'], 14),
          question(71, null, ['information'], 14),
        ]),
      ],
    }),
  );
  expect(units).toHaveLength(1);
  expect(units[0].sharedImages.map(image => image.id)).toEqual(['information']);
  expect([units[0].first, units[0].last]).toEqual([0, 1]);
});

test('groups the real five N2 exams by shared cloze, medium, long and information-search passages', () => {
  const payload = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        '../../backend/jlpt/import_data/n2-2022-2024.json',
      ),
      'utf8',
    ),
  );
  for (const exam of payload.normalized as Exam[]) {
    const units = groupExamEntries(entries(exam));
    const forNumber = (number: number) =>
      units.find(unit =>
        unit.entries.some(
          e =>
            e.section.id === 'language-reading' && e.question.number === number,
        ),
      )!;
    expect(forNumber(48).entries.map(e => e.question.number)).toEqual([
      48, 49, 50, 51,
    ]);
    expect(forNumber(57).entries.map(e => e.question.number)).toEqual([57, 58]);
    expect(forNumber(59)).not.toBe(forNumber(57));
    expect(forNumber(67).entries.map(e => e.question.number)).toEqual([
      67, 68, 69,
    ]);
    expect(forNumber(70).entries.map(e => e.question.number)).toEqual([70, 71]);
    expect(forNumber(70).sharedImages).toHaveLength(1);
    expect(units.flatMap(unit => unit.entries)).toHaveLength(101);
  }
});

test('groups the additional N2 exams using each original reading instead of fixed question numbers', () => {
  const payload = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        '../../backend/jlpt/import_data/n2-more-2020-2025.json',
      ),
      'utf8',
    ),
  );
  for (const exam of payload.normalized as Exam[]) {
    const units = groupExamEntries(entries(exam));
    const language = exam.sections[0].questions;
    const longReading = language.filter(q => q.group === 13);
    const longUnit = units.find(u =>
      u.entries.some(e => e.question.id === longReading[0].id),
    )!;
    expect(longUnit.entries.map(e => e.question.id)).toEqual(
      longReading.map(q => q.id),
    );
    const info = language.filter(q => q.group === 14);
    expect(
      units
        .find(u => u.entries.some(e => e.question.id === info[0].id))!
        .entries.map(e => e.question.id),
    ).toEqual(info.map(q => q.id));
    expect(units.flatMap(u => u.entries)).toHaveLength(language.length + 30);
  }
});
