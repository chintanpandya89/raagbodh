import React from 'react';
import { DetectedNote, NoteStat } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface AnalysisViewProps {
  noteStream: DetectedNote[];
  noteStats: NoteStat[];
}

const AnalysisView: React.FC<AnalysisViewProps> = ({ noteStream, noteStats }) => {
  
  // Format stream for display
  const streamDisplay = noteStream.map((n, i) => (
    <span key={i} className={`inline-block px-1 font-mono text-lg ${
      ['S', 'P'].includes(n.note) ? 'font-bold text-indigo-700' : 'text-slate-600'
    }`}>
      {n.note}
    </span>
  ));

  return (
    <div className="w-full space-y-6">
      
      {/* Note Stream Ticker */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Detected Notation Stream</h4>
        <div className="overflow-x-auto no-scrollbar whitespace-nowrap py-2">
          {streamDisplay.length > 0 ? streamDisplay : <span className="text-slate-400 italic">No notes detected.</span>}
        </div>
      </div>

      {/* Stats Chart */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Note Duration Analysis</h4>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={noteStats} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <XAxis dataKey="note" axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="normalizedDuration" radius={[4, 4, 0, 0]}>
                {noteStats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.normalizedDuration > 0.1 ? '#4f46e5' : '#cbd5e1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-center text-xs text-slate-400">
           Taller bars indicate Vaadi/Samvaadi candidates
        </div>
      </div>
    </div>
  );
};

export default AnalysisView;
