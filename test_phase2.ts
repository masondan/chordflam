import "fake-indexeddb/auto";
import { db, getAllSongs, saveSong, exportLibrary, importLibrary, clearLibrary, getSettings, updateSettings } from "./src/lib/db/db";

async function runTests() {
  console.log("--- PHASE 2 TESTS: STORAGE LAYER ---");

  // 1. Initial State
  await clearLibrary();
  let songs = await getAllSongs();
  console.log("Initial songs count:", songs.length);
  
  let settings = await getSettings();
  console.log("Initial settings:", settings);

  // 2. Save a song and update settings
  console.log("\n--- SAVING DATA ---");
  await saveSong({
    id: "song-1",
    title: "Test Song",
    artist: "Test Artist",
    rawText: "[C]Hello [G]world",
    parsedLines: [],
    chordList: ["C", "G"],
    originalKey: "C",
    currentKey: "C",
    fontSize: 20,
    chordColour: "#ff0000",
    isFavourite: true,
    dateAdded: new Date().toISOString()
  });
  
  await updateSettings({ defaultFontSize: 20 });
  
  songs = await getAllSongs();
  console.log("Songs count after save:", songs.length);
  console.log("Song title:", songs[0].title);
  
  settings = await getSettings();
  console.log("Updated settings defaultFontSize:", settings.defaultFontSize);

  // 3. Export
  console.log("\n--- EXPORTING ---");
  const jsonExport = await exportLibrary();
  console.log("Exported JSON sample:", jsonExport.substring(0, 150) + "...");

  // 4. Clear
  console.log("\n--- CLEARING ---");
  await clearLibrary();
  songs = await getAllSongs();
  console.log("Songs count after clear:", songs.length);
  settings = await getSettings();
  console.log("Settings after clear:", settings);

  // 5. Import
  console.log("\n--- IMPORTING ---");
  await importLibrary(jsonExport);
  
  songs = await getAllSongs();
  console.log("Songs count after import:", songs.length);
  console.log("Imported song title:", songs[0].title);
  
  settings = await getSettings();
  console.log("Imported settings defaultFontSize:", settings.defaultFontSize);
  
  console.log("\n--- TESTS COMPLETE ---");
  process.exit(0);
}

runTests().catch(console.error);
