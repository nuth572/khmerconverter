/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';

export interface ExtractedSubtitleFile {
  name: string;
  content: string;
  size: number;
}

const SUBTITLE_EXTENSIONS = new Set([
  'srt',
  'vtt',
  'ass',
  'ssa',
  'sbv',
  'lrc',
  'ttml',
  'dfxp',
  'xml',
  'smi',
  'sami',
  'csv',
  'tsv',
  'json',
  'txt',
]);

/**
 * Decode array buffer with auto-detection for UTF-8, UTF-16LE/BE, and Windows-1252
 */
export function decodeSubtitleBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2) {
    // UTF-16 LE BOM
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(buf);
    }
    // UTF-16 BE BOM
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(buf);
    }
  }

  // Attempt UTF-8
  const utf8Text = new TextDecoder('utf-8').decode(buf);
  // If no replacement characters, it's valid UTF-8
  if (!utf8Text.includes('\uFFFD')) {
    return utf8Text.replace(/^\uFEFF/, '');
  }

  // Fallback to Windows-1252
  try {
    return new TextDecoder('windows-1252').decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return utf8Text.replace(/^\uFEFF/, '');
  }
}

/**
 * Check if a file is a ZIP archive by extension or MIME type
 */
export function isZipFile(file: File | { name: string; type?: string }): boolean {
  const name = file.name.toLowerCase();
  const type = file.type || '';
  return (
    name.endsWith('.zip') ||
    type === 'application/zip' ||
    type === 'application/x-zip-compressed' ||
    type === 'multipart/x-zip'
  );
}

/**
 * Check if a filename is a supported subtitle file
 */
export function isSubtitleFilename(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  return !!ext && SUBTITLE_EXTENSIONS.has(ext);
}

/**
 * Unpack a ZIP file and return all valid subtitle files found inside
 */
export async function unpackZipSubtitles(zipFileOrBuffer: File | Blob | ArrayBuffer): Promise<ExtractedSubtitleFile[]> {
  const zip = new JSZip();
  const loaded = await zip.loadAsync(zipFileOrBuffer);
  const results: ExtractedSubtitleFile[] = [];

  const entries = Object.keys(loaded.files);

  for (const relativePath of entries) {
    const entry = loaded.files[relativePath];

    // Skip directories and MacOS system files
    if (entry.dir || relativePath.includes('__MACOSX') || relativePath.startsWith('.') || relativePath.includes('/.')) {
      continue;
    }

    // Clean filename (strip folders if needed, or keep clean path)
    const fileName = relativePath.split('/').pop() || relativePath;

    if (!isSubtitleFilename(fileName)) {
      continue;
    }

    try {
      const buffer = await entry.async('arraybuffer');
      const text = decodeSubtitleBuffer(buffer);

      if (text.trim().length > 0) {
        results.push({
          name: fileName,
          content: text,
          size: buffer.byteLength,
        });
      }
    } catch (err) {
      console.warn(`Failed to read ${relativePath} from zip`, err);
    }
  }

  // Sort alphabetically by file name
  results.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return results;
}
