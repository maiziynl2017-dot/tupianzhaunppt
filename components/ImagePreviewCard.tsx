import React, { useState, useEffect } from 'react';
import { ProcessedImage } from '../types';
import { Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';

interface ImagePreviewCardProps {
  item: ProcessedImage;
}

export const ImagePreviewCard: React.FC<ImagePreviewCardProps> = ({ item }) => {
  const [showOverlay, setShowOverlay] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Simple bounding box visualization
  const Overlay = () => {
    if (!item.elements || !showOverlay || !imageLoaded) return null;

    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
        {item.elements.map((el, idx) => {
          const [ymin, xmin, ymax, xmax] = el.box_2d;
          return (
            <div
              key={idx}
              className="absolute border border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors flex items-center justify-center group"
              style={{
                top: `${ymin / 10}%`,
                left: `${xmin / 10}%`,
                height: `${(ymax - ymin) / 10}%`,
                width: `${(xmax - xmin) / 10}%`,
              }}
              title={el.text}
            >
             <span className="hidden group-hover:block absolute -top-6 left-0 bg-black text-white text-[10px] px-1 py-0.5 rounded truncate max-w-full">
               {el.text}
             </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="relative aspect-video bg-slate-100 w-full group">
        <img
          src={item.previewUrl}
          alt="Preview"
          className={clsx("w-full h-full object-contain transition-opacity duration-300", imageLoaded ? 'opacity-100' : 'opacity-0')}
          onLoad={() => setImageLoaded(true)}
        />
        
        <Overlay />

        {/* Status Overlay */}
        <div className="absolute top-2 right-2">
          {item.status === 'processing' && (
            <div className="bg-white/90 backdrop-blur text-indigo-600 px-2 py-1 rounded-full text-xs font-medium flex items-center shadow-sm">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Scanning
            </div>
          )}
          {item.status === 'completed' && (
             <button 
             onClick={() => setShowOverlay(!showOverlay)}
             className="bg-white/90 hover:bg-white text-slate-600 px-2 py-1 rounded-full text-xs font-medium flex items-center shadow-sm border border-slate-100 cursor-pointer"
           >
             {showOverlay ? <Eye className="w-3 h-3 mr-1"/> : <EyeOff className="w-3 h-3 mr-1"/>}
             {showOverlay ? 'Hide Text' : 'Show Text'}
           </button>
          )}
          {item.status === 'error' && (
            <div className="bg-red-50 text-red-600 px-2 py-1 rounded-full text-xs font-medium flex items-center shadow-sm border border-red-100">
              <AlertCircle className="w-3 h-3 mr-1" />
              Failed
            </div>
          )}
        </div>
      </div>
      
      <div className="p-3 border-t border-slate-100 flex items-center justify-between">
         <span className="text-xs text-slate-500 truncate max-w-[70%]">
           {item.file.name}
         </span>
         {item.status === 'completed' && (
           <span className="text-xs text-green-600 flex items-center font-medium">
             <CheckCircle2 className="w-3 h-3 mr-1" />
             {item.elements?.length} blocks
           </span>
         )}
      </div>
    </div>
  );
};