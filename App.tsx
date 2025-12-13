import React, { useState, useRef, useEffect } from 'react';
import { BASE_NOTES, AppStep, AudioProcessResult, RagaScore, SeparatedStream } from './types';
import { AudioProcessor } from './services/audioProcessor';
import { RagaEngine } from './services/ragaEngine';
import { LayerDetectionService } from './services/layerDetection';
import AudioRecorder from './components/AudioRecorder';
import AnalysisView from './components/AnalysisView';
import RagaResults from './components/RagaResults';
import RagaLibrary from './components/RagaLibrary';
import { 
    Upload, Mic, Youtube, ArrowRight, Music, Activity, Wand2, 
    Wind, Drum, Waves, Speaker, EarOff, Piano, Play, Pause, Download, CheckSquare, Square,
    Library, Radio
} from 'lucide-react';

const App: React.FC = () => {
  // Navigation State
  const [viewMode, setViewMode] = useState<'analyze' | 'library'>('analyze');

  // Analyzer State
  const [step, setStep] = useState<AppStep>(AppStep.SELECT_BASE_NOTE);
  const [baseFreq, setBaseFreq] = useState<number>(BASE_NOTES[0].freq);
  const [selectedNoteName, setSelectedNoteName] = useState("C");
  const [isAutoDetect, setIsAutoDetect] = useState(false);
  const [hasBaseNote, setHasBaseNote] = useState(false);
  
  const [analysisResult, setAnalysisResult] = useState<AudioProcessResult | null>(null);
  const [ragaScores, setRagaScores] = useState<RagaScore[]>([]);
  const [streams, setStreams] = useState<SeparatedStream[]>([]);

  // Separation state
  const [showSeparation, setShowSeparation] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("Idle");
  
  // Audio Playback State
  const [sourceAudioBuffer, setSourceAudioBuffer] = useState<AudioBuffer | null>(null);
  const [playingStreamId, setPlayingStreamId] = useState<string | null>(null); // 'mixed' or streamId
  
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
    setHasBaseNote(true);
    setIsAutoDetect(false);
    setStep(AppStep.INPUT_METHOD);
  };

  const handleAutoDetectSelect = () => {
    setIsAutoDetect(true);
    setHasBaseNote(false); // Not yet detected
    setStep(AppStep.INPUT_METHOD);
  };

  const handleManualSaChange = () => {
      stopPlayback();
      setStep(AppStep.SELECT_BASE_NOTE);
      setHasBaseNote(false);
      setAnalysisResult(null);
      setRagaScores([]);
      setShowSeparation(false);
      setStreams([]);
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
        setHasBaseNote(true);
        
        setProcessingStatus(`Detected Sa: ${detectedRoot.name}`);
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Update raw pitch data
        rawPitchData.forEach(p => {
            p.note = AudioProcessor.pitchToNote(p.frequency, currentBaseFreq);
        });
    } else {
        setHasBaseNote(true);
    }

    // AI Layer Detection
    if (audioSource instanceof Blob) {
        setProcessingStatus("AI analyzing spectral layers...");
        try {
            const detectedLayers = await LayerDetectionService.detectLayers(audioSource);
            setStreams(detectedLayers);
        } catch (e) {
            console.error(e);
            setStreams(getDefaultStreams());
        }
    } else {
         setStreams(getDefaultStreams());
    }
    
    setProcessingStatus("Generating Crossover Networks...");
    setTimeout(() => {
        setProcessingStatus("Processing Complete.");
        setShowSeparation(true);
    }, 1500);

    // Persist raw data for later re-analysis
    (window as any).currentRawPitchData = rawPitchData;
  };

  const getDefaultStreams = (): SeparatedStream[] => [
    { id: 'voc', name: 'Vocals (Mids)', type: 'vocal', selected: true, confidence: 95, description: 'Primary Melody', filterConfig: [{ type: 'highpass', freq: 300 }, { type: 'lowpass', freq: 4000 }] },
    { id: 'drn', name: 'Drone/Bass (Lows)', type: 'drone', selected: false, confidence: 90, description: 'Base Note', filterConfig: [{ type: 'lowpass', freq: 300 }] },
    { id: 'noi', name: 'Ambience (Highs)', type: 'noise', selected: false, confidence: 90, description: 'High frequency content', filterConfig: [{ type: 'highpass', freq: 4000 }] },
  ];

  // --- Advanced Audio Rendering (Parallel Mixing) ---
  const renderMixedAudio = async (selectedStreams: SeparatedStream[]): Promise<AudioBuffer | null> => {
      if (!sourceAudioBuffer) return null;

      const offlineCtx = new OfflineAudioContext(
          sourceAudioBuffer.numberOfChannels,
          sourceAudioBuffer.length,
          sourceAudioBuffer.sampleRate
      );

      // We render each stream's filter path in parallel and connect to destination
      // The OfflineContext automatically sums signals connected to destination.
      
      selectedStreams.forEach(stream => {
          const source = offlineCtx.createBufferSource();
          source.buffer = sourceAudioBuffer;
          
          let lastNode: AudioNode = source;
          
          // Apply filters
          if (stream.filterConfig) {
              stream.filterConfig.forEach(f => {
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
      });

      return await offlineCtx.startRendering();
  };

  const playMixedStream = async (targetStreams: SeparatedStream[]) => {
      stopPlayback();
      
      if (!sourceAudioBuffer || !audioContextRef.current) return;
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

      // If playing everything, just play original for perfect fidelity
      const isPlayingAll = targetStreams.length === streams.length;
      let renderedBuffer: AudioBuffer | null;

      if (isPlayingAll) {
          renderedBuffer = sourceAudioBuffer;
      } else {
          renderedBuffer = await renderMixedAudio(targetStreams);
      }

      if (!renderedBuffer) return;

      const source = audioContextRef.current.createBufferSource();
      source.buffer = renderedBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setPlayingStreamId(null);
      source.start();
      
      sourceNodeRef.current = source;
      setPlayingStreamId(targetStreams.length === 1 ? targetStreams[0].id : 'mixed');
  };

  const togglePlayback = (stream?: SeparatedStream) => {
      if (stream) {
          // Play single
          if (playingStreamId === stream.id) {
              stopPlayback();
          } else {
              playMixedStream([stream]);
          }
      } else {
          // Play Mix of selected
          if (playingStreamId === 'mixed') {
              stopPlayback();
          } else {
              const selected = streams.filter(s => s.selected);
              if (selected.length > 0) playMixedStream(selected);
          }
      }
  };

  const stopPlayback = () => {
      if (sourceNodeRef.current) {
          sourceNodeRef.current.stop();
          sourceNodeRef.current = null;
      }
      setPlayingStreamId(null);
  };

  const downloadStem = async (stream: SeparatedStream) => {
      const buffer = await renderMixedAudio([stream]);
      if (!buffer) return;
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
      setProcessingStatus("Analyzing combined layers...");

      const selected = streams.filter(s => s.selected);
      if (selected.length === 0) {
          alert("Please select at least one stream to analyze.");
          setStep(AppStep.SEPARATION);
          return;
      }

      try {
          // Render the MIX of selected streams
          const renderedBuffer = await renderMixedAudio(selected);
          if (!renderedBuffer) throw new Error("Audio rendering failed");

          const newPitchData = await AudioProcessor.analyzeAudioBuffer(renderedBuffer, baseFreq);
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
             // For initial analysis, use default base freq, later update if auto-detect
             const pitchData = await AudioProcessor.analyzeAudioBuffer(audioBuffer, baseFreq);
             handleAudioData(pitchData, file); 
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
      setProcessingStatus("Processing stream...");
      setShowSeparation(false);
      setTimeout(() => {
          // Synthetic Data Simulation
          const syntheticData: { time: number; frequency: number; note: string }[] = [];
          const notes = ["Ni", "Re", "Ga", "Ma", "Dha", "Ni", "Sa", "Re", "Ga", "Re", "Sa", "Ni", "Dha", "Pa", "Ma", "Ga", "Re", "Sa"];
          let timeOffset = 0;
          for(const noteName of notes) {
              const duration = 500;
              const frames = 10;
              for(let i=0; i<frames; i++) {
                  syntheticData.push({ time: timeOffset, frequency: 440, note: noteName });
                  timeOffset += 50;
              }
          }
          handleAudioData(syntheticData); 
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
    setHasBaseNote(false);
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
    <div className="min-h-screen flex flex-col items-center bg-slate-50">
      
      {/* Header */}
      <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setViewMode('analyze')}>
                <div className="bg-indigo-600 p-1.5 rounded-lg">
                    <Activity className="text-white" size={20} />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">Raagbodh</h1>
            </div>

            {/* View Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setViewMode('analyze')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'analyze' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Radio size={16} /> Analyzer
                </button>
                <button 
                  onClick={() => setViewMode('library')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'library' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Library size={16} /> Library
                </button>
            </div>
          </div>

          {/* Persistent Info Bar - Only in Analyzer Mode */}
          {viewMode === 'analyze' && hasBaseNote && (
             <div className="bg-indigo-900 text-white py-2 px-4 animate-in slide-in-from-top-full duration-300">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-6 text-sm">
                        <span className="opacity-70">Current Session</span>
                        <div className="flex items-center gap-2 font-medium">
                            <Music size={14} />
                            Base Note (Sa): <span className="text-indigo-200 font-bold text-lg">{selectedNoteName}</span>
                            <span className="opacity-50 ml-1">({Math.round(baseFreq)} Hz)</span>
                        </div>
                    </div>
                    <button 
                        onClick={handleManualSaChange} 
                        className="text-xs bg-indigo-800 hover:bg-indigo-700 px-3 py-1 rounded text-white transition-colors"
                    >
                        Change
                    </button>
                </div>
             </div>
          )}
      </header>

      <main className="w-full max-w-6xl mx-auto p-4 md:p-8 flex-1 flex flex-col items-center">
        
        {viewMode === 'library' ? (
           <RagaLibrary />
        ) : (
           <>
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
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h3 className="text-2xl font-bold text-slate-800">Source Separation Studio</h3>
                                    <p className="text-slate-500 mt-2">AI-detected spectral layers. Select layers to isolate or combine them to reconstruct the mix.</p>
                                </div>
                                <div className="text-right">
                                     <button 
                                        onClick={() => togglePlayback()}
                                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold shadow-md transition-all ${playingStreamId === 'mixed' ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}
                                     >
                                         {playingStreamId === 'mixed' ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
                                         {playingStreamId === 'mixed' ? "Stop Mix" : "Play Mix"}
                                     </button>
                                     <p className="text-xs text-slate-400 mt-2">Plays mixture of checked boxes</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                                {streams.map((stream) => {
                                    const Icon = getIcon(stream.type);
                                    return (
                                      <div key={stream.id} className={`relative group p-5 rounded-xl border-2 transition-all ${stream.selected ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}>
                                          <div className="flex justify-between items-start mb-4">
                                              <div className={`p-3 rounded-lg ${playingStreamId === stream.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 shadow-sm border border-slate-100'}`}>
                                                  <Icon size={24} />
                                              </div>
                                              <button 
                                                  onClick={() => toggleStreamSelection(stream.id)}
                                                  className={`p-1 rounded transition-colors ${stream.selected ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}
                                              >
                                                  {stream.selected ? <CheckSquare size={28} /> : <Square size={28} />}
                                              </button>
                                          </div>
                                          
                                          <h4 className="text-lg font-bold text-slate-800 mb-1">{stream.name}</h4>
                                          <p className="text-xs text-slate-500 mb-6 h-8 line-clamp-2">{stream.description}</p>
                                          
                                          <div className="flex gap-2">
                                              <button 
                                                onClick={() => togglePlayback(stream)}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${playingStreamId === stream.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                                              >
                                                  {playingStreamId === stream.id ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}
                                                  {playingStreamId === stream.id ? "Stop" : "Solo"}
                                              </button>
                                              
                                              <button 
                                                onClick={() => downloadStem(stream)}
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
                                  className="px-10 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl hover:shadow-xl hover:scale-105 transition-all flex items-center gap-3 mx-auto"
                                >
                                  <Wand2 size={24} />
                                  Detect Raaga
                                </button>
                                <p className="text-sm text-slate-500 mt-3">Analyzes the combined audio of selected layers</p>
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
           </>
        )}

      </main>

      <footer className="mt-auto py-6 text-center text-xs text-slate-400 border-t border-slate-200 bg-white w-full">
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