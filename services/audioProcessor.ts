import { DetectedNote, NoteStat, SWARA_MAPPING, BASE_NOTES } from '../types';

export class AudioProcessor {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private buffer: Float32Array;
  private sampleRate: number;
  private recording: boolean = false;
  private recordedChunks: Blob[] = [];
  
  // Settings
  private fftSize = 2048;
  private smoothingTimeConstant = 0.8;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.sampleRate = this.audioContext.sampleRate;
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
    this.buffer = new Float32Array(this.fftSize);
  }

  async startRecording(stream: MediaStream) {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.microphone = this.audioContext.createMediaStreamSource(stream);
    this.microphone.connect(this.analyser);
    this.recording = true;
    this.recordedChunks = [];
  }

  stopRecording() {
    this.recording = false;
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }
  }

  // Get current pitch from analyser
  getPitch(): number {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return AudioProcessor.computePitch(this.buffer, this.sampleRate);
  }

  // Pure function to compute pitch from a buffer
  static computePitch(buffer: Float32Array, sampleRate: number): number {
    // RMS to detect silence
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.01) return -1; // Too quiet

    // Autocorrelation
    let r1 = 0, r2 = buffer.length - 1, thres = 0.2;
    for (let i = 0; i < buffer.length / 2; i++) {
      if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < buffer.length / 2; i++) {
      if (Math.abs(buffer[buffer.length - i]) < thres) { r2 = buffer.length - i; break; }
    }

    const buf2 = buffer.slice(r1, r2);
    const c = new Array(buf2.length).fill(0);
    for (let i = 0; i < buf2.length; i++) {
      for (let j = 0; j < buf2.length - i; j++) {
        c[i] = c[i] + buf2[j] * buf2[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < buf2.length; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  }

  // Convert Pitch to Indian Note based on Sa frequency
  static pitchToNote(pitch: number, baseFreq: number): string {
    if (pitch === -1) return "-";
    
    // Calculate semitones from base frequency
    // Formula: 12 * log2(pitch / baseFreq)
    const semitonesFromBase = 12 * Math.log2(pitch / baseFreq);
    
    // Round to nearest integer
    const roundedSemitones = Math.round(semitonesFromBase);
    
    // Normalize to 0-11
    // Handle negative values correctly by adding multiples of 12
    const normalizedIndex = ((roundedSemitones % 12) + 12) % 12;
    
    return SWARA_MAPPING[normalizedIndex];
  }

  // Analyze a full audio buffer (for file uploads)
  static async analyzeAudioBuffer(audioBuffer: AudioBuffer, baseFreq: number): Promise<{ time: number; frequency: number; note: string }[]> {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const bufferSize = 2048;
    const hopSize = 1024; // 50% overlap for decent resolution
    const results = [];
    
    // Limit to first 45 seconds to prevent browser freeze on large files
    const maxSamples = Math.min(channelData.length, sampleRate * 45);

    for (let i = 0; i < maxSamples; i += hopSize) {
      if (i + bufferSize > channelData.length) break;
      const chunk = channelData.slice(i, i + bufferSize);
      const pitch = AudioProcessor.computePitch(chunk, sampleRate);
      const note = AudioProcessor.pitchToNote(pitch, baseFreq);
      
      results.push({
        time: (i / sampleRate) * 1000,
        frequency: pitch,
        note: note
      });
    }
    return results;
  }

  /**
   * Identifies the Base Note (Sa) from raw frequency data.
   * Logic: Calculates a histogram of Chroma (0-11 pitch classes).
   * The most frequent pitch class is assumed to be Sa (or a strong drone).
   * Returns matching object from BASE_NOTES.
   */
  static detectRootNoteFromPitchData(pitchData: { frequency: number }[]): { name: string, freq: number } {
     const bins = new Array(12).fill(0);
     const refA4 = 440;
     
     let validSamples = 0;

     pitchData.forEach(p => {
         if (p.frequency > 50 && p.frequency < 1000) { // Reasonable vocal/tanpura range
             // Get semitones from A4
             const n = 12 * Math.log2(p.frequency / refA4);
             const nRounded = Math.round(n);
             // Wrap to 0-11 range (A, A#, B, C, C#, ...)
             // A4 is index 0 in this calculation relative to 440, but we want absolute chroma
             // Midi Note 69 is A4. 69 % 12 = 9. So A is 9? 
             // Let's stick to simple relation to C4 (261.63).
             
             const semitonesFromC = 12 * Math.log2(p.frequency / 261.63);
             const chroma = ((Math.round(semitonesFromC) % 12) + 12) % 12;
             
             bins[chroma]++;
             validSamples++;
         }
     });

     if (validSamples === 0) return BASE_NOTES[0]; // Default C if no data

     // Find max bin
     let maxBin = 0;
     let maxVal = 0;
     for(let i=0; i<12; i++) {
         if(bins[i] > maxVal) {
             maxVal = bins[i];
             maxBin = i;
         }
     }

     // Map bin index back to Note Name using BASE_NOTES order (which starts at C)
     // BASE_NOTES is ordered C, C#, D... which aligns with our logic above where 0 was C.
     return BASE_NOTES[maxBin];
  }

  static processAudioData(
    pitchData: { time: number; frequency: number; note: string }[]
  ): { noteStream: DetectedNote[]; noteStats: NoteStat[] } {
    
    // 1. Condense stream (S S S -> S) with duration
    const condensed: DetectedNote[] = [];
    if (pitchData.length === 0) return { noteStream: [], noteStats: [] };

    let currentNote = pitchData[0].note;
    let startTime = pitchData[0].time;

    for (let i = 1; i < pitchData.length; i++) {
      if (pitchData[i].note === currentNote) {
        // continue same note
      } else {
        // End of previous note
        if (currentNote !== "-") {
          condensed.push({
            note: currentNote,
            timestamp: startTime,
            duration: pitchData[i].time - startTime
          });
        }
        // Start new note
        currentNote = pitchData[i].note;
        startTime = pitchData[i].time;
      }
    }
    // Push last note
    if (currentNote !== "-" && pitchData.length > 0) {
      const lastTime = pitchData[pitchData.length - 1].time;
      condensed.push({
        note: currentNote,
        timestamp: startTime,
        duration: Math.max(50, lastTime - startTime) // Ensure minimal duration
      });
    }

    // 2. Calculate Stats
    const statsMap: Record<string, number> = {};
    SWARA_MAPPING.forEach(n => statsMap[n] = 0);

    let totalDuration = 0;
    condensed.forEach(n => {
      // Filter out very short transient notes (< 40ms) as noise
      if (n.duration > 40) {
        statsMap[n.note] += n.duration;
        totalDuration += n.duration;
      }
    });

    const noteStats: NoteStat[] = Object.keys(statsMap).map(note => ({
      note,
      duration: statsMap[note],
      normalizedDuration: totalDuration > 0 ? statsMap[note] / totalDuration : 0
    }));

    return {
      noteStream: condensed.filter(n => n.duration > 40), // return filtered stream
      noteStats
    };
  }
}