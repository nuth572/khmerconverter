/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Helper logic mimicking ZipRenamerTab calculation
function padN(n: number, p: number) {
  return p > 0 ? String(n).padStart(p, '0') : String(n);
}

function cleanTags(name: string) {
  return name
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*(?:1080|720|4k|2160|hevc|x264|x265|web|bluray)[^)]*\)/gi, '')
    .replace(/\b(1080p|720p|480p|2160p|4k|uhd|hdtv|web-dl|webrip|bluray|x264|x265|hevc|aac|dts|remux)\b/gi, '')
    .replace(/[._-]+/g, ' ')
    .trim();
}

function computeNewName(
  path: string,
  index: number,
  options: {
    prefix?: string;
    suffix?: string;
    pad?: number;
    keepOriginal?: boolean;
    cleanScene?: boolean;
    forceExt?: string;
    casing?: 'none' | 'lower' | 'upper';
  }
) {
  const base = path.split('/').pop() || path;
  const dot = base.lastIndexOf('.');
  const originalExt = dot > 0 ? base.slice(dot + 1) : '';
  let stem = dot > 0 ? base.slice(0, dot) : base;

  if (options.cleanScene) {
    stem = cleanTags(stem);
  }

  const num = padN(index, options.pad || 0);
  const pre = options.prefix || '';
  const suf = options.suffix || '';
  const ext = options.forceExt || originalExt;

  let newName = '';
  if (options.keepOriginal) {
    newName = `${pre}${num}_${stem}${suf}`;
  } else {
    newName = `${pre}${num}${suf}`;
  }

  if (options.casing === 'lower') newName = newName.toLowerCase();
  if (options.casing === 'upper') newName = newName.toUpperCase();

  return ext ? `${newName}.${ext}` : newName;
}

test('cleanTags strips release groups and torrent resolution tags', () => {
  const dirty = '[HorribleSubs] My.Hero.Academia - 01 [1080p] [AAC].srt';
  const cleaned = cleanTags(dirty);
  assert.ok(!cleaned.includes('1080p'));
  assert.ok(!cleaned.includes('HorribleSubs'));
  assert.ok(!cleaned.includes('AAC'));
});

test('computeNewName generates padded sequential numbers (01, 02...) with prefix', () => {
  const res1 = computeNewName('file1.srt', 1, { prefix: 'ep_', pad: 2 });
  const res2 = computeNewName('file2.srt', 2, { prefix: 'ep_', pad: 2 });
  assert.equal(res1, 'ep_01.srt');
  assert.equal(res2, 'ep_02.srt');
});

test('computeNewName supports TV show S01E01 format and forced extension', () => {
  const res = computeNewName('sample_raw.txt', 5, {
    prefix: 'Show_S01E',
    pad: 2,
    forceExt: 'srt',
  });
  assert.equal(res, 'Show_S01E05.srt');
});

test('computeNewName keeps original name with custom KhmerSub suffix', () => {
  const res = computeNewName('Kingdom_ep12.vtt', 1, {
    keepOriginal: true,
    suffix: '_KhmerSub',
    pad: 0,
  });
  assert.equal(res, '1_Kingdom_ep12_KhmerSub.vtt');
});
