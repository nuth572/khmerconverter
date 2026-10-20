/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SubtitleCue } from './subtitleConverter.ts';

const KHMER_DIGITS: Record<string, string> = {
  '0': '០',
  '1': '១',
  '2': '២',
  '3': '៣',
  '4': '៤',
  '5': '៥',
  '6': '៦',
  '7': '៧',
  '8': '៨',
  '9': '៩',
};

const LATIN_DIGITS: Record<string, string> = {
  '០': '0',
  '១': '1',
  '២': '2',
  '៣': '3',
  '៤': '4',
  '៥': '5',
  '៦': '6',
  '៧': '7',
  '៨': '8',
  '៩': '9',
};

/**
 * Checks if a string contains Khmer Unicode characters (\u1780-\u17FF)
 */
export function isKhmerText(text: string): boolean {
  return /[\u1780-\u17FF]/.test(text);
}

/**
 * Optimizes Khmer text typography:
 * - Converts period `.` at end of Khmer sentence into Khmer Khan `។`
 * - Standardizes Khmer spacing around punctuation
 */
export function optimizeKhmerPunctuation(text: string): string {
  if (!isKhmerText(text)) return text;

  let result = text
    // Replace trailing period on Khmer lines with Khmer full stop
    .replace(/([\u1780-\u17FF]+)\s*\.\s*$/gm, '$1។')
    .replace(/([\u1780-\u17FF]+)\s*\.\s+([\u1780-\u17FF])/g, '$1។ $2')
    // Standardize Khmer comma / question marks
    .replace(/\s*([។៕])\s*/g, '$1 ')
    .trim();

  return result;
}

/**
 * Convert numbers between Latin (0-9) and Khmer digits (០-៩)
 */
export function convertKhmerNumerals(text: string, toKhmer = true): string {
  if (toKhmer) {
    return text.replace(/[0-9]/g, ch => KHMER_DIGITS[ch] || ch);
  }
  return text.replace(/[០-៩]/g, ch => LATIN_DIGITS[ch] || ch);
}

/**
 * Batch find and replace across all subtitle cues
 */
export function findAndReplaceInCues(
  cues: SubtitleCue[],
  findText: string,
  replaceText: string,
  options: {
    matchCase?: boolean;
    useRegex?: boolean;
    targetFields?: 'all' | 'original' | 'khmer';
  } = {}
): { updatedCues: SubtitleCue[]; count: number } {
  const { matchCase = false, useRegex = false, targetFields = 'all' } = options;

  if (!findText) return { updatedCues: cues, count: 0 };

  let regex: RegExp;
  try {
    const flags = matchCase ? 'g' : 'gi';
    const pattern = useRegex ? findText : findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(pattern, flags);
  } catch {
    return { updatedCues: cues, count: 0 };
  }

  let totalReplacements = 0;

  const updatedCues = cues.map(cue => {
    let newText = cue.text;
    let newKm = cue.km;

    if (targetFields === 'all' || targetFields === 'original') {
      const matches = newText.match(regex);
      if (matches) {
        totalReplacements += matches.length;
        newText = newText.replace(regex, replaceText);
      }
    }

    if (newKm && (targetFields === 'all' || targetFields === 'khmer')) {
      const matchesKm = newKm.match(regex);
      if (matchesKm) {
        totalReplacements += matchesKm.length;
        newKm = newKm.replace(regex, replaceText);
      }
    }

    return {
      ...cue,
      text: newText,
      km: newKm,
    };
  });

  return { updatedCues, count: totalReplacements };
}
