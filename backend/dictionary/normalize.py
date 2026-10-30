"""One search representation for kana, romaji and Vietnamese diacritics."""
import re
import unicodedata


def normalize(value):
    value = unicodedata.normalize('NFKC', value).lower().strip()
    value = ''.join(chr(ord(c) - 0x60) if '\u30a1' <= c <= '\u30f6' else c for c in value)
    value = unicodedata.normalize('NFD', value.replace('đ', 'd'))
    # Strip Latin accents only: Japanese dakuten must remain significant.
    result, latin = [], False
    for char in value:
        if unicodedata.combining(char):
            if not latin:
                result.append(char)
        else:
            latin = 'LATIN' in unicodedata.name(char, '')
            result.append(char)
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', ''.join(result)))


# Hepburn plus common input variants; longest syllable wins.
_ROWS = {
    'a i u e o': 'あ い う え お', 'ka ki ku ke ko': 'か き く け こ',
    'ga gi gu ge go': 'が ぎ ぐ げ ご', 'sa shi su se so': 'さ し す せ そ',
    'za ji zu ze zo': 'ざ じ ず ぜ ぞ', 'ta chi tsu te to': 'た ち つ て と',
    'da di du de do': 'だ ぢ づ で ど', 'na ni nu ne no': 'な に ぬ ね の',
    'ha hi fu he ho': 'は ひ ふ へ ほ', 'ba bi bu be bo': 'ば び ぶ べ ぼ',
    'pa pi pu pe po': 'ぱ ぴ ぷ ぺ ぽ', 'ma mi mu me mo': 'ま み む め も',
    'ya yu yo': 'や ゆ よ', 'ra ri ru re ro': 'ら り る れ ろ',
    'wa wo': 'わ を', 'si ti tu hu zi': 'し ち つ ふ じ',
}
ROMAJI = {r: k for row, kana in _ROWS.items() for r, k in zip(row.split(), kana.split())}
for prefix, kana in [('ky', 'き'), ('gy', 'ぎ'), ('sh', 'し'), ('sy', 'し'),
                     ('ch', 'ち'), ('ty', 'ち'), ('ny', 'に'), ('hy', 'ひ'),
                     ('by', 'び'), ('py', 'ぴ'), ('my', 'み'), ('ry', 'り'), ('j', 'じ'), ('zy', 'じ')]:
    for vowel, suffix in [('a', 'ゃ'), ('u', 'ゅ'), ('o', 'ょ')]:
        ROMAJI[prefix + vowel] = kana + suffix


def romaji_to_kana(value):
    # Do not reinterpret Vietnamese or mixed text as a Japanese reading.
    value = unicodedata.normalize('NFKC', value).lower().strip()
    if not re.fullmatch("[a-z']+", value):
        return None
    result, i = [], 0
    while i < len(value):
        if i + 1 < len(value) and value[i] == value[i + 1] and value[i] not in 'aeioun':
            result.append('っ')
            i += 1
            continue
        if value[i] == 'n' and (i + 1 == len(value) or value[i + 1] not in 'aeiouy'):
            result.append('ん')
            i += 2 if value[i:i + 2] == "n'" else 1
            continue
        for size in (3, 2, 1):
            token = value[i:i + size]
            if token in ROMAJI:
                result.append(ROMAJI[token])
                i += len(token)
                break
        else:
            return None
    return ''.join(result)
