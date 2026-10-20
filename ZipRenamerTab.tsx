/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Archive,
  Upload,
  ArrowRight,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Sparkles,
  Search,
  Check,
  FolderArchive,
  Filter,
  SlidersHorizontal,
  FileCode,
  Layers,
  FileText,
  AlertCircle,
  ExternalLink,
  Zap,
} from 'lucide-react';

interface ZipFileEntry {
  path: string;
  file: JSZip.JSZipObject;
  idx: number;
  size: number;
  date: number;
  srcZip: string;
  newPath?: string;
}

interface ZipRenamerTabProps {
  onToast: (msg: string) => void;
  onNavigateToConvert?: () => void;
}

export const ZipRenamerTab: React.FC<ZipRenamerTabProps> = ({
  onToast,
  onNavigateToConvert,
}) => {
  const [allFiles, setAllFiles] = useState<ZipFileEntry[]>([]);
  const [prefix, setPrefix] = useState('ep_');
  const [suffix, setSuffix] = useState('');
  const [startNum, setStartNum] = useState(1);
  const [stepNum, setStepNum] = useState(1);
  const [padDigits, setPadDigits] = useState(2);
  const [forceExt, setForceExt] = useState('');
  const [caseMode, setCaseMode] = useState<'none' | 'lower' | 'upper' | 'title'>('none');
  const [flattenFolders, setFlattenFolders] = useState(true);
  const [sortMode, setSortMode] = useState<string>('name');
  const [onlyExt, setOnlyExt] = useState('');
  const [skipExt, setSkipExt] = useState('');
  const [outputZipName, setOutputZipName] = useState('renamed_files.zip');

  // Checkbox options
  const [restartPerFolder, setRestartPerFolder] = useState(false);
  const [perExt, setPerExt] = useState(false);
  const [keepOriginalName, setKeepOriginalName] = useState(false);
  const [cleanSceneTags, setCleanSceneTags] = useState(true);
  const [noCompress, setNoCompress] = useState(false);

  // UI & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper utilities
  const getBaseName = (p: string) => p.split('/').pop() || p;
  const getExt = (p: string) => {
    const b = getBaseName(p);
    const i = b.lastIndexOf('.');
    return i > 0 ? b.slice(i + 1).toLowerCase() : '';
  };
  const getStem = (p: string) => {
    const b = getBaseName(p);
    const i = b.lastIndexOf('.');
    return i > 0 ? b.slice(0, i) : b;
  };
  const padN = (n: number, p: number) => (p > 0 ? String(n).padStart(p, '0') : String(n));
  const formatBytes = (b: number) => {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  };
  const parseExtList = (v: string) =>
    v
      .split(/[,\s]+/)
      .map(s => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);

  // Clean common release group tags like [1080p], [WEB-DL], x264, x265, AAC, etc.
  const cleanTags = (name: string) => {
    return name
      .replace(/\[[^\]]*\]/g, '') // [anything]
      .replace(/\([^)]*(?:1080|720|4k|2160|hevc|x264|x265|web|bluray)[^)]*\)/gi, '')
      .replace(/\b(1080p|720p|480p|2160p|4k|uhd|hdtv|web-dl|webrip|bluray|x264|x265|hevc|aac|dts|remux)\b/gi, '')
      .replace(/[._-]+/g, ' ')
      .trim();
  };

  // Preset Handlers
  const applyPreset = (preset: 'tv' | 'khmer' | 'clean' | 'photos' | 'reset') => {
    if (preset === 'tv') {
      setPrefix('S01E');
      setSuffix('');
      setPadDigits(2);
      setStartNum(1);
      setKeepOriginalName(false);
      setFlattenFolders(true);
      onToast('Applied TV Series preset (S01E01...)');
    } else if (preset === 'khmer') {
      setPrefix('');
      setSuffix('_KhmerSub');
      setPadDigits(0);
      setKeepOriginalName(true);
      onToast('Applied Khmer Subtitle Tag preset');
    } else if (preset === 'clean') {
      setCleanSceneTags(true);
      setKeepOriginalName(true);
      setPrefix('');
      setSuffix('');
      setPadDigits(0);
      onToast('Applied Clean Release Tags preset');
    } else if (preset === 'photos') {
      setPrefix('IMG_');
      setSuffix('');
      setPadDigits(4);
      setStartNum(1);
      setKeepOriginalName(false);
      onToast('Applied Photo Sequencer preset (IMG_0001...)');
    } else if (preset === 'reset') {
      setPrefix('ep_');
      setSuffix('');
      setStartNum(1);
      setStepNum(1);
      setPadDigits(2);
      setForceExt('');
      setCaseMode('none');
      setFlattenFolders(true);
      setSortMode('name');
      setOnlyExt('');
      setSkipExt('');
      setRestartPerFolder(false);
      setPerExt(false);
      setKeepOriginalName(false);
      setCleanSceneTags(true);
      onToast('Reset options to defaults');
    }
  };

  // Load uploaded ZIP files
  const loadZipFiles = async (fileList: FileList | File[]) => {
    const zipFiles = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.zip'));
    if (zipFiles.length === 0) {
      setStatusText('Please drop or select valid .zip file(s)');
      setStatusType('error');
      onToast('Please select valid .zip file(s)');
      return;
    }

    setIsProcessing(true);
    setProgressPercent(15);
    setStatusText(`Reading ${zipFiles.length} ZIP file(s)...`);
    setStatusType('info');
    setGeneratedBlob(null);

    const loaded: ZipFileEntry[] = [];

    try {
      for (let zIdx = 0; zIdx < zipFiles.length; zIdx++) {
        const file = zipFiles[zIdx];
        const zip = await JSZip.loadAsync(file);
        let counter = 0;

        zip.forEach((path, entry) => {
          if (!entry.dir) {
            // JSZipObject internal representation
            const rawSize = (entry as any)._data ? (entry as any)._data.uncompressedSize : 0;
            const date = entry.date ? entry.date.getTime() : 0;
            loaded.push({
              path,
              file: entry,
              idx: counter++,
              size: rawSize,
              date,
              srcZip: file.name,
            });
          }
        });
      }

      if (loaded.length === 0) {
        setStatusText('Selected ZIP file(s) are empty or only contain directories.');
        setStatusType('error');
        setAllFiles([]);
        setIsProcessing(false);
        return;
      }

      setAllFiles(loaded);
      setProgressPercent(100);
      setStatusText(`Loaded ${zipFiles.length} ZIP archive(s) with ${loaded.length} total files.`);
      setStatusType('success');
      onToast(`Loaded ${loaded.length} files from ${zipFiles.length} ZIP archive(s)`);
    } catch (err: any) {
      console.error('Failed to unpack zip:', err);
      setStatusText(`Error unpacking ZIP: ${err.message || 'Corrupted archive'}`);
      setStatusType('error');
      onToast('Error reading ZIP file');
    } finally {
      setIsProcessing(false);
    }
  };

  // Compute computed new names for files
  const processedFiles = useMemo(() => {
    if (allFiles.length === 0) return [];

    const onlyList = parseExtList(onlyExt);
    const skipList = parseExtList(skipExt);

    // 1. Filter
    const filtered = allFiles.filter(item => {
      const ext = getExt(item.path);
      if (onlyList.length > 0 && !onlyList.includes(ext)) return false;
      if (skipList.length > 0 && skipList.includes(ext)) return false;
      return true;
    });

    // 2. Sort
    const naturalSort = (a: ZipFileEntry, b: ZipFileEntry) =>
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });

    filtered.sort((a, b) => {
      switch (sortMode) {
        case 'nameDesc':
          return -naturalSort(a, b);
        case 'size':
          return a.size - b.size;
        case 'sizeDesc':
          return b.size - a.size;
        case 'date':
          return a.date - b.date;
        case 'dateDesc':
          return b.date - a.date;
        case 'ext':
          return getExt(a.path).localeCompare(getExt(b.path)) || naturalSort(a, b);
        case 'original':
          return a.idx - b.idx;
        case 'name':
        default:
          return naturalSort(a, b);
      }
    });

    // 3. Numbering and New Name Calculation
    const counters: Record<string, number> = {};

    return filtered.map(item => {
      const dir = flattenFolders
        ? ''
        : item.path.includes('/')
        ? item.path.slice(0, item.path.lastIndexOf('/') + 1)
        : '';
      const originalExt = getExt(item.path);
      const key = (restartPerFolder ? dir : '') + '|' + (perExt ? originalExt : '');

      if (counters[key] === undefined) {
        counters[key] = startNum;
      } else {
        counters[key] += stepNum;
      }

      const curNum = counters[key];
      const targetExt = forceExt.trim().replace(/^\./, '') || originalExt;

      let baseStem = getStem(item.path);
      if (cleanSceneTags) {
        baseStem = cleanTags(baseStem);
      }

      let newFileName = '';
      if (keepOriginalName) {
        if (prefix || padDigits > 0) {
          newFileName = `${prefix}${padN(curNum, padDigits)}_${baseStem}${suffix}`;
        } else {
          newFileName = `${baseStem}${suffix}`;
        }
      } else {
        newFileName = `${prefix}${padN(curNum, padDigits)}${suffix}`;
      }

      if (caseMode === 'lower') {
        newFileName = newFileName.toLowerCase();
      } else if (caseMode === 'upper') {
        newFileName = newFileName.toUpperCase();
      } else if (caseMode === 'title') {
        newFileName = newFileName.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
      }

      const finalPath = dir + newFileName + (targetExt ? '.' + targetExt : '');

      return {
        ...item,
        newPath: finalPath,
      };
    });
  }, [
    allFiles,
    prefix,
    suffix,
    startNum,
    stepNum,
    padDigits,
    forceExt,
    caseMode,
    flattenFolders,
    sortMode,
    onlyExt,
    skipExt,
    restartPerFolder,
    perExt,
    keepOriginalName,
    cleanSceneTags,
  ]);

  // Search filtered items
  const displayRows = useMemo(() => {
    if (!searchQuery.trim()) return processedFiles;
    const q = searchQuery.toLowerCase();
    return processedFiles.filter(
      f =>
        f.path.toLowerCase().includes(q) ||
        (f.newPath && f.newPath.toLowerCase().includes(q))
    );
  }, [processedFiles, searchQuery]);

  // Pattern preview text
  const patternPreview = useMemo(() => {
    const formattedNum = padN(startNum, padDigits);
    const middle = keepOriginalName ? '_OriginalName' : '';
    const ext = forceExt.trim().replace(/^\./, '') || 'ext';
    return `${prefix}${formattedNum}${middle}${suffix}.${ext}`;
  }, [prefix, startNum, padDigits, keepOriginalName, suffix, forceExt]);

  // Build renamed ZIP
  const handleBuildZip = async () => {
    if (processedFiles.length === 0) return;

    setIsProcessing(true);
    setProgressPercent(5);
    setStatusText('Packaging renamed files into new ZIP...');
    setStatusType('info');

    try {
      const outZip = new JSZip();
      const usedPaths: Record<string, number> = {};

      for (let i = 0; i < processedFiles.length; i++) {
        const item = processedFiles[i];
        let targetPath = item.newPath || item.path;

        // Collision safety
        if (usedPaths[targetPath]) {
          const count = usedPaths[targetPath];
          const dot = targetPath.lastIndexOf('.');
          targetPath =
            dot > 0
              ? targetPath.slice(0, dot) + `_(${count})` + targetPath.slice(dot)
              : targetPath + `_(${count})`;
        }
        usedPaths[item.newPath || item.path] =
          (usedPaths[item.newPath || item.path] || 0) + 1;

        // Extract blob from source zip entry
        const blob = await item.file.async('blob');
        outZip.file(targetPath, blob);

        const currentPct = Math.round(((i + 1) / processedFiles.length) * 60);
        setProgressPercent(currentPct);

        if (i % 8 === 0) {
          setStatusText(`Archiving file ${i + 1} of ${processedFiles.length}...`);
          // Yield to let UI update
          await new Promise(r => setTimeout(r, 0));
        }
      }

      setStatusText('Compressing final ZIP file...');
      const finalBlob = await outZip.generateAsync(
        {
          type: 'blob',
          compression: noCompress ? 'STORE' : 'DEFLATE',
          compressionOptions: { level: 6 },
        },
        metadata => {
          const compPct = 60 + metadata.percent * 0.4;
          setProgressPercent(Math.round(compPct));
          setStatusText(`Compressing ZIP: ${metadata.percent.toFixed(0)}%`);
        }
      );

      setGeneratedBlob(finalBlob);
      setProgressPercent(100);
      setStatusText(
        `Done! Packaged ${processedFiles.length} files (${formatBytes(finalBlob.size)}).`
      );
      setStatusType('success');
      onToast(`Packaged ${processedFiles.length} files successfully!`);
    } catch (err: any) {
      console.error('Failed to build zip:', err);
      setStatusText(`Packaging error: ${err.message || 'Failed to generate ZIP'}`);
      setStatusType('error');
      onToast('Error building ZIP');
    } finally {
      setIsProcessing(false);
    }
  };

  // Download created ZIP
  const handleDownloadZip = () => {
    if (!generatedBlob) return;
    const name = (outputZipName.trim() || 'renamed_subtitles.zip').replace(
      /(\.zip)?$/i,
      '.zip'
    );
    const url = URL.createObjectURL(generatedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
    onToast(`Downloading ${name}`);
  };

  // Export Name Mapping CSV
  const handleExportCsv = () => {
    if (processedFiles.length === 0) return;
    const csvHeader = 'old_name,new_name,size_bytes,date\n';
    const csvRows = processedFiles
      .map(
        f =>
          `"${f.path.replace(/"/g, '""')}","${(f.newPath || f.path).replace(
            /"/g,
            '""'
          )}",${f.size},"${new Date(f.date).toISOString()}"`
      )
      .join('\n');

    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rename-map.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    onToast('Downloaded rename-map.csv');
  };

  // Reset all state
  const handleReset = () => {
    setAllFiles([]);
    setGeneratedBlob(null);
    setProgressPercent(0);
    setStatusText('');
    setSearchQuery('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onToast('Cleared all files');
  };

  // Check how many files in ZIP are subtitle files
  const subtitleFilesCount = useMemo(() => {
    const subExts = ['srt', 'vtt', 'ass', 'ssa', 'sbv', 'lrc', 'ttml', 'dfxp', 'smi', 'json', 'csv', 'tsv', 'txt'];
    return allFiles.filter(f => subExts.includes(getExt(f.path))).length;
  }, [allFiles]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900/90 via-purple-950/40 to-slate-900/90 border border-white/10 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-2">
              <FolderArchive className="w-3.5 h-3.5 text-cyan-400" />
              <span>Universal ZIP Archive Batch Tool · 100% Client-Side</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
              ZIP Bulk Renamer Pro
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-sm">
                1, 2, 3… PRO
              </span>
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl font-light">
              Upload single or multiple ZIP files → batch rename subtitle episodes, videos, photos, or documents with custom prefixes, zero-padded numbering, clean torrent/scene tags → repackage and download instantly.
            </p>
            <p className="text-xs text-purple-300 font-khmer mt-1">
              ប្ដូរឈ្មោះឯកសារក្នុង ZIP ជាក្រុមដោយស្វ័យប្រវត្ត (1, 2, 3...) និងទាញយកមកវិញភ្លាមៗ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onNavigateToConvert && (
              <button
                onClick={onNavigateToConvert}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition-all hover:border-purple-500/40"
              >
                <FileCode className="w-4 h-4 text-purple-400" />
                <span>Go to Converter</span>
              </button>
            )}
            <button
              onClick={handleReset}
              disabled={allFiles.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={e => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files) loadZipFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-200 relative group overflow-hidden ${
          isDragging
            ? 'border-cyan-400 bg-cyan-950/30 scale-[1.005]'
            : 'border-white/15 hover:border-cyan-500/50 bg-slate-900/50 hover:bg-slate-900/70'
        }`}
      >
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-purple-500/20 to-pink-500/20 border border-white/15 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
          <Upload className="w-7 h-7 text-cyan-400" />
        </div>
        <p className="font-bold text-lg text-white">
          Drop .zip archive(s) here or click to browse
        </p>
        <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto font-light">
          Supports multiple ZIP archives. Files are unpacked and repackaged 100% inside your browser. No files leave your device.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-[11px] text-slate-400">
          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">.zip files</span>
          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">Multi-archive merge</span>
          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">TV Subtitles & Media</span>
          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">Auto-clean Torrent tags</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files) loadZipFiles(e.target.files);
          }}
        />
      </div>

      {/* Preset Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
          <Zap className="w-3.5 h-3.5 text-pink-400" />
          <span>Quick Presets:</span>
        </span>
        <button
          onClick={() => applyPreset('tv')}
          className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-200 text-xs font-semibold transition-all hover:scale-105 active:scale-95"
        >
          🎬 TV Show: S01E01, S01E02…
        </button>
        <button
          onClick={() => applyPreset('clean')}
          className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-200 text-xs font-semibold transition-all hover:scale-105 active:scale-95"
        >
          🧹 Strip [1080p] & Group Tags
        </button>
        <button
          onClick={() => applyPreset('khmer')}
          className="px-3 py-1.5 rounded-xl bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-200 text-xs font-semibold transition-all hover:scale-105 active:scale-95"
        >
          🇰🇭 Add _KhmerSub Tag
        </button>
        <button
          onClick={() => applyPreset('photos')}
          className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200 text-xs font-semibold transition-all hover:scale-105 active:scale-95"
        >
          📸 Media Sequencer: IMG_0001…
        </button>
        <button
          onClick={() => applyPreset('reset')}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold transition-all"
        >
          ↺ Reset Defaults
        </button>
      </div>

      {/* Rename Configuration Panel */}
      <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-base">Rename Configuration</h3>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1">
            <span>Live Output Pattern:</span>
            <code className="px-2.5 py-1 rounded-lg bg-slate-950 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-semibold">
              {patternPreview}
            </code>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Prefix (Start Text)
            </label>
            <input
              type="text"
              value={prefix}
              onChange={e => setPrefix(e.target.value)}
              placeholder="e.g. ep_ or Show_S01E"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 text-white placeholder-slate-600 outline-none font-mono text-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Suffix (End Text)
            </label>
            <input
              type="text"
              value={suffix}
              onChange={e => setSuffix(e.target.value)}
              placeholder="e.g. _KH or _dual"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 text-white placeholder-slate-600 outline-none font-mono text-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Start Number
            </label>
            <input
              type="number"
              value={startNum}
              onChange={e => setStartNum(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 text-white outline-none font-mono text-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Step / Increment
            </label>
            <input
              type="number"
              min="1"
              value={stepNum}
              onChange={e => setStepNum(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 text-white outline-none font-mono text-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Pad Digits (Zero Padding)
            </label>
            <select
              value={padDigits}
              onChange={e => setPadDigits(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 text-white outline-none font-mono text-xs transition-all"
            >
              <option value="0">0 (No padding: 1, 2, 3…)</option>
              <option value="2">2 Digits (01, 02, 03…)</option>
              <option value="3">3 Digits (001, 002, 003…)</option>
              <option value="4">4 Digits (0001, 0002…)</option>
              <option value="5">5 Digits (00001…)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Force Extension (Blank = Keep)
            </label>
            <input
              type="text"
              value={forceExt}
              onChange={e => setForceExt(e.target.value)}
              placeholder="e.g. srt or vtt"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 text-white placeholder-slate-600 outline-none font-mono text-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Letter Casing
            </label>
            <select
              value={caseMode}
              onChange={e => setCaseMode(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 text-white outline-none text-xs transition-all"
            >
              <option value="none">Keep as typed</option>
              <option value="lower">lowercase (all small)</option>
              <option value="upper">UPPERCASE (all caps)</option>
              <option value="title">Title Case (First Capital)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Folder Structure
            </label>
            <select
              value={flattenFolders ? '1' : '0'}
              onChange={e => setFlattenFolders(e.target.value === '1')}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 text-white outline-none text-xs transition-all"
            >
              <option value="1">Flatten all into root</option>
              <option value="0">Preserve folder tree</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Sort Files By
            </label>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 text-white outline-none text-xs transition-all"
            >
              <option value="name">Name (Natural A → Z)</option>
              <option value="nameDesc">Name (Reverse Z → A)</option>
              <option value="size">Size (Smallest First)</option>
              <option value="sizeDesc">Size (Largest First)</option>
              <option value="date">Date (Oldest First)</option>
              <option value="dateDesc">Date (Newest First)</option>
              <option value="ext">File Extension</option>
              <option value="original">Original ZIP Order</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Include Only Extensions
            </label>
            <input
              type="text"
              value={onlyExt}
              onChange={e => setOnlyExt(e.target.value)}
              placeholder="e.g. srt, vtt, ass"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 text-white placeholder-slate-600 outline-none font-mono text-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Exclude Extensions
            </label>
            <input
              type="text"
              value={skipExt}
              onChange={e => setSkipExt(e.target.value)}
              placeholder="e.g. ds_store, nfo, txt"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 text-white placeholder-slate-600 outline-none font-mono text-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Output ZIP Filename
            </label>
            <input
              type="text"
              value={outputZipName}
              onChange={e => setOutputZipName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 text-white outline-none font-mono text-xs transition-all"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-white/10 text-xs text-slate-300">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={cleanSceneTags}
              onChange={e => setCleanSceneTags(e.target.checked)}
              className="accent-pink-500 w-4 h-4 rounded"
            />
            <span>Auto-clean release tags ([1080p], groups)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepOriginalName}
              onChange={e => setKeepOriginalName(e.target.checked)}
              className="accent-cyan-500 w-4 h-4 rounded"
            />
            <span>Append original filename</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={restartPerFolder}
              onChange={e => setRestartPerFolder(e.target.checked)}
              className="accent-purple-500 w-4 h-4 rounded"
            />
            <span>Restart numbering in each folder</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={perExt}
              onChange={e => setPerExt(e.target.checked)}
              className="accent-purple-500 w-4 h-4 rounded"
            />
            <span>Separate counter per file extension</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={noCompress}
              onChange={e => setNoCompress(e.target.checked)}
              className="accent-cyan-500 w-4 h-4 rounded"
            />
            <span>Store mode (No compression, ultra-fast)</span>
          </label>
        </div>
      </div>

      {/* Action Controls & Progress */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleBuildZip}
            disabled={allFiles.length === 0 || isProcessing}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 hover:opacity-95 text-white font-bold text-sm shadow-lg shadow-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            <FolderArchive className="w-4 h-4" />
            <span>Rename & Build ZIP</span>
          </button>

          {generatedBlob && (
            <button
              onClick={handleDownloadZip}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.98] animate-in fade-in"
            >
              <Download className="w-4 h-4" />
              <span>Download ZIP ({formatBytes(generatedBlob.size)})</span>
            </button>
          )}

          <button
            onClick={handleExportCsv}
            disabled={processedFiles.length === 0}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export Name Map (CSV)</span>
          </button>

          {subtitleFilesCount > 0 && onNavigateToConvert && (
            <button
              onClick={onNavigateToConvert}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-200 font-semibold text-xs transition-all"
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span>Convert These {subtitleFilesCount} Subtitles</span>
            </button>
          )}
        </div>

        {/* Progress Bar */}
        {(isProcessing || progressPercent > 0) && (
          <div className="space-y-1.5 pt-1">
            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {statusText && (
              <p
                className={`text-xs font-medium ${
                  statusType === 'error'
                    ? 'text-rose-400'
                    : statusType === 'success'
                    ? 'text-emerald-400'
                    : 'text-cyan-300'
                }`}
              >
                {statusText}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Live Preview Table */}
      {processedFiles.length > 0 && (
        <div className="bg-slate-900/70 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl shadow-xl">
          <div className="px-6 py-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-white text-sm">
                Files Preview ({displayRows.length} / {allFiles.length})
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
                {formatBytes(processedFiles.reduce((acc, curr) => acc + curr.size, 0))} total
              </span>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search file names..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-white/15 focus:border-cyan-400 text-xs text-white placeholder-slate-500 outline-none font-mono"
              />
            </div>
          </div>

          <div className="max-h-[30rem] overflow-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950/80 sticky top-0 backdrop-blur z-10 border-b border-white/10 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                <tr>
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Original Filename</th>
                  <th className="px-4 py-3 w-24">Size</th>
                  <th className="px-4 py-3 text-cyan-300">New Renamed Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {displayRows.map((entry, idx) => (
                  <tr
                    key={entry.path + idx}
                    className="hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-4 py-2.5 text-slate-500">{idx + 1}</td>
                    <td
                      className="px-4 py-2.5 text-slate-300 truncate max-w-xs font-sans text-xs"
                      title={entry.path}
                    >
                      {entry.path}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap text-[11px]">
                      {formatBytes(entry.size)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-cyan-300 font-semibold truncate max-w-xs"
                      title={entry.newPath}
                    >
                      {entry.newPath}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
