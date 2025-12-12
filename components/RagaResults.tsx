import React from 'react';
import { RagaScore } from '../types';
import { CheckCircle2, XCircle, Music2 } from 'lucide-react';

interface RagaResultsProps {
  results: RagaScore[];
  onReset: () => void;
}

const RagaResults: React.FC<RagaResultsProps> = ({ results, onReset }) => {
  // Normalize scores to 0-100 for display, assuming top score is the benchmark or raw logic
  const topResults = results.slice(0, 3);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Raga Detection Results</h2>
        <p className="text-slate-500 mt-1">Based on note duration and phrase analysis</p>
      </div>

      <div className="space-y-4">
        {topResults.map((result, idx) => {
          const percentage = Math.min(Math.round((result.score / 80) * 100), 100); // Rough normalization
          
          return (
            <div key={result.raga.id} className={`relative overflow-hidden bg-white rounded-xl border-2 transition-all duration-300 ${idx === 0 ? 'border-indigo-500 shadow-md transform scale-102' : 'border-slate-100 shadow-sm opacity-90'}`}>
              
              {/* Score Indicator */}
              <div className="absolute top-0 right-0 p-4">
                 <div className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-sm ${idx === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                    {percentage}%
                 </div>
              </div>

              <div className="p-6 pr-16">
                <div className="flex items-center gap-3 mb-2">
                    <Music2 size={20} className={idx === 0 ? "text-indigo-600" : "text-slate-400"} />
                    <h3 className="text-xl font-bold text-slate-800">{result.raga.name}</h3>
                    <span className="text-xs px-2 py-1 bg-slate-100 rounded-full text-slate-600">{result.raga.thaat} Thaat</span>
                </div>
                
                <p className="text-sm text-slate-500 mb-4 line-clamp-2">{result.raga.identifyingFeature || "Standard structure."}</p>

                <div className="grid grid-cols-2 gap-4 text-sm">
                   <div className="flex flex-col">
                      <span className="text-xs text-slate-400 uppercase font-medium">Aaroh</span>
                      <span className="font-mono text-slate-700">{result.raga.aaroh.join(" ")}</span>
                   </div>
                   <div className="flex flex-col">
                      <span className="text-xs text-slate-400 uppercase font-medium">Avaroh</span>
                      <span className="font-mono text-slate-700">{result.raga.avaroh.join(" ")}</span>
                   </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-4 text-xs">
                    <div className="flex items-center gap-1">
                        {result.matchDetails.vaadiMatch ? <CheckCircle2 size={14} className="text-emerald-500"/> : <XCircle size={14} className="text-rose-400"/>}
                        <span className="text-slate-600">Vaadi Match ({result.raga.vaadi})</span>
                    </div>
                    <div className="flex items-center gap-1">
                        {result.matchDetails.phraseMatches > 0 ? <CheckCircle2 size={14} className="text-emerald-500"/> : <XCircle size={14} className="text-slate-300"/>}
                        <span className="text-slate-600">Phrase Match ({result.matchDetails.phraseMatches})</span>
                    </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-8 text-center">
        <button 
          onClick={onReset}
          className="px-8 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
        >
          Analyze Another
        </button>
      </div>
    </div>
  );
};

export default RagaResults;
