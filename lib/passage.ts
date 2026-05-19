import fs from 'fs';

export interface PassageInfo {
  bookName: string;    // "1 Peter"
  bookSafe: string;    // "1_Peter"
  passageCode: string; // "1Pet1.13-16"  — used in folder names
  passageName: string; // "1_Peter_1_13-16" — used in file names
}

const ABBREVS: Record<string, string> = {
  'genesis': 'Gen', 'exodus': 'Exod', 'leviticus': 'Lev', 'numbers': 'Num',
  'deuteronomy': 'Deut', 'joshua': 'Josh', 'judges': 'Judg', 'ruth': 'Ruth',
  '1 samuel': '1Sam', '2 samuel': '2Sam', '1 kings': '1Kgs', '2 kings': '2Kgs',
  '1 chronicles': '1Chr', '2 chronicles': '2Chr', 'ezra': 'Ezra', 'nehemiah': 'Neh',
  'esther': 'Esth', 'job': 'Job', 'psalms': 'Ps', 'psalm': 'Ps', 'proverbs': 'Prov',
  'ecclesiastes': 'Eccl', 'song of solomon': 'Song', 'song of songs': 'Song',
  'isaiah': 'Isa', 'jeremiah': 'Jer', 'lamentations': 'Lam', 'ezekiel': 'Ezek',
  'daniel': 'Dan', 'hosea': 'Hos', 'joel': 'Joel', 'amos': 'Amos', 'obadiah': 'Obad',
  'jonah': 'Jonah', 'micah': 'Mic', 'nahum': 'Nah', 'habakkuk': 'Hab',
  'zephaniah': 'Zeph', 'haggai': 'Hag', 'zechariah': 'Zech', 'malachi': 'Mal',
  'matthew': 'Matt', 'mark': 'Mark', 'luke': 'Luke', 'john': 'John', 'acts': 'Acts',
  'romans': 'Rom', '1 corinthians': '1Cor', '2 corinthians': '2Cor',
  'galatians': 'Gal', 'ephesians': 'Eph', 'philippians': 'Phil', 'colossians': 'Col',
  '1 thessalonians': '1Thess', '2 thessalonians': '2Thess',
  '1 timothy': '1Tim', '2 timothy': '2Tim', 'titus': 'Titus', 'philemon': 'Phlm',
  'hebrews': 'Heb', 'james': 'Jas', '1 peter': '1Pet', '2 peter': '2Pet',
  '1 john': '1Jn', '2 john': '2Jn', '3 john': '3Jn', 'jude': 'Jude',
  'revelation': 'Rev', 'revelations': 'Rev',
};

export function normalizePassage(passage: string): PassageInfo {
  const m = passage.trim().match(/^(.+?)\s+(\d+):(\d+(?:-\d+)?)$/);
  if (!m) throw new Error(`Cannot parse passage: "${passage}"`);
  const [, bookName, chapter, verseRange] = m;
  const abbrev = ABBREVS[bookName.toLowerCase()] ?? bookName.replace(/\s+/g, '');
  const bookSafe = bookName.replace(/\s+/g, '_');
  return {
    bookName,
    bookSafe,
    passageCode: `${abbrev}${chapter}.${verseRange}`,
    passageName: `${bookSafe}_${chapter}_${verseRange}`,
  };
}

// Returns the next available version number for a file matching baseFilename in folder
export function nextVersion(folder: string, baseFilename: string): number {
  if (!fs.existsSync(folder)) return 1;
  const files = fs.readdirSync(folder);
  const escaped = baseFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}_v(\\d+)\\.md$`);
  let max = 0;
  for (const f of files) {
    const match = f.match(re);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max + 1;
}

// Builds the full vault folder path and versioned filename for a synthesis or research file
export function buildVaultPath(
  vaultRoot: string,
  bookName: string,
  sessionNumber: string,
  passageCode: string,
  passageName: string,
  type: 'Synthesis' | 'Sermon_Research',
): { folder: string; filename: string; fullPath: string } {
  const folder = `${vaultRoot}/Bible Book Studies/${bookName}/Session-${sessionNumber}_${passageCode}`;
  const base = `${sessionNumber}.${passageName}_${type}_Session_${sessionNumber}`;
  const v = nextVersion(folder, base);
  const filename = `${base}_v${v}.md`;
  return { folder, filename, fullPath: `${folder}/${filename}` };
}
