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

/**
 * Cleans hex string and implements "Color Snapping"
 * Forces near-white colors to #FFFFFF and near-black to #000000
 * to fix common AI estimation errors due to lighting/compression.
 */
const cleanHex = (hex?: string): string => {
  if (!hex) return "000000";
  
  let clean = hex.replace('#', '').trim();
  
  // Handle shorthand (e.g. "FFF" -> "FFFFFF")
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  
  // Parse RGB
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);

  // If invalid hex, return black
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "000000";

  // SNAP TO WHITE
  // If all channels are very bright (>240), assume it's white
  if (r > 240 && g > 240 && b > 240) return "FFFFFF";

  // SNAP TO BLACK
  // If all channels are very dark (<15), assume it's black
  if (r < 15 && g < 15 && b < 15) return "000000";

  return clean;
};

/**
 * Calculates a more accurate font size based on bounding box height and physics.
 * Returns font size in Points.
 */
const calculateFontSize = (el: DetectedTextElement, boxHeightInInches: number): number => {
  // Convert box height to Points (1 inch = 72 points)
  const boxHeightPoints = boxHeightInInches * 72;
  
  // Estimate number of lines based on newlines
  const lines = el.text.split('\n').length;
  
  // Calculate available height per line
  // We divide by lines + buffer
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
  
  // Use "physics" scale: (fontSize / 1000) * slideHeight * 72 
  // If Gemini returns a specific relative fontSize (0-1000), use that as a strong hint if available
  if (el.fontSize && el.fontSize > 0) {
      // 1000 units = Slide Height
      // We need to pass slide height into this function properly, but assuming standard layout context:
      // This is an alternative heuristic if the box-fit method fails, 
      // but the box-fit method (above) is generally more reliable for "fitting" text into the box.
      // We will stick to the box-fit method as primary but clamp it if it deviates wildly.
  }

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
        // Reduced padding as requested: 5% instead of 15%
        const padX = Math.max(0.05, w * 0.05); 
        const padY = Math.max(0.02, h * 0.05);
        
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
      } else {
        // RAW TEXT
        // Minimal inflation to prevent clipping
        w = w * 1.05;
        h = h * 1.05;
      }

      const textColor = cleanHex(el.textColor);
      
      // Calculate font size relative to the FINAL box height (h)
      const computedFontSize = calculateFontSize(el, h);

      // Explicitly calculate font size from 0-1000 scale if provided by AI as a sanity check
      // const directFontSize = el.fontSize ? (el.fontSize / 1000) * SLIDE_HEIGHT_IN * 72 : 0;

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
        margin: el.hasContainer ? 2 : 0, // Reduced margin from 5 to 2
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
      
      // Text Shadow (Drop Shadow)
      if (el.textShadowHex) {
          // pptxgenjs doesn't support text-specific shadow easily within addText same as shape shadow
          // But we can approximate roughly or rely on the container shadow. 
          // For now, we omit text-specific shadow to prevent conflict with container shadow.
      }

      slide.addText(el.text, textOptions);
    });
  }

  await pptx.writeFile({ fileName: `Converted-Presentation-${Date.now()}.pptx` });
};