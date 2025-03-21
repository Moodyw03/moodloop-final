let context = new AudioContext();
let scheduledSources = {}; // Track scheduled audio sources

// Add analyzer for visualization
let masterAnalyser = null;
let visualizationActive = false;
let animationFrameId = null;

// Add lookahead scheduling constants
const LOOKAHEAD = 0.1; // 100ms lookahead
const SCHEDULE_AHEAD_TIME = 0.2; // Schedule 200ms ahead

// Buffer size to reduce stuttering
const BUFFER_SIZE = 2048;

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

function unlockAudioContext(audioContext) {
  if (audioContext.state === "suspended") {
    const unlock = async () => {
      await audioContext.resume();

      // Change buffer size for better performance
      if (audioContext.state === "running") {
        console.log("AudioContext is now running");
      }

      document.body.removeEventListener("touchstart", unlock);
      document.body.removeEventListener("touchend", unlock);
      document.body.removeEventListener("mousedown", unlock);
    };

    document.body.addEventListener("touchstart", unlock, false);
    document.body.addEventListener("touchend", unlock, false);
    document.body.addEventListener("mousedown", unlock, false); // Add mouse event for better handling
  }
}

unlockAudioContext(context);

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
  event.preventDefault();
  event.stopPropagation();

  const container = event.currentTarget.closest(".draggableContainer");
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
    $(this).addClass("drag-over");
  });

  dropZone.on("dragleave dragend", function (e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).removeClass("drag-over");
  });

  dropZone.on("drop", async function (e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).removeClass("drag-over");

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

  let gainNode;
  if (currentlyPlaying[list].gainNode) {
    gainNode = currentlyPlaying[list].gainNode;
  } else {
    gainNode = context.createGain();
    gainNode.gain.value = 1; // Set the initial gain value to 1.
  }

  // Check if the EQ settings for this list exist
  if (!eqSettings[list].bass) {
    createEQ(list);
  }

  // Connect the source to the EQ and then to the gain node
  source.connect(eqSettings[list].bass);
  eqSettings[list].bass.connect(eqSettings[list].mid);
  eqSettings[list].mid.connect(eqSettings[list].treble);
  eqSettings[list].treble.connect(gainNode);

  // Connect to master analyzer for visualization
  if (!masterAnalyser) {
    initializeVisualization();
  }

  // Connect the gain node to both the analyzer and the destination
  gainNode.connect(masterAnalyser);
  gainNode.connect(context.destination);

  if (firstStartTime === null) {
    firstStartTime = context.currentTime;
  }

  const loopDuration = source.buffer.duration;

  // Calculate a precise offset that aligns with buffer boundaries
  const currentTime = context.currentTime;
  const timeSinceStart = currentTime - firstStartTime;
  const offset = timeSinceStart % loopDuration;

  // Use a small delay to ensure proper buffering before playback
  const startTime = currentTime + 0.005; // 5ms delay for buffer preparation
  source.start(startTime, offset);

  // If there was a previous source, schedule its end to match the new source start
  if (currentlyPlaying[list].source) {
    currentlyPlaying[list].source.stop(startTime);
  }

  currentlyPlaying[list].source = source;
  currentlyPlaying[list].gainNode = gainNode; // Save the gain node

  // Store this source in our scheduled sources
  scheduledSources[list] = source;

  // Add event listener for when the source ends
  source.onended = () => {
    if (scheduledSources[list] === source) {
      delete scheduledSources[list];
    }
  };
}

function pauseAudio(list) {
  // Check if the audio is playing and if source exists
  if (currentlyPlaying[list] && currentlyPlaying[list].source) {
    // If the audio is playing, stop it and remember the time it was paused
    paused[list] = true;
    pauseTime[list] = context.currentTime - firstStartTime;
    currentlyPlaying[list].source.stop();
    currentlyPlaying[list].source = null;
  }
}

function stopAudio(list) {
  // Check if the audio is playing and if source exists
  if (currentlyPlaying[list] && currentlyPlaying[list].source) {
    currentlyPlaying[list].source.stop();
    currentlyPlaying[list].source = null;
  }
}

function resumeAudio(list) {
  if (paused[list]) {
    // If the audio is paused, start it from the pause time
    let source = context.createBufferSource();
    source.buffer = audioBuffers[list];
    source.loop = true;

    // If there's already a gainNode for this list, connect the source to the existing gainNode
    let gainNode;
    if (currentlyPlaying[list].gainNode) {
      gainNode = currentlyPlaying[list].gainNode;
    } else {
      gainNode = context.createGain();
      gainNode.gain.value = 1;
      currentlyPlaying[list].gainNode = gainNode;
    }

    // Connect the source to the EQ and then to the gain node
    if (!eqSettings[list].bass) {
      createEQ(list);
    }

    source.connect(eqSettings[list].bass);
    eqSettings[list].bass.connect(eqSettings[list].mid);
    eqSettings[list].mid.connect(eqSettings[list].treble);
    eqSettings[list].treble.connect(gainNode);
    gainNode.connect(context.destination);

    // If no track has started yet, start this one at time 0
    if (firstStartTime === null) {
      firstStartTime = context.currentTime;
    }

    // Calculate a more precise offset
    const loopDuration = source.buffer.duration;
    let offset = pauseTime[list] % loopDuration;

    // Small delay to ensure buffer preparation
    const startTime = context.currentTime + 0.005;
    source.start(startTime, offset);

    // Reset the pause state
    paused[list] = false;
    pauseTime[list] = 0;
    currentlyPlaying[list].source = source;

    // Store this source in our scheduled sources
    scheduledSources[list] = source;

    // Add event listener for when the source ends
    source.onended = () => {
      if (scheduledSources[list] === source) {
        delete scheduledSources[list];
      }
    };
  }
}

function muteAudio(list) {
  if (currentlyPlaying[list]?.source) {
    if (!isMuted[list]) {
      currentlyPlaying[list].gainNode.gain.value = 0; // Mute the audio
      isMuted[list] = true;
    } else {
      currentlyPlaying[list].gainNode.gain.value = 1; // Unmute the audio
      isMuted[list] = false;
    }
  }
}

// SOLO

// Global audio player object
let audioPlayer = null;

function playSolo(event) {
  event.preventDefault();
  event.stopPropagation();

  // Stop the current audio if it is playing
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  }

  if (!isSolo) {
    isSolo = true;
    // Pause all tracks
    pauseAudio("rhythm");
    pauseAudio("bass");
    pauseAudio("percussion");
    pauseAudio("synth");
    // Get the container element and its data
    let container = $(event.currentTarget).closest(".draggableContainer");
    let audioSource = container.attr("data-audio");
    // Create a new audio player and start playing the audio
    audioPlayer = new Audio(audioSource);
    audioPlayer.play();

    // Remove any existing audio controls
    $("#audio_controls").empty();
    // Add new controls to the audio_controls div if needed
  } else {
    isSolo = false;
    // Clear the audio player
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
      audioPlayer = null;
    }
    $("#audio_controls").empty();

    // Resume all tracks
    resumeAudio("rhythm");
    resumeAudio("bass");
    resumeAudio("percussion");
    resumeAudio("synth");
  }
}

function muteTheAudio(event) {
  event.preventDefault();
  event.stopPropagation();

  // Get the container element and its data
  let container = $(event.currentTarget).closest(".draggableContainer");
  let list = container.attr("data-list");

  // Call the muteAudio function with the list value
  muteAudio(list);
}

function stopTheAudio() {
  // Stop all tracks
  stopAudio("rhythm");
  stopAudio("bass");
  stopAudio("percussion");
  stopAudio("synth");
  // Reset firstStartTime
  firstStartTime = null;

  // Reset but don't stop the visualization
  // This will show the idle pulsing circle
  const canvas = document.getElementById("visualizer");
  if (canvas) {
    const canvasCtx = canvas.getContext("2d");
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function createEQ(list) {
  const bass = context.createBiquadFilter();
  const mid = context.createBiquadFilter();
  const treble = context.createBiquadFilter();

  bass.type = "lowshelf";
  bass.frequency.value = 100;

  mid.type = "peaking";
  mid.frequency.value = 1000;

  treble.type = "highshelf";
  treble.frequency.value = 5000;

  eqSettings[list].bass = bass;
  eqSettings[list].mid = mid;
  eqSettings[list].treble = treble;
}

function setEQValues(list, bassGain, midGain, trebleGain) {
  eqSettings[list].bass.gain.value = bassGain;
  eqSettings[list].mid.gain.value = midGain;
  eqSettings[list].treble.gain.value = trebleGain;
}

// Add event listeners for each slider

document.getElementById("bass").addEventListener("input", function (event) {
  const value = parseFloat(event.target.value);
  document.getElementById("bassValue").textContent = `${value} dB`;

  // Adjust the EQ for each list
  ["rhythm", "bass", "percussion", "synth"].forEach((list) => {
    if (eqSettings[list].bass) {
      eqSettings[list].bass.gain.value = value;
    }
  });
});

document.getElementById("mid").addEventListener("input", function (event) {
  const value = parseFloat(event.target.value);
  document.getElementById("midValue").textContent = `${value} dB`;

  // Adjust the EQ for each list
  ["rhythm", "bass", "percussion", "synth"].forEach((list) => {
    if (eqSettings[list].mid) {
      eqSettings[list].mid.gain.value = value;
    }
  });
});

document.getElementById("treble").addEventListener("input", function (event) {
  const value = parseFloat(event.target.value);
  document.getElementById("trebleValue").textContent = `${value} dB`;

  // Adjust the EQ for each list
  ["rhythm", "bass", "percussion", "synth"].forEach((list) => {
    if (eqSettings[list].treble) {
      eqSettings[list].treble.gain.value = value;
    }
  });
});

document.getElementById("showModalBtn").addEventListener("click", function () {
  document.getElementById("myModal").style.display = "block";
});

document.getElementById("closeModalBtn").addEventListener("click", function () {
  document.getElementById("myModal").style.display = "none";
});

// Check if the audio context gets suspended and resume it
setInterval(() => {
  if (context.state === "suspended") {
    context.resume().then(() => {
      console.log("AudioContext resumed successfully");
    });
  }
}, 1000); // Check every second

// Initialize the audio visualization
function initializeVisualization() {
  if (!masterAnalyser) {
    masterAnalyser = context.createAnalyser();
    masterAnalyser.fftSize = 256;
    masterAnalyser.connect(context.destination);
  }

  // Get the canvas and context
  const canvas = document.getElementById("visualizer");
  if (!canvas) return;

  // Set canvas size to match parent container
  resizeCanvas(canvas);

  const canvasCtx = canvas.getContext("2d");
  const bufferLength = masterAnalyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  // Start animation loop if not already running
  if (!visualizationActive) {
    visualizationActive = true;
    animateVisualization(canvasCtx, canvas, dataArray, bufferLength);
  }
}

// Function to resize canvas
function resizeCanvas(canvas) {
  const dropZone = document.getElementById("drop_zone");
  if (!dropZone || !canvas) return;

  const size = Math.min(dropZone.offsetWidth, dropZone.offsetHeight);
  canvas.width = size - 5; // Subtract a little for padding
  canvas.height = size - 5;
}

// Add resize event listener
window.addEventListener("resize", function () {
  const canvas = document.getElementById("visualizer");
  if (canvas) {
    resizeCanvas(canvas);
  }
});

// Animation function for the visualization
function animateVisualization(canvasCtx, canvas, dataArray, bufferLength) {
  // Check if any tracks are playing
  const isPlaying = Object.values(currentlyPlaying).some(
    (item) => item.source !== null
  );

  // If nothing is playing, draw a static circle
  if (!isPlaying) {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw pulsing circle
    const time = Date.now() / 1000;
    const pulse = Math.sin(time * 2) * 0.1 + 0.9; // Value between 0.8 and 1.0

    canvasCtx.beginPath();
    canvasCtx.arc(
      canvas.width / 2,
      canvas.height / 2,
      (canvas.width / 2 - 10) * pulse,
      0,
      2 * Math.PI,
      false
    );
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = "rgba(103, 103, 222, 0.5)";
    canvasCtx.stroke();

    animationFrameId = requestAnimationFrame(() =>
      animateVisualization(canvasCtx, canvas, dataArray, bufferLength)
    );
    return;
  }

  // Get frequency data
  masterAnalyser.getByteFrequencyData(dataArray);

  // Clear the canvas
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw circular visualizer
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 10;

  canvasCtx.beginPath();
  canvasCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
  canvasCtx.lineWidth = 1;
  canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  canvasCtx.stroke();

  // Draw frequency bars in circular pattern
  const barCount = bufferLength / 2;

  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * 2 * Math.PI;
    const amplitude = dataArray[i] / 255; // Normalize to 0-1

    // Calculate start and end points
    const innerRadius = radius * 0.3; // Inner limit for bars
    const outerRadius = innerRadius + (radius - innerRadius) * amplitude;

    const startX = centerX + innerRadius * Math.cos(angle);
    const startY = centerY + innerRadius * Math.sin(angle);
    const endX = centerX + outerRadius * Math.cos(angle);
    const endY = centerY + outerRadius * Math.sin(angle);

    // Draw the line
    canvasCtx.beginPath();
    canvasCtx.moveTo(startX, startY);
    canvasCtx.lineTo(endX, endY);
    canvasCtx.lineWidth = 2;

    // Create color gradient based on frequency
    const hue = (i / barCount) * 240; // from blue to purple
    canvasCtx.strokeStyle = `hsla(${hue}, 80%, 60%, ${0.5 + amplitude * 0.5})`;
    canvasCtx.stroke();
  }

  // Continue animation loop
  animationFrameId = requestAnimationFrame(() =>
    animateVisualization(canvasCtx, canvas, dataArray, bufferLength)
  );
}

// Stop visualization
function stopVisualization() {
  visualizationActive = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// Initialize visualization on page load
$(document).ready(function () {
  initializeVisualization();
});
