/**
 * Pre-defined archetype IDs
 */
export enum ArchetypeID {
  TRAP_HIPHOP = 'archetype_a',
  POP_EDM = 'archetype_b',
  ACOUSTIC_AMBIENT = 'archetype_c',
}

export const DEFAULT_ARCHETYPE = ArchetypeID.POP_EDM;

const GENRE_MAP: Record<ArchetypeID, string[]> = {
  [ArchetypeID.TRAP_HIPHOP]: ['rap', 'hip hop', 'trap', 'drill', 'phonk'],
  [ArchetypeID.POP_EDM]: ['pop', 'dance pop', 'house', 'edm', 'techno', 'slap house'],
  [ArchetypeID.ACOUSTIC_AMBIENT]: ['acoustic', 'singer-songwriter', 'indie', 'ambient', 'classical', 'lo-fi'],
};

/**
 * Maps an array of Spotify genre strings to a corresponding Archetype ID.
 * It scores each archetype based on how many genre keywords match.
 * 
 * @param spotifyGenres Array of genres returned by Spotify API for the current artist/track
 * @returns The best matching ArchetypeID
 */
export function mapGenresToArchetype(spotifyGenres: string[]): string {
  if (!spotifyGenres || spotifyGenres.length === 0) {
    return DEFAULT_ARCHETYPE;
  }

  const scores = {
    [ArchetypeID.TRAP_HIPHOP]: 0,
    [ArchetypeID.POP_EDM]: 0,
    [ArchetypeID.ACOUSTIC_AMBIENT]: 0,
  };

  const normalizedInput = spotifyGenres.map(g => g.toLowerCase());

  for (const genre of normalizedInput) {
    // Check Trap / Hip-Hop
    if (GENRE_MAP[ArchetypeID.TRAP_HIPHOP].some(keyword => genre.includes(keyword))) {
      scores[ArchetypeID.TRAP_HIPHOP]++;
    }
    // Check Pop / EDM
    else if (GENRE_MAP[ArchetypeID.POP_EDM].some(keyword => genre.includes(keyword))) {
      scores[ArchetypeID.POP_EDM]++;
    }
    // Check Acoustic / Ambient
    else if (GENRE_MAP[ArchetypeID.ACOUSTIC_AMBIENT].some(keyword => genre.includes(keyword))) {
      scores[ArchetypeID.ACOUSTIC_AMBIENT]++;
    }
  }

  // Find the archetype with the highest score
  let bestMatch: string = DEFAULT_ARCHETYPE;
  let highestScore = 0;

  for (const [archetype, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      bestMatch = archetype as ArchetypeID;
    }
  }

  return bestMatch;
}
