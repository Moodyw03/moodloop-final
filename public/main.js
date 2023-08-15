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
  let audioBuffers = {};
let firstStartTime = null;

let list;
let isSolo = false;

// WHEN DRAGGING START
function drag(event) {
    event.dataTransfer.setData(
      "text",
      JSON.stringify({
        src: event.target.dataset.audio,
        list: event.target.dataset.list,
      })
    );
  
    const controlsDiv = event.target.getElementsByClassName("controls");
    controlsDiv[0].style.display = "none";
  }
  function endDrag(event) {
    const controlsDiv = event.target.getElementsByClassName("controls");
    controlsDiv[0].style.display = "";
  }
  function simulateDragToDropzone(event) {
    const container = event.target.closest(".draggableContainer");
    const data = {
      src: container.dataset.audio,
      list: container.dataset.list,
    };
    // Mimic the behavior of your drop event handler
  if (currentlyPlaying[data.list].source) {
    currentlyPlaying[data.list].source.stop();
  }

  if (data.src) {
    loadAudio(data.src, data.list).then(() => {
      playAudio(data.list);
    });
  }
}