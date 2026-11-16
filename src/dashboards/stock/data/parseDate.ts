// Sequence-aware date resolver for the Dankuni & Chennai stock workbooks.
//
// In the Dankuni workbook, days 1..12 of each month were entered in a US-locale sheet and
// formatted as `04-01-2026`..`04-12-2026` (`MM-DD-YYYY`), whereas days 13..31 are literal
// strings `"13-04-2026"`..`"30-04-2026"` (`DD-MM-YYYY`). In Chennai, all dates are `DD-MM-YYYY`.
// Some B2C tabs also carry month-word headers (`13-June-2026`, `4-Jul-2026`) or impossible
// calendar dates (`31-11-2026`). `resolveHeaderDates` resolves every column accurately by
// scoring ambiguous `A-B-YYYY` headers against their unambiguous neighbours.

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  mat: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12) return null;
  const maxD = daysInMonth(year, month);
  const clampedDay = Math.min(Math.max(1, day), maxD);
  return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function diffDaysIso(isoA: string, isoB: string): number {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDaysIso(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export interface ResolvedHeaderDate {
  col: number;
  text: string;
  iso: string | null;
}

export function resolveHeaderDates(
  headers: readonly string[],
  firstDateCol: number,
): ResolvedHeaderDate[] {
  interface InternalCol {
    col: number;
    text: string;
    iso: string | null;
    candidates: [string, string] | null;
  }

  const parsed: InternalCol[] = [];
  for (let c = firstDateCol; c < headers.length; c++) {
    const text = String(headers[c] ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) {
      parsed.push({ col: c, text, iso: null, candidates: null });
      continue;
    }

    const wordMatch = /\b(\d{1,2})[-\s/]+([A-Za-z]{3,9})[-\s/]+(\d{2,4})\b/.exec(text);
    if (wordMatch) {
      const d = Number(wordMatch[1]);
      const m = MONTHS[wordMatch[2].toLowerCase()];
      const y = wordMatch[3].length <= 2 ? 2000 + Number(wordMatch[3]) : Number(wordMatch[3]);
      if (m) {
        parsed.push({ col: c, text, iso: toIsoDate(y, m, d), candidates: null });
        continue;
      }
    }

    const numMatch = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
    if (numMatch) {
      const a = Number(numMatch[1]);
      const b = Number(numMatch[2]);
      const y = numMatch[3].length <= 2 ? 2000 + Number(numMatch[3]) : Number(numMatch[3]);
      if (a > 12 && b <= 12) {
        parsed.push({ col: c, text, iso: toIsoDate(y, b, a), candidates: null });
        continue;
      }
      if (b > 12 && a <= 12) {
        parsed.push({ col: c, text, iso: toIsoDate(y, a, b), candidates: null });
        continue;
      }
      if (a <= 12 && b <= 12) {
        const ddmm = toIsoDate(y, b, a);
        const mmdd = toIsoDate(y, a, b);
        if (ddmm && mmdd) {
          if (ddmm === mmdd) {
            parsed.push({ col: c, text, iso: ddmm, candidates: null });
          } else {
            parsed.push({ col: c, text, iso: null, candidates: [ddmm, mmdd] });
          }
          continue;
        }
      }
    }

    parsed.push({ col: c, text, iso: null, candidates: null });
  }

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (item.iso || !item.candidates) continue;

    let prevIso: string | null = null;
    let prevDist = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (parsed[j].iso) {
        prevIso = parsed[j].iso;
        prevDist = i - j;
        break;
      }
    }

    let nextIso: string | null = null;
    let nextDist = 0;
    for (let j = i + 1; j < parsed.length; j++) {
      if (parsed[j].iso) {
        nextIso = parsed[j].iso;
        nextDist = j - i;
        break;
      }
    }

    const [ddmm, mmdd] = item.candidates;
    let scoreDDMM = 0;
    let scoreMMDD = 0;
    if (prevIso) {
      scoreDDMM += Math.abs(diffDaysIso(prevIso, ddmm) - prevDist);
      scoreMMDD += Math.abs(diffDaysIso(prevIso, mmdd) - prevDist);
    }
    if (nextIso) {
      scoreDDMM += Math.abs(diffDaysIso(ddmm, nextIso) - nextDist);
      scoreMMDD += Math.abs(diffDaysIso(mmdd, nextIso) - nextDist);
    }
    item.iso = scoreMMDD < scoreDDMM ? mmdd : ddmm;
  }

  let lastSeen: string | null = null;
  for (const item of parsed) {
    if (item.iso) lastSeen = item.iso;
    else if (item.text) item.iso = lastSeen;
  }
  let nextSeen: string | null = null;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i].iso) nextSeen = parsed[i].iso;
    else if (parsed[i].text && !parsed[i].iso) parsed[i].iso = nextSeen;
  }

  return parsed.map(({ col, text, iso }) => ({ col, text, iso }));
}
