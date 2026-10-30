import type { CardDraft } from '../services/flashcardService';

export const MAX_IMPORT_CHARACTERS = 500000;
export type ImportOptions = {
  fieldSeparator: string;
  cardSeparator: string;
  skipHeader: boolean;
};
export type ImportResult = { cards: CardDraft[]; errors: string[] };

/** Delimited text, including CSV quotes, escaped quotes and multiline fields. */
export function parseFlashcardImport(
  text: string,
  options: ImportOptions,
): ImportResult {
  const { fieldSeparator, skipHeader } = options;
  const cardSeparator = options.cardSeparator.replace(/\r\n?/g, '\n');
  const errors: string[] = [];
  const cards: CardDraft[] = [];
  if (!text.trim()) return { cards, errors };
  if (text.length > MAX_IMPORT_CHARACTERS)
    return {
      cards,
      errors: ['Nội dung quá dài. Chỉ nhập tối đa 100 thẻ mỗi lần.'],
    };
  if (
    !fieldSeparator ||
    !cardSeparator ||
    fieldSeparator.includes(cardSeparator) ||
    cardSeparator.includes(fieldSeparator) ||
    fieldSeparator.includes('"') ||
    cardSeparator.includes('"') ||
    fieldSeparator.length > 8 ||
    cardSeparator.length > 8
  ) {
    return {
      cards,
      errors: [
        'Chọn hai dấu phân cách khác nhau, dài từ 1–8 ký tự và không chứa dấu ngoặc kép.',
      ],
    };
  }
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  let row = 0;
  const finishField = () => {
    fields.push(field.trim());
    field = '';
    closedQuote = false;
  };
  const finishRow = () => {
    finishField();
    row += 1;
    if (!(skipHeader && row === 1) && fields.some(value => value)) {
      if (fields.length !== 2 && fields.length !== 3)
        errors.push(`Dòng ${row}: cần 2 hoặc 3 cột.`);
      else {
        const front = fields[0];
        const reading = fields.length === 3 ? fields[1] : '';
        const back = fields[fields.length - 1];
        if (!front || !back) errors.push(`Dòng ${row}: thiếu từ hoặc nghĩa.`);
        else if (
          front.length > 100 ||
          reading.length > 100 ||
          back.length > 2000
        )
          errors.push(
            `Dòng ${row}: từ/cách đọc tối đa 100 ký tự, nghĩa tối đa 2.000 ký tự.`,
          );
        else cards.push({ front, reading, back });
      }
    }
    fields = [];
  };
  for (let index = 0; index < source.length; ) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        closedQuote = true;
      } else field += character;
      index += 1;
    } else if (source.startsWith(cardSeparator, index)) {
      finishRow();
      index += cardSeparator.length;
    } else if (source.startsWith(fieldSeparator, index)) {
      finishField();
      index += fieldSeparator.length;
    } else if (character === '"') {
      if (field.trim() || closedQuote)
        return {
          cards: [],
          errors: [`Dòng ${row + 1}: dấu ngoặc kép không hợp lệ.`],
        };
      field = '';
      quoted = true;
      index += 1;
    } else {
      if (closedQuote && character.trim())
        return {
          cards: [],
          errors: [`Dòng ${row + 1}: có ký tự sau dấu ngoặc kép đóng.`],
        };
      field += character;
      index += 1;
    }
    if (cards.length > 100 || errors.length > 100)
      return {
        cards: [],
        errors: ['Mỗi bộ tối đa 100 thẻ. Hãy chia nhỏ dữ liệu nhập.'],
      };
  }
  if (quoted)
    return { cards: [], errors: [`Dòng ${row + 1}: chưa đóng dấu ngoặc kép.`] };
  finishRow();
  if (cards.length > 100)
    return {
      cards: [],
      errors: ['Mỗi bộ tối đa 100 thẻ. Hãy chia nhỏ dữ liệu nhập.'],
    };
  return { cards, errors };
}
