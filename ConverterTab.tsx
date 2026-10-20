/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  Upload,
  FileCode,
  ArrowRight,
  Download,
  Copy,
  Check,
  Play,
  Sliders,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Archive,
  Layers,
  FileText,
  Trash2,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  SubtitleFormat,
  SUPPORTED_FORMATS,
  SubtitleCue,
  parseSubtitles,
  convertSubtitles,
  detectSubtitleFormat,
  DualSubtitleMode,
} from '../utils/subtitleConverter.ts';
import {
  shiftSubtitleTiming,
  convertFramerate,
  scaleSpeed,
  autoFixSubtitles,
  wrapSubtitleLines,
  lintSubtitles,
  COMMON_FPS,
} from '../utils/subtitleOps.ts';
import { isZipFile, unpackZipSubtitles } from '../utils/zipHandler.ts';
import {
  optimizeKhmerPunctuation,
  convertKhmerNumerals,
  findAndReplaceInCues,
} from '../utils/khmerEnhancer.ts';
import { downloadText, downloadZip } from '../utils/downloadZip.ts';
import { translateAll, LANGUAGES, getLanguageName } from '../utils/translator.ts';
import { saveProject } from '../utils/storage.ts';

interface ConverterTabProps {
  onOpenInEditor: (title: string, cues: SubtitleCue[]) => void;
  onToast: (msg: string) => void;
}

export interface BatchFileItem {
  id: string;
  name: string;
  content: string;
  detectedFormat: SubtitleFormat;
  cues: SubtitleCue[];
  targetFormat: SubtitleFormat;
  status: 'ready' | 'translating' | 'done' | 'error';
  translatedCount?: number;
  error?: string;
}

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:03,800
Welcome to Cambodia, the Kingdom of Wonder!

2
00:00:04,200 --> 00:00:07,500
Angkor Wat is the largest religious monument in the world.

3
00:00:08,000 --> 00:00:11,200
Enjoy converting subtitles easily with KhmerSub AI!
`;

const SAMPLE_ASS = `[Script Info]
Title: KhmerSub ASS Demo
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Kantumruy Pro,48,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3.0,1.5,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\pos(960,950)}Welcome to our movie premiere!\\Nសូមស្វាគមន៍មកកាន់ការចាក់បញ្ចាំងភាពយន្ត
Dialogue: 0,0:00:04.50,0:00:08.00,Default,,0,0,0,,{\\pos(960,950)}Enjoy the highest quality subtitles in any format!
`;

const SAMPLE_LRC = `[00:01.50]Song intro starts softly...
[00:05.20]Here comes the first verse of the song
[00:09.80]Singing with accurate synchronized lyrics
[00:15.00]Chorus: Everything converted in seconds!
`;

export const ConverterTab: React.FC<ConverterTabProps> = ({ onOpenInEditor, onToast }) => {
  // Batch files list (supports single or multiple files)
  const [filesList, setFilesList] = useState<BatchFileItem[]>([
    {
      id: 'default_1',
      name: 'khmer-subtitles.srt',
      content: SAMPLE_SRT,
      detectedFormat: 'srt',
      cues: parseSubtitles(SAMPLE_SRT, 'srt', 'khmer-subtitles.srt'),
      targetFormat: 'vtt',
      status: 'ready',
    },
  ]);

  const [activeFileId, setActiveFileId] = useState<string>('default_1');
  const [globalTargetFormat, setGlobalTargetFormat] = useState<SubtitleFormat>('vtt');
  const [dualMode, setDualMode] = useState<DualSubtitleMode>('target');
  const [isCopied, setIsCopied] = useState(false);
  const [activeView, setActiveView] = useState<'raw' | 'table'>('raw');
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);
  const [batchFilterQuery, setBatchFilterQuery] = useState('');

  // Translation Options
  const [enableAutoTranslate, setEnableAutoTranslate] = useState(false);
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('km');

  // Find & Replace
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);

  // Advanced Surgery Options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [timeShiftSeconds, setTimeShiftSeconds] = useState(0);
  const [enableFpsConvert, setEnableFpsConvert] = useState(false);
  const [sourceFps, setSourceFps] = useState(23.976);
  const [targetFps, setTargetFps] = useState(25.0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [autoFixOverlaps, setAutoFixOverlaps] = useState(true);
  const [cleanHearingImpaired, setCleanHearingImpaired] = useState(false);
  const [enableWrapLines, setEnableWrapLines] = useState(false);
  const [optimizeKhmer, setOptimizeKhmer] = useState(false);
  const [toKhmerDigits, setToKhmerDigits] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active file
  const activeFile = useMemo(() => {
    return filesList.find(f => f.id === activeFileId) || filesList[0] || null;
  }, [filesList, activeFileId]);

  // Apply transformations to active file cues
  const transformedCues = useMemo(() => {
    if (!activeFile || !activeFile.cues.length) return [];
    let cues = [...activeFile.cues];

    // 1. Time shift
    if (timeShiftSeconds !== 0) {
      cues = shiftSubtitleTiming(cues, timeShiftSeconds);
    }

    // 2. FPS Conversion
    if (enableFpsConvert && sourceFps !== targetFps) {
      cues = convertFramerate(cues, sourceFps, targetFps);
    }

    // 3. Speed scale
    if (speedMultiplier !== 1.0 && speedMultiplier > 0) {
      cues = scaleSpeed(cues, speedMultiplier);
    }

    // 4. Auto-Fix overlaps & clean SDH
    if (autoFixOverlaps || cleanHearingImpaired) {
      cues = autoFixSubtitles(cues, {
        fixOverlaps: autoFixOverlaps,
        fixMinDuration: autoFixOverlaps,
        cleanSdh: cleanHearingImpaired,
      });
    }

    // 5. Line wrapping
    if (enableWrapLines) {
      cues = wrapSubtitleLines(cues, 42);
    }

    // 6. Khmer punctuation optimization (Khan ។)
    if (optimizeKhmer) {
      cues = cues.map(c => ({
        ...c,
        text: optimizeKhmerPunctuation(c.text),
        km: c.km ? optimizeKhmerPunctuation(c.km) : undefined,
      }));
    }

    // 7. Khmer numerals (០-៩)
    if (toKhmerDigits) {
      cues = cues.map(c => ({
        ...c,
        text: convertKhmerNumerals(c.text, true),
        km: c.km ? convertKhmerNumerals(c.km, true) : undefined,
      }));
    }

    return cues;
  }, [
    activeFile,
    timeShiftSeconds,
    enableFpsConvert,
    sourceFps,
    targetFps,
    speedMultiplier,
    autoFixOverlaps,
    cleanHearingImpaired,
    enableWrapLines,
    optimizeKhmer,
    toKhmerDigits,
  ]);

  // Linter issues
  const linterIssues = useMemo(() => {
    return lintSubtitles(transformedCues);
  }, [transformedCues]);

  // Converted result string for active file
  const convertedResult = useMemo(() => {
    if (!transformedCues.length || !activeFile) return '';
    try {
      return convertSubtitles(transformedCues, activeFile.targetFormat || globalTargetFormat, {
        mode: dualMode,
        title: activeFile.name.replace(/\.[^.]+$/, '') || 'Subtitles',
      });
    } catch (err) {
      return `Conversion Error: ${String(err)}`;
    }
  }, [transformedCues, activeFile, globalTargetFormat, dualMode]);

  // Handle multiple file and ZIP upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const newItems: BatchFileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];

      // Check if uploaded file is a ZIP archive
      if (isZipFile(f)) {
        try {
          onToast(`Unpacking ZIP: ${f.name}...`);
          const extracted = await unpackZipSubtitles(f);
          if (extracted.length === 0) {
            onToast(`No subtitle files found inside ${f.name}`);
          } else {
            onToast(`Extracted ${extracted.length} subtitle files from ${f.name}!`);
            for (let j = 0; j < extracted.length; j++) {
              const item = extracted[j];
              const det = detectSubtitleFormat(item.content, item.name);
              const cues = parseSubtitles(item.content, det, item.name);
              if (cues.length > 0) {
                newItems.push({
                  id: 'zip_' + Date.now() + '_' + i + '_' + j + '_' + Math.random().toString(36).slice(2, 6),
                  name: item.name,
                  content: item.content,
                  detectedFormat: det,
                  cues,
                  targetFormat: globalTargetFormat,
                  status: 'ready',
                });
              }
            }
          }
        } catch (err) {
          onToast(`Failed to unpack ${f.name}: ${String(err)}`);
        }
      } else {
        // Standard subtitle file
        try {
          const text = await f.text();
          const det = detectSubtitleFormat(text, f.name);
          const cues = parseSubtitles(text, det, f.name);
          if (cues.length > 0) {
            newItems.push({
              id: 'file_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
              name: f.name,
              content: text,
              detectedFormat: det,
              cues,
              targetFormat: globalTargetFormat,
              status: 'ready',
            });
          }
        } catch {
          onToast(`Error parsing ${f.name}`);
        }
      }
    }

    if (newItems.length > 0) {
      setFilesList(prev => [...prev, ...newItems]);
      setActiveFileId(newItems[0].id);
      onToast(`Loaded ${newItems.length} subtitle file(s) into batch!`);
    }
  };

  const handleBatchReplace = (inAllFiles: boolean) => {
    if (!findText) {
      onToast('Enter text to find');
      return;
    }
    if (inAllFiles) {
      let totalCount = 0;
      setFilesList(prev =>
        prev.map(f => {
          const { updatedCues, count } = findAndReplaceInCues(f.cues, findText, replaceText, { matchCase });
          totalCount += count;
          return { ...f, cues: updatedCues };
        })
      );
      onToast(`Replaced ${totalCount} occurrence(s) across all ${filesList.length} files`);
    } else if (activeFile) {
      const { updatedCues, count } = findAndReplaceInCues(activeFile.cues, findText, replaceText, { matchCase });
      setFilesList(prev =>
        prev.map(f => (f.id === activeFile.id ? { ...f, cues: updatedCues } : f))
      );
      onToast(`Replaced ${count} occurrence(s) in ${activeFile.name}`);
    }
  };

  // Set global target format for all files
  const handleSetGlobalTargetFormat = (fmt: SubtitleFormat) => {
    setGlobalTargetFormat(fmt);
    setFilesList(prev => prev.map(f => ({ ...f, targetFormat: fmt })));
  };

  // High-speed parallel translation and conversion across multiple files
  const handleFastTranslateAndConvertAll = async () => {
    if (!filesList.length || isBatchTranslating) return;
    setIsBatchTranslating(true);
    onToast(`Starting fast parallel translation for ${filesList.length} files...`);

    const updated = [...filesList];

    // Concurrently process files in chunks of 2-3 files
    const FILE_CONCURRENCY = 2;
    for (let i = 0; i < updated.length; i += FILE_CONCURRENCY) {
      const slice = updated.slice(i, i + FILE_CONCURRENCY);

      await Promise.all(
        slice.map(async item => {
          if (item.status === 'done') return;
          item.status = 'translating';
          setFilesList([...updated]);

          try {
            const texts = item.cues.map(c => c.text);
            const res = await translateAll(texts, {
              source: sourceLang,
              target: targetLang,
              onProgress: (done, total) => {
                item.translatedCount = done;
                setFilesList([...updated]);
              },
            });

            const translatedCues = item.cues.map((c, idx) => ({
              ...c,
              km: res.texts[idx] || c.text,
            }));

            item.cues = translatedCues;
            item.status = 'done';
            setFilesList([...updated]);

            // Save to history
            saveProject({
              title: item.name.replace(/\.[^.]+$/, ''),
              kind: 'converted',
              sourceLang: res.detected || sourceLang,
              targetLang,
              cues: translatedCues,
            });
          } catch (err) {
            item.status = 'error';
            item.error = String(err);
            setFilesList([...updated]);
          }
        })
      );
    }

    setIsBatchTranslating(false);
    onToast('Fast translation and conversion complete for all files! ✓');
  };

  const handleCopy = async () => {
    if (!convertedResult) return;
    try {
      await navigator.clipboard.writeText(convertedResult);
      setIsCopied(true);
      onToast('Converted subtitle copied to clipboard!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      onToast('Copy failed');
    }
  };

  // Download active file
  const handleDownloadActive = () => {
    if (!convertedResult || !activeFile) return;
    const base = activeFile.name.replace(/\.[^.]+$/, '') || 'subtitles';
    const fmt = activeFile.targetFormat || globalTargetFormat;
    const targetMeta = SUPPORTED_FORMATS.find(f => f.id === fmt);
    const ext = targetMeta?.extension || `.${fmt}`;
    downloadText(convertedResult, `${base}${ext}`, targetMeta?.mimeType || 'text/plain');
    onToast(`Downloaded ${base}${ext}`);
  };

  // Download all files as a unified ZIP archive
  const handleDownloadAllZip = async () => {
    if (!filesList.length) return;
    const filesToArchive = filesList.map(item => {
      const base = item.name.replace(/\.[^.]+$/, '') || 'subtitles';
      const fmt = item.targetFormat || globalTargetFormat;
      const targetMeta = SUPPORTED_FORMATS.find(f => f.id === fmt);
      const ext = targetMeta?.extension || `.${fmt}`;
      const text = convertSubtitles(item.cues, fmt, {
        mode: dualMode,
        title: base,
      });
      return {
        name: `${base}${ext}`,
        content: text,
      };
    });

    await downloadZip(filesToArchive, 'Converted-Subtitles.zip');
    onToast(`Downloaded all ${filesToArchive.length} converted files in Converted-Subtitles.zip!`);
  };

  // Remove a file from batch
  const handleRemoveFile = (id: string) => {
    const next = filesList.filter(f => f.id !== id);
    setFilesList(next);
    if (activeFileId === id && next.length > 0) {
      setActiveFileId(next[0].id);
    }
  };

  const handleCleanFilenames = () => {
    setFilesList(prev =>
      prev.map(f => {
        const clean = f.name
          .replace(/\[[^\]]+\]/g, '')
          .replace(/\([^\)]+\)/g, '')
          .replace(/_+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        return { ...f, name: clean || f.name };
      })
    );
    onToast('Cleaned bracket tags and release metadata from filenames!');
  };

  const filteredFilesList = useMemo(() => {
    if (!batchFilterQuery.trim()) return filesList;
    const q = batchFilterQuery.toLowerCase();
    return filesList.filter(f => f.name.toLowerCase().includes(q));
  }, [filesList, batchFilterQuery]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-4 rounded-3xl bg-gradient-to-r from-purple-900/30 via-pink-900/20 to-cyan-900/30 border border-purple-500/30 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-pink-400" />
            <h2 className="text-base font-bold text-white">Universal Multi-File Subtitle Converter & Fast Translator</h2>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Upload <strong>multiple files at once</strong>. Convert between <strong>SRT, VTT, ASS, SSA, SBV, LRC, TTML, SMI, CSV, JSON, TXT</strong> and translate to Khmer with maximum speed.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => {
              const newFile: BatchFileItem = {
                id: 'sample_srt_' + Date.now(),
                name: 'sample-angkor.srt',
                content: SAMPLE_SRT,
                detectedFormat: 'srt',
                cues: parseSubtitles(SAMPLE_SRT, 'srt', 'sample-angkor.srt'),
                targetFormat: globalTargetFormat,
                status: 'ready',
              };
              setFilesList(prev => [...prev, newFile]);
              setActiveFileId(newFile.id);
              onToast('Added Sample SRT');
            }}
            className="px-2.5 py-1 rounded-xl text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
          >
            + Sample SRT
          </button>
          <button
            onClick={() => {
              const newFile: BatchFileItem = {
                id: 'sample_ass_' + Date.now(),
                name: 'sample-movie.ass',
                content: SAMPLE_ASS,
                detectedFormat: 'ass',
                cues: parseSubtitles(SAMPLE_ASS, 'ass', 'sample-movie.ass'),
                targetFormat: globalTargetFormat,
                status: 'ready',
              };
              setFilesList(prev => [...prev, newFile]);
              setActiveFileId(newFile.id);
              onToast('Added Sample ASS');
            }}
            className="px-2.5 py-1 rounded-xl text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
          >
            + Sample ASS
          </button>
          <button
            onClick={() => {
              const newFile: BatchFileItem = {
                id: 'sample_lrc_' + Date.now(),
                name: 'sample-song.lrc',
                content: SAMPLE_LRC,
                detectedFormat: 'lrc',
                cues: parseSubtitles(SAMPLE_LRC, 'lrc', 'sample-song.lrc'),
                targetFormat: globalTargetFormat,
                status: 'ready',
              };
              setFilesList(prev => [...prev, newFile]);
              setActiveFileId(newFile.id);
              onToast('Added Sample LRC');
            }}
            className="px-2.5 py-1 rounded-xl text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
          >
            + Sample LRC
          </button>
        </div>
      </div>

      {/* Main Converter Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Multi-file Dropzone & Batch File Manager (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Multi-file Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              handleFileUpload(e.dataTransfer.files);
            }}
            className="group border-2 border-dashed border-white/15 hover:border-purple-500/50 rounded-3xl p-6 text-center cursor-pointer transition-all bg-white/[0.02] hover:bg-white/[0.04]"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".srt,.vtt,.ass,.ssa,.sbv,.lrc,.ttml,.dfxp,.smi,.csv,.tsv,.json,.txt,.zip,application/zip,application/x-zip-compressed"
              onChange={e => handleFileUpload(e.target.files)}
              className="hidden"
            />
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-purple-300 group-hover:scale-105 transition-transform">
              <Upload className="w-5 h-5" />
            </div>
            <div className="text-sm font-semibold text-white">
              Drop multiple subtitle files or .ZIP archive here
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Select multiple files or .ZIP archives · Automatically unpacks & converts all subtitles!
            </div>
          </div>

          {/* Uploaded Files Batch List */}
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-pink-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Files in Batch ({filesList.length})
                </h3>
              </div>
              {filesList.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCleanFilenames}
                    className="text-[11px] text-cyan-300 hover:text-cyan-200 transition-colors"
                    title="Strip bracketed tags and release clutter from filenames"
                  >
                    Clean Names
                  </button>
                  <span className="text-white/20">·</span>
                  <button
                    onClick={() => setFilesList([])}
                    className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {filesList.length > 3 && (
              <input
                type="text"
                value={batchFilterQuery}
                onChange={e => setBatchFilterQuery(e.target.value)}
                placeholder="Filter files in batch..."
                className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            )}

            {filesList.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No files uploaded yet. Drop files above!
              </div>
            ) : filteredFilesList.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No files match "{batchFilterQuery}"
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {filteredFilesList.map((item) => {
                  const isActive = item.id === activeFile?.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setActiveFileId(item.id)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-purple-500/20 border-purple-500/50 text-white shadow-md shadow-purple-500/10'
                          : 'bg-black/30 hover:bg-black/50 border-white/10 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold truncate">{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold bg-white/10 text-cyan-300 shrink-0">
                            {item.detectedFormat}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>{item.cues.length} lines</span>
                          <span>→</span>
                          <span className="uppercase text-purple-300 font-semibold">{item.targetFormat}</span>
                          {item.status === 'translating' && (
                            <span className="text-amber-400 font-medium">Translating...</span>
                          )}
                          {item.status === 'done' && (
                            <span className="text-emerald-400 font-medium">✓ Ready</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleRemoveFile(item.id);
                          }}
                          className="p-1 rounded text-slate-500 hover:text-rose-400"
                          title="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fast Batch Translate & Convert All Button */}
            {filesList.length > 0 && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <button
                  onClick={handleFastTranslateAndConvertAll}
                  disabled={isBatchTranslating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 hover:opacity-95 text-white shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all"
                >
                  {isBatchTranslating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Translating Subtitles in Fast Parallel...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4" />
                      <span>⚡ Fast Translate All to Khmer & Convert</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadAllZip}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15"
                >
                  <Archive className="w-4 h-4 text-cyan-400" />
                  <span>Download All Converted Files (ZIP)</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick Paste or Edit Current File Content */}
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Edit Current File Text:</span>
              {activeFile && <span className="font-mono text-purple-300 truncate max-w-[180px]">{activeFile.name}</span>}
            </div>
            <textarea
              value={activeFile?.content || ''}
              onChange={e => {
                const text = e.target.value;
                if (!activeFile) return;
                const det = detectSubtitleFormat(text, activeFile.name);
                const cues = parseSubtitles(text, det, activeFile.name);
                setFilesList(prev =>
                  prev.map(f => (f.id === activeFile.id ? { ...f, content: text, cues, detectedFormat: det } : f))
                );
              }}
              rows={6}
              className="w-full p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500/50 resize-y"
              placeholder="Paste or edit subtitle text here..."
            />
          </div>

          {/* Advanced Timing & Surgery Options */}
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-left group"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-bold text-white">Subtitle Timing & Surgery Tools</span>
                {(timeShiftSeconds !== 0 || enableFpsConvert || speedMultiplier !== 1.0) && (
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                )}
              </div>
              <span className="text-xs text-slate-400 group-hover:text-white transition-colors">
                {showAdvanced ? 'Hide' : 'Configure'}
              </span>
            </button>

            {showAdvanced && (
              <div className="mt-4 pt-4 border-t border-white/10 space-y-4 text-xs">
                {/* Time Shift */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Time Shift (Seconds):</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTimeShiftSeconds(prev => Math.round((prev - 0.5) * 10) / 10)}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                      >
                        -0.5s
                      </button>
                      <input
                        type="number"
                        step="0.1"
                        value={timeShiftSeconds}
                        onChange={e => setTimeShiftSeconds(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 rounded-lg bg-black/40 border border-white/15 text-center font-mono text-white"
                      />
                      <button
                        onClick={() => setTimeShiftSeconds(prev => Math.round((prev + 0.5) * 10) / 10)}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300"
                      >
                        +0.5s
                      </button>
                      {timeShiftSeconds !== 0 && (
                        <button
                          onClick={() => setTimeShiftSeconds(0)}
                          className="text-slate-400 hover:text-white"
                          title="Reset"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Speed Multiplier */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Speed Scaling:</label>
                    <select
                      value={speedMultiplier}
                      onChange={e => setSpeedMultiplier(parseFloat(e.target.value))}
                      className="w-full px-2.5 py-1 rounded-lg bg-black/40 border border-white/15 text-white"
                    >
                      <option value="1.0">1.0x (Normal speed)</option>
                      <option value="0.9">0.9x (Slow down 10%)</option>
                      <option value="1.05">1.05x (Slightly faster)</option>
                      <option value="1.1">1.1x (10% faster)</option>
                      <option value="1.25">1.25x (PAL to NTSC standard)</option>
                    </select>
                  </div>
                </div>

                {/* Auto Fix Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoFixOverlaps}
                      onChange={e => setAutoFixOverlaps(e.target.checked)}
                      className="rounded accent-purple-500"
                    />
                    Auto-fix overlaps
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cleanHearingImpaired}
                      onChange={e => setCleanHearingImpaired(e.target.checked)}
                      className="rounded accent-purple-500"
                    />
                    Clean SDH [Music]
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableWrapLines}
                      onChange={e => setEnableWrapLines(e.target.checked)}
                      className="rounded accent-purple-500"
                    />
                    Split long lines
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optimizeKhmer}
                      onChange={e => setOptimizeKhmer(e.target.checked)}
                      className="rounded accent-pink-500"
                    />
                    <span className="font-khmer">Khmer Punctuation (.) → (។)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={toKhmerDigits}
                      onChange={e => setToKhmerDigits(e.target.checked)}
                      className="rounded accent-pink-500"
                    />
                    <span className="font-khmer">Khmer Numerals (០-៩)</span>
                  </label>
                </div>

                {/* Batch Find & Replace */}
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300">Find & Replace Across Cues:</span>
                    <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={matchCase}
                        onChange={e => setMatchCase(e.target.checked)}
                        className="rounded accent-purple-500"
                      />
                      Match Case
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={findText}
                      onChange={e => setFindText(e.target.value)}
                      placeholder="Find text..."
                      className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/15 text-white placeholder-slate-500 text-xs"
                    />
                    <input
                      type="text"
                      value={replaceText}
                      onChange={e => setReplaceText(e.target.value)}
                      placeholder="Replace with..."
                      className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/15 text-white placeholder-slate-500 text-xs"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleBatchReplace(false)}
                      className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-[11px] font-semibold"
                    >
                      Replace in Current File
                    </button>
                    <button
                      onClick={() => handleBatchReplace(true)}
                      className="flex-1 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 text-[11px] font-bold"
                    >
                      Replace in All Batch Files
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Target Format Selection & Live Preview (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Target Format For All Files:
                </label>
                {activeFile && (
                  <span className="text-xs text-purple-300 font-mono">
                    Converting: {activeFile.name}
                  </span>
                )}
              </div>

              {/* Format selection pills */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {SUPPORTED_FORMATS.map(fmt => {
                  const isActive = globalTargetFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => handleSetGlobalTargetFormat(fmt.id)}
                      className={`p-2.5 rounded-xl text-left border transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 border-purple-500/60 text-white shadow-md shadow-purple-500/10'
                          : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/10 text-slate-300'
                      }`}
                    >
                      <div className="font-bold text-xs uppercase flex items-center justify-between">
                        <span>{fmt.id}</span>
                        {isActive && <Check className="w-3 h-3 text-cyan-400" />}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{fmt.name.split('(')[0]}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Track Mode and View Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
              <div className="flex items-center gap-2 text-xs">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-slate-300 font-semibold">Track Mode:</span>
                <select
                  value={dualMode}
                  onChange={e => setDualMode(e.target.value as DualSubtitleMode)}
                  className="px-2 py-1 rounded-lg bg-black/40 border border-white/15 text-xs text-white"
                >
                  <option value="target">Target / Khmer translation</option>
                  <option value="source">Source original text only</option>
                  <option value="bilingual_top_bottom">Bilingual: Khmer top, Original bottom</option>
                  <option value="bilingual_bottom_top">Bilingual: Original top, Khmer bottom</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveView('raw')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    activeView === 'raw' ? 'bg-purple-500/30 text-purple-200' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Raw Code
                </button>
                <button
                  onClick={() => setActiveView('table')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    activeView === 'table' ? 'bg-purple-500/30 text-purple-200' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Table View
                </button>
              </div>
            </div>

            {/* Converted Output View for Active File */}
            <div className="relative">
              {activeView === 'raw' ? (
                <textarea
                  readOnly
                  value={convertedResult}
                  rows={13}
                  className="w-full p-3 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-emerald-300 focus:outline-none resize-y selection:bg-purple-500/40"
                />
              ) : (
                <div className="max-h-[300px] overflow-y-auto rounded-xl bg-black/50 border border-white/10 divide-y divide-white/5 text-xs">
                  {transformedCues.map((cue, idx) => (
                    <div key={idx} className="p-2.5 hover:bg-white/[0.02] flex items-start gap-3">
                      <span className="font-mono text-slate-500 text-[10px] w-6 shrink-0 pt-0.5">#{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-cyan-400 font-mono">
                          {cue.start.toFixed(2)}s → {cue.end.toFixed(2)}s ({(cue.end - cue.start).toFixed(1)}s)
                        </div>
                        <div className="text-slate-200 mt-0.5">{cue.text}</div>
                        {cue.km && <div className="text-pink-300 font-khmer mt-0.5">{cue.km}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons for Active File */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              <button
                onClick={handleDownloadActive}
                disabled={!convertedResult}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 hover:opacity-95 text-white shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download .{activeFile?.targetFormat || globalTargetFormat}</span>
              </button>

              <button
                onClick={handleDownloadAllZip}
                disabled={!filesList.length}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-semibold text-xs bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/15 disabled:opacity-50 transition-colors"
                title="Download all converted files in Converted-Subtitles.zip"
              >
                <Archive className="w-4 h-4 text-cyan-400" />
                <span>Download All ZIP ({filesList.length})</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!convertedResult}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl font-semibold text-xs bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15 disabled:opacity-50 transition-colors"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => {
                    if (activeFile) {
                      onOpenInEditor(activeFile.name.replace(/\.[^.]+$/, '') || 'Subtitles', transformedCues);
                    }
                  }}
                  disabled={!transformedCues.length}
                  className="flex items-center justify-center p-2.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 hover:text-white disabled:opacity-50 transition-colors"
                  title="Open in Live Video Editor"
                >
                  <Play className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quality Linter Notice */}
            {linterIssues.length > 0 && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Subtitle Quality Check:</span> Found {linterIssues.length} potential timing issues (e.g. {linterIssues[0].message}).
                  <button
                    onClick={() => {
                      setAutoFixOverlaps(true);
                      onToast('Auto-fixed subtitle overlaps and durations!');
                    }}
                    className="ml-2 underline font-semibold text-amber-300 hover:text-white"
                  >
                    Click to auto-fix all
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
