# Project-Scoped Rules for MusicBorrow

## Vocal Exercise Processing Rule
When the user sends a link (like a YouTube video) or describes a vocal exercise technique and asks to add it to the app, follow these steps automatically:

1. **Check for Similarity & Duplicates First**: Before creating a new level or exercise, inspect the existing `LEVELS` array in `vocal-trainer.js` (and the breathing presets if it is a breath exercise). If the requested technique is substantially similar or redundant to an existing exercise, do NOT create a duplicate level. Instead, enhance/refine the existing exercise or notify the user that it matches an existing level.
2. **Analyze the Technique**: Identify the vocal pattern being taught (e.g., 1-2-3-2-1, Triad, Octave Jump, or Breath Control).
3. **Translate to Sequence**: Convert the notes into an array of objects for the `LEVELS` array in `vocal-trainer.js`.
   - `step`: Semitone interval from the base note (0=1st, 2=2nd, 4=3rd, 5=4th, 7=5th, 9=6th, 11=7th, 12=8ve).
   - `duration`: The duration of each note in seconds (usually 1.0 to 1.5 for short notes, 2.0 to 4.0 for long tones).
4. **Determine Difficulty & Insert**: Evaluate how difficult the technique is compared to existing levels. Insert the new level object into the `LEVELS` array at the appropriate position if unique. Note: You do not need separate male/female levels; the app automatically adjusts the `baseNote` for gender.
5. **Renumber Levels**: After inserting any new level, systematically update the `id` and `name` properties of ALL levels in the array so they remain consecutive (Level 1, Level 2, Level 3, etc.).
6. **Report**: Create or update the `walkthrough.md` to show the user what was added/updated and deploy the app.
