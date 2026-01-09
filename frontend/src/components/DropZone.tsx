import { useCallback, useState } from 'react';

interface DropZoneProps {
  onFilesSelect: (files: File[]) => void;
  multiple?: boolean;
}

export function DropZone({ onFilesSelect, multiple = true }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.endsWith('.eml')
      );
      if (droppedFiles.length > 0) {
        onFilesSelect(multiple ? droppedFiles : [droppedFiles[0]]);
      }
    },
    [onFilesSelect, multiple]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const emlFiles = Array.from(files).filter((f) => f.name.endsWith('.eml'));
        if (emlFiles.length > 0) {
          onFilesSelect(multiple ? emlFiles : [emlFiles[0]]);
        }
      }
    },
    [onFilesSelect, multiple]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        flex flex-col items-center justify-center
        w-full h-64 border-2 border-dashed rounded-xl
        cursor-pointer transition-all duration-200
        ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
        }
      `}
    >
      <input
        type="file"
        accept=".eml"
        multiple={multiple}
        onChange={handleFileInput}
        className="hidden"
        id="eml-file-input"
      />
      <label
        htmlFor="eml-file-input"
        className="flex flex-col items-center cursor-pointer"
      >
        <svg
          className="w-12 h-12 mb-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="mb-2 text-sm text-gray-400">
          <span className="font-semibold">クリックしてファイルを選択</span>
        </p>
        <p className="text-xs text-gray-500">
          またはEMLファイルをドラッグ&ドロップ{multiple && '（複数可）'}
        </p>
      </label>
    </div>
  );
}
