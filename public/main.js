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
  let currentListOfAudioInDZ = {
    rhythm: null,
    bass: null,
    percussion: null,
    synth: null,
  };
  
  let paused = {
    rhythm: false,
    bass: false,
    percussion: false,
    synth: false,
  };
  
  let pauseTime = {
    rhythm: 0,
    bass: 0,
    percussion: 0,
    synth: 0,
  };
  
  let isMuted = {
    rhythm: false,
    bass: false,
    percussion: false,
    synth: false,
  };