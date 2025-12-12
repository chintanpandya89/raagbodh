import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square } from 'lucide-react';
import { AudioProcessor } from '../services/audioProcessor';

interface AudioRecorderProps {
  baseFreq: number;
  onProcessingComplete: (
    pitchData: { time: number; frequency: number; note: string }[],
    audioBlob: Blob
  ) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ baseFreq, onProcessingComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentNote, setCurrentNote] = useState<string>("-");
  
  const processorRef = useRef<AudioProcessor | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const intervalRef = useRef<any>(null);
  const collectIntervalRef = useRef<any>(null);
  const rawDataRef = useRef<{ time: number; frequency: number; note: string }[]>([]);

  useEffect(() => {
    processorRef.current = new AudioProcessor();
    return () => {
      processorRef.current?.stopRecording();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (collectIntervalRef.current) clearInterval(collectIntervalRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Start Analysis
      await processorRef.current?.startRecording(stream);
      
      // Start Capture
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start();
      
      setIsRecording(true);
      rawDataRef.current = [];
      setProgress(0);

      // Progress bar interval (20 seconds total)
      const startTime = Date.now();
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const p = Math.min((elapsed / 20000) * 100, 100);
        setProgress(p);
        
        if (elapsed >= 20000) {
          stopRecording();
        }
      }, 100);

      // Pitch collection interval (every 5ms)
      collectIntervalRef.current = setInterval(() => {
        if (processorRef.current) {
          const pitch = processorRef.current.getPitch();
          const note = AudioProcessor.pitchToNote(pitch, baseFreq);
          
          if (pitch !== -1) {
            setCurrentNote(note);
          }
          
          rawDataRef.current.push({
            time: Date.now() - startTime,
            frequency: pitch,
            note: note
          });
        }
      }, 5);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (collectIntervalRef.current) clearInterval(collectIntervalRef.current);
    
    processorRef.current?.stopRecording();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.onstop = () => {
         const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
         setIsRecording(false);
         onProcessingComplete(rawDataRef.current, audioBlob);
      };
    } else {
        setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-md">
      <div className="mb-6 text-center">
        <h3 className="text-lg font-semibold text-slate-800 mb-1">Record Audio</h3>
        <p className="text-sm text-slate-500">Sing or play an instrument for 20 seconds.</p>
      </div>

      <div className="mb-8 relative w-48 h-48 flex items-center justify-center">
         {/* Ring Animation when recording */}
         {isRecording && (
           <div className="absolute inset-0 rounded-full border-4 border-rose-100 animate-ping"></div>
         )}
         <div className={`relative z-10 w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 ${isRecording ? 'bg-rose-50' : 'bg-slate-50'}`}>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                isRecording ? 'bg-rose-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isRecording ? <Square size={32} fill="currentColor" /> : <Mic size={32} />}
            </button>
         </div>
      </div>

      {isRecording && (
        <div className="w-full space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-500 uppercase tracking-wider">
                <span>Recording...</span>
                <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-rose-500 transition-all duration-100 ease-linear"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <div className="mt-4 text-center">
                <span className="text-2xl font-bold text-slate-800">{currentNote}</span>
                <span className="text-xs text-slate-400 ml-2">Current Note</span>
            </div>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
