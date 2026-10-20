/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubtitleCue {
  id?: number | string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
  km?: string;   // optional Khmer or secondary translation
  speaker?: string;
  style?: string;
}

export type SubtitleFormat =
  | 'srt'
  | 'vtt'
  | 'ass'
  | 'ssa'
  | 'sbv'
  | 'lrc'
  | 'ttml'
  | 'smi'
  | 'csv'
  | 'tsv'
  | 'json'
  | 'txt';

export interface FormatMeta {
  id: SubtitleFormat;
  name: string;
  extension: string;
  mimeType: string;
  description: string;
  supportsStyles: boolean;
  supportsDual: boolean;
}

export const SUPPORTED_FORMATS: FormatMeta[] = [
  { id: 'srt', name: 'SubRip (.srt)', extension: '.srt', mimeType: 'application/x-subrip', description: 'Industry standard for video players and streaming', supportsStyles: false, supportsDual: true },
  { id: 'vtt', name: 'WebVTT (.vtt)', extension: '.vtt', mimeType: 'text/vtt', description: 'HTML5 web video subtitle standard', supportsStyles: true, supportsDual: true },
  { id: 'ass', name: 'Advanced SubStation Alpha (.ass)', extension: '.ass', mimeType: 'text/x-ssa', description: 'Advanced styling, positioning, fonts, and anime subtitles', supportsStyles: true, supportsDual: true },
  { id: 'ssa', name: 'SubStation Alpha (.ssa)', extension: '.ssa', mimeType: 'text/x-ssa', description: 'Legacy styled subtitle format', supportsStyles: true, supportsDual: true },
  { id: 'sbv', name: 'YouTube SubViewer (.sbv)', extension: '.sbv', mimeType: 'text/plain', description: 'YouTube caption upload format', supportsStyles: false, supportsDual: true },
  { id: 'lrc', name: 'Lyrics (.lrc)', extension: '.lrc', mimeType: 'text/plain', description: 'Synchronized music lyrics and karaoke', supportsStyles: false, supportsDual: false },
  { id: 'ttml', name: 'Timed Text / DFXP (.ttml)', extension: '.ttml', mimeType: 'application/ttml+xml', description: 'Broadcast & Netflix XML timed text specification', supportsStyles: true, supportsDual: true },
  { id: 'smi', name: 'SAMI (.smi)', extension: '.smi', mimeType: 'application/smil', description: 'Windows Media Player Synchronized Accessible Media Interchange', supportsStyles: true, supportsDual: true },
  { id: 'csv', name: 'Spreadsheet CSV (.csv)', extension: '.csv', mimeType: 'text/csv', description: 'Tabular format for Excel, Google Sheets, and databases', supportsStyles: false, supportsDual: true },
  { id: 'tsv', name: 'Tab-Separated (.tsv)', extension: '.tsv', mimeType: 'text/tab-separated-values', description: 'Easy clipboard import/export for spreadsheets', supportsStyles: false, supportsDual: true },
  { id: 'json', name: 'JSON Data (.json)', extension: '.json', mimeType: 'application/json', description: 'Structured developer-friendly format with timestamps', supportsStyles: true, supportsDual: true },
  { id: 'txt', name: 'Plain Text Dialogue (.txt)', extension: '.txt', mimeType: 'text/plain', description: 'Clean text transcript without timing clutter', supportsStyles: false, supportsDual: true },
];

/* ============================================================
   TIME FORMATTING AND PARSING
   ============================================================ */

export function pad(n: number, len = 2): string {
  return String(Math.floor(n)).padStart(len, '0');
}

/** Formats seconds into SRT format: 00:01:23,456 */
export function formatTimeSrt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
}

/** Formats seconds into VTT format: 00:01:23.456 */
export function formatTimeVtt(sec: number): string {
  return formatTimeSrt(sec).replace(',', '.');
}

/** Formats seconds into ASS/SSA format: 0:01:23.45 (centi-seconds) */
export function formatTimeAss(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const r = cs % 100;
  return `${h}:${pad(m)}:${pad(s)}.${pad(r, 2)}`;
}

/** Formats seconds into SBV format: 0:01:23.456 */
export function formatTimeSbv(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${h}:${pad(m)}:${pad(s)}.${pad(r, 3)}`;
}

/** Formats seconds into LRC format: [01:23.45] */
export function formatTimeLrc(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const cs = Math.round(sec * 100);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const r = cs % 100;
  return `[${pad(m)}:${pad(s)}.${pad(r, 2)}]`;
}

/** Robust time parser that handles HH:MM:SS,mmm or HH:MM:SS.mmm or MM:SS.mmm or pure seconds */
export function parseTime(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim().replace(',', '.');
  // Check for seconds only like "12.34s" or "12.34"
  if (/^\d+(\.\d+)?s?$/i.test(clean)) {
    return parseFloat(clean);
  }
  const parts = clean.split(':');
  if (parts.length === 3) {
    const [h, m, s] = parts.map(Number);
    if ([h, m, s].some(n => Number.isNaN(n))) return 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts.map(Number);
    if ([m, s].some(n => Number.isNaN(n))) return 0;
    return m * 60 + s;
  }
  const num = parseFloat(clean);
  return Number.isFinite(num) ? num : 0;
}

/** Strip HTML and subtitle styling tags for clean plain text */
export function stripStyles(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, '') // ASS tags like {\pos(100,200)}
    .replace(/<[^>]+>/g, '')      // HTML/VTT tags like <i>, <c.yellow>
    .replace(/\r\n/g, '\n')
    .trim();
}

/** Clean SDH (Subtitles for the Deaf and Hard-of-Hearing) annotations */
export function cleanSdh(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, '')        // [Music], [Laughter]
    .replace(/\([^)]+\)/g, '')        // (Chuckle), (Sighs)
    .replace(/^[A-Z0-9\s]{2,15}:\s*/gm, '') // SPEAKER:
    .replace(/[♪♫#]/g, '')            // Music notes
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/* ============================================================
   FORMAT DETECTION
   ============================================================ */

export function detectSubtitleFormat(content: string, filename?: string): SubtitleFormat {
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'srt') return 'srt';
    if (ext === 'vtt') return 'vtt';
    if (ext === 'ass') return 'ass';
    if (ext === 'ssa') return 'ssa';
    if (ext === 'sbv') return 'sbv';
    if (ext === 'lrc') return 'lrc';
    if (ext === 'ttml' || ext === 'dfxp' || ext === 'xml') return 'ttml';
    if (ext === 'smi' || ext === 'sami') return 'smi';
    if (ext === 'csv') return 'csv';
    if (ext === 'tsv') return 'tsv';
    if (ext === 'json') return 'json';
  }

  const str = content.trim();
  if (str.startsWith('WEBVTT')) return 'vtt';
  if (/\[Script Info\]/i.test(str) || /\[Events\]/i.test(str)) {
    return (str.includes('V4+ Styles') || str.includes('v4.00+')) ? 'ass' : 'ssa';
  }
  if (/<tt\b[^>]*>|<timedtext\b/i.test(str)) return 'ttml';
  if (/<sami\b|<sync\b/i.test(str)) return 'smi';
  if (str.startsWith('[') || (str.startsWith('{') && str.includes('"start"'))) {
    try {
      JSON.parse(str);
      return 'json';
    } catch {
      // not json
    }
  }
  if (/^\[\d{2}:\d{2}[\.:]\d{2,3}\]/m.test(str)) return 'lrc';
  if (/^\d{1,2}:\d{2}:\d{2}[.,]\d{3},\d{1,2}:\d{2}:\d{2}[.,]\d{3}/m.test(str)) return 'sbv';
  if (/-->/m.test(str)) return 'srt';
  if (str.includes('\t') && (str.includes('start') || str.includes('text') || /^\d+\t/m.test(str))) return 'tsv';
  if (str.includes(',') && (str.toLowerCase().includes('start,end') || /^\d+,/m.test(str))) return 'csv';

  return 'srt'; // fallback default
}

/* ============================================================
   PARSERS
   ============================================================ */

/** SRT parser */
export function parseSrt(content: string): SubtitleCue[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];
  const timeRegex = /((?:\d+:)?\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?)/;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (!lines.length || (lines.length === 1 && !lines[0])) continue;

    let timeLineIdx = -1;
    let match: RegExpMatchArray | null = null;
    for (let i = 0; i < lines.length; i++) {
      match = lines[i].match(timeRegex);
      if (match) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx !== -1 && match) {
      const start = parseTime(match[1]);
      const end = parseTime(match[2]);
      const rawTextLines = lines.slice(timeLineIdx + 1);
      const text = rawTextLines.join('\n').trim();
      if (text) {
        cues.push({
          id: cues.length + 1,
          start,
          end: Math.max(end, start + 0.1),
          text,
        });
      }
    }
  }

  return cues;
}

/** WebVTT parser */
export function parseVtt(content: string): SubtitleCue[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/^WEBVTT[^\n]*\n+/i, '').replace(/\r\n/g, '\n');
  return parseSrt(normalized);
}

/** ASS / SSA parser */
export function parseAss(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  let inEvents = false;
  let formatFields: string[] = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('[')) {
      inEvents = /^\[Events\]/i.test(line);
      continue;
    }

    if (!inEvents) continue;

    if (line.startsWith('Format:')) {
      formatFields = line
        .replace(/^Format:\s*/i, '')
        .split(',')
        .map(f => f.trim().toLowerCase());
      continue;
    }

    if (line.startsWith('Dialogue:')) {
      const payload = line.replace(/^Dialogue:\s*/i, '');
      // The text field is the last field and may contain commas, so split by count
      const parts: string[] = [];
      let cur = '';
      let fieldCount = 0;
      for (let i = 0; i < payload.length; i++) {
        if (payload[i] === ',' && fieldCount < formatFields.length - 1) {
          parts.push(cur.trim());
          cur = '';
          fieldCount++;
        } else {
          cur += payload[i];
        }
      }
      parts.push(cur.trim());

      const startIdx = formatFields.indexOf('start');
      const endIdx = formatFields.indexOf('end');
      const textIdx = formatFields.indexOf('text');
      const speakerIdx = formatFields.indexOf('name');
      const styleIdx = formatFields.indexOf('style');

      const start = parseTime(parts[startIdx] || '0');
      const end = parseTime(parts[endIdx] || '0');
      let rawText = parts[textIdx >= 0 ? textIdx : parts.length - 1] || '';
      // Replace ASS \N and \n with actual newlines
      rawText = rawText.replace(/\\N/g, '\n').replace(/\\n/g, '\n');
      const text = stripStyles(rawText);

      if (text) {
        cues.push({
          id: cues.length + 1,
          start,
          end: Math.max(end, start + 0.1),
          text,
          speaker: speakerIdx >= 0 ? parts[speakerIdx] : undefined,
          style: styleIdx >= 0 ? parts[styleIdx] : undefined,
        });
      }
    }
  }

  return cues;
}

/** YouTube SBV parser */
export function parseSbv(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);
  const timeRegex = /^(\d{1,2}:\d{2}:\d{2}[.,]\d{3}),(\d{1,2}:\d{2}:\d{2}[.,]\d{3})/;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (!lines.length) continue;
    const match = lines[0].match(timeRegex);
    if (match) {
      const start = parseTime(match[1]);
      const end = parseTime(match[2]);
      const text = lines.slice(1).join('\n').trim();
      if (text) {
        cues.push({
          id: cues.length + 1,
          start,
          end: Math.max(end, start + 0.1),
          text,
        });
      }
    }
  }

  return cues;
}

/** LRC lyrics parser */
export function parseLrc(content: string): SubtitleCue[] {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const rawEntries: { time: number; text: string }[] = [];
  const lrcTimeRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[ti:') || trimmed.startsWith('[ar:') || trimmed.startsWith('[al:')) continue;

    const times: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = lrcTimeRegex.exec(trimmed)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const frac = match[3] ? (match[3].length === 3 ? parseInt(match[3], 10) / 1000 : parseInt(match[3], 10) / 100) : 0;
      times.push(min * 60 + sec + frac);
    }

    const text = trimmed.replace(lrcTimeRegex, '').trim();
    if (text && times.length > 0) {
      for (const t of times) {
        rawEntries.push({ time: t, text });
      }
    }
  }

  // Sort by time
  rawEntries.sort((a, b) => a.time - b.time);

  // Derive duration: end time is either next cue's start or start + 3s
  const cues: SubtitleCue[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const cur = rawEntries[i];
    const next = rawEntries[i + 1];
    const end = next ? Math.max(cur.time + 0.5, next.time) : cur.time + 3.5;
    cues.push({
      id: i + 1,
      start: cur.time,
      end,
      text: cur.text,
    });
  }

  return cues;
}

/** TTML / DFXP XML parser */
export function parseTtml(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  // Use regex parser for cross-environment compatibility (works in Node and Browser without DOMParser dependency)
  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(content)) !== null) {
    const attrs = match[1];
    let body = match[2];

    const beginMatch = attrs.match(/begin=["']([^"']+)["']/i);
    const endMatch = attrs.match(/end=["']([^"']+)["']/i);
    const durMatch = attrs.match(/dur=["']([^"']+)["']/i);

    if (beginMatch) {
      const start = parseTime(beginMatch[1]);
      let end = endMatch ? parseTime(endMatch[1]) : 0;
      if (!end && durMatch) {
        end = start + parseTime(durMatch[1]);
      }
      if (!end || end <= start) {
        end = start + 3.0;
      }

      // Replace <br/> with newline and strip tags
      body = body.replace(/<br\s*\/?>/gi, '\n');
      const text = stripStyles(body);

      if (text) {
        cues.push({
          id: cues.length + 1,
          start,
          end,
          text,
        });
      }
    }
  }

  return cues;
}

/** SAMI / SMI parser */
export function parseSami(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const syncRegex = /<SYNC\s+Start=["']?(\d+)["']?[^>]*>([\s\S]*?)(?=<SYNC|$)/gi;
  let match: RegExpExecArray | null;

  const raw: { start: number; text: string }[] = [];
  while ((match = syncRegex.exec(content)) !== null) {
    const startMs = parseInt(match[1], 10);
    const body = match[2].replace(/<br\s*\/?>/gi, '\n');
    const text = stripStyles(body).replace(/&nbsp;/gi, ' ').trim();
    if (text) {
      raw.push({ start: startMs / 1000, text });
    }
  }

  raw.sort((a, b) => a.start - b.start);

  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const next = raw[i + 1];
    const end = next ? Math.max(cur.start + 0.5, next.start) : cur.start + 3.5;
    cues.push({
      id: i + 1,
      start: cur.start,
      end,
      text: cur.text,
    });
  }

  return cues;
}

/** CSV / TSV parser */
export function parseCsv(content: string, delimiter = ','): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines.length) return cues;

  // Simple CSV line parser respecting quotes
  function parseLine(line: string): string[] {
    const row: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    row.push(cur.trim());
    return row;
  }

  const rows = lines.filter(l => l.trim()).map(parseLine);
  if (!rows.length) return cues;

  // Check header
  let startCol = 1;
  let endCol = 2;
  let textCol = 3;
  let kmCol = -1;

  const first = rows[0].map(c => c.toLowerCase());
  const hasHeader = first.some(c => c.includes('start') || c.includes('time') || c.includes('text'));

  if (hasHeader) {
    startCol = first.findIndex(c => c.includes('start'));
    endCol = first.findIndex(c => c.includes('end'));
    textCol = first.findIndex(c => c.includes('text') || c.includes('dialogue') || c.includes('subtitle') || c.includes('original'));
    kmCol = first.findIndex(c => c.includes('km') || c.includes('khmer') || c.includes('translation') || c.includes('target'));
  }

  const dataRows = hasHeader ? rows.slice(1) : rows;

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    if (r.length < 2) continue;

    const startVal = r[startCol >= 0 ? startCol : 0];
    const endVal = r[endCol >= 0 ? endCol : 1];
    const textVal = r[textCol >= 0 ? textCol : 2] || r[r.length - 1];
    const kmVal = kmCol >= 0 ? r[kmCol] : undefined;

    const start = parseTime(startVal);
    let end = parseTime(endVal);
    if (!end || end <= start) end = start + 3;

    if (textVal) {
      cues.push({
        id: i + 1,
        start,
        end,
        text: textVal.replace(/\\n/g, '\n'),
        km: kmVal ? kmVal.replace(/\\n/g, '\n') : undefined,
      });
    }
  }

  return cues;
}

/** JSON parser */
export function parseJson(content: string): SubtitleCue[] {
  const data = JSON.parse(content.replace(/^\uFEFF/, ''));
  const list = Array.isArray(data) ? data : data.cues || data.subtitles || data.segments || [];
  return list.map((item: Record<string, unknown>, index: number) => ({
    id: item.id ? String(item.id) : index + 1,
    start: typeof item.start === 'number' ? item.start : parseTime(String(item.start || item.startTime || 0)),
    end: typeof item.end === 'number' ? item.end : parseTime(String(item.end || item.endTime || 0)),
    text: String(item.text || item.content || item.line || '').trim(),
    km: item.km ? String(item.km).trim() : undefined,
    speaker: item.speaker ? String(item.speaker) : undefined,
  }));
}

/** Universal master parse function */
export function parseSubtitles(content: string, formatHint?: SubtitleFormat, filename?: string): SubtitleCue[] {
  const format = formatHint || detectSubtitleFormat(content, filename);
  switch (format) {
    case 'vtt':
      return parseVtt(content);
    case 'ass':
    case 'ssa':
      return parseAss(content);
    case 'sbv':
      return parseSbv(content);
    case 'lrc':
      return parseLrc(content);
    case 'ttml':
      return parseTtml(content);
    case 'smi':
      return parseSami(content);
    case 'tsv':
      return parseCsv(content, '\t');
    case 'csv':
      return parseCsv(content, ',');
    case 'json':
      return parseJson(content);
    case 'txt':
    case 'srt':
    default:
      return parseSrt(content);
  }
}

/* ============================================================
   SERIALIZERS (Export Any Format)
   ============================================================ */

export type DualSubtitleMode = 'source' | 'target' | 'bilingual_top_bottom' | 'bilingual_bottom_top';

export function getCueDisplay(cue: SubtitleCue, mode: DualSubtitleMode = 'target'): string {
  if (mode === 'source') return cue.text;
  if (mode === 'target') return cue.km || cue.text;
  if (mode === 'bilingual_top_bottom') {
    // Target (Khmer) on top, Source (English) on bottom
    return cue.km && cue.km !== cue.text ? `${cue.km}\n${cue.text}` : cue.text;
  }
  // Source on top, Target on bottom
  return cue.km && cue.km !== cue.text ? `${cue.text}\n${cue.km}` : cue.text;
}

export function buildSrt(cues: SubtitleCue[], mode: DualSubtitleMode = 'target'): string {
  return cues
    .map((c, i) => `${i + 1}\n${formatTimeSrt(c.start)} --> ${formatTimeSrt(c.end)}\n${getCueDisplay(c, mode)}`)
    .join('\n\n') + '\n';
}

export function buildVtt(cues: SubtitleCue[], mode: DualSubtitleMode = 'target'): string {
  const body = cues
    .map((c, i) => `${i + 1}\n${formatTimeVtt(c.start)} --> ${formatTimeVtt(c.end)}\n${getCueDisplay(c, mode)}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

export function buildAss(cues: SubtitleCue[], title = 'KhmerSub Export', mode: DualSubtitleMode = 'target'): string {
  const header = `[Script Info]
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Kantumruy Pro,48,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3.0,1.5,2,40,40,40,1
Style: Secondary,Arial,34,&H00F5E19A,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,2.0,1.0,2,40,40,95,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogues = cues.map(c => {
    let text = '';
    if (mode === 'bilingual_top_bottom' && c.km && c.km !== c.text) {
      text = `{\\rDefault}${c.km}\\N{\\rSecondary}${c.text}`;
    } else if (mode === 'bilingual_bottom_top' && c.km && c.km !== c.text) {
      text = `{\\rSecondary}${c.text}\\N{\\rDefault}${c.km}`;
    } else {
      text = getCueDisplay(c, mode).replace(/\n/g, '\\N');
    }
    const speaker = c.speaker || '';
    return `Dialogue: 0,${formatTimeAss(c.start)},${formatTimeAss(c.end)},Default,${speaker},0,0,0,,${text}`;
  });

  return header + dialogues.join('\n') + '\n';
}

export function buildSbv(cues: SubtitleCue[], mode: DualSubtitleMode = 'target'): string {
  return cues
    .map(c => `${formatTimeSbv(c.start)},${formatTimeSbv(c.end)}\n${getCueDisplay(c, mode)}`)
    .join('\n\n') + '\n';
}

export function buildLrc(cues: SubtitleCue[], mode: DualSubtitleMode = 'target'): string {
  return cues
    .map(c => `${formatTimeLrc(c.start)}${getCueDisplay(c, mode).replace(/\n/g, ' ')}`)
    .join('\n') + '\n';
}

export function buildTtml(cues: SubtitleCue[], mode: DualSubtitleMode = 'target'): string {
  const lines = cues.map(c => {
    const escaped = getCueDisplay(c, mode)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br/>');
    return `      <p begin="${formatTimeVtt(c.start)}" end="${formatTimeVtt(c.end)}">${escaped}</p>`;
  });

  return `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:timeBase="media" xml:lang="km">
  <head>
    <styling>
      <style xml:id="defaultStyle" fontStyle="normal" fontFamily="Kantumruy Pro, sans-serif" fontSize="100%" color="white" backgroundColor="black" />
    </styling>
    <layout>
      <region xml:id="bottom" origin="10% 80%" extent="80% 20%" />
    </layout>
  </head>
  <body>
    <div region="bottom" style="defaultStyle">
${lines.join('\n')}
    </div>
  </body>
</tt>
`;
}

export function buildSami(cues: SubtitleCue[], mode: DualSubtitleMode = 'target'): string {
  const syncs = cues.map(c => {
    const startMs = Math.round(c.start * 1000);
    const endMs = Math.round(c.end * 1000);
    const escaped = getCueDisplay(c, mode)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    return `<SYNC Start=${startMs}><P Class=KMCC>${escaped}</P></SYNC>\n<SYNC Start=${endMs}><P Class=KMCC>&nbsp;</P></SYNC>`;
  });

  return `<SAMI>
<HEAD>
<TITLE>KhmerSub SAMI</TITLE>
<STYLE TYPE="text/css">
<!--
P { font-family: 'Kantumruy Pro', Arial; font-size: 20pt; text-align: center; color: white; background-color: black; }
.KMCC { Name: Khmer; lang: km-KH; }
-->
</STYLE>
</HEAD>
<BODY>
${syncs.join('\n')}
</BODY>
</SAMI>
`;
}

export function buildCsv(cues: SubtitleCue[], delimiter = ','): string {
  const headers = ['Index', 'Start', 'End', 'Start_Sec', 'End_Sec', 'Duration_Sec', 'Text', 'Khmer'];
  const rows = cues.map((c, i) => {
    const dur = (c.end - c.start).toFixed(3);
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""').replace(/\n/g, '\\n')}"`;
    return [
      i + 1,
      formatTimeSrt(c.start),
      formatTimeSrt(c.end),
      c.start.toFixed(3),
      c.end.toFixed(3),
      dur,
      escapeCsv(c.text),
      escapeCsv(c.km || ''),
    ].join(delimiter);
  });

  return [headers.join(delimiter), ...rows].join('\n') + '\n';
}

export function buildJson(cues: SubtitleCue[]): string {
  return JSON.stringify(cues, null, 2);
}

export function buildPlainText(cues: SubtitleCue[], mode: DualSubtitleMode = 'target', includeTimestamps = false): string {
  return cues
    .map(c => {
      const text = getCueDisplay(c, mode);
      return includeTimestamps ? `[${formatTimeSrt(c.start)} --> ${formatTimeSrt(c.end)}] ${text}` : text;
    })
    .join('\n');
}

/** Universal master export function */
export function convertSubtitles(
  cues: SubtitleCue[],
  targetFormat: SubtitleFormat,
  options: {
    mode?: DualSubtitleMode;
    title?: string;
    includeTimestampsInTxt?: boolean;
  } = {}
): string {
  const { mode = 'target', title = 'Subtitles', includeTimestampsInTxt = false } = options;

  switch (targetFormat) {
    case 'vtt':
      return buildVtt(cues, mode);
    case 'ass':
    case 'ssa':
      return buildAss(cues, title, mode);
    case 'sbv':
      return buildSbv(cues, mode);
    case 'lrc':
      return buildLrc(cues, mode);
    case 'ttml':
      return buildTtml(cues, mode);
    case 'smi':
      return buildSami(cues, mode);
    case 'csv':
      return buildCsv(cues, ',');
    case 'tsv':
      return buildCsv(cues, '\t');
    case 'json':
      return buildJson(cues);
    case 'txt':
      return buildPlainText(cues, mode, includeTimestampsInTxt);
    case 'srt':
    default:
      return buildSrt(cues, mode);
  }
}
