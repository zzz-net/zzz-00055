import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, FileText, X } from 'lucide-react';

interface FileUploadProps {
  accept: string;
  label: string;
  onFileSelect: (file: File) => void;
  loading?: boolean;
}

export function FileUpload({ accept, label, onFileSelect, loading }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setSelectedFile(files[0]);
      onFileSelect(files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      onFileSelect(files[0]);
    }
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragging
          ? 'border-primary-500 bg-primary-500/10'
          : 'border-slate-600 hover:border-slate-500'
      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !loading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
        disabled={loading}
      />

      {selectedFile ? (
        <div className="flex items-center justify-center gap-3">
          <FileText className="text-primary-400" size={32} />
          <div className="text-left">
            <p className="font-medium text-slate-200">{selectedFile.name}</p>
            <p className="text-sm text-slate-400">
              {(selectedFile.size / 1024).toFixed(2)} KB
            </p>
          </div>
          {!loading && (
            <button
              onClick={clearFile}
              className="p-1 hover:bg-slate-700 rounded"
            >
              <X size={18} className="text-slate-400" />
            </button>
          )}
        </div>
      ) : (
        <div>
          <Upload className="mx-auto mb-4 text-slate-400" size={48} />
          <p className="text-slate-200 font-medium">{label}</p>
          <p className="text-sm text-slate-400 mt-1">点击或拖拽文件到此处</p>
          <p className="text-xs text-slate-500 mt-2">支持 {accept.toUpperCase()} 格式</p>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center rounded-lg">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
}
