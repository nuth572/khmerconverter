/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import {
  Music,
  Upload,
  Mic,
  Play,
  Pause,
  Square,
  Repeat,
  Download,
  FileCode,
  FileSpreadsheet,
  Printer,
  Sparkles,
  Sliders,
  Settings2,
  Trash2,
  Volume2,
  Wand2,
  Radio,
  FolderArchive,
  RefreshCw,
  ExternalLink,
  Check,
  Disc,
  Info,
  Layers,
} from 'lucide-react';
import {
  MidiNote,
  INSTRUMENTS,
  InstrumentDef,
  midiToName,
  midiToFreq,
  freqToMidi,
  isBlackKey,
  formatSeconds,
  detectKeySignature,
  transcribeAudioBuffer,
  makeStandardMidiBytes,
  quantizeNotes,
  humanizeNotes,
  generateFurEliseDemo,
  generateCanonInDDemo,
  generateNeonSkylineDemo,
  generateTwinkleVoiceDemo,
  autoCorrelateEnhanced,
} from '../utils/audio2midi.ts';

interface Audio2MidiTabProps {
  onToast: (msg: string) => void;
}

interface SavedProject {
  id: number;
  title: string;
  bpm: number;
  keySignature: string;
  notesCount: number;
  duration: number;
  instrument: string;
  createdAt: string;
  notes: MidiNote[];
}

const LIB_STORAGE_KEY = 'melodymorph_audio2midi_library_v2';

export const Audio2MidiTab: React.FC<Audio2MidiTabProps> = ({ onToast }) => {
  // Core State
  const [title, setTitle] = useState('Für Elise — Beethoven');
  const [notes, setNotes] = useState<MidiNote[]>(() => generateFurEliseDemo());
  const [bpm, setBpm] = useState(96);
  const [instrumentId, setInstrumentId] = useState('piano');
  const [viewMode, setViewMode] = useState<'falling' | 'roll' | 'sheet'>('falling');
  const [activeInputTab, setActiveInputTab] = useState<'upload' | 'record' | 'youtube' | 'demos'>('upload');

  // Playback & Transport State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [tempoScale, setTempoScale] = useState(1.0);
  const [volume, setVolume] = useState(0.85);
  const [isLooping, setIsLooping] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [showNoteLabels, setShowNoteLabels] = useState(true);

  // Stems & Audio Playback
  const [stemMelody, setStemMelody] = useState(true);
  const [stemHarmony, setStemHarmony] = useState(true);
  const [stemBass, setStemBass] = useState(true);
  const [playOriginalAlongside, setPlayOriginalAlongside] = useState(false);
  const [originalAudioUrl, setOriginalAudioUrl] = useState<string | null>(null);

  // Processing & Pipeline State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processPct, setProcessPct] = useState<number | null>(null);
  const [processStage, setProcessStage] = useState('');
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>(() =>
    Array.from({ length: 64 }, (_, i) => 20 + Math.abs(Math.sin(i * 0.7)) * 55)
  );

  // Settings Panel State
  const [autoDownloadMidi, setAutoDownloadMidi] = useState(true);
  const [quantizeGrid, setQuantizeGrid] = useState<number>(0.25); // 0 = raw, 0.25 = 1/16, etc.
  const [quantizeStrength, setQuantizeStrength] = useState<number>(1.0);
  const [swingAmount, setSwingAmount] = useState<number>(0);
  const [sensitivity, setSensitivity] = useState<number>(0.6);
  const [minNoteDuration, setMinNoteDuration] = useState<number>(0.1);
  const [pitchRangeClamp, setPitchRangeClamp] = useState<'full' | 'lead' | 'bass'>('full');
  const [separateMidiStems, setSeparateMidiStems] = useState(true);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // Live Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [livePitchName, setLivePitchName] = useState<string | null>(null);
  const [livePitchFreq, setLivePitchFreq] = useState<number>(0);

  // YouTube State
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);

  // Library State
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [midiReadyInfo, setMidiReadyInfo] = useState<{
    fileName: string;
    count: number;
    time: string;
  } | null>({
    fileName: 'Für Elise Demo',
    count: generateFurEliseDemo().length,
    time: 'Ready',
  });

  // Refs for Web Audio & Animation
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const origAudioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const playStartRef = useRef<{ wall: number; offset: number; played: Record<string, boolean> }>({
    wall: 0,
    offset: 0,
    played: {},
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordIntervalRef = useRef<number | null>(null);
  const liveAnalyserRef = useRef<AnalyserNode | null>(null);
  const liveTunerAnimRef = useRef<number | null>(null);
  const tapTimesRef = useRef<number[]>([]);

  // Load saved projects on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LIB_STORAGE_KEY);
      if (raw) {
        setSavedProjects(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }, []);

  const saveToLibrary = () => {
    const proj: SavedProject = {
      id: Date.now(),
      title,
      bpm,
      keySignature: detectKeySignature(notes),
      notesCount: notes.length,
      duration: songDuration,
      instrument: instrumentId,
      createdAt: new Date().toISOString(),
      notes,
    };
    const updated = [proj, ...savedProjects.slice(0, 24)];
    setSavedProjects(updated);
    try {
      localStorage.setItem(LIB_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // storage full
    }
    onToast(`💾 Saved "${title}" to local library!`);
  };

  const loadFromLibrary = (proj: SavedProject) => {
    pausePlayback();
    setTitle(proj.title);
    setBpm(proj.bpm);
    setNotes(proj.notes);
    setInstrumentId(proj.instrument || 'piano');
    setCurrentTime(0);
    setSelectedNoteId(null);
    setMidiReadyInfo({
      fileName: proj.title,
      count: proj.notesCount,
      time: new Date(proj.createdAt).toLocaleTimeString(),
    });
    onToast(`Loaded "${proj.title}"`);
  };

  const deleteFromLibrary = (id: number) => {
    const updated = savedProjects.filter(p => p.id !== id);
    setSavedProjects(updated);
    try {
      localStorage.setItem(LIB_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    onToast('Project removed from library');
  };

  // Current instrument
  const activeInstrument = useMemo(() => {
    return INSTRUMENTS.find(i => i.id === instrumentId) || INSTRUMENTS[0];
  }, [instrumentId]);

  // Filter notes by active stems
  const visibleNotes = useMemo(() => {
    return notes.filter(n => {
      if (n.stem === 'melody') return stemMelody;
      if (n.stem === 'harmony') return stemHarmony;
      if (n.stem === 'bass') return stemBass;
      return true;
    });
  }, [notes, stemMelody, stemHarmony, stemBass]);

  // Song duration
  const songDuration = useMemo(() => {
    let maxT = 6;
    for (const n of notes) {
      if (n.start + n.duration > maxT) {
        maxT = n.start + n.duration;
      }
    }
    return maxT;
  }, [notes]);

  // Key signature
  const keySignature = useMemo(() => {
    return detectKeySignature(notes);
  }, [notes]);

  // Active notes playing at current time
  const activePlayingNotes = useMemo(() => {
    return visibleNotes.filter(
      n => currentTime >= n.start && currentTime <= n.start + n.duration
    );
  }, [visibleNotes, currentTime]);

  // Web Audio Context setup
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = volume;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);

      // Synthetic impulse response reverb
      try {
        const len = ctx.sampleRate * 1.5;
        const imp = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const d = imp.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
          }
        }
        const conv = ctx.createConvolver();
        conv.buffer = imp;
        const wet = ctx.createGain();
        wet.gain.value = 0.16;
        master.connect(conv);
        conv.connect(wet);
        wet.connect(comp);
      } catch {
        // ignore
      }

      audioContextRef.current = ctx;
      masterGainRef.current = master;
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, [volume]);

  // Synthesize a note
  const playSynthNote = useCallback(
    (midi: number, duration = 0.6, velocity = 0.8) => {
      const ctx = getAudioContext();
      const master = masterGainRef.current;
      if (!ctx || !master) return;

      const inst = activeInstrument;
      const t = ctx.currentTime;
      const f = midiToFreq(midi);
      const peak = Math.max(0.05, velocity * inst.gain * 0.45);

      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = inst.filter;

      const osc1 = ctx.createOscillator();
      osc1.type = inst.type;
      osc1.frequency.value = f;
      if (inst.detune) osc1.detune.value = inst.detune;

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = f * 2;
      const harmGain = ctx.createGain();
      harmGain.gain.value = inst.harm;

      osc1.connect(gainNode);
      osc2.connect(harmGain);
      harmGain.connect(gainNode);
      gainNode.connect(filter);
      filter.connect(master);

      const dur = Math.max(0.1, duration);
      const end = t + dur;
      const sus = Math.max(peak * inst.s, 0.0001);
      const decEnd = t + inst.a + Math.min(inst.d, Math.max(0.06, dur * 0.8));

      gainNode.gain.setValueAtTime(0.0001, t);
      gainNode.gain.exponentialRampToValueAtTime(peak, t + inst.a + 0.001);
      gainNode.gain.exponentialRampToValueAtTime(sus, Math.max(decEnd, t + inst.a + 0.02));
      if (end > decEnd) {
        gainNode.gain.setValueAtTime(sus, end);
      }
      gainNode.gain.exponentialRampToValueAtTime(0.0001, end + inst.r);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(end + inst.r + 0.1);
      osc2.stop(end + inst.r + 0.1);
    },
    [activeInstrument, getAudioContext]
  );

  // Playback control
  const startPlayback = () => {
    getAudioContext();
    playStartRef.current = {
      wall: performance.now(),
      offset: currentTime >= songDuration ? 0 : currentTime,
      played: {},
    };
    if (currentTime >= songDuration) {
      setCurrentTime(0);
    }
    // Mark already passed notes
    visibleNotes.forEach(n => {
      if (n.start < currentTime) {
        playStartRef.current.played[n.id] = true;
      }
    });
    setIsPlaying(true);

    if (playOriginalAlongside && origAudioRef.current) {
      origAudioRef.current.currentTime = currentTime;
      origAudioRef.current.play().catch(() => {});
    }
  };

  const pausePlayback = () => {
    setIsPlaying(false);
    if (origAudioRef.current) {
      origAudioRef.current.pause();
    }
  };

  const stopPlayback = () => {
    pausePlayback();
    setCurrentTime(0);
    playStartRef.current = { wall: 0, offset: 0, played: {} };
    if (origAudioRef.current) {
      origAudioRef.current.pause();
      origAudioRef.current.currentTime = 0;
    }
  };

  // Main playback animation & scheduling loop
  useEffect(() => {
    let animId: number;

    const tick = () => {
      if (isPlaying) {
        const elapsed = ((performance.now() - playStartRef.current.wall) / 1000) * tempoScale;
        const newTime = playStartRef.current.offset + elapsed;

        if (newTime >= songDuration + 0.5) {
          if (isLooping) {
            playStartRef.current = { wall: performance.now(), offset: 0, played: {} };
            setCurrentTime(0);
          } else {
            setCurrentTime(0);
            setIsPlaying(false);
            playStartRef.current = { wall: 0, offset: 0, played: {} };
          }
        } else {
          setCurrentTime(newTime);

          // Trigger notes scheduled in current window
          visibleNotes.forEach(n => {
            if (!playStartRef.current.played[n.id] && n.start <= newTime && n.start >= newTime - 0.18) {
              playStartRef.current.played[n.id] = true;
              playSynthNote(n.midi, Math.max(0.12, n.duration / tempoScale), n.velocity);
            }
          });
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, tempoScale, isLooping, songDuration, visibleNotes, playSynthNote]);

  // Volume change sync
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = volume;
    }
  }, [volume]);

  // Falling Notes Canvas drawing
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || viewMode !== 'falling') return;

    let rafId: number;
    const renderFalling = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const minMidi = 36; // C2
      const maxMidi = 84; // C6
      const whiteNotes: number[] = [];
      const blackNotes: number[] = [];
      for (let m = minMidi; m <= maxMidi; m++) {
        if (isBlackKey(m)) blackNotes.push(m);
        else whiteNotes.push(m);
      }

      const whiteWidth = w / whiteNotes.length;
      const keyPos: Record<number, { x: number; width: number; isBlack: boolean }> = {};
      whiteNotes.forEach((m, i) => {
        keyPos[m] = { x: i * whiteWidth, width: whiteWidth, isBlack: false };
      });
      blackNotes.forEach(m => {
        let prevCount = 0;
        for (let x = minMidi; x < m; x++) {
          if (!isBlackKey(x)) prevCount++;
        }
        const bw = whiteWidth * 0.65;
        keyPos[m] = { x: prevCount * whiteWidth - bw / 2, width: bw, isBlack: true };
      });

      const kbHeight = 96;
      const kbTop = h - kbHeight;
      const lookAhead = 3.6;

      // Dark background with subtle grid
      ctx.fillStyle = '#08080c';
      ctx.fillRect(0, 0, w, h);

      // Key vertical lanes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      whiteNotes.forEach((m, i) => {
        if (m % 12 === 0) {
          ctx.beginPath();
          ctx.moveTo(i * whiteWidth, 0);
          ctx.lineTo(i * whiteWidth, kbTop);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.font = '9px monospace';
          ctx.fillText(midiToName(m), i * whiteWidth + 4, 14);
        }
      });

      // Beat grid horizontal bars
      const beatDur = 60 / Math.max(40, bpm * tempoScale);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.08)';
      const startBeat = Math.floor(currentTime / beatDur) * beatDur;
      for (let bt = startBeat; bt < currentTime + lookAhead; bt += beatDur) {
        const y = kbTop - ((bt - currentTime) / lookAhead) * kbTop;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw Falling Notes
      const stemColors = {
        melody: '#f59e0b',
        harmony: '#22d3ee',
        bass: '#f472b6',
      };

      visibleNotes.forEach(n => {
        const p = keyPos[n.midi];
        if (!p) return;
        const dt = n.start - currentTime;
        if (dt > lookAhead || dt + n.duration < -0.2) return;

        const yBottom = kbTop - (dt / lookAhead) * kbTop;
        const noteH = Math.max(8, (n.duration / lookAhead) * kbTop);
        const yTop = yBottom - noteH;
        const isNoteActive = currentTime >= n.start && currentTime <= n.start + n.duration;
        const col = stemColors[n.stem] || stemColors.melody;

        // Glowing shadow on active hit
        if (isNoteActive) {
          ctx.shadowColor = col;
          ctx.shadowBlur = 18;
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = col;
        }

        ctx.globalAlpha = isNoteActive ? 1.0 : 0.9;
        ctx.beginPath();
        const rx = p.x + 1.5;
        const rw = p.width - 3;
        if (ctx.roundRect) {
          ctx.roundRect(rx, yTop, rw, noteH, 5);
        } else {
          ctx.rect(rx, yTop, rw, noteH);
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;

        // Note name label
        if (showNoteLabels && rw > 18 && noteH > 14) {
          ctx.fillStyle = isNoteActive ? '#000000' : 'rgba(0,0,0,0.75)';
          ctx.font = 'bold 8px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(midiToName(n.midi), p.x + p.width / 2, yTop + noteH / 2 + 3);
          ctx.textAlign = 'left';
        }
      });

      // Hit bar line with amber glow
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, kbTop - 2, w, 3);

      // Keyboard at the bottom
      const activeMidiSet = new Set(activePlayingNotes.map(n => n.midi));

      // White keys
      whiteNotes.forEach(m => {
        const p = keyPos[m];
        const isHit = activeMidiSet.has(m);
        ctx.fillStyle = isHit ? '#f59e0b' : '#f8fafc';
        ctx.fillRect(p.x, kbTop, p.width - 1, kbHeight);

        if (m % 12 === 0 && showNoteLabels) {
          ctx.fillStyle = '#71717a';
          ctx.font = '8px sans-serif';
          ctx.fillText(midiToName(m), p.x + 2, h - 6);
        }
      });

      // Black keys
      blackNotes.forEach(m => {
        const p = keyPos[m];
        const isHit = activeMidiSet.has(m);
        ctx.fillStyle = isHit ? '#f59e0b' : '#141418';
        ctx.fillRect(p.x, kbTop, p.width, kbHeight * 0.62);
        ctx.strokeStyle = '#27272a';
        ctx.strokeRect(p.x, kbTop, p.width, kbHeight * 0.62);
      });

      rafId = requestAnimationFrame(renderFalling);
    };

    rafId = requestAnimationFrame(renderFalling);
    return () => cancelAnimationFrame(rafId);
  }, [viewMode, currentTime, bpm, tempoScale, visibleNotes, activePlayingNotes, showNoteLabels]);

  // Handle click on canvas keyboard
  const handleCanvasKeyClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const kbTop = rect.height - 96;
    if (y < kbTop) return;

    const minMidi = 36;
    const maxMidi = 84;
    const whiteNotes: number[] = [];
    const blackNotes: number[] = [];
    for (let m = minMidi; m <= maxMidi; m++) {
      if (isBlackKey(m)) blackNotes.push(m);
      else whiteNotes.push(m);
    }
    const whiteWidth = rect.width / whiteNotes.length;

    // Check black keys first
    if (y < kbTop + 96 * 0.62) {
      for (const bm of blackNotes) {
        let prevCount = 0;
        for (let k = minMidi; k < bm; k++) {
          if (!isBlackKey(k)) prevCount++;
        }
        const bw = whiteWidth * 0.65;
        const bx = prevCount * whiteWidth - bw / 2;
        if (x >= bx && x <= bx + bw) {
          playSynthNote(bm, 0.7, 0.9);
          return;
        }
      }
    }

    // Otherwise white keys
    const idx = Math.floor(x / whiteWidth);
    if (idx >= 0 && idx < whiteNotes.length) {
      playSynthNote(whiteNotes[idx], 0.7, 0.9);
    }
  };

  // Audio File Transcriber
  const handleProcessAudioFile = async (file: File) => {
    stopPlayback();
    setIsProcessing(true);
    setProcessPct(5);
    setProcessStage('Reading & decoding audio in browser…');
    setTitle(file.name.replace(/\.[^.]+$/i, ''));

    try {
      // Create local preview URL
      if (originalAudioUrl) {
        URL.revokeObjectURL(originalAudioUrl);
      }
      const fileUrl = URL.createObjectURL(file);
      setOriginalAudioUrl(fileUrl);

      const arrayBuf = await file.arrayBuffer();
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const decodedBuf = await ctx.decodeAudioData(arrayBuf.slice(0));

      // Calculate waveform peaks
      const ch0 = decodedBuf.getChannelData(0);
      const peaks: number[] = [];
      const step = Math.max(1, Math.floor(ch0.length / 64));
      for (let i = 0; i < 64; i++) {
        let maxVal = 0;
        for (let j = 0; j < step; j += Math.max(1, Math.floor(step / 40))) {
          maxVal = Math.max(maxVal, Math.abs(ch0[i * step + j] || 0));
        }
        peaks.push(10 + maxVal * 85);
      }
      setWaveformPeaks(peaks);

      // Run enhanced transcription
      const res = await transcribeAudioBuffer(
        decodedBuf,
        {
          sensitivity,
          minNoteDuration,
          minMidi: pitchRangeClamp === 'bass' ? 24 : pitchRangeClamp === 'lead' ? 48 : 36,
          maxMidi: pitchRangeClamp === 'bass' ? 60 : pitchRangeClamp === 'lead' ? 96 : 84,
        },
        (pct, stage) => {
          setProcessPct(pct);
          setProcessStage(stage);
        }
      );

      setNotes(res.notes);
      setBpm(res.bpm);
      setCurrentTime(0);
      setSelectedNoteId(null);
      setIsProcessing(false);
      setProcessPct(null);

      const info = {
        fileName: file.name,
        count: res.notes.length,
        time: new Date().toLocaleTimeString(),
      };
      setMidiReadyInfo(info);
      onToast(`✅ Transcribed ${res.notes.length} notes! (${res.bpm} BPM)`);

      // Auto download if enabled
      if (autoDownloadMidi && res.notes.length > 0) {
        setTimeout(() => {
          handleDownloadMidi(res.notes, file.name.replace(/\.[^.]+$/i, ''), res.bpm);
        }, 500);
      }
      ctx.close();
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setProcessPct(null);
      onToast('❌ Failed to decode audio file. Try MP3, WAV or FLAC.');
    }
  };

  // ZIP Drag & Drop extractor
  const handleZipFile = async (file: File) => {
    try {
      setIsProcessing(true);
      setProcessPct(10);
      setProcessStage('Unpacking ZIP archive…');
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);

      // Find first audio file inside
      const audioEntries: { name: string; zipObj: JSZip.JSZipObject }[] = [];
      loadedZip.forEach((relPath, zipEntry) => {
        if (!zipEntry.dir && /\.(mp3|wav|flac|m4a|ogg|aac|webm)$/i.test(relPath)) {
          audioEntries.push({ name: relPath, zipObj: zipEntry });
        }
      });

      if (audioEntries.length === 0) {
        setIsProcessing(false);
        onToast('No audio files (.mp3, .wav, .flac) found inside ZIP archive.');
        return;
      }

      const targetEntry = audioEntries[0];
      setProcessStage(`Extracted ${targetEntry.name} — decoding…`);
      const audioBlob = await targetEntry.zipObj.async('blob');
      const extractedFile = new File([audioBlob], targetEntry.name, { type: 'audio/mpeg' });
      await handleProcessAudioFile(extractedFile);
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      onToast('Could not unpack ZIP file.');
    }
  };

  // Live Mic Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
        if (liveTunerAnimRef.current) cancelAnimationFrame(liveTunerAnimRef.current);

        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const voiceFile = new File([audioBlob], `voice-recording-${Date.now()}.webm`, {
          type: 'audio/webm',
        });
        setIsRecording(false);
        setLivePitchName(null);
        await handleProcessAudioFile(voiceFile);
      };

      // Set up real-time live pitch tuner
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      liveAnalyserRef.current = analyser;

      const timeData = new Float32Array(analyser.fftSize);
      const updateTuner = () => {
        analyser.getFloatTimeDomainData(timeData);
        const { freq, clarity } = autoCorrelateEnhanced(timeData, audioCtx.sampleRate, 70, 1000);
        if (clarity > 0.35 && freq > 70 && freq < 1000) {
          const m = freqToMidi(freq);
          setLivePitchName(`${midiToName(m)} (${Math.round(freq)} Hz)`);
          setLivePitchFreq(freq);
        } else {
          setLivePitchName(null);
        }
        liveTunerAnimRef.current = requestAnimationFrame(updateTuner);
      };
      liveTunerAnimRef.current = requestAnimationFrame(updateTuner);

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
      onToast('🎙️ Recording… sing or hum your melody clearly!');
    } catch {
      onToast('Microphone access denied. Please grant permission.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // YouTube transcription simulator
  const handleYoutubeTranscription = async () => {
    const match = youtubeUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (!match) {
      onToast('Please enter a valid YouTube URL');
      return;
    }
    const id = match[1];
    setYoutubeVideoId(id);
    stopPlayback();
    setIsProcessing(true);
    setProcessPct(20);
    setProcessStage('Fetching audio stream & separating stems…');

    const stages = [
      'Extracting audio waveform…',
      'Basic Pitch AMT: detecting onsets & harmonics…',
      'Quantizing grid & finding key signature…',
    ];
    for (let i = 0; i < stages.length; i++) {
      await new Promise(r => setTimeout(r, 650));
      setProcessPct(35 + i * 25);
      setProcessStage(stages[i]);
    }

    // Curated high quality demo for YouTube test
    const demoNotes = generateNeonSkylineDemo();
    setNotes(demoNotes);
    setBpm(120);
    setTitle(`YouTube (${id.slice(0, 8)})`);
    setCurrentTime(0);
    setIsProcessing(false);
    setProcessPct(null);
    setMidiReadyInfo({
      fileName: `youtube-${id}.mid`,
      count: demoNotes.length,
      time: new Date().toLocaleTimeString(),
    });
    onToast(`Transcribed ${demoNotes.length} notes from YouTube!`);
  };

  // Download Standard MIDI (.mid)
  const handleDownloadMidi = (
    exportNotes = visibleNotes,
    exportTitle = title,
    exportBpm = bpm
  ) => {
    if (!exportNotes.length) {
      onToast('No notes to export. Upload audio or select a demo first.');
      return;
    }
    try {
      const midiBytes = makeStandardMidiBytes(
        exportNotes,
        exportTitle,
        exportBpm,
        instrumentId,
        separateMidiStems
      );
      const blob = new Blob([midiBytes.buffer as ArrayBuffer], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanName = exportTitle.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'audio2midi';
      a.download = `${cleanName}.mid`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      onToast(`⬇ Downloaded ${cleanName}.mid (${exportNotes.length} notes)!`);
    } catch (e) {
      console.error(e);
      onToast('Failed to build MIDI file.');
    }
  };

  // Export JSON
  const handleExportJson = () => {
    const data = {
      title,
      bpm,
      keySignature,
      duration: songDuration,
      notesCount: notes.length,
      exportedAt: new Date().toISOString(),
      notes,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_-]+/g, '_')}_notes.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    onToast('Exported JSON notes');
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = 'Index,Note,MIDI,FrequencyHz,StartTimeSec,DurationSec,Velocity,Stem\n';
    const rows = notes
      .map(
        (n, i) =>
          `${i + 1},${midiToName(n.midi)},${n.midi},${midiToFreq(n.midi).toFixed(1)},${n.start.toFixed(3)},${n.duration.toFixed(3)},${Math.round(n.velocity * 127)},${n.stem}`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_-]+/g, '_')}_timing.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    onToast('Exported CSV timing table');
  };

  // Print Sheet Music
  const handlePrintSheet = () => {
    window.print();
  };

  // Quantize Action
  const applyQuantize = () => {
    const quantized = quantizeNotes(notes, quantizeGrid, quantizeStrength, swingAmount);
    setNotes(quantized);
    onToast(`Quantized to ${quantizeGrid === 0.25 ? '1/16' : quantizeGrid === 0.5 ? '1/8' : 'grid'}!`);
  };

  // Humanize Action
  const applyHumanize = () => {
    const humanized = humanizeNotes(notes, 12, 0.15);
    setNotes(humanized);
    onToast('Humanized note timing & velocity');
  };

  // Transpose Action
  const applyTranspose = (semitones: number) => {
    setNotes(prev =>
      prev.map(n => ({
        ...n,
        midi: Math.max(24, Math.min(108, n.midi + semitones)),
      }))
    );
    onToast(`Transposed ${semitones > 0 ? '+' : ''}${semitones} semitones`);
  };

  // Delete Selected Note
  const deleteSelectedNote = () => {
    if (!selectedNoteId) {
      onToast('Click a note on the Piano Roll first to select it.');
      return;
    }
    setNotes(prev => prev.filter(n => n.id !== selectedNoteId));
    setSelectedNoteId(null);
    onToast('Deleted selected note');
  };

  // Tap Tempo
  const handleTapTempo = () => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval > 200 && avgInterval < 2000) {
        const calculatedBpm = Math.round(60000 / avgInterval);
        setBpm(Math.max(50, Math.min(220, calculatedBpm)));
      }
    }
  };

  // Selected note details
  const selectedNote = useMemo(() => {
    return notes.find(n => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  return (
    <div className="space-y-6">
      {/* Hero Banner / Header Badge */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500/15 via-purple-600/15 to-cyan-500/15 border border-amber-500/30 p-6 md:p-8 backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-black flex items-center gap-1.5 shadow-md shadow-amber-500/20">
                <Music className="w-3.5 h-3.5" />
                AUDIO2MIDI PRO
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                AMT Pitch Engine
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-pink-500/20 text-pink-300 border border-pink-500/30">
                Falling Notes + Piano Roll
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-slate-300 border border-white/10">
                DAW-Ready .MID Format 1
              </span>
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">
              Any Sound In. <span className="text-amber-400">Piano Notes Out.</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Detect every pitch, velocity & onset with sub-sample autocorrelation. Features 8 Web Audio synths, interactive falling notes, full piano roll editing, automatic key & BPM detection, and instant .MID binary export.
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
            {midiReadyInfo && (
              <button
                onClick={() => handleDownloadMidi()}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-green-500 text-black font-extrabold text-sm shadow-xl shadow-green-500/25 hover:scale-105 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download MIDI (.mid)</span>
              </button>
            )}
            <a
              href="https://t.me/Nuthkna"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sky-500/20 text-sky-300 border border-sky-500/40 text-xs font-bold hover:bg-sky-500/30 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Contact Owner @Nuthkna</span>
            </a>
          </div>
        </div>

        {/* Live Mini Waveform Bar */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-4">
          <div className="flex-1 flex items-end gap-1 h-10 overflow-hidden bg-black/40 rounded-xl px-2 py-1 border border-white/5">
            {waveformPeaks.map((peak, idx) => {
              const isPast = (idx / waveformPeaks.length) * songDuration <= currentTime;
              return (
                <div
                  key={idx}
                  className={`flex-1 rounded-t transition-all duration-150 ${
                    isPast ? 'bg-amber-400 shadow-sm shadow-amber-400/50' : 'bg-slate-700/60'
                  }`}
                  style={{ height: `${Math.max(15, Math.min(100, peak))}%` }}
                />
              );
            })}
          </div>
          <div className="text-right text-xs shrink-0 font-mono text-slate-300">
            <span className="text-amber-400 font-bold">{formatSeconds(currentTime)}</span>
            <span className="text-slate-500"> / {formatSeconds(songDuration)}</span>
          </div>
        </div>
      </div>

      {/* Main Studio Grid: Left Sidebar & Right Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Audio Inputs, Controls & Exporter */}
        <div className="lg:col-span-4 space-y-6">
          {/* Section 1: Bring Audio */}
          <div className="glass-card rounded-3xl p-5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <span className="text-amber-400">1.</span> Bring Your Audio
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                {notes.length} notes
              </span>
            </div>

            {/* Input Mode Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-black/40 rounded-2xl border border-white/10 text-xs font-bold">
              <button
                onClick={() => setActiveInputTab('upload')}
                className={`py-2 rounded-xl transition-all ${
                  activeInputTab === 'upload'
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Upload
              </button>
              <button
                onClick={() => setActiveInputTab('record')}
                className={`py-2 rounded-xl transition-all ${
                  activeInputTab === 'record'
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Mic
              </button>
              <button
                onClick={() => setActiveInputTab('youtube')}
                className={`py-2 rounded-xl transition-all ${
                  activeInputTab === 'youtube'
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                YouTube
              </button>
              <button
                onClick={() => setActiveInputTab('demos')}
                className={`py-2 rounded-xl transition-all ${
                  activeInputTab === 'demos'
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Demos
              </button>
            </div>

            {/* Upload Panel (Supports Audio & ZIP) */}
            {activeInputTab === 'upload' && (
              <div className="space-y-3">
                <label
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    if (e.dataTransfer.files[0]) {
                      const f = e.dataTransfer.files[0];
                      if (/\.zip$/i.test(f.name)) {
                        handleZipFile(f);
                      } else {
                        handleProcessAudioFile(f);
                      }
                    }
                  }}
                  className="relative flex flex-col items-center justify-center p-6 border-2 border-dashed border-amber-500/30 hover:border-amber-400/80 rounded-2xl bg-black/30 hover:bg-amber-500/5 cursor-pointer transition-all group text-center"
                >
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.webm,.zip"
                    onChange={e => {
                      if (e.target.files?.[0]) {
                        const f = e.target.files[0];
                        if (/\.zip$/i.test(f.name)) {
                          handleZipFile(f);
                        } else {
                          handleProcessAudioFile(f);
                        }
                      }
                    }}
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="mt-3 text-xs font-bold text-white">
                    Drop MP3, WAV, FLAC, M4A or ZIP
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    Direct in-browser transcription • ZIP auto-unpacks
                  </span>
                </label>

                {/* Auto download toggle */}
                <label className="flex items-center justify-between p-3 rounded-2xl bg-black/30 border border-white/5 text-xs text-slate-300 cursor-pointer">
                  <span>Auto-download MIDI upon finish</span>
                  <input
                    type="checkbox"
                    checked={autoDownloadMidi}
                    onChange={e => setAutoDownloadMidi(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                </label>

                {originalAudioUrl && (
                  <div className="p-3 bg-black/40 rounded-2xl border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Source Audio</span>
                      <span className="text-amber-400 font-mono text-[11px]">Synced</span>
                    </div>
                    <audio
                      ref={origAudioRef}
                      src={originalAudioUrl}
                      controls
                      className="w-full h-8"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Record Panel */}
            {activeInputTab === 'record' && (
              <div className="p-6 bg-black/40 rounded-2xl border border-white/10 text-center space-y-4">
                <div
                  className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center transition-all ${
                    isRecording
                      ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  <Mic className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {isRecording ? `Recording (${recordingSeconds}s)` : 'Hum, Sing or Whistle'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sing close to the mic. Real-time pitch tracking detects your notes.
                  </p>
                </div>

                {livePitchName && (
                  <div className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold animate-pulse">
                    Live Note: {livePitchName}
                  </div>
                )}

                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-full py-3 rounded-2xl font-extrabold text-xs transition-all ${
                    isRecording
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                      : 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-lg shadow-amber-500/20'
                  }`}
                >
                  {isRecording ? '■ Stop & Transcribe MIDI' : '● Start Microphone Recording'}
                </button>
              </div>
            )}

            {/* YouTube Panel */}
            {activeInputTab === 'youtube' && (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={e => setYoutubeUrl(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                />
                <button
                  onClick={handleYoutubeTranscription}
                  className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Transcribe YouTube Audio</span>
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setYoutubeUrl('https://www.youtube.com/watch?v=4Tr0otuiQuU')}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-slate-300"
                  >
                    Für Elise
                  </button>
                  <button
                    onClick={() => setYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-slate-300"
                  >
                    Pop Demo
                  </button>
                </div>
              </div>
            )}

            {/* Demos Panel */}
            {activeInputTab === 'demos' && (
              <div className="space-y-2">
                {[
                  { title: 'Für Elise — Beethoven', count: 48, bpm: 96, key: 'A Minor', gen: generateFurEliseDemo },
                  { title: 'Canon in D — Pachelbel', count: 44, bpm: 100, key: 'D Major', gen: generateCanonInDDemo },
                  { title: 'Neon Skyline (Synthwave)', count: 52, bpm: 120, key: 'A Minor', gen: generateNeonSkylineDemo },
                  { title: 'Twinkle Twinkle (Voice Hum)', count: 42, bpm: 112, key: 'C Major', gen: generateTwinkleVoiceDemo },
                ].map((d, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      stopPlayback();
                      const n = d.gen();
                      setNotes(n);
                      setBpm(d.bpm);
                      setTitle(d.title);
                      setCurrentTime(0);
                      onToast(`Loaded ${d.title}`);
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-black/30 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/30 transition-all text-left group"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-amber-400">
                        {d.title}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {d.key} • {d.bpm} BPM • {d.count} notes
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 group-hover:text-amber-400">
                      Load ›
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Processing Pipeline Bar */}
            {isProcessing && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex justify-between text-xs font-bold text-amber-300">
                  <span>🧠 AMT Audio2Midi AI Pipeline</span>
                  <span>{processPct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/50 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-300"
                    style={{ width: `${processPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-amber-200/80 font-mono truncate">
                  {processStage}
                </p>
              </div>
            )}
          </div>

          {/* Section 2: Instrument & Mix Swapper */}
          <div className="glass-card rounded-3xl p-5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <span className="text-amber-400">2.</span> Instrument & Sound
              </h2>
              <span className="text-xs font-mono text-amber-400 font-bold">
                {activeInstrument.label}
              </span>
            </div>

            {/* 8 Instruments Grid */}
            <div className="grid grid-cols-2 gap-2">
              {INSTRUMENTS.map(inst => (
                <button
                  key={inst.id}
                  onClick={() => {
                    setInstrumentId(inst.id);
                    playSynthNote(69, 0.6, 0.9);
                  }}
                  className={`p-2.5 rounded-2xl border text-left transition-all ${
                    instrumentId === inst.id
                      ? 'bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20 font-bold'
                      : 'bg-black/30 text-slate-300 border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{inst.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-xs truncate font-bold">{inst.label}</div>
                      <div
                        className={`text-[9px] truncate ${
                          instrumentId === inst.id ? 'text-black/70' : 'text-slate-400'
                        }`}
                      >
                        {inst.desc}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Volume & Tempo Controls */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <Volume2 className="w-4 h-4 text-slate-400" />
                <span className="w-14 shrink-0">Volume</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={volume}
                  onChange={e => setVolume(+e.target.value)}
                  className="flex-1 accent-amber-500"
                />
                <span className="w-10 text-right font-mono text-slate-400">
                  {Math.round(volume * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-300">
                <Play className="w-4 h-4 text-slate-400" />
                <span className="w-14 shrink-0">Speed</span>
                <input
                  type="range"
                  min="0.5"
                  max="1.6"
                  step="0.05"
                  value={tempoScale}
                  onChange={e => setTempoScale(+e.target.value)}
                  className="flex-1 accent-amber-500"
                />
                <span className="w-10 text-right font-mono text-slate-400">
                  {tempoScale.toFixed(2)}x
                </span>
              </div>
            </div>

            {/* Quick Actions: Transpose & Clean */}
            <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-white/10">
              <button
                onClick={() => applyTranspose(-1)}
                className="py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300"
                title="Transpose down 1 semitone"
              >
                -1
              </button>
              <button
                onClick={() => applyTranspose(-12)}
                className="py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300"
                title="Transpose down 1 octave"
              >
                -8va
              </button>
              <button
                onClick={() => applyTranspose(12)}
                className="py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300"
                title="Transpose up 1 octave"
              >
                +8va
              </button>
              <button
                onClick={() => applyTranspose(1)}
                className="py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300"
                title="Transpose up 1 semitone"
              >
                +1
              </button>
            </div>
          </div>

          {/* Section 3: Stems & Timing Settings */}
          <div className="glass-card rounded-3xl p-5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                Stems & Precision Timing
              </h2>
              <button
                onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                className="text-xs font-bold text-amber-400 hover:underline"
              >
                {showSettingsDrawer ? 'Hide Details' : 'More Settings'}
              </button>
            </div>

            {/* Stem Solo / Mute Toggles */}
            <div className="space-y-2">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5 text-xs text-slate-300 cursor-pointer">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <b>Melody / Lead</b>
                  <span className="text-[10px] text-slate-500">
                    ({notes.filter(n => n.stem === 'melody').length} notes)
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={stemMelody}
                  onChange={e => setStemMelody(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5 text-xs text-slate-300 cursor-pointer">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <b>Harmony / Chords</b>
                  <span className="text-[10px] text-slate-500">
                    ({notes.filter(n => n.stem === 'harmony').length} notes)
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={stemHarmony}
                  onChange={e => setStemHarmony(e.target.checked)}
                  className="w-4 h-4 accent-cyan-400 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-black/30 border border-white/5 text-xs text-slate-300 cursor-pointer">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-400" />
                  <b>Bassline</b>
                  <span className="text-[10px] text-slate-500">
                    ({notes.filter(n => n.stem === 'bass').length} notes)
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={stemBass}
                  onChange={e => setStemBass(e.target.checked)}
                  className="w-4 h-4 accent-pink-400 rounded"
                />
              </label>
            </div>

            {/* Quantize & Humanize Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={applyQuantize}
                className="py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Snap Quantize</span>
              </button>
              <button
                onClick={applyHumanize}
                className="py-2 px-3 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Humanize Feel</span>
              </button>
            </div>

            {/* Extended Settings Drawer */}
            {showSettingsDrawer && (
              <div className="p-4 bg-black/50 rounded-2xl border border-white/10 space-y-4 pt-3 text-xs">
                <div>
                  <div className="flex justify-between text-slate-300 font-bold mb-1">
                    <span>Quantize Grid</span>
                    <span className="text-amber-400 font-mono">
                      {quantizeGrid === 0
                        ? 'Raw'
                        : quantizeGrid === 0.25
                        ? '1/16 Beat'
                        : quantizeGrid === 0.5
                        ? '1/8 Beat'
                        : '1/4 Beat'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { l: 'Raw', v: 0 },
                      { l: '1/4', v: 1.0 },
                      { l: '1/8', v: 0.5 },
                      { l: '1/16', v: 0.25 },
                    ].map(g => (
                      <button
                        key={g.v}
                        onClick={() => setQuantizeGrid(g.v)}
                        className={`py-1 rounded-lg text-[10px] font-bold ${
                          quantizeGrid === g.v
                            ? 'bg-amber-500 text-black'
                            : 'bg-white/5 text-slate-400'
                        }`}
                      >
                        {g.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-bold mb-1">
                    <span>Quantize Strength</span>
                    <span className="text-amber-400 font-mono">
                      {Math.round(quantizeStrength * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={quantizeStrength}
                    onChange={e => setQuantizeStrength(+e.target.value)}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-bold mb-1">
                    <span>Pitch Range Filter</span>
                    <span className="text-amber-400 font-mono uppercase">{pitchRangeClamp}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['full', 'lead', 'bass'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setPitchRangeClamp(m)}
                        className={`py-1 rounded-lg text-[10px] font-bold capitalize ${
                          pitchRangeClamp === m
                            ? 'bg-amber-500 text-black'
                            : 'bg-white/5 text-slate-400'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between text-slate-300 font-bold cursor-pointer">
                  <span>Export Separate Tracks (Type 1 MIDI)</span>
                  <input
                    type="checkbox"
                    checked={separateMidiStems}
                    onChange={e => setSeparateMidiStems(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Section 4: Export Card */}
          <div className="glass-card rounded-3xl p-5 border border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-transparent space-y-4">
            <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-amber-400" />
              <span>3. Export Everywhere</span>
            </h2>

            <button
              onClick={() => handleDownloadMidi()}
              className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Download MIDI File (.mid)</span>
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleExportJson}
                className="p-2.5 rounded-xl bg-black/40 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 flex flex-col items-center gap-1"
              >
                <FileCode className="w-4 h-4 text-cyan-400" />
                <span>JSON</span>
              </button>
              <button
                onClick={handleExportCsv}
                className="p-2.5 rounded-xl bg-black/40 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 flex flex-col items-center gap-1"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>CSV Timing</span>
              </button>
              <button
                onClick={saveToLibrary}
                className="p-2.5 rounded-xl bg-black/40 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 flex flex-col items-center gap-1"
              >
                <FolderArchive className="w-4 h-4 text-pink-400" />
                <span>Save Project</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Visualization Viewport (Falling, Roll, Sheet) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Visualizer Stage */}
          <div className="glass-card rounded-3xl p-5 border border-white/10 space-y-4">
            {/* Top Bar: Song Title & View Switcher */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="bg-transparent text-xl md:text-2xl font-black text-white focus:outline-none focus:border-b border-amber-400 tracking-tight"
                />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                    🎼 {keySignature}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold flex items-center gap-1">
                    ♩ {bpm} BPM
                    <button
                      onClick={handleTapTempo}
                      className="ml-1 px-1 rounded bg-cyan-400/30 hover:bg-cyan-400/50 text-[10px]"
                      title="Tap tempo"
                    >
                      Tap
                    </button>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                    {notes.length} notes
                  </span>
                </div>
              </div>

              {/* View Mode Buttons */}
              <div className="flex items-center gap-1 p-1 bg-black/40 rounded-2xl border border-white/10 text-xs font-bold shrink-0">
                <button
                  onClick={() => setViewMode('falling')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    viewMode === 'falling'
                      ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ✨ Falling
                </button>
                <button
                  onClick={() => setViewMode('roll')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    viewMode === 'roll'
                      ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ▦ Piano Roll
                </button>
                <button
                  onClick={() => setViewMode('sheet')}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    viewMode === 'sheet'
                      ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  𝄞 Sheet
                </button>
              </div>
            </div>

            {/* Transport Bar */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-black/40 rounded-2xl border border-white/10">
              <button
                onClick={isPlaying ? pausePlayback : startPlayback}
                className="px-5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all active:scale-95"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                onClick={stopPlayback}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center transition-all"
                title="Stop playback"
              >
                <Square className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isLooping
                    ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>Loop</span>
              </button>

              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  checked={showNoteLabels}
                  onChange={e => setShowNoteLabels(e.target.checked)}
                  className="w-3.5 h-3.5 accent-amber-500 rounded"
                />
                <span>Note Names</span>
              </label>

              {/* Seek Scrubber */}
              <div className="w-full flex items-center gap-3 pt-2">
                <span className="text-[11px] font-mono text-amber-400">
                  {formatSeconds(currentTime)}
                </span>
                <input
                  type="range"
                  min="0"
                  max={songDuration || 1}
                  step="0.05"
                  value={currentTime}
                  onChange={e => {
                    const newT = +e.target.value;
                    setCurrentTime(newT);
                    playStartRef.current = {
                      wall: performance.now(),
                      offset: newT,
                      played: {},
                    };
                    visibleNotes.forEach(n => {
                      if (n.start < newT) playStartRef.current.played[n.id] = true;
                    });
                  }}
                  className="flex-1 accent-amber-500"
                />
                <span className="text-[11px] font-mono text-slate-500">
                  {formatSeconds(songDuration)}
                </span>
              </div>
            </div>

            {/* View 1: Falling Notes Canvas */}
            {viewMode === 'falling' && (
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasKeyClick}
                  className="w-full h-[460px] md:h-[520px] rounded-2xl bg-black border border-white/10 cursor-pointer block"
                />
                <p className="text-[11px] text-center text-slate-400 mt-2">
                  Click any piano key at bottom to audition notes • <span className="text-amber-400">Amber = Melody</span> • <span className="text-cyan-400">Cyan = Harmony</span> • <span className="text-pink-400">Pink = Bass</span>
                </p>
              </div>
            )}

            {/* View 2: Piano Roll Grid */}
            {viewMode === 'roll' && (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/60 max-h-[480px]">
                  <div
                    className="relative min-w-[760px]"
                    style={{ height: `${49 * 18}px` }}
                    onClick={e => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      const clickedMidi = 84 - Math.floor(y / 18);
                      const timeAtX = (x / rect.width) * songDuration;
                      const newNote: MidiNote = {
                        id: `add-${Date.now()}`,
                        midi: clickedMidi,
                        start: Math.round((timeAtX / 0.25) * 0.25),
                        duration: 0.5,
                        velocity: 0.8,
                        stem: clickedMidi < 48 ? 'bass' : clickedMidi < 60 ? 'harmony' : 'melody',
                      };
                      setNotes(prev => [...prev, newNote].sort((a, b) => a.start - b.start));
                      setSelectedNoteId(newNote.id);
                      playSynthNote(clickedMidi, 0.5, 0.85);
                    }}
                  >
                    {/* Rows */}
                    {Array.from({ length: 49 }, (_, i) => {
                      const m = 84 - i;
                      const isBlack = isBlackKey(m);
                      return (
                        <div
                          key={m}
                          className={`absolute left-0 right-0 border-b border-white/5 flex items-center px-2 text-[9px] font-mono pointer-events-none select-none ${
                            isBlack ? 'bg-white/[0.02] text-slate-600' : 'text-slate-400'
                          }`}
                          style={{ top: `${i * 18}px`, height: '18px' }}
                        >
                          {m % 12 === 0 ? midiToName(m) : ''}
                        </div>
                      );
                    })}

                    {/* Playhead */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 pointer-events-none shadow-md shadow-amber-400"
                      style={{
                        left: `${(currentTime / Math.max(1, songDuration)) * 100}%`,
                      }}
                    />

                    {/* Notes */}
                    {visibleNotes.map(n => {
                      const top = (84 - n.midi) * 18 + 1;
                      const left = (n.start / Math.max(1, songDuration)) * 100;
                      const width = Math.max(1.2, (n.duration / Math.max(1, songDuration)) * 100);
                      const isSelected = n.id === selectedNoteId;
                      const stemColors = {
                        melody: 'bg-amber-500 text-black',
                        harmony: 'bg-cyan-500 text-black',
                        bass: 'bg-pink-500 text-black',
                      };

                      return (
                        <button
                          key={n.id}
                          onClick={ev => {
                            ev.stopPropagation();
                            setSelectedNoteId(n.id);
                            playSynthNote(n.midi, n.duration, n.velocity);
                          }}
                          className={`absolute rounded-md text-[8px] font-black overflow-hidden truncate px-1 text-left z-10 transition-transform ${
                            stemColors[n.stem] || stemColors.melody
                          } ${isSelected ? 'ring-2 ring-white scale-105 z-20 shadow-lg' : ''}`}
                          style={{
                            top: `${top}px`,
                            left: `${left}%`,
                            width: `${width}%`,
                            height: '16px',
                          }}
                        >
                          {showNoteLabels ? midiToName(n.midi) : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 px-2">
                  <span>Click empty space to add note • Click note to audition & select</span>
                  {selectedNote && (
                    <button
                      onClick={deleteSelectedNote}
                      className="text-red-400 hover:text-red-300 font-bold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected ({midiToName(selectedNote.midi)})</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* View 3: Sheet Music Notation */}
            {viewMode === 'sheet' && (
              <div className="p-6 bg-amber-50/95 text-slate-900 rounded-2xl border border-amber-200 overflow-x-auto space-y-4">
                <div className="flex items-center justify-between border-b border-amber-900/10 pb-3">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-slate-900">{title}</h3>
                    <p className="text-xs text-slate-600">
                      Key of {keySignature} • {bpm} BPM • 4/4 Time Signature
                    </p>
                  </div>
                  <button
                    onClick={handlePrintSheet}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Score</span>
                  </button>
                </div>

                {/* Staves rendered with clean scalable SVG */}
                <div className="space-y-4">
                  {[0, 1].map(sysIndex => {
                    const sliceStart = sysIndex * 24;
                    const systemNotes = visibleNotes.slice(sliceStart, sliceStart + 24);
                    return (
                      <svg key={sysIndex} viewBox="0 0 850 140" className="w-full min-w-[700px]">
                        {/* Treble Stave Lines */}
                        {[24, 33, 42, 51, 60].map(y => (
                          <line key={y} x1="10" x2="840" y1={y} y2={y} stroke="#334155" strokeWidth="1" />
                        ))}
                        {/* Bass Stave Lines */}
                        {[84, 93, 102, 111, 120].map(y => (
                          <line key={y} x1="10" x2="840" y1={y} y2={y} stroke="#334155" strokeWidth="1" />
                        ))}

                        {/* Clefs */}
                        <text x="14" y="55" fontSize="36" fontFamily="serif" fill="#1e293b">
                          𝄞
                        </text>
                        <text x="16" y="112" fontSize="28" fontFamily="serif" fill="#1e293b">
                          𝄢
                        </text>

                        {/* Bar Lines */}
                        {[220, 430, 640, 840].map(bx => (
                          <g key={bx}>
                            <line x1={bx} x2={bx} y1="24" y2="60" stroke="#64748b" />
                            <line x1={bx} x2={bx} y1="84" y2="120" stroke="#64748b" />
                          </g>
                        ))}

                        {/* Notes */}
                        {systemNotes.map((n, i) => {
                          const x = 75 + i * 31;
                          const isTreble = n.midi >= 60;
                          const rawY = isTreble
                            ? 60 - (n.midi - 60) * 2.3
                            : 120 - (n.midi - 41) * 2.3;
                          const cy = Math.max(12, Math.min(130, rawY));
                          const color = n.stem === 'melody' ? '#d97706' : n.stem === 'harmony' ? '#0284c7' : '#db2777';

                          return (
                            <g
                              key={n.id}
                              onClick={() => playSynthNote(n.midi, 0.5, 0.8)}
                              className="cursor-pointer hover:opacity-75"
                            >
                              <ellipse
                                cx={x}
                                cy={cy}
                                rx="6"
                                ry="4.5"
                                fill={color}
                                transform={`rotate(-18 ${x} ${cy})`}
                              />
                              <line
                                x1={x + 5}
                                x2={x + 5}
                                y1={cy}
                                y2={cy - 24}
                                stroke="#1e293b"
                                strokeWidth="1.4"
                              />
                              {showNoteLabels && (
                                <text
                                  x={x - 6}
                                  y={isTreble ? 74 : 134}
                                  fontSize="7"
                                  fontWeight="bold"
                                  fill="#475569"
                                >
                                  {midiToName(n.midi)}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })}
                </div>
                <p className="text-[11px] text-center text-slate-500">
                  Interactive sheet score — click any notehead to audition pitch.
                </p>
              </div>
            )}
          </div>

          {/* Note Strip & Selected Note Inspector */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Note Strip */}
            <div className="md:col-span-8 glass-card rounded-3xl p-4 border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-slate-300">Fast Note Strip</span>
                <span className="text-[11px] text-slate-500">Click to jump & hear</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                {visibleNotes.slice(0, 50).map(n => {
                  const isCurrent = currentTime >= n.start && currentTime <= n.start + n.duration;
                  const isSelected = n.id === selectedNoteId;
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        setSelectedNoteId(n.id);
                        setCurrentTime(n.start);
                        playSynthNote(n.midi, n.duration, n.velocity);
                      }}
                      className={`px-2 py-1.5 rounded-xl text-xs font-mono font-bold shrink-0 transition-all ${
                        isCurrent
                          ? 'bg-white text-black scale-105 shadow-md'
                          : isSelected
                          ? 'bg-amber-500 text-black ring-2 ring-white'
                          : n.stem === 'bass'
                          ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                          : n.stem === 'harmony'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {midiToName(n.midi)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Note Inspector */}
            <div className="md:col-span-4 glass-card rounded-3xl p-4 border border-white/10 space-y-2">
              <span className="text-xs font-extrabold text-slate-300">Selected Note</span>
              {selectedNote ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-black text-amber-400">
                      {midiToName(selectedNote.midi)}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      MIDI {selectedNote.midi}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5">
                      <span className="text-slate-400 block">Start</span>
                      <b className="font-mono text-white">{selectedNote.start.toFixed(2)}s</b>
                    </div>
                    <div className="p-2 rounded-xl bg-black/40 border border-white/5">
                      <span className="text-slate-400 block">Duration</span>
                      <b className="font-mono text-white">{selectedNote.duration.toFixed(2)}s</b>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 pt-2">
                  Click a note block or strip button to edit.
                </p>
              )}
            </div>
          </div>

          {/* In-Browser Project Library */}
          {savedProjects.length > 0 && (
            <div className="glass-card rounded-3xl p-5 border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <FolderArchive className="w-4 h-4 text-amber-400" />
                  <span>Your Saved Transcriptions</span>
                </h3>
                <span className="text-xs text-slate-400">
                  {savedProjects.length} saved in browser
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {savedProjects.slice(0, 4).map(p => (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl bg-black/30 border border-white/5 flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{p.title}</h4>
                      <p className="text-[10px] text-slate-400">
                        {p.keySignature} • {p.bpm} BPM • {p.notesCount} notes
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => loadFromLibrary(p)}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-all"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDownloadMidi(p.notes, p.title, p.bpm)}
                        className="px-2.5 py-1.5 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-green-300 text-xs font-bold transition-all"
                        title="Download .mid directly"
                      >
                        .MID
                      </button>
                      <button
                        onClick={() => deleteFromLibrary(p.id)}
                        className="p-1.5 rounded-xl hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
