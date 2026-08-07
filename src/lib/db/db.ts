import Dexie, { type Table } from 'dexie';

export interface ParsedSegment {
  chord: string | null;
  lyric: string;
}

export interface ParsedLine {
  id: string; 
  segments: ParsedSegment[];
}

export interface Song {
  id: string;
  title: string;
  artist: string | null;
  rawText: string;
  parsedLines: ParsedLine[];
  chordList: string[];
  originalKey: string | null;
  currentKey: string;
  fontSize: number;
  chordColour: string;
  isFavourite: boolean;
  dateAdded: string; // ISO string
}

export interface AppSettings {
  id: number; // Single row, ID 1
  defaultFontSize: number;
  defaultChordColour: string;
}

export class ChordFlamDB extends Dexie {
  songs!: Table<Song, string>;
  settings!: Table<AppSettings, number>;

  constructor() {
    super('ChordFlamDB');
    this.version(1).stores({
      songs: 'id, title, artist, isFavourite, dateAdded', // indexes
      settings: 'id'
    });
  }
}

export const db = new ChordFlamDB();

// --- CRUD Operations for Songs ---

export async function getAllSongs(): Promise<Song[]> {
  return await db.songs.orderBy('title').toArray();
}

export async function getRecentSongs(limit = 3): Promise<Song[]> {
  return await db.songs.orderBy('dateAdded').reverse().limit(limit).toArray();
}

export async function getSong(id: string): Promise<Song | undefined> {
  return await db.songs.get(id);
}

export async function saveSong(song: Song): Promise<string> {
  return await db.songs.put(song);
}

export async function deleteSong(id: string): Promise<void> {
  return await db.songs.delete(id);
}

export async function toggleFavourite(id: string): Promise<void> {
  const song = await getSong(id);
  if (song) {
    await db.songs.update(id, { isFavourite: !song.isFavourite });
  }
}

// --- CRUD Operations for AppSettings ---

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  defaultFontSize: 18,
  defaultChordColour: '#6E36D1' // Brand Purple
};

export async function getSettings(): Promise<AppSettings> {
  const settings = await db.settings.get(1);
  return settings || DEFAULT_SETTINGS;
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<void> {
  const settings = await getSettings();
  const newSettings = { ...settings, ...updates, id: 1 };
  await db.settings.put(newSettings);
}

// --- Import/Export ---

export interface ExportData {
  version: number;
  songs: Song[];
  settings: AppSettings;
}

export async function exportLibrary(): Promise<string> {
  const songs = await db.songs.toArray();
  const settings = await getSettings();
  
  const data: ExportData = {
    version: 1,
    songs,
    settings
  };
  
  return JSON.stringify(data, null, 2);
}

export async function importLibrary(jsonString: string): Promise<void> {
  try {
    const data: ExportData = JSON.parse(jsonString);
    
    // Basic validation
    if (!data.songs || !Array.isArray(data.songs)) {
      throw new Error('Invalid import format: missing or invalid songs array');
    }
    
    await db.transaction('rw', db.songs, db.settings, async () => {
      // Add/update by internal id, no duplicate detection
      await db.songs.bulkPut(data.songs);
      
      if (data.settings) {
        await db.settings.put(data.settings);
      }
    });
  } catch (error) {
    console.error('Import failed:', error);
    throw error;
  }
}

export async function clearLibrary(): Promise<void> {
  await db.transaction('rw', db.songs, db.settings, async () => {
    await db.songs.clear();
    await db.settings.clear();
  });
}
