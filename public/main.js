let context = new AudioContext();

let currentlyPlaying = {
  rhythm: { source: null, gainNode: null },
  bass: { source: null, gainNode: null },
  percussion: { source: null, gainNode: null },
  synth: { source: null, gainNode: null },
};
const eqSettings = {
    rhythm: { bass: null, mid: null, treble: null },
    bass: { bass: null, mid: null, treble: null },
    percussion: { bass: null, mid: null, treble: null },
    synth: { bass: null, mid: null, treble: null },
  };