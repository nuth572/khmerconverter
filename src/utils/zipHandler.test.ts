/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  isZipFile,
  isSubtitleFilename,
  unpackZipSubtitles,
  decodeSubtitleBuffer,
} from './zipHandler.ts';
import {
  isKhmerText,
  optimizeKhmerPunctuation,
  convertKhmerNumerals,
  findAndReplaceInCues,
} from './khmerEnhancer.ts';
import type { SubtitleCue } from './subtitleConverter.ts';

test('isZipFile correctly identifies zip archives', () => {
  assert.equal(isZipFile({ name: 'subtitles.zip' }), true);
  assert.equal(isZipFile({ name: 'episodes.ZIP' }), true);
  assert.equal(isZipFile({ name: 'subtitles.srt' }), false);
});

test('isSubtitleFilename filters subtitle extensions', () => {
  assert.equal(isSubtitleFilename('movie.srt'), true);
  assert.equal(isSubtitleFilename('video.vtt'), true);
  assert.equal(isSubtitleFilename('anime.ass'), true);
  assert.equal(isSubtitleFilename('lyrics.lrc'), true);
  assert.equal(isSubtitleFilename('movie.mp4'), false);
  assert.equal(isSubtitleFilename('notes.docx'), false);
  assert.equal(isSubtitleFilename('.DS_Store'), false);
});

test('unpackZipSubtitles extracts all valid subtitle files from zip archive', async () => {
  const zip = new JSZip();
  zip.file('episode1.srt', '1\n00:00:01,000 --> 00:00:03,000\nEpisode 1');
  zip.file('season/episode2.vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nEpisode 2');
  zip.file('readme.txt', '1\n00:00:01,000 --> 00:00:02,000\nPlain text sub');
  zip.file('cover.jpg', 'fake image binary data'); // should be ignored

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
  const extracted = await unpackZipSubtitles(zipBuffer);

  assert.equal(extracted.length, 3);
  assert.ok(extracted.some(f => f.name === 'episode1.srt'));
  assert.ok(extracted.some(f => f.name === 'episode2.vtt'));
  assert.ok(extracted.some(f => f.name === 'readme.txt'));
  assert.ok(!extracted.some(f => f.name === 'cover.jpg'));
});

test('Khmer typography optimizer replaces period with Khmer Khan', () => {
  assert.equal(isKhmerText('សួស្តី'), true);
  assert.equal(isKhmerText('Hello world'), false);

  const optimized = optimizeKhmerPunctuation('សូមស្វាគមន៍មកកាន់កម្ពុជា.');
  assert.equal(optimized, 'សូមស្វាគមន៍មកកាន់កម្ពុជា។');
});

test('Convert Khmer numerals transforms digits correctly', () => {
  assert.equal(convertKhmerNumerals('2026', true), '២០២៦');
  assert.equal(convertKhmerNumerals('២០២៦', false), '2026');
});

test('Batch find and replace updates cues accurately', () => {
  const cues: SubtitleCue[] = [
    { start: 1, end: 3, text: 'Hello John!', km: 'សួស្តី John!' },
    { start: 4, end: 6, text: 'Goodbye John!', km: 'លាហើយ John!' },
  ];

  const result = findAndReplaceInCues(cues, 'John', 'Alex');
  assert.equal(result.count, 4);
  assert.equal(result.updatedCues[0].text, 'Hello Alex!');
  assert.equal(result.updatedCues[0].km, 'សួស្តី Alex!');
  assert.equal(result.updatedCues[1].text, 'Goodbye Alex!');
});
