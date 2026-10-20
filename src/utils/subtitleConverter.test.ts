/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSrt,
  parseVtt,
  parseAss,
  parseSbv,
  parseLrc,
  parseTtml,
  parseCsv,
  buildSrt,
  buildVtt,
  buildAss,
  buildSbv,
  buildLrc,
  buildTtml,
  buildCsv,
  detectSubtitleFormat,
  convertSubtitles,
  parseSubtitles,
  stripStyles,
  cleanSdh,
} from './subtitleConverter.ts';
import type { SubtitleCue } from './subtitleConverter.ts';
import {
  shiftSubtitleTiming,
  convertFramerate,
  scaleSpeed,
  autoFixSubtitles,
  lintSubtitles,
  mergeBilingualSubtitles,
} from './subtitleOps.ts';
import {
  getCachedTranslation,
  setCachedTranslation,
} from './translator.ts';

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:03,500
Hello world, welcome to the show!

2
00:00:04,200 --> 00:00:07,000
This is a test subtitle.
`;

const SAMPLE_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:03.500
Hello world, welcome to the show!

2
00:00:04.200 --> 00:00:07.000
This is a test subtitle.
`;

const SAMPLE_ASS = `[Script Info]
Title: Sample
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Hello world, welcome to the show!
Dialogue: 0,0:00:04.20,0:00:07.00,Default,,0,0,0,,This is a test subtitle.
`;

const SAMPLE_SBV = `0:00:01.000,0:00:03.500
Hello world, welcome to the show!

0:00:04.200,0:00:07.000
This is a test subtitle.
`;

const SAMPLE_LRC = `[00:01.00]Hello world, welcome to the show!
[00:04.20]This is a test subtitle.
`;

const SAMPLE_TTML = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:03.500">Hello world, welcome to the show!</p>
      <p begin="00:00:04.200" end="00:00:07.000">This is a test subtitle.</p>
    </div>
  </body>
</tt>
`;

test('Format detection detects correct subtitle formats', () => {
  assert.equal(detectSubtitleFormat(SAMPLE_SRT), 'srt');
  assert.equal(detectSubtitleFormat(SAMPLE_VTT), 'vtt');
  assert.equal(detectSubtitleFormat(SAMPLE_ASS), 'ass');
  assert.equal(detectSubtitleFormat(SAMPLE_SBV), 'sbv');
  assert.equal(detectSubtitleFormat(SAMPLE_LRC), 'lrc');
  assert.equal(detectSubtitleFormat(SAMPLE_TTML), 'ttml');
});

test('SRT parser correctly parses cue count and timings', () => {
  const cues = parseSrt(SAMPLE_SRT);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1.0);
  assert.equal(cues[0].end, 3.5);
  assert.equal(cues[0].text, 'Hello world, welcome to the show!');
  assert.equal(cues[1].start, 4.2);
  assert.equal(cues[1].end, 7.0);
});

test('VTT parser correctly parses cue count and timings', () => {
  const cues = parseVtt(SAMPLE_VTT);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1.0);
  assert.equal(cues[0].end, 3.5);
  assert.equal(cues[0].text, 'Hello world, welcome to the show!');
});

test('ASS parser correctly parses dialogues and strips style tags', () => {
  const cues = parseAss(SAMPLE_ASS);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1.0);
  assert.equal(cues[0].end, 3.5);
  assert.equal(cues[0].text, 'Hello world, welcome to the show!');
});

test('SBV parser correctly parses YouTube SubViewer cues', () => {
  const cues = parseSbv(SAMPLE_SBV);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1.0);
  assert.equal(cues[0].end, 3.5);
});

test('LRC parser correctly parses lyric timestamps', () => {
  const cues = parseLrc(SAMPLE_LRC);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1.0);
  assert.equal(cues[0].text, 'Hello world, welcome to the show!');
});

test('TTML parser correctly extracts paragraph tags and timings', () => {
  const cues = parseTtml(SAMPLE_TTML);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, 1.0);
  assert.equal(cues[0].end, 3.5);
  assert.equal(cues[0].text, 'Hello world, welcome to the show!');
});

test('Universal cross-format conversion: SRT -> VTT -> ASS -> TTML -> SRT', () => {
  const initialCues = parseSrt(SAMPLE_SRT);

  // SRT -> VTT
  const vttStr = buildVtt(initialCues);
  assert.ok(vttStr.includes('WEBVTT'));
  const cuesFromVtt = parseVtt(vttStr);
  assert.equal(cuesFromVtt.length, 2);

  // VTT -> ASS
  const assStr = buildAss(cuesFromVtt, 'Test Project');
  assert.ok(assStr.includes('[Events]'));
  const cuesFromAss = parseAss(assStr);
  assert.equal(cuesFromAss.length, 2);

  // ASS -> TTML
  const ttmlStr = buildTtml(cuesFromAss);
  assert.ok(ttmlStr.includes('<tt '));
  const cuesFromTtml = parseTtml(ttmlStr);
  assert.equal(cuesFromTtml.length, 2);

  // TTML -> SRT
  const srtFinal = buildSrt(cuesFromTtml);
  const cuesFinal = parseSrt(srtFinal);
  assert.equal(cuesFinal.length, 2);
  assert.equal(cuesFinal[0].text, 'Hello world, welcome to the show!');
});

test('Bilingual dual-language subtitle generation', () => {
  const cues: SubtitleCue[] = [
    { start: 1, end: 3, text: 'Hello', km: 'សួស្តី' },
  ];

  const bilingualSrt = buildSrt(cues, 'bilingual_top_bottom');
  assert.ok(bilingualSrt.includes('សួស្តី\nHello'));

  const bilingualAss = buildAss(cues, 'Dual', 'bilingual_top_bottom');
  assert.ok(bilingualAss.includes('Default}សួស្តី\\N{\\rSecondary}Hello'));
});

test('Subtitle Ops: time shift and FPS convert', () => {
  const cues: SubtitleCue[] = [
    { start: 10, end: 15, text: 'Test' },
  ];

  // Shift +2.5s
  const shifted = shiftSubtitleTiming(cues, 2.5);
  assert.equal(shifted[0].start, 12.5);
  assert.equal(shifted[0].end, 17.5);

  // Framerate 24fps -> 25fps (ratio 24/25 = 0.96)
  const fpsConverted = convertFramerate(cues, 24, 25);
  assert.equal(fpsConverted[0].start, 9.6);
  assert.equal(fpsConverted[0].end, 14.4);

  // Speed 1.25x
  const speedScaled = scaleSpeed(cues, 1.25);
  assert.equal(speedScaled[0].start, 8.0);
  assert.equal(speedScaled[0].end, 12.0);
});

test('Subtitle Linter and Auto-Fix repairs overlapping cues', () => {
  const messyCues: SubtitleCue[] = [
    { start: 1.0, end: 4.0, text: 'Cue 1 overlaps Cue 2' },
    { start: 3.5, end: 6.0, text: 'Cue 2' },
  ];

  const issues = lintSubtitles(messyCues);
  assert.ok(issues.some(i => i.type === 'overlap'));

  const fixed = autoFixSubtitles(messyCues);
  assert.ok(fixed[0].end <= fixed[1].start);
});

test('Strip styles and clean SDH tags works cleanly', () => {
  const rawAss = '{\\pos(192,200)}Hello <i>world</i>!';
  assert.equal(stripStyles(rawAss), 'Hello world!');

  const rawSdh = '[Music playing] JOHN: (Laughs) What a day! ♪';
  assert.equal(cleanSdh(rawSdh), 'What a day!');
});

test('Merge bilingual subtitles matches cues correctly', () => {
  const engCues: SubtitleCue[] = [
    { start: 1, end: 3, text: 'Good morning' },
    { start: 4, end: 6, text: 'How are you?' },
  ];
  const khmCues: SubtitleCue[] = [
    { start: 1, end: 3, text: 'អរុណសួស្តី' },
    { start: 4, end: 6, text: 'តើអ្នកសុខសប្បាយទេ?' },
  ];

  const merged = mergeBilingualSubtitles(engCues, khmCues);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].text, 'Good morning');
  assert.equal(merged[0].km, 'អរុណសួស្តី');
  assert.equal(merged[1].km, 'តើអ្នកសុខសប្បាយទេ?');
});

test('Translator caching remembers and retrieves translations instantly', () => {
  setCachedTranslation('en', 'km', 'Welcome', 'សូមស្វាគមន៍');
  const cached = getCachedTranslation('en', 'km', 'welcome');
  assert.equal(cached, 'សូមស្វាគមន៍');

  const notFound = getCachedTranslation('en', 'km', 'NonExistentWord12345');
  assert.equal(notFound, undefined);
});

