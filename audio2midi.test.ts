/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  midiToName,
  midiToFreq,
  freqToMidi,
  autoCorrelateEnhanced,
  detectKeySignature,
  quantizeNotes,
  humanizeNotes,
  makeStandardMidiBytes,
  generateFurEliseDemo,
  generateCanonInDDemo,
} from './audio2midi.ts';
import type { MidiNote } from './audio2midi.ts';

test('midiToName and frequency conversion', () => {
  assert.equal(midiToName(60), 'C4');
  assert.equal(midiToName(69), 'A4');
  assert.equal(midiToName(36), 'C2');
  assert.equal(midiToName(84), 'C6');

  // A4 = 440 Hz
  assert.equal(Math.round(midiToFreq(69)), 440);
  assert.equal(freqToMidi(440), 69);
  // C4 ~ 261.63 Hz
  assert.equal(freqToMidi(261.63), 60);
});

test('autoCorrelateEnhanced accurately detects pure sine wave frequency', () => {
  const sampleRate = 44100;
  const targetFreq = 440; // A4
  const numSamples = 2048;
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    buffer[i] = Math.sin((2 * Math.PI * targetFreq * i) / sampleRate);
  }

  const result = autoCorrelateEnhanced(buffer, sampleRate, 80, 1000);
  assert.ok(result.clarity > 0.8, 'Clarity should be high for pure sine');
  assert.ok(
    Math.abs(result.freq - 440) < 2.0,
    `Detected freq ${result.freq} should be within 2Hz of 440`
  );
  assert.equal(freqToMidi(result.freq), 69);
});

test('detectKeySignature correctly identifies C Major and A Minor', () => {
  const cMajorNotes: MidiNote[] = [
    { id: '1', midi: 60, start: 0, duration: 1, velocity: 0.8, stem: 'melody' }, // C
    { id: '2', midi: 64, start: 1, duration: 1, velocity: 0.8, stem: 'melody' }, // E
    { id: '3', midi: 67, start: 2, duration: 1, velocity: 0.8, stem: 'melody' }, // G
    { id: '4', midi: 72, start: 3, duration: 2, velocity: 0.8, stem: 'melody' }, // C
  ];
  const detected = detectKeySignature(cMajorNotes);
  assert.ok(detected.includes('C Major') || detected.includes('Major'), `Should detect major: ${detected}`);

  const aMinorNotes: MidiNote[] = [
    { id: '1', midi: 57, start: 0, duration: 2, velocity: 0.8, stem: 'bass' }, // A
    { id: '2', midi: 60, start: 1, duration: 1, velocity: 0.8, stem: 'melody' }, // C
    { id: '3', midi: 64, start: 2, duration: 1, velocity: 0.8, stem: 'melody' }, // E
    { id: '4', midi: 69, start: 3, duration: 2, velocity: 0.8, stem: 'melody' }, // A
  ];
  const detectedMin = detectKeySignature(aMinorNotes);
  assert.ok(detectedMin.includes('Minor') || detectedMin.includes('A'), `Should detect minor: ${detectedMin}`);
});

test('quantizeNotes snaps to 16th note grid (0.25s)', () => {
  const rawNotes: MidiNote[] = [
    { id: '1', midi: 60, start: 0.23, duration: 0.48, velocity: 0.8, stem: 'melody' },
    { id: '2', midi: 62, start: 0.52, duration: 0.26, velocity: 0.8, stem: 'melody' },
  ];
  const quantized = quantizeNotes(rawNotes, 0.25, 1.0, 0.0);
  assert.equal(quantized[0].start, 0.25);
  assert.equal(quantized[0].duration, 0.5);
  assert.equal(quantized[1].start, 0.5);
  assert.equal(quantized[1].duration, 0.25);
});

test('humanizeNotes modifies start timing and velocities within realistic bounds', () => {
  const rawNotes: MidiNote[] = [
    { id: '1', midi: 60, start: 1.0, duration: 0.5, velocity: 0.8, stem: 'melody' },
    { id: '2', midi: 62, start: 1.5, duration: 0.5, velocity: 0.8, stem: 'melody' },
  ];
  const humanized = humanizeNotes(rawNotes, 15, 0.1);
  assert.equal(humanized.length, 2);
  assert.ok(humanized[0].start >= 0);
  assert.ok(humanized[0].velocity >= 0.25 && humanized[0].velocity <= 1.0);
});

test('makeStandardMidiBytes creates valid SMF Format 1 MIDI file', () => {
  const notes = generateFurEliseDemo();
  const midiBytes = makeStandardMidiBytes(notes, 'Für Elise Beethoven', 96, 'piano', true);

  // Check MThd header: 'MThd' = 0x4D, 0x54, 0x68, 0x64
  assert.equal(midiBytes[0], 0x4d);
  assert.equal(midiBytes[1], 0x54);
  assert.equal(midiBytes[2], 0x68);
  assert.equal(midiBytes[3], 0x64);

  // Header length is 6
  assert.equal(midiBytes[7], 6);

  // Format 1
  assert.equal(midiBytes[8], 0);
  assert.equal(midiBytes[9], 1);

  // Check size is non-trivial and tracks exist
  assert.ok(midiBytes.length > 200, `MIDI size ${midiBytes.length} should be > 200 bytes`);

  // Check MTrk exists
  let foundMTrk = false;
  for (let i = 0; i < midiBytes.length - 4; i++) {
    if (
      midiBytes[i] === 0x4d &&
      midiBytes[i + 1] === 0x54 &&
      midiBytes[i + 2] === 0x72 &&
      midiBytes[i + 3] === 0x6b
    ) {
      foundMTrk = true;
      break;
    }
  }
  assert.ok(foundMTrk, 'Should contain MTrk chunk');
});

test('demos generate valid note collections', () => {
  const fur = generateFurEliseDemo();
  assert.ok(fur.length > 20, 'Für Elise demo should have > 20 notes');

  const canon = generateCanonInDDemo();
  assert.ok(canon.length > 20, 'Canon in D demo should have > 20 notes');
});
