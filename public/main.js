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
$(function () {
    var dropZone = $("#drop_zone");
  
    dropZone.on("dragover dragenter", function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
    dropZone.on("drop", async function (e) {
        e.preventDefault();
        e.stopPropagation();
    
        var data = JSON.parse(e.originalEvent.dataTransfer.getData("text"));
        var file = data.src;
        list = data.list;

    if (currentlyPlaying[list].source) {
        currentlyPlaying[list].source.stop();
      }
  
      if (file) {
        await loadAudio(file, list);
        playAudio(list);
      }
    });
  });
  async function loadAudio(url, list) {
    let response = await fetch(url);
    let arrayBuffer = await response.arrayBuffer();
    let audioData = await context.decodeAudioData(arrayBuffer);
    audioBuffers[list] = audioData;
  currentListOfAudioInDZ[list] = url;

  // Remove the "selected" class from all files
  $(".draggableContainer").removeClass("selected");

  // Add the "selected" class to the selected file
  $(`div[data-audio='${url}']`).addClass("selected");
}
function playAudio(list) {
    let source = context.createBufferSource();
    source.buffer = audioBuffers[list];
    source.loop = true;
  
    let gainNode = context.createGain(); // Create a gain node
    source.connect(gainNode); // Connect the source to the gain node
    gainNode.connect(context.destination); // Connect the gain node to the destination
  
    if (firstStartTime === null) {
      firstStartTime = context.currentTime;
    }
    //source.start(0, context.currentTime - firstStartTime);

  const loopDuration = source.buffer.duration;
  const offset = (context.currentTime - firstStartTime) % loopDuration;
  source.start(0, offset);

  currentlyPlaying[list].source = source;
  currentlyPlaying[list].gainNode = gainNode; // Save the gain node

  // Check if the EQ settings for this list exist
  if (!eqSettings[list].bass) {
    createEQ(list);
  }
  // Connect the source to the EQ and then to the gain node
  source.connect(eqSettings[list].bass);
  eqSettings[list].bass.connect(eqSettings[list].mid);
  eqSettings[list].mid.connect(eqSettings[list].treble);
  eqSettings[list].treble.connect(currentlyPlaying[list].gainNode);
}