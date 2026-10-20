/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LanguageInfo {
  code: string;
  google: string;
  name: string;
  native: string;
  flag: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'auto', google: 'auto', name: 'Auto detect', native: 'ស្វ័យប្រវត្តិ', flag: '✨' },
  { code: 'km', google: 'km', name: 'Khmer', native: 'ភាសាខ្មែរ', flag: '🇰🇭' },
  { code: 'en', google: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
  { code: 'zh', google: 'zh-CN', name: 'Chinese (Simplified)', native: '中文(简体)', flag: '🇨🇳' },
  { code: 'zh-TW', google: 'zh-TW', name: 'Chinese (Traditional)', native: '中文(繁體)', flag: '🇹🇼' },
  { code: 'th', google: 'th', name: 'Thai', native: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', google: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ko', google: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷' },
  { code: 'ja', google: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵' },
  { code: 'lo', google: 'lo', name: 'Lao', native: 'ລາວ', flag: '🇱🇦' },
  { code: 'ms', google: 'ms', name: 'Malay', native: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'id', google: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'tl', google: 'tl', name: 'Filipino / Tagalog', native: 'Tagalog', flag: '🇵🇭' },
  { code: 'my', google: 'my', name: 'Burmese', native: 'မြန်မာ', flag: '🇲🇲' },
  { code: 'hi', google: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  { code: 'fr', google: 'fr', name: 'French', native: 'Français', flag: '🇫🇷' },
  { code: 'es', google: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'pt', google: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹' },
  { code: 'de', google: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', google: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  { code: 'ru', google: 'ru', name: 'Russian', native: 'Русский', flag: '🇷🇺' },
  { code: 'ar', google: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦' },
  { code: 'tr', google: 'tr', name: 'Turkish', native: 'Türkçe', flag: '🇹🇷' },
  { code: 'nl', google: 'nl', name: 'Dutch', native: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', google: 'pl', name: 'Polish', native: 'Polski', flag: '🇵🇱' },
  { code: 'uk', google: 'uk', name: 'Ukrainian', native: 'Українська', flag: '🇺🇦' },
];

const LANG_MAP = new Map(LANGUAGES.map(l => [l.code, l]));

export function getLanguageName(code: string): string {
  return LANG_MAP.get(code)?.name || code.toUpperCase();
}

export function toGoogleCode(code: string): string {
  return LANG_MAP.get(code)?.google || code;
}

const GTX_URL = 'https://translate.googleapis.com/translate_a/t?client=gtx&format=text';

// Global LRU-style translation cache: `${source}->${target}:${cleanText}` -> translatedText
const translationCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 8000;

function getCacheKey(source: string, target: string, text: string): string {
  return `${source}->${target}:${text.trim().toLowerCase()}`;
}

export function getCachedTranslation(source: string, target: string, text: string): string | undefined {
  return translationCache.get(getCacheKey(source, target, text));
}

export function setCachedTranslation(source: string, target: string, text: string, translation: string): void {
  if (translationCache.size > MAX_CACHE_ENTRIES) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) translationCache.delete(firstKey);
  }
  translationCache.set(getCacheKey(source, target, text), translation);
}

interface GtxResult {
  texts: string[];
  detected?: string;
}

function normalizeGtx(data: unknown, count: number): GtxResult {
  let detected: string | undefined;

  const pick = (item: unknown): string => {
    if (typeof item === 'string') return item;
    if (Array.isArray(item) && typeof item[0] === 'string') {
      if (typeof item[1] === 'string') detected = detected ?? item[1];
      return item[0];
    }
    return '';
  };

  if (!Array.isArray(data)) {
    throw new Error('Unexpected translation response format');
  }

  if (count === 1) {
    if (data.length === 2 && typeof data[0] === 'string' && typeof data[1] === 'string' && !Array.isArray(data[0])) {
      return { texts: [data[0]], detected: data[1] };
    }
    if (data.length >= 1) return { texts: [pick(data[0])], detected };
  }

  return { texts: data.map(pick), detected };
}

export async function translateBatch(texts: string[], source = 'auto', target = 'km'): Promise<GtxResult> {
  const body = new URLSearchParams();
  texts.forEach(t => body.append('q', t));
  const res = await fetch(`${GTX_URL}&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Translation API error (${res.status})`);
  }
  const data = await res.json();
  return normalizeGtx(data, texts.length);
}

/**
 * High-performance, deduplicated, concurrent translator
 * Features:
 * - Instant cache lookup
 * - Deduplication of repeated subtitle lines
 * - Concurrency of up to 6 parallel network requests
 * - Optimal payload batching
 */
export async function translateAll(
  texts: string[],
  options: {
    source?: string;
    target?: string;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number, partials: string[]) => void;
  } = {}
): Promise<{ texts: string[]; detected?: string }> {
  const { source = 'auto', target = 'km', signal, onProgress } = options;
  const totalCount = texts.length;
  if (!totalCount) return { texts: [] };

  const out = new Array<string>(totalCount).fill('');
  let detected: string | undefined;

  // Step 1: Check cache and map identical strings
  const textToIndices = new Map<string, number[]>();
  let cachedCount = 0;

  texts.forEach((rawText, idx) => {
    const cleaned = (rawText || ' ').replace(/\s*\n\s*/g, ' ').trim() || ' ';
    const cached = getCachedTranslation(source, target, cleaned);
    if (cached !== undefined) {
      out[idx] = cached;
      cachedCount++;
    } else {
      const existing = textToIndices.get(cleaned);
      if (existing) {
        existing.push(idx);
      } else {
        textToIndices.set(cleaned, [idx]);
      }
    }
  });

  // Report initial progress from cache
  if (cachedCount > 0) {
    onProgress?.(cachedCount, totalCount, [...out]);
    if (cachedCount === totalCount) {
      return { texts: out, detected };
    }
  }

  // Step 2: Unique strings that need network translation
  const uniqueTextsToTranslate = Array.from(textToIndices.keys());

  // Step 3: Chunk unique texts into optimal batches
  const batches: string[][] = [];
  let curBatch: string[] = [];
  let charCount = 0;

  for (const str of uniqueTextsToTranslate) {
    const len = str.length + 8;
    if (curBatch.length >= 65 || charCount + len > 4800) {
      batches.push(curBatch);
      curBatch = [];
      charCount = 0;
    }
    curBatch.push(str);
    charCount += len;
  }
  if (curBatch.length) batches.push(curBatch);

  // Step 4: Run concurrent worker pool (concurrency = 6)
  let doneCount = cachedCount;
  let batchIndex = 0;

  async function worker() {
    while (batchIndex < batches.length) {
      if (signal?.aborted) throw new Error('Translation aborted');
      const currentBatchIdx = batchIndex++;
      const batch = batches[currentBatchIdx];
      if (!batch) break;

      let attempt = 0;
      let res: GtxResult | null = null;

      for (;;) {
        try {
          res = await translateBatch(batch, toGoogleCode(source), toGoogleCode(target));
          break;
        } catch (e) {
          attempt++;
          if (attempt >= 4) throw e;
          await new Promise(r => setTimeout(r, 400 * attempt));
        }
      }

      if (res) {
        detected = detected ?? res.detected;
        batch.forEach((uniqueStr, k) => {
          const translatedStr = (res!.texts[k] ?? '').trim();
          setCachedTranslation(source, target, uniqueStr, translatedStr);

          // Populate all occurrences of this unique text
          const targetIndices = textToIndices.get(uniqueStr) || [];
          for (const idx of targetIndices) {
            out[idx] = translatedStr;
            doneCount++;
          }
        });

        onProgress?.(Math.min(totalCount, doneCount), totalCount, [...out]);
      }
    }
  }

  const concurrency = Math.min(6, batches.length);
  await Promise.all(Array.from({ length: concurrency }, worker));

  return { texts: out, detected };
}
