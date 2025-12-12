export interface NoteStat {
  note: string;
  duration: number; // in milliseconds
  normalizedDuration: number; // 0 to 1
}

export interface DetectedNote {
  note: string;
  timestamp: number;
  duration: number;
}

export interface Thaat {
  id: string;
  name: string;
  notes: string[];
}

export interface Raga {
  num: number;
  id: string;
  name: string;
  thaat: string;
  aaroh: string[];
  avaroh: string[];
  pakad: string[] | string[][];
  phrases?: string[][];
  vaadi: string;
  samvaadi: string;
  identifyingFeature?: string;
}

export interface AudioProcessResult {
  pitchData: { time: number; frequency: number; note: string }[];
  noteStream: DetectedNote[];
  noteStats: NoteStat[];
}

export interface RagaScore {
  raga: Raga;
  score: number;
  matchDetails: {
    vaadiMatch: boolean;
    samvaadiMatch: boolean;
    phraseMatches: number;
    noteOverlapScore: number;
  };
}

export interface SeparatedStream {
  id: string;
  name: string;
  type: string; // 'vocal' | 'percussion' | 'melodic' | 'drone' | 'noise' etc
  selected: boolean;
  confidence: number;
  description: string;
  filterConfig?: {
    type: BiquadFilterType;
    freq: number;
    Q?: number;
    gain?: number;
  }[];
}

export enum AppStep {
  SELECT_BASE_NOTE,
  INPUT_METHOD,
  RECORDING,
  SEPARATION,
  PROCESSING,
  RESULTS
}

export const SWARA_MAPPING = [
  "Sa", "re", "Re", "ga", "Ga", "ma", "Ma", "Pa", "dha", "Dha", "ni", "Ni"
];

// Frequencies for Octave 4 (Middle C area) as reference
// C4 = 261.63
export const BASE_NOTES = [
  { name: "C", freq: 261.63 },
  { name: "C#", freq: 277.18 },
  { name: "D", freq: 293.66 },
  { name: "D#", freq: 311.13 },
  { name: "E", freq: 329.63 },
  { name: "F", freq: 349.23 },
  { name: "F#", freq: 369.99 },
  { name: "G", freq: 392.00 },
  { name: "G#", freq: 415.30 },
  { name: "A", freq: 440.00 },
  { name: "A#", freq: 466.16 },
  { name: "B", freq: 493.88 },
];
