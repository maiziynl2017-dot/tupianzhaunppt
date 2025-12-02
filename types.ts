export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface DetectedTextElement {
  text: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000 scale
  textColor: string; // Hex
  hasContainer: boolean; // True if text is inside a distinct shape (box, circle, sticker)
  containerColor?: string; // Hex color of that shape, if hasContainer is true
  containerOpacity?: number; // 0.0 to 1.0 estimate
  strokeColor?: string; // Hex color if text has an outline
  fontSize: number; // Relative point size estimate
  fontFamily: 'serif' | 'sans-serif' | 'monospace' | 'handwriting'; // Estimated font style
  fontWeight: 'bold' | 'normal'; // New: Font weight
  fontStyle: 'italic' | 'normal'; // New: Font style
  isTitle: boolean;
  alignment: 'left' | 'center' | 'right';
}

export interface ProcessedImage {
  id: string;
  file: File;
  previewUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  width: number;
  height: number;
  elements?: DetectedTextElement[];
  cleanBackgroundBase64?: string; // The image with text removed
  error?: string;
}

export enum ProcessingStep {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  GENERATING = 'GENERATING',
  DONE = 'DONE',
}