import React, { useState, useMemo } from 'react';
import { RAGA_DATA, THAAT_DATA } from '../constants';
import { Search, Music2, BookOpen } from 'lucide-react';
import { Raga } from '../types';

const RagaLibrary: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRaga, setSelectedRaga] = useState<Raga | null>(null);

  const filteredRagas = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return RAGA_DATA.filter(r => 
      r.name.toLowerCase().includes(lower) || 
      r.thaat.toLowerCase().includes(lower) ||
      r.id.includes(lower)
    );
  }, [searchTerm]);

  return (
    <div className="w-full max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center justify-center gap-2">
           <BookOpen className="text-indigo-600" />
           Raga Knowledge Base
        </h2>
        <p className="text-slate-500 mt-2">Search our database of classical Hindustani ragas.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 h-[600px]">
        {/* Search and List Side */}
        <div className="md:col-span-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
           <div className="p-4 border-b border-slate-100 bg-slate-50">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search Raga name..." 
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
           </div>
           <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar">
              {filteredRagas.map(raga => (
                <button
                  key={raga.id}
                  onClick={() => setSelectedRaga(raga)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors flex justify-between items-center ${
                    selectedRaga?.id === raga.id 
                      ? 'bg-indigo-50 text-indigo-700 font-medium' 
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>{raga.name}</span>
                  <span className="text-xs text-slate-400 font-normal">{raga.thaat}</span>
                </button>
              ))}
              {filteredRagas.length === 0 && (
                <div className="p-4 text-center text-slate-400 text-sm">
                  No ragas found.
                </div>
              )}
           </div>
        </div>

        {/* Detail View Side */}
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto p-6 md:p-8">
           {selectedRaga ? (
             <div className="space-y-6">
                <div className="flex items-start justify-between border-b border-slate-100 pb-6">
                   <div>
                     <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
                       {selectedRaga.thaat} Thaat
                     </span>
                     <h3 className="text-3xl font-bold text-slate-900">{selectedRaga.name}</h3>
                   </div>
                   <div className="bg-slate-50 p-3 rounded-full">
                      <Music2 size={32} className="text-indigo-300" />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                   <div className="bg-slate-50 p-4 rounded-lg">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Aaroh (Ascending)</h4>
                      <p className="font-mono text-lg text-slate-800">{selectedRaga.aaroh.join(" - ")}</p>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-lg">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Avaroh (Descending)</h4>
                      <p className="font-mono text-lg text-slate-800">{selectedRaga.avaroh.join(" - ")}</p>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                   <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-slate-500">Vaadi (King Note)</span>
                      <span className="font-bold text-indigo-700 text-lg">{selectedRaga.vaadi}</span>
                   </div>
                   <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-slate-500">Samvaadi (Queen Note)</span>
                      <span className="font-bold text-indigo-700 text-lg">{selectedRaga.samvaadi}</span>
                   </div>
                </div>

                {selectedRaga.pakad && (
                   <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pakad (Catch Phrase)</h4>
                      <div className="bg-slate-900 text-white p-4 rounded-lg font-mono tracking-wide">
                        {Array.isArray(selectedRaga.pakad[0]) 
                          ? (selectedRaga.pakad as string[][]).map(p => p.join(" ")).join(" | ")
                          : (selectedRaga.pakad as string[]).join(" ")
                        }
                      </div>
                   </div>
                )}
                
                {selectedRaga.phrases && (
                    <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Common Phrases</h4>
                        <div className="flex flex-wrap gap-2">
                            {selectedRaga.phrases.slice(0, 8).map((phrase, i) => (
                                <span key={i} className="px-3 py-1 bg-white border border-slate-200 rounded-md text-xs font-mono text-slate-600">
                                    {phrase.join(" ")}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {selectedRaga.identifyingFeature && (
                   <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg text-amber-800 text-sm">
                      <span className="font-semibold block mb-1">Key Characteristic:</span>
                      {selectedRaga.identifyingFeature}
                   </div>
                )}
             </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <Music2 size={64} className="mb-4 opacity-20" />
                <p>Select a Raga from the list to view details</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default RagaLibrary;