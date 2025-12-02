import React, { useCallback } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelected, disabled }) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (disabled) return;
      
      const files = Array.from(e.dataTransfer.files).filter((file: File) => 
        file.type.startsWith('image/')
      );
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected, disabled]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || !e.target.files) return;
    const files = Array.from(e.target.files).filter((file: File) => 
      file.type.startsWith('image/')
    );
    onFilesSelected(files);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={clsx(
        "relative group border-2 border-dashed rounded-xl p-8 transition-all duration-200 text-center cursor-pointer",
        disabled 
          ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60" 
          : "border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50/50 bg-white"
      )}
    >
      <input
        type="file"
        multiple
        accept="image/png, image/jpeg, image/jpg"
        onChange={handleFileInput}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
      
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className={clsx(
          "p-4 rounded-full transition-colors",
          disabled ? "bg-slate-100 text-slate-400" : "bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200"
        )}>
          {disabled ? <ImageIcon className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-800">
            {disabled ? "Processing..." : "Drop images here"}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            or click to select (PNG, JPG)
          </p>
        </div>
      </div>
    </div>
  );
};