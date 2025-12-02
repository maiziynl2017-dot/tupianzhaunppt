import { GoogleGenAI, Type, Schema } from "@google/genai";
import { DetectedTextElement } from "../types";

const SYSTEM_INSTRUCTION = `
You are an expert Presentation Layout Engine. Your goal is to analyze an image (which will be a slide in a presentation) and extract ALL text elements to reconstruct an editable PowerPoint with HIGH FIDELITY.

CRITICAL INSTRUCTIONS:

1. **VISUAL GROUPING (Strict)**: 
   - If multiple lines of text appear inside the SAME visual container (like a white box, a sticker, a speech bubble, or a button), **YOU MUST GROUP THEM** into a single object. 
   - If a Title and a Subtitle share the same background area, group them.
   - Use newlines (\\n) to separate lines.

2. **CONTAINER DETECTION & COLORS**: 
   - **hasContainer**: Is the text inside a shape/box that overlays the background image? 
   - **containerColor**: The EXACT Hex color of that box (e.g., #FFFFFF, #FFFDD0).
   - **containerOpacity**: Estimate opacity. 1.0 = solid, 0.5 = see-through, 0.0 = transparent.
   - **textColor**: The EXACT Hex color of the letters.
   - **strokeColor**: If text has a visible outline/border (common in memes/subtitles), return that Hex color.

3. **FONT STYLING (Precision)**:
   - **fontWeight**: Is the font Thick/Bold? Return 'bold'. Otherwise 'normal'.
   - **fontStyle**: Is the font Slanted/Italic? Return 'italic'. Otherwise 'normal'.
   - **fontFamily**: Match the vibe (serif, sans-serif, handwriting).

4. **BOUNDING BOXES**: 
   - The box_2d must encompass the ENTIRE container if hasContainer=true.

Return an array of these elements.
`;

const responseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING },
      box_2d: {
        type: Type.ARRAY,
        items: { type: Type.INTEGER },
        description: "ymin, xmin, ymax, xmax (0-1000 scale)",
      },
      textColor: { type: Type.STRING, description: "Hex color code of the text" },
      hasContainer: { type: Type.BOOLEAN, description: "True if text is inside a visual box/shape" },
      containerColor: { type: Type.STRING, description: "Hex color of the container if hasContainer is true", nullable: true },
      containerOpacity: { type: Type.NUMBER, description: "Opacity from 0.0 to 1.0", nullable: true },
      strokeColor: { type: Type.STRING, description: "Hex color of text outline if exists", nullable: true },
      fontSize: { type: Type.INTEGER },
      fontFamily: { type: Type.STRING, enum: ["serif", "sans-serif", "monospace", "handwriting"] },
      fontWeight: { type: Type.STRING, enum: ["bold", "normal"] },
      fontStyle: { type: Type.STRING, enum: ["italic", "normal"] },
      isTitle: { type: Type.BOOLEAN },
      alignment: { type: Type.STRING, enum: ["left", "center", "right"] },
    },
    required: ["text", "box_2d", "textColor", "hasContainer", "fontSize", "alignment", "fontWeight", "fontStyle"],
  },
};

const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const analyzeImageLayout = async (
  file: File, 
  apiKey: string
): Promise<DetectedTextElement[]> => {
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });
  const base64Data = await fileToGenerativePart(file);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: file.type, data: base64Data } },
          { text: "Analyze this slide. Group text in containers. Identify exact colors, bold/italic styles, and container opacity." }
        ],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1,
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("Empty response from Gemini");

    const data = JSON.parse(jsonText) as DetectedTextElement[];
    return data;

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};

export const removeTextFromImage = async (
  file: File,
  apiKey: string,
  aspectRatio: "16:9" | "4:3" | "1:1" = "16:9"
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });
  const base64Data = await fileToGenerativePart(file);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          { inlineData: { mimeType: file.type, data: base64Data } },
          { text: "Remove ALL text from this slide. Keep the background pattern, logos, diagrams, and illustrations exactly as they are. Do not change the art style. Just erase the letters." }
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio
        }
      }
    });

    let cleanImageBase64 = "";
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          cleanImageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!cleanImageBase64) {
      throw new Error("No image generated for background cleaning");
    }

    return `data:image/png;base64,${cleanImageBase64}`;

  } catch (error) {
    console.error("Gemini Text Removal Failed:", error);
    throw error;
  }
};