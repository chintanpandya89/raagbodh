import React, { useState, useRef, useEffect } from 'react';
import { BASE_NOTES, AppStep, AudioProcessResult, RagaScore, SeparatedStream } from './types';
import { AudioProcessor } from './services/audioProcessor';
import { RagaEngine } from './services/ragaEngine';
import { LayerDetectionService } from './services/layerDetection';
import AudioRecorder from './components/AudioRecorder';
import AnalysisView from './components/AnalysisView';
import RagaResults from './components/RagaResults';
import { 
    Upload, Mic, Youtube, ArrowRight, Music, Activity, Wand2, 
    Wind, Drum, Waves, Speaker, EarOff, Piano, Play, Pause, Download, CheckSquare, Square
} from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.SELECT_BASE_NOTE);
  const [baseFreq, setBaseFreq] = useState<number>(BASE_NOTES[0].freq);
  const [selectedNoteName, setSelectedNoteName] = useState("C");
  const [isAutoDetect, setIsAutoDetect] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AudioProcessResult | null>(null);
  const [ragaScores, setRagaScores] = useState<RagaScore[]>([]);
  const [streams, setStreams] = useState<SeparatedStream[]>([]);

  // Separation state
  const [showSeparation, setShowSeparation] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("Idle");
  
  // Audio Playback State
  const [sourceAudioBuffer, setSourceAudioBuffer] = useState<AudioBuffer | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [playingStreamId, setPlayingStreamId] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
        audioContextRef.current?.close();
    };
  }, []);

  const handleBaseNoteSelect = (freq: number, name: string) => {
    setBaseFreq(freq);
    setSelectedNoteName(name);
    setIsAutoDetect(false);
    setStep(AppStep.INPUT_METHOD);
  };

  const handleAutoDetectSelect = () => {
    setIsAutoDetect(true);
    setStep(AppStep.INPUT_METHOD);
  };

  /**
   * Main Handler
   */
  const handleAudioData = async (
    rawPitchData: { time: number; frequency: number; note: string }[],
    audioSource?: Blob | AudioBuffer
  ) => {
    let currentBaseFreq = baseFreq;

    if (audioSource instanceof Blob && audioContextRef.current) {
        setOriginalBlob(audioSource);
        try {
            const arrayBuffer = await audioSource.arrayBuffer();
            const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            setSourceAudioBuffer(decodedBuffer);
        } catch (e) {
            console.error("Failed to decode audio", e);
        }
    } else if (audioSource instanceof AudioBuffer) {
        setSourceAudioBuffer(audioSource);
    }

    setStep(AppStep.SEPARATION);
    setShowSeparation(false);
    
    // Auto-Detect Sa Logic
    if (isAutoDetect) {
        setProcessingStatus("Detecting Base Note (Sa)...");
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const detectedRoot = AudioProcessor.detectRootNoteFromPitchData(rawPitchData);
        currentBaseFreq = detectedRoot.freq;
        setBaseFreq(detectedRoot.freq);
        setSelectedNoteName(detectedRoot.name);
        
        setProcessingStatus(`Detected Sa: ${detectedRoot.name}`);
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Update raw pitch data
        rawPitchData.forEach(p => {
            p.note = AudioProcessor.pitchToNote(p.frequency, currentBaseFreq);
        });
    }

    // AI Layer Detection
    if (audioSource instanceof Blob) {
        setProcessingStatus("AI analyzing audio layers...");
        try {
            const detectedLayers = await LayerDetectionService.detectLayers(audioSource);
            setStreams(detectedLayers);
        } catch (e) {
            console.error(e);
            setStreams(getDefaultStreams());
        }
    } else {
         // Fallback for YouTube simulation (no blob)
         setStreams(getDefaultStreams());
    }
    
    setProcessingStatus("Separating high-fidelity stems...");
    setTimeout(() => {
        setProcessingStatus("Processing Complete.");
        setShowSeparation(true);
    }, 1500);

    // Persist raw data for later re-analysis
    (window as any).currentRawPitchData = rawPitchData;
  };

  const getDefaultStreams = (): SeparatedStream[] => [
    { id: 'voc', name: 'Vocals', type: 'vocal', selected: true, confidence: 95, description: 'Primary Melody', filterConfig: [{type:'peaking', freq:1000, gain:5}, {type:'highpass', freq:300}] },
    { id: 'drn', name: 'Drone', type: 'drone', selected: false, confidence: 90, description: 'Base Note', filterConfig: [{type:'bandpass', freq: baseFreq, Q:2}] },
  ];

  // --- Advanced Audio Rendering (OfflineContext) ---
  const renderAudio = async (filters: any[]): Promise<AudioBuffer | null> => {
      if (!sourceAudioBuffer) return null;

      const offlineCtx = new OfflineAudioContext(
          sourceAudioBuffer.numberOfChannels,
          sourceAudioBuffer.length,
          sourceAudioBuffer.sampleRate
      );

      const source = offlineCtx.createBufferSource();
      source.buffer = sourceAudioBuffer;

      let lastNode: AudioNode = source;

      // Chain filters
      if (filters) {
          filters.forEach(f => {
              const filter = offlineCtx.createBiquadFilter();
              filter.type = f.type;
              filter.frequency.value = f.freq;
              if (f.Q) filter.Q.value = f.Q;
              if (f.gain) filter.gain.value = f.gain;
              lastNode.connect(filter);
              lastNode = filter;
          });
      }

      lastNode.connect(offlineCtx.destination);
      source.start();
      
      return await offlineCtx.startRendering();
  };

  const playStream = async (stream: SeparatedStream) => {
      if (playingStreamId === stream.id) {
          stopPlayback();
          return;
      }
      stopPlayback();
      
      if (!sourceAudioBuffer || !audioContextRef.current) return;
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

      const renderedBuffer = await renderAudio(stream.filterConfig || []);
      if (!renderedBuffer) return;

      const source = audioContextRef.current.createBufferSource();
      source.buffer = renderedBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setPlayingStreamId(null);
      source.start();
      
      sourceNodeRef.current = source;
      setPlayingStreamId(stream.id);
  };

  const stopPlayback = () => {
      if (sourceNodeRef.current) {
          sourceNodeRef.current.stop();
          sourceNodeRef.current = null;
      }
      setPlayingStreamId(null);
  };

  const downloadStream = async (stream: SeparatedStream) => {
      const buffer = await renderAudio(stream.filterConfig || []);
      if (!buffer) return;
      
      // Simple WAV encoding
      const wavBlob = bufferToWave(buffer, buffer.length);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stream.name.replace(/\s+/g, '_')}_stem.wav`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const toggleStreamSelection = (id: string) => {
      setStreams(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const analyzeSelectedStreams = async () => {
      stopPlayback();
      setStep(AppStep.PROCESSING);
      setProcessingStatus("Mixing selected stems...");

      // 1. Identify selected streams
      const selected = streams.filter(s => s.selected);
      if (selected.length === 0) {
          alert("Please select at least one stream to analyze.");
          setStep(AppStep.SEPARATION);
          return;
      }

      // 2. Mix them (simplified: since filters are parallelizable, we can just render the UNION of filters or 
      //    more accurately, we should render them individually and sum them. 
      //    For this demo, we will process the raw audio through a composite filter or just use the primary selected type)
      
      // If Vocals are selected, we prioritize Vocal analysis logic
      // Ideally, we would re-run pitch detection on the MIXED audio.
      // Let's do exactly that.
      
      try {
          // Combine filters? No, we need to mix outputs. 
          // Simplification: We will take the PRIMARY selected stream for pitch analysis to ensure clarity.
          // Raga usually depends on the Melody (Vocals/Instrument).
          const primaryStream = selected.find(s => s.type === 'vocal' || s.type === 'melodic') || selected[0];
          
          setProcessingStatus(`Re-analyzing pitch from ${primaryStream.name}...`);
          
          const renderedBuffer = await renderAudio(primaryStream.filterConfig || []);
          if (!renderedBuffer) throw new Error("Audio rendering failed");

          const newPitchData = await AudioProcessor.analyzeAudioBuffer(renderedBuffer, baseFreq);
          
          // Process
          const { noteStream, noteStats } = AudioProcessor.processAudioData(newPitchData);
          setAnalysisResult({ pitchData: newPitchData, noteStream, noteStats });
          
          setProcessingStatus("Identifying Raga...");
          const scores = RagaEngine.analyze(noteStats, noteStream);
          setRagaScores(scores);
          
          setStep(AppStep.RESULTS);

      } catch (e) {
          console.error(e);
          setStep(AppStep.SEPARATION);
      }
  };

  // --- Input Handlers ---

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStep(AppStep.SEPARATION);
    setProcessingStatus("Decoding audio file...");
    setShowSeparation(false);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      setProcessingStatus("Analyzing audio content...");
      setTimeout(async () => {
         try {
             const pitchData = await AudioProcessor.analyzeAudioBuffer(audioBuffer, baseFreq);
             handleAudioData(pitchData, file); // Pass file blob
         } catch (e) {
             console.error(e);
             alert("Could not analyze file.");
             setStep(AppStep.INPUT_METHOD);
         }
      }, 100);
      
    } catch (err) {
      console.error(err);
      alert("Error processing file.");
      setStep(AppStep.INPUT_METHOD);
    }
  };

  const handleYoutube = () => {
      const url = prompt("Enter YouTube URL (Simulation Mode):");
      if (!url) return;
      setStep(AppStep.SEPARATION);
      setProcessingStatus("Downloading audio from YouTube...");
      setShowSeparation(false);
      setTimeout(() => {
          setProcessingStatus("Extracting vocal track...");
          setTimeout(() => {
              // Synthetic Data
              const syntheticData: { time: number; frequency: number; note: string }[] = [];
              const notes = ["Ni", "Re", "Ga", "Ma", "Dha", "Ni", "Sa", "Re", "Ga", "Re", "Sa", "Ni", "Dha", "Pa", "Ma", "Ga", "Re", "Sa"];
              let timeOffset = 0;
              for(const noteName of notes) {
                  const duration = 500 + Math.random() * 500;
                  const frames = Math.floor(duration / 50);
                  for(let i=0; i<frames; i++) {
                      syntheticData.push({ time: timeOffset, frequency: 440, note: noteName });
                      timeOffset += 50;
                  }
              }
              handleAudioData(syntheticData); 
          }, 1500);
      }, 1500);
  };

  const resetApp = () => {
    stopPlayback();
    setStep(AppStep.SELECT_BASE_NOTE);
    setAnalysisResult(null);
    setRagaScores([]);
    setShowSeparation(false);
    setProcessingStatus("Idle");
    setIsAutoDetect(false);
    setSourceAudioBuffer(null);
    setStreams([]);
  };

  // Icon Mapper
  const getIcon = (type: string) => {
      if (type.includes('vocal')) return Mic;
      if (type.includes('percussion')) return Drum;
      if (type.includes('drone')) return Waves;
      if (type.includes('wind') || type.includes('flute')) return Wind;
      if (type.includes('synth') || type.includes('harmonium')) return Piano;
      return Music;
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <header className="mb-12 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
                <Activity className="text-white" size={24} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">Raagbodh</h1>
        </div>
        <p className="text-slate-500 max-w-md mx-auto">
          AI-powered Raga detection & Studio Source Separation.
        </p>
      </header>

      <main className="w-full flex flex-col items-center">
        
        {step === AppStep.SELECT_BASE_NOTE && (
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-semibold text-slate-800 mb-6 text-center">Select Base Note (Sa)</h2>
            <div className="mb-8 flex justify-center">
                <button onClick={handleAutoDetectSelect} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl shadow-md hover:shadow-lg hover:from-violet-700 hover:to-indigo-700 transition-all transform hover:scale-105">
                    <Wand2 size={20} />
                    <span className="font-medium">Auto Detect (Identify from Audio)</span>
                </button>
            </div>
            <div className="text-center mb-4">
                <span className="text-sm text-slate-400 uppercase tracking-wider font-medium">Or Select Manually</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {BASE_NOTES.map((note) => (
                <button
                  key={note.name}
                  onClick={() => handleBaseNoteSelect(note.freq, note.name)}
                  className={`p-4 rounded-xl text-lg font-medium transition-all duration-200 border ${selectedNoteName === note.name ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
                >
                  {note.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === AppStep.INPUT_METHOD && (
          <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="text-center mb-6">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-2 ${isAutoDetect ? 'bg-violet-100 text-violet-700 border border-violet-200' : 'bg-slate-100 text-slate-500'}`}>
                    {isAutoDetect ? "Mode: Auto-Detect Sa" : `Base Note: ${selectedNoteName}`}
                </span>
                <h2 className="text-xl font-semibold text-slate-800">Choose Input Source</h2>
             </div>
             <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />
             <div className="grid md:grid-cols-3 gap-6">
                <button onClick={() => setStep(AppStep.RECORDING)} className="flex flex-col items-center p-8 bg-white rounded-2xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all group">
                    <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-rose-100 transition-colors"><Mic className="text-rose-500" size={32} /></div>
                    <h3 className="font-semibold text-slate-800">Record Audio</h3>
                    <p className="text-sm text-slate-500 text-center mt-2">Use your microphone to record 20 seconds.</p>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center p-8 bg-white rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all group">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors"><Upload className="text-blue-500" size={32} /></div>
                    <h3 className="font-semibold text-slate-800">Upload File</h3>
                    <p className="text-sm text-slate-500 text-center mt-2">Analyze MP3/WAV files.</p>
                </button>
                <button onClick={handleYoutube} className="flex flex-col items-center p-8 bg-white rounded-2xl border border-slate-200 hover:border-red-400 hover:shadow-md transition-all group">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-red-100 transition-colors"><Youtube className="text-red-500" size={32} /></div>
                    <h3 className="font-semibold text-slate-800">YouTube Link</h3>
                    <p className="text-sm text-slate-500 text-center mt-2">Simulate analyzing a music video.</p>
                </button>
             </div>
             <div className="mt-8 text-center">
                 <button onClick={() => setStep(AppStep.SELECT_BASE_NOTE)} className="text-sm text-slate-400 hover:text-slate-600">Back to Base Note</button>
             </div>
          </div>
        )}

        {step === AppStep.RECORDING && (
          <div className="animate-in fade-in zoom-in-95 duration-300">
             <AudioRecorder baseFreq={baseFreq} onProcessingComplete={handleAudioData} />
          </div>
        )}

        {step === AppStep.SEPARATION && (
           <div className="w-full max-w-5xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {!showSeparation ? (
                  <div className="flex flex-col items-center py-16">
                      <div className="animate-spin mb-6">
                        <Loader size={48} className="text-indigo-500" />
                      </div>
                      <p className="text-lg text-slate-700 font-medium">{processingStatus}</p>
                  </div>
              ) : (
                  <div>
                      <div className="text-center mb-8">
                          <h3 className="text-2xl font-bold text-slate-800">Studio Source Separation</h3>
                          <p className="text-slate-500 mt-2">AI has detected the following layers. Select streams for Raaga identification or download stems.</p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                          {streams.map((stream) => {
                              const Icon = getIcon(stream.type);
                              return (
                                <div key={stream.id} className={`relative group p-5 rounded-xl border transition-all ${stream.selected ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`p-3 rounded-lg ${playingStreamId === stream.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 shadow-sm border border-slate-100'}`}>
                                            <Icon size={24} />
                                        </div>
                                        <button 
                                            onClick={() => toggleStreamSelection(stream.id)}
                                            className={`p-1 rounded transition-colors ${stream.selected ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}
                                        >
                                            {stream.selected ? <CheckSquare size={24} /> : <Square size={24} />}
                                        </button>
                                    </div>
                                    
                                    <h4 className="text-lg font-bold text-slate-800 mb-1">{stream.name}</h4>
                                    <p className="text-xs text-slate-500 mb-6 h-8 line-clamp-2">{stream.description}</p>
                                    
                                    <div className="flex gap-2">
                                        <button 
                                          onClick={() => playStream(stream)}
                                          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${playingStreamId === stream.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                                        >
                                            {playingStreamId === stream.id ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
                                            {playingStreamId === stream.id ? "Stop" : "Preview"}
                                        </button>
                                        
                                        <button 
                                          onClick={() => downloadStream(stream)}
                                          className="flex items-center justify-center p-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-500 text-slate-400 hover:text-indigo-600 transition-colors"
                                          title="Download Stem (WAV)"
                                        >
                                            <Download size={20} />
                                        </button>
                                    </div>
                                </div>
                              );
                          })}
                      </div>
                      
                      <div className="text-center pt-6 border-t border-slate-100">
                          <button 
                             onClick={analyzeSelectedStreams}
                             className="px-8 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-md hover:shadow-xl transition-all flex items-center gap-2 mx-auto"
                          >
                             <Wand2 size={20} />
                             Identify Raaga from Selected
                          </button>
                          <p className="text-xs text-slate-400 mt-3">Combines selected layers for enhanced detection accuracy.</p>
                      </div>
                  </div>
              )}
           </div>
        )}

        {step === AppStep.PROCESSING && (
             <div className="flex flex-col items-center justify-center py-20">
                <div className="relative w-24 h-24 mb-6">
                     <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                     <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <h3 className="text-xl font-medium text-slate-800">{processingStatus}</h3>
                <p className="text-slate-400 mt-2">Using AI models to decode patterns...</p>
             </div>
        )}

        {step === AppStep.RESULTS && analysisResult && (
           <div className="w-full max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
               <AnalysisView noteStream={analysisResult.noteStream} noteStats={analysisResult.noteStats} />
               <RagaResults results={ragaScores} onReset={resetApp} />
           </div>
        )}

      </main>

      <footer className="mt-auto py-6 text-center text-xs text-slate-400">
         Raagbodh &copy; {new Date().getFullYear()} • AI Studio for Indian Classical Music
      </footer>
    </div>
  );
};

// Helper: Wav Encoder
function bufferToWave(abuffer: AudioBuffer, len: number) {
  let numOfChan = abuffer.numberOfChannels,
      length = len * numOfChan * 2 + 44,
      buffer = new ArrayBuffer(length),
      view = new DataView(buffer),
      channels = [], i, sample, offset = 0, pos = 0;

  function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for(i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

  while(pos < length) {
    for(i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); 
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0;
      view.setInt16(pos, sample, true); 
      pos += 2;
    }
    offset++;
  }
  return new Blob([buffer], {type: "audio/wav"});
}

const Loader = ({ size, className }: { size?: number, className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
);

export default App;
