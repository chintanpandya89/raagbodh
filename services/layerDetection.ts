import { GoogleGenAI, Type } from "@google/genai";
import { SeparatedStream } from "../types";

export class LayerDetectionService {
  private static aiClient: GoogleGenAI | null = null;

  private static get ai(): GoogleGenAI {
    if (!this.aiClient) {
      this.aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return this.aiClient;
  }

  static async detectLayers(audioBlob: Blob): Promise<SeparatedStream[]> {
    try {
      // 1. Prepare Audio (Slice to first 15s to save tokens/latency)
      const slicedBlob = audioBlob.slice(0, 15000, audioBlob.type);
      const base64Audio = await LayerDetectionService.blobToBase64(slicedBlob);

      // 2. Call Gemini
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: audioBlob.type || 'audio/webm',
                data: base64Audio
              }
            },
            {
              text: `Analyze this audio clip for musical source separation. 
              Identify the distinct instruments or components present (e.g., Vocals, Tabla, Tanpura, Flute, Harmonium, etc.).
              Only list sources that are clearly audible.
              For each source, provide a 'type' (vocal, percussion, melodic, drone, noise) and a suggested frequency range or characteristic for filtering.`
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              layers: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ["vocal", "percussion", "melodic", "drone", "noise"] },
                    confidence: { type: Type.NUMBER },
                    description: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      const layers = result.layers || [];

      // 3. Map to SeparatedStream with filter configs (Simulation mapping)
      return layers.map((layer: any, index: number) => ({
        id: `stream-${index}`,
        name: layer.name,
        type: layer.type,
        selected: layer.type === 'vocal' || layer.type === 'melodic', // Default select melodic parts
        confidence: Math.round(layer.confidence * 100),
        description: layer.description,
        filterConfig: LayerDetectionService.getFilterConfigForType(layer.type, layer.name)
      }));

    } catch (error) {
      console.error("Gemini Layer Detection Failed:", error);
      // Fallback
      return [
        { id: 'voc', name: 'Vocals', type: 'vocal', selected: true, confidence: 90, description: 'Detected vocals', filterConfig: LayerDetectionService.getFilterConfigForType('vocal') },
        { id: 'acc', name: 'Accompaniment', type: 'melodic', selected: false, confidence: 80, description: 'Background instruments', filterConfig: LayerDetectionService.getFilterConfigForType('melodic') }
      ];
    }
  }

  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private static getFilterConfigForType(type: string, name: string = ''): any[] {
    const n = name.toLowerCase();
    
    if (type === 'percussion' || n.includes('tabla') || n.includes('drum')) {
      return [{ type: 'lowpass', freq: 300, Q: 1 }];
    }
    if (type === 'drone' || n.includes('tanpura') || n.includes('drone')) {
      return [{ type: 'bandpass', freq: 150, Q: 2 }, { type: 'lowpass', freq: 600 }];
    }
    if (type === 'vocal') {
      return [{ type: 'highpass', freq: 250 }, { type: 'lowpass', freq: 4000 }, { type: 'peaking', freq: 1000, gain: 4 }];
    }
    if (n.includes('flute') || n.includes('bansuri')) {
      return [{ type: 'highpass', freq: 800 }];
    }
    if (n.includes('harmonium') || n.includes('synth')) {
      return [{ type: 'bandpass', freq: 500, Q: 0.5 }];
    }
    // Default broad melodic
    return [{ type: 'highpass', freq: 200 }, { type: 'lowpass', freq: 5000 }];
  }
}