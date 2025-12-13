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
              text: `Analyze this audio for source separation. 
              Classify the audio into distinct frequency-dominant layers suitable for crossovers.
              Identify if there are Vocals, Percussion, Drone, or Melodic Instruments.
              Assign a role: 'lows' (percussion/bass), 'mids' (vocals/instruments), 'highs' (harmonics/noise), or 'full' (if complex).`
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
                    role: { type: Type.STRING, enum: ["lows", "mids", "highs", "full"], description: "Spectral dominance" },
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

      // 3. Map to SeparatedStream with Crossover Filter Configs
      // We aim for spectral partitioning: Lows (<300), Mids (300-4000), Highs (>4000)
      // This ensures combining them reconstructs the audio reasonably well.
      
      const mappedLayers = layers.map((layer: any, index: number) => ({
        id: `stream-${index}`,
        name: layer.name,
        type: layer.type,
        selected: layer.type === 'vocal' || layer.type === 'melodic', 
        confidence: 90,
        description: layer.description,
        filterConfig: LayerDetectionService.getSpectralFilter(layer.role)
      }));

      // Fallback if AI didn't return good crossover coverage, add a 'Residual' layer if needed in a real app
      // For now, we trust the mapping.
      return mappedLayers;

    } catch (error) {
      console.error("Gemini Layer Detection Failed:", error);
      // Fallback
      return [
        { id: 'voc', name: 'Vocals/Melody (Mids)', type: 'vocal', selected: true, confidence: 90, description: 'Primary Mid-range frequencies', filterConfig: LayerDetectionService.getSpectralFilter('mids') },
        { id: 'bass', name: 'Bass/Percussion (Lows)', type: 'percussion', selected: false, confidence: 80, description: 'Low frequency content', filterConfig: LayerDetectionService.getSpectralFilter('lows') },
        { id: 'atm', name: 'Ambience (Highs)', type: 'noise', selected: false, confidence: 70, description: 'High frequency harmonics', filterConfig: LayerDetectionService.getSpectralFilter('highs') }
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

  // Uses Linkwitz-Riley esque logic for better summation
  private static getSpectralFilter(role: string): any[] {
    switch (role) {
      case 'lows':
        // Lowpass at 300Hz
        return [{ type: 'lowpass', freq: 300, Q: 0.71 }]; // Butterworth Q
      case 'mids':
        // Bandpass: Highpass 300, Lowpass 4000
        return [
          { type: 'highpass', freq: 300, Q: 0.71 },
          { type: 'lowpass', freq: 4000, Q: 0.71 }
        ];
      case 'highs':
        // Highpass at 4000Hz
        return [{ type: 'highpass', freq: 4000, Q: 0.71 }];
      default:
        return []; // No filter = Full Audio
    }
  }
}