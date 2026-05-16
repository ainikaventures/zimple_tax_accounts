/* src/components/FileDropzone.tsx — drag/drop + click-to-browse CSV uploader.
 *
 * Reads files in the browser via the native File API and yields `{ name,
 * content }` pairs back to the parent. No content ever leaves the page; the
 * parent typically feeds the text into `parseCSV()` from
 * src/lib/statementParser.ts.
 *
 * Keyboard accessible: the drop target is a button (Enter / Space activate
 * the hidden file picker), with visible focus ring. Drag-over state pulls
 * the burgundy accent so it's obvious you can let go. */

"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useRef,
  useState,
} from "react";

export interface UploadedFile {
  name: string;
  content: string;
}

interface FileDropzoneProps {
  /** Invoked once per drop / select with every file in the batch. */
  onFiles: (files: UploadedFile[]) => void;
  /** Disable the zone (e.g. while parsing). */
  disabled?: boolean;
}

export function FileDropzone({ onFiles, disabled }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const ingest = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setLastError(null);
      setBusy(true);
      try {
        const list = Array.from(files);
        const csvs = list.filter(
          (f) => f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv",
        );
        const skipped = list.length - csvs.length;
        if (skipped > 0) {
          setLastError(
            `Skipped ${skipped} non-CSV file${skipped === 1 ? "" : "s"} — only .csv files are supported.`,
          );
        }
        if (csvs.length === 0) return;
        const parsed = await Promise.all(
          csvs.map(async (file) => ({
            name: file.name,
            content: await file.text(),
          })),
        );
        onFiles(parsed);
      } catch (err) {
        setLastError(
          err instanceof Error
            ? `Could not read file: ${err.message}`
            : "Could not read one or more files.",
        );
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onFiles],
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    void ingest(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    void ingest(e.target.files);
  };

  const handleClick = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Drop CSV files here, or press Enter to browse"
        onClick={handleClick}
        onKeyDown={handleKey}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          "block w-full rounded border-2 border-dashed text-center transition-colors",
          "px-6 py-12 sm:py-16",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
          isDragOver
            ? "border-accent bg-accent/5"
            : "border-rule hover:border-accent/60",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        ].join(" ")}
      >
        <p className="font-serif text-xl text-ink">
          {busy
            ? "Reading…"
            : isDragOver
              ? "Drop to upload"
              : "Drop CSV statements here"}
        </p>
        <p className="mt-2 text-sm text-muted">
          {busy ? "Parsing in your browser." : "or click to choose files"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={handleChange}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />
      </div>
      {lastError && (
        <p className="mt-3 text-sm text-accent" role="alert">
          {lastError}
        </p>
      )}
    </div>
  );
}
