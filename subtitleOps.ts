/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SubtitleCue } from './subtitleConverter.ts';
import { cleanSdh as cleanSdhText } from './subtitleConverter.ts';

export interface LinterIssue {
  cueIndex: number;
  type: 'overlap' | 'short_duration' | 'long_duration' | 'too_long' | 'high_cps' | 'empty';
  message: string;
  severity: 'warning' | 'error';
}

export interface FpsOption {
  label: string;
  fps: number;
}

export const COMMON_FPS: FpsOption[] = [
  { label: '23.976 fps (Film / NTSC)', fps: 23.976 },
  { label: '24.0 fps (Standard Cinema)', fps: 24.0 },
  { label: '25.0 fps (PAL / European TV)', fps: 25.0 },
  { label: '29.97 fps (NTSC TV / Broadcast)', fps: 29.97 },
  { label: '30.0 fps (Web / Digital Video)', fps: 30.0 },
  { label: '50.0 fps (PAL High Frame Rate)', fps: 50.0 },
  { label: '59.94 fps (NTSC 60p)', fps: 59.94 },
  { label: '60.0 fps (YouTube / Gaming)', fps: 60.0 },
];

/** Shift all cues by deltaSeconds (can be positive or negative) */
export function shiftSubtitleTiming(cues: SubtitleCue[], deltaSeconds: number): SubtitleCue[] {
  return cues.map(cue => {
    const start = Math.max(0, cue.start + deltaSeconds);
    const end = Math.max(start + 0.1, cue.end + deltaSeconds);
    return { ...cue, start, end };
  });
}

/** Convert timing between different frame rates (e.g. 23.976 -> 25) */
export function convertFramerate(cues: SubtitleCue[], sourceFps: number, targetFps: number): SubtitleCue[] {
  if (sourceFps <= 0 || targetFps <= 0 || sourceFps === targetFps) return cues;
  const ratio = sourceFps / targetFps;
  return cues.map(cue => ({
    ...cue,
    start: Math.round(cue.start * ratio * 1000) / 1000,
    end: Math.round(cue.end * ratio * 1000) / 1000,
  }));
}

/** Scale timing by a speed factor (e.g. 1.25x faster -> time multiplied by 1/1.25) */
export function scaleSpeed(cues: SubtitleCue[], speedFactor: number): SubtitleCue[] {
  if (speedFactor <= 0 || speedFactor === 1) return cues;
  return cues.map(cue => ({
    ...cue,
    start: Math.round((cue.start / speedFactor) * 1000) / 1000,
    end: Math.round((cue.end / speedFactor) * 1000) / 1000,
  }));
}

/** Lint subtitles for common timing, readability, and formatting issues */
export function lintSubtitles(cues: SubtitleCue[], maxCharsPerLine = 42, maxCps = 22): LinterIssue[] {
  const issues: LinterIssue[] = [];

  for (let i = 0; i < cues.length; i++) {
    const cur = cues[i];
    const dur = cur.end - cur.start;

    // Check empty text
    if (!cur.text.trim() && !(cur.km && cur.km.trim())) {
      issues.push({
        cueIndex: i,
        type: 'empty',
        message: `Cue #${i + 1} has empty subtitle text`,
        severity: 'error',
      });
      continue;
    }

    // Check overlap with next cue
    if (i < cues.length - 1) {
      const next = cues[i + 1];
      if (cur.end > next.start) {
        issues.push({
          cueIndex: i,
          type: 'overlap',
          message: `Cue #${i + 1} overlaps with cue #${i + 2} by ${(cur.end - next.start).toFixed(2)}s`,
          severity: 'error',
        });
      }
    }

    // Check very short duration
    if (dur < 0.6) {
      issues.push({
        cueIndex: i,
        type: 'short_duration',
        message: `Cue #${i + 1} duration is too short (${dur.toFixed(2)}s < 0.6s)`,
        severity: 'warning',
      });
    }

    // Check excessively long duration
    if (dur > 8.0) {
      issues.push({
        cueIndex: i,
        type: 'long_duration',
        message: `Cue #${i + 1} duration is unusually long (${dur.toFixed(1)}s > 8.0s)`,
        severity: 'warning',
      });
    }

    // Check line length
    const lines = (cur.km || cur.text).split('\n');
    for (const l of lines) {
      if (l.length > maxCharsPerLine) {
        issues.push({
          cueIndex: i,
          type: 'too_long',
          message: `Cue #${i + 1} line exceeds ${maxCharsPerLine} chars (${l.length} chars)`,
          severity: 'warning',
        });
        break;
      }
    }

    // Check characters per second (reading speed)
    const charCount = (cur.km || cur.text).replace(/\s+/g, '').length;
    const cps = dur > 0 ? charCount / dur : 99;
    if (cps > maxCps && dur > 0.5) {
      issues.push({
        cueIndex: i,
        type: 'high_cps',
        message: `Cue #${i + 1} reading speed is very fast (${Math.round(cps)} CPS > ${maxCps} CPS)`,
        severity: 'warning',
      });
    }
  }

  return issues;
}

/** Auto-fix all common subtitle issues */
export function autoFixSubtitles(
  cues: SubtitleCue[],
  options: {
    fixOverlaps?: boolean;
    fixMinDuration?: boolean;
    cleanSdh?: boolean;
    sortChronologically?: boolean;
    removeEmpty?: boolean;
    minGap?: number; // min gap between cues in seconds, e.g. 0.05
    minDuration?: number; // min duration in seconds, e.g. 0.8
  } = {}
): SubtitleCue[] {
  const {
    fixOverlaps = true,
    fixMinDuration = true,
    cleanSdh = false,
    sortChronologically = true,
    removeEmpty = true,
    minGap = 0.05,
    minDuration = 0.8,
  } = options;

  let result = [...cues];

  // 1. Remove empty cues
  if (removeEmpty) {
    result = result.filter(c => c.text.trim().length > 0 || (c.km && c.km.trim().length > 0));
  }

  // 2. Clean SDH if requested
  if (cleanSdh) {
    result = result.map(c => ({
      ...c,
      text: cleanSdhText(c.text),
      km: c.km ? cleanSdhText(c.km) : undefined,
    })).filter(c => c.text.trim().length > 0);
  }

  // 3. Sort chronologically
  if (sortChronologically) {
    result.sort((a, b) => a.start - b.start);
  }

  // 4. Fix minimum duration and overlaps
  for (let i = 0; i < result.length; i++) {
    const cur = result[i];

    // Ensure minimum duration
    if (fixMinDuration && cur.end - cur.start < minDuration) {
      cur.end = cur.start + minDuration;
    }

    // Fix overlap with next cue
    if (fixOverlaps && i < result.length - 1) {
      const next = result[i + 1];
      if (cur.end >= next.start - minGap) {
        // Adjust end time so it ends before next start
        cur.end = Math.max(cur.start + 0.3, next.start - minGap);
      }
    }

    cur.id = i + 1;
  }

  return result;
}

/** Merge two subtitle files (e.g. English original + Khmer translation) into dual-track cues */
export function mergeBilingualSubtitles(sourceCues: SubtitleCue[], targetCues: SubtitleCue[], tolerance = 1.0): SubtitleCue[] {
  // If lengths match and timing is roughly aligned, match by index
  if (sourceCues.length === targetCues.length) {
    return sourceCues.map((s, idx) => {
      const t = targetCues[idx];
      return {
        ...s,
        km: t.km || t.text,
      };
    });
  }

  // Otherwise, match each source cue with the best overlapping target cue
  return sourceCues.map(s => {
    // Find target cues with highest overlap with s
    let bestTarget: SubtitleCue | null = null;
    let maxOverlap = 0;

    for (const t of targetCues) {
      const overlapStart = Math.max(s.start, t.start);
      const overlapEnd = Math.min(s.end, t.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestTarget = t;
      }
    }

    if (!bestTarget && targetCues.length > 0) {
      // Find closest by start time within tolerance
      const closest = targetCues.find(t => Math.abs(t.start - s.start) <= tolerance);
      if (closest) bestTarget = closest;
    }

    return {
      ...s,
      km: bestTarget ? (bestTarget.km || bestTarget.text) : '',
    };
  });
}

/** Split long lines in cues into natural two-line sentences */
export function wrapSubtitleLines(cues: SubtitleCue[], maxChars = 42): SubtitleCue[] {
  return cues.map(cue => {
    const wrapText = (text: string) => {
      if (text.length <= maxChars || text.includes('\n')) return text;
      const words = text.split(/\s+/);
      let line1 = '';
      let line2 = '';
      const half = Math.floor(words.length / 2);
      line1 = words.slice(0, half).join(' ');
      line2 = words.slice(half).join(' ');
      return `${line1}\n${line2}`;
    };

    return {
      ...cue,
      text: wrapText(cue.text),
      km: cue.km ? wrapText(cue.km) : undefined,
    };
  });
}
