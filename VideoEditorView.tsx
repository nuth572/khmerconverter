/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Download,
  Archive,
  Copy,
  Plus,
  Trash2,
  RotateCcw,
  Sliders,
  Sparkles,
  Search,
  Upload,
  Check,
  Split,
  Layers,
} from 'lucide-react';
import {
  SubtitleCue,
  parseSubtitles,
  buildSrt,
  buildVtt,
  buildAss,
  buildCsv,
  buildPlainText,
  formatTimeSrt,
  parseTime,
} from '../utils/subtitleConverter.ts';
import { shiftSubtitleTiming } from '../utils/subtitleOps.ts';
import { optimizeKhmerPunctuation, findAndReplaceInCues } from '../utils/khmerEnhancer.ts';
import { translateBatch, LANGUAGES } from '../utils/translator.ts';
import { isZipFile, unpackZipSubtitles } from '../utils/zipHandler.ts';
import { downloadText, downloadZip } from '../utils/downloadZip.ts';
import { saveProject } from '../utils/storage.ts';

interface VideoEditorViewProps {
  initialTitle: string;
  initialCues: SubtitleCue[];
  initialMediaUrl?: string;
  initialMediaKind?: 'video' | 'audio';
  onBack: () => void;
  onToast: (msg: string) => void;
}

export const VideoEditorView: React.FC<VideoEditorViewProps> = ({
  initialTitle,
  initialCues,
  initialMediaUrl,
  initialMediaKind = 'video',
  onBack,
  onToast,
}) => {
  const [title, setTitle] = useState(initialTitle || 'Subtitles Project');
  const [cues, setCues] = useState<SubtitleCue[]>(initialCues);
  const [mediaUrl, setMediaUrl] = useState<string | null>(initialMediaUrl || null);
  const [mediaKind, setMediaKind] = useState<'video' | 'audio'>(initialMediaKind);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCueIndex, setActiveCueIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState(26);
  const [displayMode, setDisplayMode] = useState<'khmer' | 'bilingual' | 'original'>('khmer');
  const [autoScroll, setAutoScroll] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // Find & Replace
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplaceBox, setShowReplaceBox] = useState(false);

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<any>(null);

  const handleSubtitleUpload = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const f = files[0];
    if (isZipFile(f)) {
      try {
        onToast(`Unpacking ZIP: ${f.name}...`);
        const extracted = await unpackZipSubtitles(f);
        if (extracted.length === 0) {
          onToast('No subtitle files found inside this ZIP archive.');
          return;
        }
        const first = extracted[0];
        const parsed = parseSubtitles(first.content, undefined, first.name);
        if (parsed.length > 0) {
          setCues(parsed);
          const newTitle = first.name.replace(/\.[^.]+$/, '');
          setTitle(newTitle);
          triggerAutoSave(parsed, newTitle);
          onToast(`Loaded ${first.name} (${parsed.length} cues) from ZIP!`);
        }
      } catch (err) {
        onToast(`Failed to unpack ZIP: ${String(err)}`);
      }
    } else {
      try {
        const text = await f.text();
        const parsed = parseSubtitles(text, undefined, f.name);
        if (parsed.length > 0) {
          setCues(parsed);
          const newTitle = f.name.replace(/\.[^.]+$/, '');
          setTitle(newTitle);
          triggerAutoSave(parsed, newTitle);
          onToast(`Loaded ${f.name} (${parsed.length} cues)!`);
        }
      } catch {
        onToast(`Failed to parse ${f.name}`);
      }
    }
  };

  // Trigger auto-save whenever title or cues change
  const triggerAutoSave = (newCues: SubtitleCue[], newTitle: string) => {
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveProject({
        title: newTitle,
        kind: 'converted',
        sourceLang: 'en',
        targetLang: 'km',
        cues: newCues,
      });
      setSaveStatus('saved');
    }, 800);
  };

  // Sync active cue with current media playback
  useEffect(() => {
    let active = -1;
    for (let i = 0; i < cues.length; i++) {
      if (currentTime >= cues[i].start && currentTime <= cues[i].end) {
        active = i;
        break;
      }
    }
    setActiveCueIndex(active);

    if (autoScroll && active >= 0) {
      const el = document.getElementById(`cue-row-${active}`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentTime, cues, autoScroll]);

  const activeCue = activeCueIndex >= 0 ? cues[activeCueIndex] : null;

  // Media time update
  const handleTimeUpdate = () => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime);
    }
  };

  const seekTo = (seconds: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = seconds + 0.01;
      mediaRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleAttachMedia = (file: File) => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    const url = URL.createObjectURL(file);
    setMediaUrl(url);
    const isVid = file.type.startsWith('video') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
    setMediaKind(isVid ? 'video' : 'audio');
    onToast(`Attached ${file.name}`);
  };

  const handleUpdateCue = (index: number, patch: Partial<SubtitleCue>) => {
    const next = cues.map((c, i) => (i === index ? { ...c, ...patch } : c));
    setCues(next);
    triggerAutoSave(next, title);
  };

  const handleDeleteCue = (index: number) => {
    const next = cues.filter((_, i) => i !== index);
    setCues(next);
    triggerAutoSave(next, title);
    onToast(`Deleted cue #${index + 1}`);
  };

  const handleInsertAfter = (index: number) => {
    const cur = cues[index];
    const nextCue = cues[index + 1];
    const newStart = cur.end;
    const newEnd = nextCue ? Math.min(newStart + 2, nextCue.start) : newStart + 2.5;

    const newCue: SubtitleCue = {
      start: newStart,
      end: newEnd,
      text: 'New subtitle text',
      km: 'អត្ថបទអក្សររត់ថ្មី',
    };

    const next = [...cues.slice(0, index + 1), newCue, ...cues.slice(index + 1)];
    setCues(next);
    triggerAutoSave(next, title);
    onToast(`Inserted cue after #${index + 1}`);
  };

  const handleMergeNext = (index: number) => {
    if (index >= cues.length - 1) return;
    const cur = cues[index];
    const nextCue = cues[index + 1];

    const merged: SubtitleCue = {
      start: cur.start,
      end: nextCue.end,
      text: `${cur.text} ${nextCue.text}`.trim(),
      km: cur.km || nextCue.km ? `${cur.km || ''} ${nextCue.km || ''}`.trim() : undefined,
    };

    const next = [...cues.slice(0, index), merged, ...cues.slice(index + 2)];
    setCues(next);
    triggerAutoSave(next, title);
    onToast(`Merged cue #${index + 1} with #${index + 2}`);
  };

  const handleRetranslateCue = async (index: number) => {
    const cur = cues[index];
    if (!cur.text.trim()) return;
    try {
      const res = await translateBatch([cur.text], 'auto', 'km');
      if (res.texts[0]) {
        handleUpdateCue(index, { km: res.texts[0] });
        onToast('Line translated!');
      }
    } catch {
      onToast('Translation error');
    }
  };

  const handleShiftAll = (delta: number) => {
    const next = shiftSubtitleTiming(cues, delta);
    setCues(next);
    triggerAutoSave(next, title);
    onToast(`Shifted all subtitles ${delta > 0 ? '+' : ''}${delta}s`);
  };

  const handleApplyFindReplace = () => {
    if (!findText) {
      onToast('Enter text to find');
      return;
    }
    const { updatedCues, count } = findAndReplaceInCues(cues, findText, replaceText);
    setCues(updatedCues);
    triggerAutoSave(updatedCues, title);
    onToast(`Replaced ${count} occurrence(s) in subtitles!`);
    setShowReplaceBox(false);
  };

  const handleOptimizeKhmerAll = () => {
    const updated = cues.map(c => ({
      ...c,
      text: optimizeKhmerPunctuation(c.text),
      km: c.km ? optimizeKhmerPunctuation(c.km) : undefined,
    }));
    setCues(updated);
    triggerAutoSave(updated, title);
    onToast('Optimized Khmer punctuation (Khan ។)!');
  };

  const filteredCues = cues
    .map((c, i) => ({ c, i }))
    .filter(
      ({ c }) =>
        !searchQuery ||
        c.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.km && c.km.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-colors"
            title="Back to converter"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <input
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                triggerAutoSave(cues, e.target.value);
              }}
              className="text-lg font-bold text-white bg-transparent border-b border-transparent hover:border-white/20 focus:border-purple-500 focus:outline-none"
            />
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>{cues.length} lines</span>
              <span>·</span>
              <span>{saveStatus === 'saving' ? 'Saving...' : '✓ Auto-saved'}</span>
            </div>
          </div>
          <div>
            <input
              ref={subtitleInputRef}
              type="file"
              accept=".srt,.vtt,.ass,.ssa,.sbv,.lrc,.ttml,.csv,.txt,.zip"
              onChange={e => handleSubtitleUpload(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => subtitleInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-cyan-300 border border-white/15 transition-colors"
              title="Upload any subtitle file or .ZIP archive"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Subtitle / .ZIP</span>
            </button>
          </div>
        </div>

        {/* Quick Exports */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              downloadText(buildSrt(cues, 'target'), `${title}.km.srt`, 'application/x-subrip');
              onToast('Downloaded Khmer SRT');
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-purple-500/20"
          >
            ⬇ Khmer SRT
          </button>
          <button
            onClick={() => {
              downloadText(buildSrt(cues, 'bilingual_top_bottom'), `${title}.dual.srt`, 'application/x-subrip');
              onToast('Downloaded Bilingual SRT');
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15"
          >
            ⬇ Bilingual SRT
          </button>
          <button
            onClick={() => {
              downloadText(buildVtt(cues, 'target'), `${title}.km.vtt`, 'text/vtt');
              onToast('Downloaded WebVTT');
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15"
          >
            ⬇ VTT
          </button>
          <button
            onClick={async () => {
              await downloadZip([
                { name: `${title}.km.srt`, content: buildSrt(cues, 'target') },
                { name: `${title}.dual.srt`, content: buildSrt(cues, 'bilingual_top_bottom') },
                { name: `${title}.orig.srt`, content: buildSrt(cues, 'source') },
                { name: `${title}.km.vtt`, content: buildVtt(cues, 'target') },
                { name: `${title}.km.ass`, content: buildAss(cues, title, 'bilingual_top_bottom') },
              ], 'Translate-Sub-khmer.zip');
              onToast('Downloaded all formats ZIP!');
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15"
          >
            <Archive className="w-3.5 h-3.5 inline mr-1 text-cyan-400" />
            All ZIP
          </button>
        </div>
      </div>

      {/* Main Grid: Video Preview on Left, Cue List on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Media Player + Styling Controls */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-3xl bg-black/60 border border-white/10 overflow-hidden shadow-2xl relative">
            {mediaUrl ? (
              <div className="relative aspect-video bg-black flex items-center justify-center">
                {mediaKind === 'video' ? (
                  <video
                    ref={mediaRef as any}
                    src={mediaUrl}
                    controls
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full p-6 text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center">
                      <Play className="w-8 h-8" />
                    </div>
                    <audio
                      ref={mediaRef as any}
                      src={mediaUrl}
                      controls
                      onTimeUpdate={handleTimeUpdate}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      className="w-full"
                    />
                  </div>
                )}

                {/* Subtitle Overlay */}
                {activeCue && (
                  <div className="absolute inset-x-4 bottom-14 pointer-events-none text-center">
                    <div
                      className="inline-block px-3 py-1.5 rounded-xl bg-black/75 backdrop-blur-sm text-white font-khmer font-bold drop-shadow-md transition-all"
                      style={{ fontSize: `${fontSize}px` }}
                    >
                      {displayMode === 'khmer' && (activeCue.km || activeCue.text)}
                      {displayMode === 'original' && activeCue.text}
                      {displayMode === 'bilingual' && (
                        <div>
                          <div>{activeCue.km || activeCue.text}</div>
                          {activeCue.km && (
                            <div className="text-[0.65em] text-amber-300 font-sans font-normal mt-0.5">
                              {activeCue.text}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-video bg-white/[0.02] flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Preview with your Video or Audio</h4>
                  <p className="text-xs text-slate-400 max-w-xs mt-1">
                    Attach your video file (MP4, WebM, MOV) or audio (MP3, WAV) to watch Khmer subtitles in real-time.
                  </p>
                </div>
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/15"
                >
                  Attach Media File
                </button>
              </div>
            )}

            <input
              ref={mediaInputRef}
              type="file"
              accept="video/*,audio/*"
              onChange={e => {
                if (e.target.files?.[0]) handleAttachMedia(e.target.files[0]);
              }}
              className="hidden"
            />
          </div>

          {/* Subtitle Display & Styling Controls */}
          <div className="p-4 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-slate-400">Subtitle Display:</span>
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                <button
                  onClick={() => setDisplayMode('khmer')}
                  className={`px-2.5 py-1 ${displayMode === 'khmer' ? 'bg-purple-500/40 text-white font-bold' : 'text-slate-400'}`}
                >
                  Khmer
                </button>
                <button
                  onClick={() => setDisplayMode('bilingual')}
                  className={`px-2.5 py-1 ${displayMode === 'bilingual' ? 'bg-purple-500/40 text-white font-bold' : 'text-slate-400'}`}
                >
                  Bilingual
                </button>
                <button
                  onClick={() => setDisplayMode('original')}
                  className={`px-2.5 py-1 ${displayMode === 'original' ? 'bg-purple-500/40 text-white font-bold' : 'text-slate-400'}`}
                >
                  Original
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400 font-semibold">Font Size ({fontSize}px):</span>
              <input
                type="range"
                min={16}
                max={48}
                value={fontSize}
                onChange={e => setFontSize(Number(e.target.value))}
                className="w-36 accent-purple-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/10">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={e => setAutoScroll(e.target.checked)}
                  className="rounded accent-purple-500"
                />
                Auto-scroll with playback
              </label>

              {mediaUrl && (
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  className="text-purple-400 hover:text-purple-300 text-[11px]"
                >
                  Change Media File
                </button>
              )}
            </div>

            {/* Quick Time Shift Controls */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <span className="text-slate-400 font-semibold">Shift All Cues:</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleShiftAll(-0.5)}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                >
                  -0.5s
                </button>
                <button
                  onClick={() => handleShiftAll(-0.1)}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                >
                  -0.1s
                </button>
                <button
                  onClick={() => handleShiftAll(0.1)}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                >
                  +0.1s
                </button>
                <button
                  onClick={() => handleShiftAll(0.5)}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                >
                  +0.5s
                </button>
              </div>
            </div>

            {/* Subtitle Enhancer Tools */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReplaceBox(!showReplaceBox)}
                  className="flex-1 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-semibold"
                >
                  🔍 Find & Replace
                </button>
                <button
                  onClick={handleOptimizeKhmerAll}
                  className="flex-1 py-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/30 text-pink-200 text-xs font-semibold font-khmer"
                  title="Converts Latin full stop to Khmer Khan (។)"
                >
                  ✨ Optimize Khmer (។)
                </button>
              </div>

              {showReplaceBox && (
                <div className="p-3 rounded-2xl bg-black/50 border border-white/15 space-y-2 animate-in fade-in duration-150">
                  <input
                    type="text"
                    value={findText}
                    onChange={e => setFindText(e.target.value)}
                    placeholder="Find in subtitles..."
                    className="w-full px-2.5 py-1 rounded-lg bg-black/40 border border-white/15 text-white text-xs"
                  />
                  <input
                    type="text"
                    value={replaceText}
                    onChange={e => setReplaceText(e.target.value)}
                    placeholder="Replace with..."
                    className="w-full px-2.5 py-1 rounded-lg bg-black/40 border border-white/15 text-white text-xs"
                  />
                  <button
                    onClick={handleApplyFindReplace}
                    className="w-full py-1 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-bold text-xs"
                  >
                    Replace All Matches
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Cue Table / Editor */}
        <div className="lg:col-span-7 p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex flex-col h-[750px]">
          {/* Cue Search bar */}
          <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search subtitles..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
              />
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {filteredCues.length} / {cues.length}
            </span>
          </div>

          {/* Cue Scroll Area */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {filteredCues.map(({ c, i }) => {
              const isActive = i === activeCueIndex;
              return (
                <div
                  key={i}
                  id={`cue-row-${i}`}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isActive
                      ? 'bg-purple-950/40 border-purple-500/60 shadow-lg shadow-purple-500/10'
                      : 'bg-black/30 hover:bg-black/50 border-white/10'
                  }`}
                >
                  {/* Top Bar: Timings and Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-[10px] font-mono text-slate-500 font-bold">
                        #{i + 1}
                      </span>
                      {mediaUrl && (
                        <button
                          onClick={() => seekTo(c.start)}
                          className="p-1 rounded-full bg-white/10 hover:bg-purple-500 hover:text-white text-slate-300 transition-colors"
                          title="Seek video here"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      )}
                      <input
                        type="text"
                        defaultValue={formatTimeSrt(c.start)}
                        key={`start-${i}-${c.start}`}
                        onBlur={e => {
                          const parsed = parseTime(e.target.value);
                          if (Number.isFinite(parsed)) handleUpdateCue(i, { start: parsed });
                        }}
                        className="w-24 px-1.5 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-cyan-300 text-center"
                      />
                      <span className="text-slate-500">→</span>
                      <input
                        type="text"
                        defaultValue={formatTimeSrt(c.end)}
                        key={`end-${i}-${c.end}`}
                        onBlur={e => {
                          const parsed = parseTime(e.target.value);
                          if (Number.isFinite(parsed)) handleUpdateCue(i, { end: parsed });
                        }}
                        className="w-24 px-1.5 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-cyan-300 text-center"
                      />
                      <span className="text-[10px] text-slate-500">
                        ({(c.end - c.start).toFixed(1)}s)
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRetranslateCue(i)}
                        className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-pink-300"
                        title="Re-translate line"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleInsertAfter(i)}
                        className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                        title="Insert line after"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      {i < cues.length - 1 && (
                        <button
                          onClick={() => handleMergeNext(i)}
                          className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                          title="Merge with next line"
                        >
                          <Split className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteCue(i)}
                        className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                        title="Delete line"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Original text textarea */}
                  <textarea
                    value={c.text}
                    onChange={e => handleUpdateCue(i, { text: e.target.value })}
                    rows={1}
                    className="w-full p-1.5 rounded-lg bg-black/30 border border-white/5 text-xs text-slate-300 focus:outline-none focus:border-white/20 resize-none font-sans"
                    placeholder="Original subtitle text..."
                  />

                  {/* Khmer translated text textarea */}
                  <textarea
                    value={c.km || ''}
                    onChange={e => handleUpdateCue(i, { km: e.target.value })}
                    rows={1}
                    className="w-full mt-1.5 p-2 rounded-lg bg-white/[0.02] border border-white/10 text-sm font-khmer font-medium text-white focus:outline-none focus:border-purple-500/50 resize-none"
                    placeholder="ការបកប្រែជាភាសាខ្មែរ..."
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
