/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  Layers,
  Upload,
  ArrowRight,
  Download,
  Play,
  Sparkles,
  Sliders,
  Check,
  FileText,
  AlertTriangle,
  Archive,
  RefreshCw,
  FolderOpen,
  Zap,
} from 'lucide-react';
import {
  SubtitleCue,
  parseSubtitles,
  buildSrt,
  buildVtt,
  buildAss,
  buildCsv,
} from '../utils/subtitleConverter.ts';
import {
  mergeBilingualSubtitles,
  autoFixSubtitles,
  lintSubtitles,
} from '../utils/subtitleOps.ts';
import { isZipFile, unpackZipSubtitles, ExtractedSubtitleFile } from '../utils/zipHandler.ts';
import { downloadText, downloadZip } from '../utils/downloadZip.ts';
import { saveProject } from '../utils/storage.ts';

interface BilingualMergerTabProps {
  onOpenInEditor: (title: string, cues: SubtitleCue[]) => void;
  onToast: (msg: string) => void;
}

const SAMPLE_TRACK_A = `1
00:00:01,000 --> 00:00:03,500
Good morning, how are you today?

2
00:00:04,000 --> 00:00:06,800
I am excited to show you this feature.
`;

const SAMPLE_TRACK_B = `1
00:00:01,000 --> 00:00:03,500
អរុណសួស្តី តើអ្នកសុខសប្បាយជាទេថ្ងៃនេះ?

2
00:00:04,000 --> 00:00:06,800
ខ្ញុំពិតជារំភើបណាស់ក្នុងការបង្ហាញមុខងារនេះដល់អ្នក។
`;

export const BilingualMergerTab: React.FC<BilingualMergerTabProps> = ({ onOpenInEditor, onToast }) => {
  const [trackAText, setTrackAText] = useState(SAMPLE_TRACK_A);
  const [trackAName, setTrackAName] = useState('english-original.srt');
  const [trackBText, setTrackBText] = useState(SAMPLE_TRACK_B);
  const [trackBName, setTrackBName] = useState('khmer-translated.srt');
  const [order, setOrder] = useState<'khmer_top' | 'khmer_bottom'>('khmer_top');
  const [mergedFormat, setMergedFormat] = useState<'srt' | 'vtt' | 'ass' | 'csv'>('srt');
  const [zipFiles, setZipFiles] = useState<ExtractedSubtitleFile[]>([]);
  const [isAutoMerging, setIsAutoMerging] = useState(false);

  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const trackAInputRef = useRef<HTMLInputElement>(null);
  const trackBInputRef = useRef<HTMLInputElement>(null);

  // Handle upload of ZIP or multi-files
  const handleMainUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const extractedList: ExtractedSubtitleFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (isZipFile(f)) {
        try {
          onToast(`Unpacking ZIP: ${f.name}...`);
          const extracted = await unpackZipSubtitles(f);
          if (extracted.length === 0) {
            onToast(`No subtitle files found inside ${f.name}`);
          } else {
            extractedList.push(...extracted);
          }
        } catch (err) {
          onToast(`Failed to unpack ${f.name}: ${String(err)}`);
        }
      } else {
        try {
          const text = await f.text();
          extractedList.push({
            name: f.name,
            content: text,
            size: f.size,
          });
        } catch {
          onToast(`Error reading ${f.name}`);
        }
      }
    }

    if (extractedList.length === 0) return;

    setZipFiles(prev => [...prev, ...extractedList]);

    if (extractedList.length >= 2) {
      setTrackAText(extractedList[0].content);
      setTrackAName(extractedList[0].name);
      setTrackBText(extractedList[1].content);
      setTrackBName(extractedList[1].name);
      onToast(`Loaded ${extractedList.length} files! Set Track A to ${extractedList[0].name} and Track B to ${extractedList[1].name}`);
    } else if (extractedList.length === 1) {
      setTrackAText(extractedList[0].content);
      setTrackAName(extractedList[0].name);
      onToast(`Loaded ${extractedList[0].name} into Track A. Upload Track B next.`);
    }
  };

  // Specific track upload
  const handleSingleTrackUpload = async (file: File, track: 'A' | 'B') => {
    if (isZipFile(file)) {
      await handleMainUpload([file] as any);
      return;
    }
    const text = await file.text();
    if (track === 'A') {
      setTrackAText(text);
      setTrackAName(file.name);
      onToast(`Loaded ${file.name} into Track A`);
    } else {
      setTrackBText(text);
      setTrackBName(file.name);
      onToast(`Loaded ${file.name} into Track B`);
    }
  };

  // Parse cues
  const cuesA = React.useMemo(() => {
    try {
      return parseSubtitles(trackAText, undefined, trackAName);
    } catch {
      return [];
    }
  }, [trackAText, trackAName]);

  const cuesB = React.useMemo(() => {
    try {
      return parseSubtitles(trackBText, undefined, trackBName);
    } catch {
      return [];
    }
  }, [trackBText, trackBName]);

  // Merged cues
  const mergedCues = React.useMemo(() => {
    if (!cuesA.length && !cuesB.length) return [];
    if (!cuesB.length) return cuesA;
    if (!cuesA.length) return cuesB;

    return mergeBilingualSubtitles(cuesA, cuesB);
  }, [cuesA, cuesB]);

  // Formatted merged result
  const mergedOutput = React.useMemo(() => {
    if (!mergedCues.length) return '';
    const mode = order === 'khmer_top' ? 'bilingual_top_bottom' : 'bilingual_bottom_top';

    if (mergedFormat === 'vtt') return buildVtt(mergedCues, mode);
    if (mergedFormat === 'ass') return buildAss(mergedCues, 'Bilingual Subtitle', mode);
    if (mergedFormat === 'csv') return buildCsv(mergedCues);
    return buildSrt(mergedCues, mode);
  }, [mergedCues, order, mergedFormat]);

  const handleDownload = () => {
    if (!mergedOutput) return;
    const baseA = trackAName.replace(/\.[^.]+$/, '');
    const filename = `${baseA}.bilingual.${mergedFormat}`;
    downloadText(mergedOutput, filename);
    onToast(`Downloaded ${filename}`);

    saveProject({
      title: `${baseA} (Bilingual)`,
      kind: 'merged',
      sourceLang: 'en',
      targetLang: 'km',
      cues: mergedCues,
    });
  };

  // Auto-pair files from ZIP and batch-merge them
  const handleAutoPairAndBatchMerge = async () => {
    if (zipFiles.length < 2) {
      onToast('Please upload a ZIP file containing at least 2 subtitle tracks to batch merge.');
      return;
    }

    setIsAutoMerging(true);
    onToast(`Analyzing ${zipFiles.length} files from ZIP to find matching language pairs...`);

    try {
      // Find pairs by base name stripping language tokens
      const cleanBase = (name: string) => {
        return name
          .toLowerCase()
          .replace(/\.(srt|vtt|ass|ssa|sbv|lrc|txt)$/i, '')
          .replace(/[._-](en|eng|english|km|kh|khm|khmer|vi|th|zh|zh-cn|zh-tw|ja|ko)$/i, '')
          .trim();
      };

      const groups = new Map<string, ExtractedSubtitleFile[]>();
      zipFiles.forEach(f => {
        const key = cleanBase(f.name);
        const list = groups.get(key) || [];
        list.push(f);
        groups.set(key, list);
      });

      const mergedFilesToZip: { name: string; content: string }[] = [];
      let pairCount = 0;

      for (const [baseKey, filesInGroup] of groups.entries()) {
        if (filesInGroup.length >= 2) {
          // Identify track A and B (e.g. non-Khmer as A, Khmer as B, or first and second)
          let fileA = filesInGroup[0];
          let fileB = filesInGroup[1];

          // If fileA has khmer indicator, swap so non-khmer is A and khmer is B
          const isKhmer = (name: string) => /[._-](km|kh|khm|khmer)/i.test(name);
          if (isKhmer(fileA.name) && !isKhmer(fileB.name)) {
            const temp = fileA;
            fileA = fileB;
            fileB = temp;
          }

          const cues1 = parseSubtitles(fileA.content, undefined, fileA.name);
          const cues2 = parseSubtitles(fileB.content, undefined, fileB.name);
          const merged = mergeBilingualSubtitles(cues1, cues2);

          const mode = order === 'khmer_top' ? 'bilingual_top_bottom' : 'bilingual_bottom_top';
          let outputContent = '';
          if (mergedFormat === 'vtt') outputContent = buildVtt(merged, mode);
          else if (mergedFormat === 'ass') outputContent = buildAss(merged, baseKey, mode);
          else if (mergedFormat === 'csv') outputContent = buildCsv(merged);
          else outputContent = buildSrt(merged, mode);

          mergedFilesToZip.push({
            name: `${baseKey || 'merged'}.bilingual.${mergedFormat}`,
            content: outputContent,
          });
          pairCount++;
        }
      }

      // If no naming pairs matched, merge files sequentially in pairs
      if (mergedFilesToZip.length === 0) {
        for (let i = 0; i < zipFiles.length - 1; i += 2) {
          const fileA = zipFiles[i];
          const fileB = zipFiles[i + 1];
          const cues1 = parseSubtitles(fileA.content, undefined, fileA.name);
          const cues2 = parseSubtitles(fileB.content, undefined, fileB.name);
          const merged = mergeBilingualSubtitles(cues1, cues2);
          const mode = order === 'khmer_top' ? 'bilingual_top_bottom' : 'bilingual_bottom_top';
          const outputContent = buildSrt(merged, mode);
          const base = fileA.name.replace(/\.[^.]+$/, '');
          mergedFilesToZip.push({
            name: `${base}.bilingual.${mergedFormat}`,
            content: outputContent,
          });
          pairCount++;
        }
      }

      if (mergedFilesToZip.length > 0) {
        await downloadZip(mergedFilesToZip, 'Batch-Bilingual-Subtitles.zip');
        onToast(`Successfully merged ${pairCount} pairs! Downloaded Batch-Bilingual-Subtitles.zip`);
      } else {
        onToast('Could not pair files automatically. Please assign Track A and Track B manually.');
      }
    } catch (err) {
      onToast(`Batch merge error: ${String(err)}`);
    } finally {
      setIsAutoMerging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-4 rounded-3xl bg-gradient-to-r from-purple-900/30 via-cyan-900/20 to-pink-900/30 border border-purple-500/30 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            <h2 className="text-base font-bold text-white">Bilingual Subtitle Merger & Dual-Track Studio</h2>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Combine two subtitle files or <strong>upload a .ZIP archive</strong> containing multiple subtitle tracks to batch merge dual-language subtitles!
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={mainFileInputRef}
            type="file"
            multiple
            accept=".zip,application/zip,application/x-zip-compressed,.srt,.vtt,.ass,.ssa,.sbv,.lrc"
            onChange={e => handleMainUpload(e.target.files)}
            className="hidden"
          />
          <button
            onClick={() => mainFileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-xs font-semibold text-purple-200 transition-colors"
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>Upload .ZIP / Multiple Files</span>
          </button>

          {zipFiles.length >= 2 && (
            <button
              onClick={handleAutoPairAndBatchMerge}
              disabled={isAutoMerging}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:opacity-95 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>{isAutoMerging ? 'Merging Pairs...' : '⚡ Auto-Pair & Merge All to ZIP'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ZIP File Quick Selector / Browser */}
      {zipFiles.length > 0 && (
        <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Unpacked Files from ZIP ({zipFiles.length})
              </span>
            </div>
            <button
              onClick={() => setZipFiles([])}
              className="text-xs text-rose-400 hover:text-rose-300"
            >
              Clear ZIP files
            </button>
          </div>

          <p className="text-xs text-slate-400">
            Click any file below to set as Track A or Track B, or use <strong>⚡ Auto-Pair & Merge All</strong> above.
          </p>

          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
            {zipFiles.map(z => {
              const isA = trackAName === z.name;
              const isB = trackBName === z.name;
              return (
                <div
                  key={z.name}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs border transition-all ${
                    isA
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                      : isB
                      ? 'bg-pink-500/20 border-pink-500/50 text-pink-200'
                      : 'bg-black/40 border-white/10 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 opacity-60" />
                  <span className="font-mono text-xs truncate max-w-[160px]" title={z.name}>
                    {z.name}
                  </span>
                  <button
                    onClick={() => {
                      setTrackAText(z.content);
                      setTrackAName(z.name);
                      onToast(`Set Track A to ${z.name}`);
                    }}
                    className="px-1.5 py-0.5 rounded bg-cyan-500/30 hover:bg-cyan-500/50 text-[10px] text-cyan-200 font-bold"
                  >
                    Set A
                  </button>
                  <button
                    onClick={() => {
                      setTrackBText(z.content);
                      setTrackBName(z.name);
                      onToast(`Set Track B to ${z.name}`);
                    }}
                    className="px-1.5 py-0.5 rounded bg-pink-500/30 hover:bg-pink-500/50 text-[10px] text-pink-200 font-bold"
                  >
                    Set B
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Track A and Track B Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Track A */}
        <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center">1</span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Track A (e.g. English Original)</h3>
                <span className="text-[11px] text-slate-400 font-mono truncate block max-w-[200px]" title={trackAName}>
                  {trackAName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">{cuesA.length} cues</span>
              <input
                ref={trackAInputRef}
                type="file"
                accept=".srt,.vtt,.ass,.ssa,.sbv,.lrc,.txt,.zip"
                onChange={e => e.target.files?.[0] && handleSingleTrackUpload(e.target.files[0], 'A')}
                className="hidden"
              />
              <button
                onClick={() => trackAInputRef.current?.click()}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs"
                title="Upload file for Track A"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <textarea
            value={trackAText}
            onChange={e => setTrackAText(e.target.value)}
            rows={8}
            className="w-full p-3 rounded-2xl bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
            placeholder="Paste Track 1 subtitles..."
          />
        </div>

        {/* Track B */}
        <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-300 text-xs font-bold flex items-center justify-center">2</span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Track B (e.g. Khmer Translation)</h3>
                <span className="text-[11px] text-slate-400 font-mono truncate block max-w-[200px]" title={trackBName}>
                  {trackBName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">{cuesB.length} cues</span>
              <input
                ref={trackBInputRef}
                type="file"
                accept=".srt,.vtt,.ass,.ssa,.sbv,.lrc,.txt,.zip"
                onChange={e => e.target.files?.[0] && handleSingleTrackUpload(e.target.files[0], 'B')}
                className="hidden"
              />
              <button
                onClick={() => trackBInputRef.current?.click()}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs"
                title="Upload file for Track B"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <textarea
            value={trackBText}
            onChange={e => setTrackBText(e.target.value)}
            rows={8}
            className="w-full p-3 rounded-2xl bg-black/40 border border-white/10 text-xs font-khmer text-slate-200 focus:outline-none focus:border-pink-500/50"
            placeholder="Paste Track 2 subtitles..."
          />
        </div>
      </div>

      {/* Merged Preview and Export */}
      <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Layout:</span>
              <select
                value={order}
                onChange={e => setOrder(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
              >
                <option value="khmer_top">Khmer Top, English Bottom</option>
                <option value="khmer_bottom">English Top, Khmer Bottom</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Format:</span>
              <select
                value={mergedFormat}
                onChange={e => setMergedFormat(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white uppercase font-bold"
              >
                <option value="srt">SRT (Universal)</option>
                <option value="vtt">VTT (Web)</option>
                <option value="ass">ASS (Styled Dual-Color)</option>
                <option value="csv">CSV (Spreadsheet)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!mergedCues.length}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-95 text-white shadow-lg shadow-purple-500/20 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Download Bilingual .{mergedFormat}</span>
            </button>

            <button
              onClick={() => onOpenInEditor('Bilingual Subtitles', mergedCues)}
              disabled={!mergedCues.length}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15 disabled:opacity-50"
            >
              <Play className="w-4 h-4 text-cyan-400" />
              <span>Open in Video Player</span>
            </button>
          </div>
        </div>

        {/* Output view */}
        <textarea
          readOnly
          value={mergedOutput}
          rows={10}
          className="w-full p-4 rounded-2xl bg-black/50 border border-white/10 text-xs font-mono text-cyan-300 focus:outline-none"
        />
      </div>
    </div>
  );
};
