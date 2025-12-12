import { RAGA_DATA } from '../constants';
import { NoteStat, DetectedNote, RagaScore } from '../types';

export class RagaEngine {
  
  static analyze(noteStats: NoteStat[], noteStream: DetectedNote[]): RagaScore[] {
    const scores: RagaScore[] = [];

    // 1. Identify Vaadi and Samvaadi from input
    // Sort notes by duration descending
    const sortedNotes = [...noteStats].sort((a, b) => b.duration - a.duration);
    
    // Top 2 are candidate Vaadi/Samvaadi
    // We take top 3 to be safe against slight measurement errors
    const dominantNotes = sortedNotes.slice(0, 3).map(n => n.note);
    
    // Identify Varjit notes (very low duration, e.g., < 1% presence)
    const varjitNotes = noteStats.filter(n => n.normalizedDuration < 0.01).map(n => n.note);
    
    // Create a string representation of the stream for phrase matching
    const streamString = noteStream.map(n => n.note).join(" ");

    for (const raga of RAGA_DATA) {
      let score = 0;
      const details = {
        vaadiMatch: false,
        samvaadiMatch: false,
        phraseMatches: 0,
        noteOverlapScore: 0
      };

      // A. Vaadi/Samvaadi Check (+10 each)
      if (dominantNotes.includes(raga.vaadi)) {
        score += 10;
        details.vaadiMatch = true;
      }
      if (dominantNotes.includes(raga.samvaadi)) {
        score += 10;
        details.samvaadiMatch = true;
      }

      // B. Note Overlap (Aaroh/Avaroh notes presence) (+20 max)
      // Check if the raga's notes are present in our dominant set and 
      // check if our detected notes are allowed in the raga
      const ragaNotes = new Set([...raga.aaroh, ...raga.avaroh]);
      
      let presentNotesScore = 0;
      let forbiddenPenalty = 0;

      // Bonus for significant notes present
      sortedNotes.forEach(n => {
        if (n.normalizedDuration > 0.05) { // Significant note
            if (ragaNotes.has(n.note)) {
                presentNotesScore += 2;
            } else {
                // High presence of a note NOT in the raga is a heavy penalty
                forbiddenPenalty += 5;
            }
        }
      });
      
      details.noteOverlapScore = presentNotesScore - forbiddenPenalty;
      score += details.noteOverlapScore;


      // C. Varjit Check (Penalty if a Varjit note is played significantly)
      // (Handled implicitly above by forbiddenPenalty, but explicit check for known Varjit logic if we had it per raga)
      
      // D. Phrase / Pakad Matching (+20 per match)
      // Flatten pakad if it's nested
      const pakads = Array.isArray(raga.pakad[0]) ? raga.pakad as string[][] : [raga.pakad as string[]];
      const phrases = raga.phrases || [];
      const allPatterns = [...pakads, ...phrases];

      for (const pattern of allPatterns) {
        const patternStr = pattern.join(" ");
        // Simple substring check. In a real app, we might use fuzzy matching for timing deviations
        if (streamString.includes(patternStr)) {
            score += 20;
            details.phraseMatches++;
        }
      }

      // Normalize score roughly to 0-100 based on expected max
      // Max expected ~ 10+10+20(overlap)+40(2 phrases) = 80-100
      
      scores.push({
        raga,
        score,
        matchDetails: details
      });
    }

    // Sort by score descending
    return scores.sort((a, b) => b.score - a.score);
  }
}
