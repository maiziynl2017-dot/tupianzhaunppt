import React, { useState, useCallback } from 'react';
import { Dropzone } from './components/Dropzone';
import { ImagePreviewCard } from './components/ImagePreviewCard';
import { ProcessedImage, ProcessingStep } from './types';
import { analyzeImageLayout, removeTextFromImage } from './services/geminiService';
import { generatePPT } from './services/pptService';
import { FileDown, Layers, Sparkles, Trash2, Key, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [items, setItems] = useState<ProcessedImage[]>([]);
  const [step, setStep] = useState<ProcessingStep>(ProcessingStep.IDLE);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Allow user to input key if env var is missing
  const [userApiKey, setUserApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(!process.env.API_KEY);

  const getApiKey = () => {
    return (process.env.API_KEY || userApiKey).trim();
  };

  const handleFilesSelected = useCallback((files: File[]) => {
    const newItems: ProcessedImage[] = files.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
      width: 0,
      height: 0, 
    }));

    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const handleClear = () => {
    // Revoke URLs to prevent memory leaks
    items.forEach(i => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setStep(ProcessingStep.IDLE);
    setProgress({ current: 0, total: 0 });
  };

  const processImages = async () => {
    if (items.length === 0) return;
    const apiKey = getApiKey();

    if (!apiKey) {
      alert("Please enter a valid Google Gemini API Key to proceed.");
      setShowKeyInput(true);
      return;
    }

    setStep(ProcessingStep.ANALYZING);
    setProgress({ current: 0, total: items.length });

    const updatedItems = [...items];

    // Process sequentially in batches to avoid rate limits
    const BATCH_SIZE = 3;
    
    for (let i = 0; i < updatedItems.length; i += BATCH_SIZE) {
        const batch = updatedItems.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (item, indexInBatch) => {
            const globalIndex = i + indexInBatch;
            
            // Skip if already done
            if (updatedItems[globalIndex].status === 'completed') return;

            // Set processing
            setItems(prev => {
                const copy = [...prev];
                copy[globalIndex].status = 'processing';
                return copy;
            });

            try {
                // 1. Get image dimensions first to determine aspect ratio
                const img = new Image();
                img.src = item.previewUrl;
                await new Promise((resolve) => { if(img.complete) resolve(true); else img.onload = resolve; });
                
                const ratio = img.naturalWidth / img.naturalHeight;
                
                let targetAspectRatio: "16:9" | "4:3" | "1:1" = "1:1";
                // Thresholds set to midpoints
                if (ratio >= 1.55) targetAspectRatio = "16:9";      // Covers 16:9 (1.77) and 16:10 (1.6)
                else if (ratio >= 1.15) targetAspectRatio = "4:3";  // Covers 4:3 (1.33) and 3:2 (1.5)
                else targetAspectRatio = "1:1";

                // 2. Run analysis and background cleaning in parallel
                const [elements, cleanBackgroundBase64] = await Promise.all([
                  analyzeImageLayout(item.file, apiKey),
                  // Pass the aspect ratio to ensure background isn't squashed
                  removeTextFromImage(item.file, apiKey, targetAspectRatio).catch(err => {
                    console.warn("Background cleaning failed, falling back to original", err);
                    return undefined;
                  })
                ]);
                
                setItems(prev => {
                    const copy = [...prev];
                    copy[globalIndex] = {
                        ...copy[globalIndex],
                        status: 'completed',
                        elements: elements,
                        cleanBackgroundBase64: cleanBackgroundBase64,
                        width: img.naturalWidth,
                        height: img.naturalHeight
                    };
                    return copy;
                });
            } catch (err: any) {
                console.error(err);
                setItems(prev => {
                    const copy = [...prev];
                    copy[globalIndex].status = 'error';
                    copy[globalIndex].error = err.message || "Failed";
                    return copy;
                });
            } finally {
                setProgress(prev => ({ ...prev, current: prev.current + 1 }));
            }
        });

        await Promise.all(promises);
    }

    setStep(ProcessingStep.DONE);
  };

  const handleDownload = async () => {
    setStep(ProcessingStep.GENERATING);
    try {
      await generatePPT(items);
    } catch (e) {
      alert("Failed to generate PPT");
      console.error(e);
    } finally {
      setStep(ProcessingStep.DONE);
    }
  };

  const canProcess = items.length > 0 && items.some(i => i.status === 'pending' || i.status === 'error');
  const canDownload = items.some(i => i.status === 'completed');

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight hidden sm:block">Img2PPT</h1>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight sm:hidden">Img2PPT</h1>
          </div>
          
          <div className="flex items-center space-x-3">
             {/* API Key Input Area */}
             <div className="relative group">
                {showKeyInput ? (
                  <div className="flex items-center bg-slate-100 rounded-full px-3 py-1.5 border border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                    <Key className="w-4 h-4 text-slate-400 mr-2" />
                    <input 
                      type="password" 
                      placeholder="Enter Gemini API Key" 
                      value={userApiKey}
                      onChange={(e) => setUserApiKey(e.target.value)}
                      className="bg-transparent border-none outline-none text-sm w-32 sm:w-48 text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowKeyInput(true)}
                    className="flex items-center text-slate-500 hover:text-indigo-600 transition-colors"
                    title="Change API Key"
                  >
                     <Settings className="w-5 h-5" />
                  </button>
                )}
             </div>

             <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline">
              Get Key
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        
        {/* Hero */}
        <section className="text-center space-y-4 py-4">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900">
            Convert Images to Editable Slides
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto text-lg leading-relaxed">
            Upload slide screenshots. We use <span className="text-indigo-600 font-semibold">Gemini Vision AI</span> to detect text and <span className="text-indigo-600 font-semibold">generative inpainting</span> to create clean backgrounds, separating text from image perfectly.
          </p>
        </section>

        {/* Uploader */}
        <section>
          <Dropzone 
            onFilesSelected={handleFilesSelected} 
            disabled={step === ProcessingStep.ANALYZING || step === ProcessingStep.GENERATING} 
          />
        </section>

        {/* Controls & Progress */}
        {items.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sticky top-20 z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
               <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-700">
                    {items.length} Slide{items.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-slate-500">
                    {items.filter(i => i.status === 'completed').length} processed
                  </span>
               </div>
               {step === ProcessingStep.ANALYZING && (
                 <div className="flex-1 sm:w-48 h-2 bg-slate-100 rounded-full overflow-hidden">
                   <div 
                     className="h-full bg-indigo-500 transition-all duration-300"
                     style={{ width: `${(progress.current / progress.total) * 100}%` }}
                   />
                 </div>
               )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={handleClear}
                disabled={step === ProcessingStep.ANALYZING}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center flex-1 sm:flex-none"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </button>

              {canProcess ? (
                 <button
                 onClick={processImages}
                 disabled={!getApiKey()}
                 className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-all flex items-center justify-center flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <Sparkles className="w-4 h-4 mr-2" />
                 {step === ProcessingStep.ANALYZING ? 'Analyzing & Cleaning...' : 'Process Images'}
               </button>
              ) : (
                <button
                  onClick={handleDownload}
                  disabled={!canDownload || step === ProcessingStep.GENERATING}
                  className="px-6 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg shadow-sm transition-all flex items-center justify-center flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  {step === ProcessingStep.GENERATING ? 'Generating PPT...' : 'Download PPT'}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Grid of Images */}
        {items.length > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <ImagePreviewCard key={item.id} item={item} />
            ))}
          </section>
        )}

        {items.length === 0 && (
           <div className="border border-slate-100 rounded-xl p-8 bg-white/50 text-center">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                   <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto font-bold">1</div>
                   <h3 className="font-medium text-slate-800">Upload Images</h3>
                   <p className="text-sm text-slate-500">Drop screenshots of slides, diagrams, or documents.</p>
                </div>
                <div className="space-y-2">
                   <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto font-bold">2</div>
                   <h3 className="font-medium text-slate-800">AI Separation</h3>
                   <p className="text-sm text-slate-500">Extracts text layout AND generates a clean text-free background image.</p>
                </div>
                <div className="space-y-2">
                   <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto font-bold">3</div>
                   <h3 className="font-medium text-slate-800">Editable PPT</h3>
                   <p className="text-sm text-slate-500">Download native .pptx with clean background and editable text overlays.</p>
                </div>
             </div>
           </div>
        )}
      </main>
    </div>
  );
};

export default App;