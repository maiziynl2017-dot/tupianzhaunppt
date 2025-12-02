import PptxGenJS from "pptxgenjs";
import { ProcessedImage, DetectedTextElement } from "../types";

// Helper to convert File to Base64 Data URL (includes mime type header)
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const getFontMap = (family?: string): string => {
  switch (family) {
    case 'serif': return "Times New Roman";
    case 'monospace': return "Courier New";
    case 'handwriting': return "Segoe Print"; 
    case 'sans-serif': 
    default: return "Arial";
  }
};

const cleanHex = (hex?: string): string => {
  if (!hex) return "000000";
  return hex.replace('#', '').trim();
};

/**
 * Calculates a more accurate font size.
 */
const calculateFontSize = (el: DetectedTextElement, boxHeightInInches: number): number => {
  // Convert box height to Points (1 inch = 72 points)
  const boxHeightPoints = boxHeightInInches * 72;
  
  // Estimate number of lines based on newlines
  const lines = el.text.split('\n').length;
  
  // Calculate available height per line
  const heightPerLine = boxHeightPoints / lines;
  
  // Logic varies if it's a container (lots of whitespace usually) vs raw text (tight fit)
  const fillRatio = el.hasContainer ? 0.70 : 0.85;

  // Base calculation
  let size = heightPerLine * fillRatio;

  // Bold text usually takes up more horizontal space, so we reduce the height-based size slightly to prevent wrapping
  if (el.fontWeight === 'bold') {
    size = size * 0.95;
  }

  // Min/Max caps
  size = Math.max(9, size); // Minimum readable size
  
  return size;
};

export const generatePPT = async (processedImages: ProcessedImage[]) => {
  const pptx = new PptxGenJS();
  
  const validImages = processedImages.filter(i => i.status === 'completed' && i.width && i.height);
  if (validImages.length === 0) return;

  // 1. DYNAMIC LAYOUT STRATEGY
  const firstImg = validImages[0];
  const layoutName = "CUSTOM_LAYOUT";
  
  const SLIDE_WIDTH_IN = 10;
  const aspectRatio = firstImg.width / firstImg.height;
  const SLIDE_HEIGHT_IN = SLIDE_WIDTH_IN / aspectRatio;

  pptx.defineLayout({ name: layoutName, width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pptx.layout = layoutName;

  for (const imgData of validImages) {
    if (!imgData.elements) continue;

    const slide = pptx.addSlide();

    try {
      let base64Background = "";
      if (imgData.cleanBackgroundBase64) {
        base64Background = imgData.cleanBackgroundBase64;
      } else {
        base64Background = await fileToBase64(imgData.file);
      }
      
      // 2. BACKGROUND STRETCHING
      slide.addImage({ 
        data: base64Background, 
        x: 0, 
        y: 0, 
        w: '100%', 
        h: '100%',
        sizing: { type: 'contain', w: SLIDE_WIDTH_IN, h: SLIDE_HEIGHT_IN }
      });

    } catch (e) {
      console.error("Failed to load background image", e);
    }

    // 3. OVERLAY TEXT BOXES
    imgData.elements.forEach((el) => {
      const [ymin, xmin, ymax, xmax] = el.box_2d;
      
      let x = (xmin / 1000) * SLIDE_WIDTH_IN;
      let y = (ymin / 1000) * SLIDE_HEIGHT_IN;
      let w = ((xmax - xmin) / 1000) * SLIDE_WIDTH_IN;
      let h = ((ymax - ymin) / 1000) * SLIDE_HEIGHT_IN;

      // 4. CONDITIONAL INFLATION & STYLING
      
      let fillProps: any = undefined; // Default transparency
      let lineProps: any = undefined; // Default no border
      let shadowProps: any = undefined;
      
      if (el.hasContainer) {
        // INFLATE CONTAINER
        // Add padding to make it look like a real box
        const padX = Math.max(0.1, w * 0.15); 
        const padY = Math.max(0.05, h * 0.15);
        x = x - padX;
        y = y - padY;
        w = w + (padX * 2);
        h = h + (padY * 2);

        // Apply detected background color
        // If containerOpacity is undefined, assume solid (100 -> 0% transparency)
        // pptxgenjs transparency is 0-100 where 0 is opaque.
        const opacity = el.containerOpacity !== undefined ? (1 - el.containerOpacity) * 100 : 0;
        
        fillProps = { 
            color: cleanHex(el.containerColor) || "FFFFFF",
            transparency: opacity
        };
        
        // Add a nice soft shadow for containers to separate from background
        shadowProps = { type: 'outer', color: '000000', opacity: 0.3, blur: 3, offset: 2 };

        // Rounded corners for better aesthetics
        // Note: pptxgenjs uses rectRadius in 0-1 range approx or percentage. 
        // We'll apply it via shape option if using addShape, but here we are using addText.
        // For addText, shape: 'roundRect' works.
      } else {
        // RAW TEXT
        // Minimal inflation to prevent clipping
        w = w * 1.05;
        h = h * 1.05;
      }

      const textColor = cleanHex(el.textColor);
      const computedFontSize = calculateFontSize(el, h);

      const textOptions: any = {
        x: x,
        y: y,
        w: w,
        h: h,
        fontSize: computedFontSize,
        color: textColor,
        align: el.alignment,
        fontFace: getFontMap(el.fontFamily), 
        valign: "middle",
        margin: el.hasContainer ? 5 : 0, 
        wrap: true,
        // Style Mapping
        bold: el.fontWeight === 'bold',
        italic: el.fontStyle === 'italic',
      };

      // Apply Shape/Container Styles
      if (el.hasContainer) {
        textOptions.shape = 'roundRect';
        textOptions.rectRadius = 0.1; // mild roundness
        textOptions.fill = fillProps;
        textOptions.line = { color: "888888", width: 0.5, transparency: 50 }; // Subtle border
        textOptions.shadow = shadowProps;
      }

      // Text Outline/Stroke (if detected)
      if (el.strokeColor) {
        textOptions.outline = { color: cleanHex(el.strokeColor), size: 0.75 };
      }

      slide.addText(el.text, textOptions);
    });
  }

  await pptx.writeFile({ fileName: `Converted-Presentation-${Date.now()}.pptx` });
};