/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MidiNote {
  id: string;
  midi: number;
  start: number; // in seconds
  duration: number; // in seconds
  velocity: number; // 0.0 to 1.0
  stem: 'melody' | 'harmony' | 'bass';
}

export interface InstrumentDef {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  type: OscillatorType;
  a: number; // attack (s)
  d: number; // decay (s)
  s: number; // sustain (0-1)
  r: number; // release (s)
  harm: number; // 2nd harmonic gain
  filter: number; // low-pass filter cutoff (Hz)
  gain: number;
  prog: number; // General MIDI program number
  detune?: number;
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: 'piano', label: 'Grand Piano', emoji: '🎹', desc: 'Warm felt concert piano', type: 'triangle', a: 0.005, d: 1.1, s: 0.18, r: 0.9, harm: 0.28, filter: 3800, gain: 0.95, prog: 0 },
  { id: 'synth', label: 'Neon Synth', emoji: '🎛️', desc: 'Sawtooth 80s lead synth', type: 'sawtooth', a: 0.02, d: 0.28, s: 0.52, r: 0.65, harm: 0.16, filter: 5200, gain: 0.52, prog: 80, detune: 8 },
  { id: 'guitar', label: 'Acoustic Guitar', emoji: '🎸', desc: 'Plucked nylon & steel strings', type: 'triangle', a: 0.004, d: 0.75, s: 0.03, r: 0.52, harm: 0.38, filter: 2700, gain: 0.9, prog: 24 },
  { id: 'violin', label: 'Violin / Strings', emoji: '🎻', desc: 'Bowed orchestral ensemble', type: 'sawtooth', a: 0.22, d: 0.2, s: 0.78, r: 0.55, harm: 0.22, filter: 3400, gain: 0.55, prog: 40 },
  { id: 'flute', label: 'Flute / Wind', emoji: '🪈', desc: 'Breathy sine with vibrato', type: 'sine', a: 0.09, d: 0.15, s: 0.65, r: 0.42, harm: 0.14, filter: 2500, gain: 0.95, prog: 73 },
  { id: 'musicbox', label: 'Music Box', emoji: '🎶', desc: 'Crystalline bell chimes', type: 'sine', a: 0.002, d: 1.5, s: 0.0, r: 1.05, harm: 0.58, filter: 6800, gain: 0.8, prog: 10 },
  { id: 'organ', label: 'Church Organ', emoji: '⛪', desc: 'Full cathedral pipes', type: 'triangle', a: 0.04, d: 0.1, s: 0.95, r: 0.55, harm: 0.45, filter: 3500, gain: 0.75, prog: 19 },
  { id: 'marimba', label: 'Marimba', emoji: '🪵', desc: 'Acoustic resonant wood mallets', type: 'sine', a: 0.002, d: 0.55, s: 0.0, r: 0.38, harm: 0.34, filter: 3100, gain: 0.95, prog: 12 },
];

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToName(m: number): string {
  const note = NOTE_NAMES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${note}${octave}`;
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function freqToMidi(f: number): number {
  if (f <= 0) return 0;
  return Math.round(69 + 12 * Math.log2(f / 440));
}

export function isBlackKey(m: number): boolean {
  return [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
}

export function formatSeconds(s: number): string {
  const safe = Math.max(0, s || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function determineStem(midi: number): 'melody' | 'harmony' | 'bass' {
  if (midi < 48) return 'bass';
  if (midi < 60) return 'harmony';
  return 'melody';
}

/**
 * Enhanced Autocorrelation with Parabolic Interpolation for Sub-Sample Pitch Accuracy
 */
export function autoCorrelateEnhanced(
  buf: Float32Array,
  sampleRate: number,
  minFreq = 55,
  maxFreq = 1800
): { freq: number; clarity: number } {
  const size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) {
    rms += buf[i] * buf[i];
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return { freq: -1, clarity: 0 };

  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.floor(sampleRate / minFreq);

  // Autocorrelation computation
  let bestLag = -1;
  let maxCorr = -1;
  let firstPeakFound = false;

  let totalEnergy = 0;
  for (let i = 0; i < size; i++) {
    totalEnergy += buf[i] * buf[i];
  }

  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag && lag < size; lag++) {
    let sum = 0;
    for (let i = 0; i < size - lag; i++) {
      sum += buf[i] * buf[i + lag];
    }
    corr[lag] = sum;
  }

  // Find the primary peak after the first dip
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] > corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      if (!firstPeakFound) {
        firstPeakFound = true;
      }
      if (corr[lag] > maxCorr) {
        maxCorr = corr[lag];
        bestLag = lag;
      }
    }
  }

  if (bestLag <= 0 || maxCorr <= 0) return { freq: -1, clarity: 0 };

  // Parabolic interpolation for fine tuning
  const y1 = corr[bestLag - 1] || 0;
  const y2 = corr[bestLag];
  const y3 = corr[bestLag + 1] || 0;
  const denom = 2 * (2 * y2 - y1 - y3);
  let fineLag = bestLag;
  if (denom !== 0) {
    const delta = (y1 - y3) / denom;
    fineLag = bestLag + delta;
  }

  const freq = sampleRate / fineLag;
  const clarity = totalEnergy > 0 ? Math.min(1, Math.max(0, maxCorr / totalEnergy)) : 0;

  return { freq, clarity };
}

/**
 * Key estimation using Krumhansl-Schmuckler key profile correlation
 */
export function detectKeySignature(notes: MidiNote[]): string {
  if (!notes.length) return 'C Major';
  const chroma = new Array(12).fill(0);
  for (const n of notes) {
    chroma[((n.midi % 12) + 12) % 12] += n.duration;
  }

  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  let bestScore = -Infinity;
  let bestRoot = 0;
  for (let r = 0; r < 12; r++) {
    let score = 0;
    for (let i = 0; i < 12; i++) {
      score += chroma[(r + i) % 12] * majorProfile[i];
    }
    if (score > bestScore) {
      bestScore = score;
      bestRoot = r;
    }
  }

  const relativeMinor = (bestRoot + 9) % 12;
  const isMinor = chroma[relativeMinor] > chroma[bestRoot] * 1.15;
  const rootIndex = isMinor ? relativeMinor : bestRoot;
  return `${NOTE_NAMES[rootIndex]}${isMinor ? ' Minor' : ' Major'}`;
}

export interface TranscriptionOptions {
  sensitivity?: number; // 0.1 to 1.0 (default 0.5)
  minNoteDuration?: number; // seconds, default 0.1
  quantizeGrid?: number; // 0 = raw, 0.25 = 1/16, 0.5 = 1/8, etc.
  minMidi?: number; // default 36 (C2)
  maxMidi?: number; // default 84 (C6)
  stemSplit?: boolean;
}

/**
 * Full buffer transcriber converting decoded AudioBuffer to timed MidiNotes
 */
export async function transcribeAudioBuffer(
  audioBuffer: AudioBuffer,
  options: TranscriptionOptions = {},
  onProgress?: (pct: number, stage: string) => void
): Promise<{ notes: MidiNote[]; bpm: number }> {
  const {
    sensitivity = 0.5,
    minNoteDuration = 0.1,
    minMidi = 36,
    maxMidi = 84,
  } = options;

  const sr = audioBuffer.sampleRate;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
  const totalSamples = ch0.length;

  // Mono mix
  const mono = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    mono[i] = (ch0[i] + ch1[i]) / 2;
  }

  // Hop window settings: 40ms hop gives crisp timing without dropping performance
  const hopSec = 0.04;
  const hopSize = Math.floor(sr * hopSec);
  const windowSize = Math.min(2048, Math.floor(sr * 0.08));
  const totalFrames = Math.floor((totalSamples - windowSize) / hopSize);

  interface RawFrame {
    time: number;
    midi: number | null;
    vel: number;
    energyDiff: number;
  }

  const frames: RawFrame[] = [];
  let prevRms = 0;
  const noiseFloor = 0.012 * (1.1 - sensitivity * 0.5);

  for (let idx = 0; idx < totalFrames; idx++) {
    const startSample = idx * hopSize;
    const slice = mono.subarray(startSample, startSample + windowSize);

    // Compute RMS
    let sumSq = 0;
    for (let j = 0; j < slice.length; j++) {
      sumSq += slice[j] * slice[j];
    }
    const rms = Math.sqrt(sumSq / slice.length);
    const energyDiff = Math.max(0, rms - prevRms);
    prevRms = rms;

    if (rms < noiseFloor) {
      frames.push({ time: idx * hopSec, midi: null, vel: 0, energyDiff });
    } else {
      const { freq, clarity } = autoCorrelateEnhanced(slice, sr, 50, 1800);
      if (freq > 50 && freq < 2000 && clarity > 0.25) {
        let midi = freqToMidi(freq);
        if (midi >= minMidi && midi <= maxMidi) {
          const vel = Math.min(1.0, Math.max(0.2, rms * 5 + 0.25));
          frames.push({ time: idx * hopSec, midi, vel, energyDiff });
        } else {
          frames.push({ time: idx * hopSec, midi: null, vel: 0, energyDiff });
        }
      } else {
        frames.push({ time: idx * hopSec, midi: null, vel: 0, energyDiff });
      }
    }

    if (idx % 25 === 0 && onProgress) {
      const pct = Math.round((idx / totalFrames) * 85);
      onProgress(
        pct,
        pct < 30
          ? 'Analyzing spectral transients & harmonics…'
          : pct < 70
          ? 'Tracking pitches, onsets & velocity…'
          : 'Refining note boundaries…'
      );
      await new Promise(r => setTimeout(r, 0));
    }
  }

  if (onProgress) onProgress(88, 'Grouping notes & calculating note duration…');

  // Group frames into discrete notes with transient onset splitting
  const rawNotes: MidiNote[] = [];
  let currentMidi: number | null = null;
  let currentStart = 0;
  let currentVels: number[] = [];
  let noteCounter = 0;

  const commitCurrent = (endTime: number) => {
    if (currentMidi !== null && currentVels.length > 0) {
      const dur = Math.max(minNoteDuration, endTime - currentStart);
      const avgVel = currentVels.reduce((a, b) => a + b, 0) / currentVels.length;
      rawNotes.push({
        id: `note-${noteCounter++}-${currentMidi}-${currentStart.toFixed(2)}`,
        midi: currentMidi,
        start: +currentStart.toFixed(3),
        duration: +dur.toFixed(3),
        velocity: +avgVel.toFixed(2),
        stem: determineStem(currentMidi),
      });
    }
    currentMidi = null;
    currentVels = [];
  };

  for (let i = 0; i < frames.length; i++) {
    const fr = frames[i];
    const isTransient = fr.energyDiff > 0.08 && currentVels.length >= 2;

    if (fr.midi === null) {
      commitCurrent(fr.time);
    } else if (currentMidi === null) {
      currentMidi = fr.midi;
      currentStart = fr.time;
      currentVels = [fr.vel];
    } else if (currentMidi === fr.midi && !isTransient) {
      currentVels.push(fr.vel);
    } else {
      // Different pitch or strong attack transient on same pitch
      commitCurrent(fr.time);
      currentMidi = fr.midi;
      currentStart = fr.time;
      currentVels = [fr.vel];
    }
  }
  commitCurrent(frames.length * hopSec);

  if (onProgress) onProgress(94, 'Detecting BPM tempo and generating bass reinforcement…');

  // Detect BPM based on inter-onset intervals
  const onsetDeltas: number[] = [];
  for (let i = 1; i < Math.min(rawNotes.length, 60); i++) {
    const delta = rawNotes[i].start - rawNotes[i - 1].start;
    if (delta > 0.18 && delta < 1.2) {
      onsetDeltas.push(delta);
    }
  }

  let bpm = 120;
  if (onsetDeltas.length >= 4) {
    onsetDeltas.sort((a, b) => a - b);
    const medianDelta = onsetDeltas[Math.floor(onsetDeltas.length / 2)];
    if (medianDelta > 0) {
      const rawBpm = Math.round(60 / medianDelta);
      bpm = Math.max(65, Math.min(180, rawBpm < 65 ? rawBpm * 2 : rawBpm > 180 ? Math.round(rawBpm / 2) : rawBpm));
    }
  }

  // Harmonic bass enrichment if audio has long chords
  const outNotes = [...rawNotes];
  const audioDuration = audioBuffer.duration;
  for (let t = 0; t < audioDuration - 1.5; t += 2.0) {
    const windowNotes = rawNotes.filter(n => n.start >= t && n.start < t + 2.0);
    if (windowNotes.length >= 2 && !windowNotes.some(n => n.midi < 48)) {
      const rootMidi = 36 + (windowNotes[0].midi % 12);
      outNotes.push({
        id: `bass-${t.toFixed(1)}`,
        midi: rootMidi,
        start: +t.toFixed(2),
        duration: 1.6,
        velocity: 0.45,
        stem: 'bass',
      });
    }
  }

  outNotes.sort((a, b) => a.start - b.start);

  if (onProgress) onProgress(100, 'Transcription complete!');

  return { notes: outNotes, bpm };
}

/**
 * Standard MIDI File (SMF Format 1) Binary Builder
 */
export function makeStandardMidiBytes(
  notes: MidiNote[],
  title = 'Audio2Midi Export',
  bpm = 120,
  instId = 'piano',
  separateStems = true
): Uint8Array {
  const TPQ = 480; // Ticks per quarter note
  const secToTick = (s: number) => Math.round(s * (bpm / 60) * TPQ);

  const def = INSTRUMENTS.find(x => x.id === instId) || INSTRUMENTS[0];
  const mpq = Math.round(60000000 / Math.max(30, bpm));

  // Variable-length quantity encoder
  const vlq = (n: number): number[] => {
    if (n <= 0) return [0];
    const b: number[] = [];
    while (n > 0) {
      b.unshift(n & 0x7f);
      n >>= 7;
    }
    for (let i = 0; i < b.length - 1; i++) {
      b[i] |= 0x80;
    }
    return b;
  };

  const strBytes = (s: string): number[] => {
    const unescaped = unescape(encodeURIComponent(s));
    const out: number[] = [];
    for (let i = 0; i < unescaped.length; i++) {
      out.push(unescaped.charCodeAt(i));
    }
    return out;
  };

  const u32 = (n: number): number[] => [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ];

  interface MidiEvent {
    tick: number;
    prio: number;
    data: number[];
  }

  const buildTrackData = (events: MidiEvent[]): number[] => {
    events.sort((a, b) => a.tick - b.tick || a.prio - b.prio);
    let out: number[] = [];
    let lastTick = 0;
    for (const ev of events) {
      const delta = Math.max(0, ev.tick - lastTick);
      out = out.concat(vlq(delta), ev.data);
      lastTick = ev.tick;
    }
    return out;
  };

  // Conductor Track (Tempo & Time Signature)
  const conductorEvents: MidiEvent[] = [
    { tick: 0, prio: 0, data: [0xff, 0x03].concat(vlq(strBytes(title).length), strBytes(title)) },
    { tick: 0, prio: 1, data: [0xff, 0x51, 0x03, (mpq >> 16) & 255, (mpq >> 8) & 255, mpq & 255] },
    { tick: 0, prio: 2, data: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] }, // 4/4 time
    { tick: 1, prio: 9, data: [0xff, 0x2f, 0x00] }, // End of Track
  ];
  const conductorTrack = buildTrackData(conductorEvents);

  const tracks: number[][] = [conductorTrack];

  if (separateStems) {
    const stems: Record<'melody' | 'harmony' | 'bass', MidiNote[]> = {
      melody: [],
      harmony: [],
      bass: [],
    };
    for (const n of notes) {
      stems[n.stem || determineStem(n.midi)].push(n);
    }

    const stemConfigs: [string, number, MidiNote[], number][] = [
      ['Melody / Lead', def.prog, stems.melody, 0],
      ['Harmony / Chords', 0, stems.harmony, 1],
      ['Acoustic Bass', 32, stems.bass, 2],
    ];

    for (const [name, prog, stemNotes, channel] of stemConfigs) {
      if (!stemNotes.length) continue;
      const evs: MidiEvent[] = [
        { tick: 0, prio: 0, data: [0xff, 0x03].concat(vlq(strBytes(name).length), strBytes(name)) },
        { tick: 0, prio: 1, data: [0xc0 | channel, prog] }, // Program change
      ];

      let maxTick = 0;
      for (const n of stemNotes) {
        const onTick = secToTick(n.start);
        const offTick = Math.max(onTick + 1, secToTick(n.start + n.duration));
        const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));

        evs.push({ tick: onTick, prio: 3, data: [0x90 | channel, n.midi, vel] });
        evs.push({ tick: offTick, prio: 2, data: [0x80 | channel, n.midi, 64] });
        if (offTick > maxTick) maxTick = offTick;
      }
      evs.push({ tick: maxTick + 1, prio: 9, data: [0xff, 0x2f, 0x00] });
      tracks.push(buildTrackData(evs));
    }
  } else {
    // Single track mode
    const evs: MidiEvent[] = [
      { tick: 0, prio: 0, data: [0xff, 0x03].concat(vlq(strBytes(title).length), strBytes(title)) },
      { tick: 0, prio: 1, data: [0xc0, def.prog] },
    ];
    let maxTick = 0;
    for (const n of notes) {
      const onTick = secToTick(n.start);
      const offTick = Math.max(onTick + 1, secToTick(n.start + n.duration));
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));

      evs.push({ tick: onTick, prio: 3, data: [0x90, n.midi, vel] });
      evs.push({ tick: offTick, prio: 2, data: [0x80, n.midi, 64] });
      if (offTick > maxTick) maxTick = offTick;
    }
    evs.push({ tick: maxTick + 1, prio: 9, data: [0xff, 0x2f, 0x00] });
    tracks.push(buildTrackData(evs));
  }

  // File Header: MThd, length 6, format 1, num tracks, TPQ
  const fileBytes: number[] = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x01,
    (tracks.length >> 8) & 255,
    tracks.length & 255,
    (TPQ >> 8) & 255,
    TPQ & 255,
  ];

  for (const tr of tracks) {
    fileBytes.push(0x4d, 0x54, 0x72, 0x6b);
    fileBytes.push(...u32(tr.length));
    fileBytes.push(...tr);
  }

  return new Uint8Array(fileBytes);
}

/**
 * Quantize notes to given grid division (e.g. 0.25 = 16th note, 0.5 = 8th note)
 * Supports strength percentage and swing
 */
export function quantizeNotes(
  notes: MidiNote[],
  grid: number,
  strength = 1.0,
  swing = 0.0
): MidiNote[] {
  if (grid <= 0) return notes.map(n => ({ ...n }));

  return notes.map(n => {
    const rawStart = n.start;
    const beatIndex = Math.round(rawStart / grid);
    let targetStart = beatIndex * grid;

    // Apply swing to off-beats
    if (swing > 0 && beatIndex % 2 === 1) {
      targetStart += grid * (swing * 0.33);
    }

    const finalStart = rawStart + (targetStart - rawStart) * strength;
    const quantizedDuration = Math.max(grid * 0.5, Math.round(n.duration / grid) * grid);
    const finalDuration = n.duration + (quantizedDuration - n.duration) * strength;

    return {
      ...n,
      start: +finalStart.toFixed(3),
      duration: +Math.max(0.08, finalDuration).toFixed(3),
    };
  });
}

/**
 * Humanize velocities and slight micro-timing
 */
export function humanizeNotes(
  notes: MidiNote[],
  timingJitterMs = 12,
  velRange = 0.15
): MidiNote[] {
  return notes.map(n => {
    const jitterSec = ((Math.random() * 2 - 1) * timingJitterMs) / 1000;
    const newStart = Math.max(0, n.start + jitterSec);
    const velOffset = (Math.random() * 2 - 1) * velRange;
    const newVel = Math.min(1.0, Math.max(0.25, n.velocity + velOffset));

    return {
      ...n,
      start: +newStart.toFixed(3),
      velocity: +newVel.toFixed(2),
    };
  });
}

/**
 * Pre-composed Demos
 */
function seq(raw: [number, number, number, number?][]): MidiNote[] {
  return raw
    .sort((a, b) => a[1] - b[1])
    .map((n, i) => ({
      id: `demo-${i}-${n[0]}-${n[1]}`,
      midi: n[0],
      start: n[1],
      duration: n[2],
      velocity: n[3] ?? 0.8,
      stem: determineStem(n[0]),
    }));
}

export function generateFurEliseDemo(): MidiNote[] {
  const raw: [number, number, number, number?][] = [];
  let t = 0;
  const e = 0.38;
  const mel = [76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71, 72, 64, 76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 72, 71, 69];
  mel.forEach((m, i) => {
    raw.push([m, t, i % 8 === 0 ? 0.6 : e, 0.75 + (i % 4) * 0.05]);
    t += e;
  });
  [45, 52, 57, 40, 52, 56, 45, 52, 57, 40, 52, 56, 45, 52, 57].forEach((m, i) => {
    raw.push([m, i * 0.76, 0.7, 0.52]);
  });
  return seq(raw);
}

export function generateCanonInDDemo(): MidiNote[] {
  const raw: [number, number, number, number?][] = [];
  const chords = [
    [50, 57, 66], [45, 52, 61], [47, 54, 62], [42, 49, 57],
    [43, 50, 59], [38, 45, 54], [43, 50, 59], [45, 52, 61],
  ];
  chords.forEach((c, i) => {
    c.forEach(m => raw.push([m, i * 1.2, 1.15, 0.48]));
  });
  [78, 76, 74, 73, 71, 74, 71, 69, 71, 73, 74, 76, 78, 76, 74, 73, 71].forEach((m, i) => {
    raw.push([m, i * 0.6, 0.55, 0.85]);
  });
  [50, 45, 47, 42, 43, 38, 43, 45].forEach((m, i) => {
    raw.push([m, i * 1.2, 1.1, 0.65]);
  });
  return seq(raw);
}

export function generateNeonSkylineDemo(): MidiNote[] {
  const raw: [number, number, number, number?][] = [];
  const roots = [45, 41, 48, 43];
  for (let b = 0; b < 4; b++) {
    const r = roots[b];
    [0, 7, 12, 16, 19, 16, 12, 7].forEach((iv, i) => {
      raw.push([r + 24 + iv, b * 2 + i * 0.25, 0.24, 0.72]);
    });
    raw.push([r, b * 2, 1.8, 0.75]);
    raw.push([r + 7, b * 2 + 1, 0.9, 0.55]);
    raw.push([r + 36, b * 2 + 0.5, 0.5, 0.9]);
    raw.push([r + 34, b * 2 + 1.25, 0.4, 0.8]);
  }
  return seq(raw);
}

export function generateTwinkleVoiceDemo(): MidiNote[] {
  const mel = [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60, 67, 67, 65, 65, 64, 64, 62, 67, 67, 65, 65, 64, 64, 62, 60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60];
  const raw: [number, number, number, number?][] = mel.map((m, i) => [
    m,
    i * 0.5,
    i % 7 === 6 ? 0.9 : 0.45,
    0.8,
  ]);
  [48, 53, 48, 55, 48, 53, 48].forEach((m, i) => {
    raw.push([m, i * 3.5, 1.6, 0.5]);
  });
  return seq(raw);
}
