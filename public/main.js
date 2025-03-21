let context = new AudioContext();
let scheduledSources = {}; // Track scheduled audio sources

// Add analyzer for visualization
let masterAnalyser = null;
let visualizationActive = false;
let animationFrameId = null;

// Improved scheduling constants for better performance
const BUFFER_REDUNDANCY = 3; // Schedule multiple buffers ahead
const SCHEDULE_AHEAD_TIME = 0.3; // Schedule 300ms ahead
const UPDATE_INTERVAL = 100; // Update scheduler every 100ms
const CROSSFADE_DURATION = 0.05; // 50ms crossfade at loop points

// Add BPM and timing variables for precise sync
let bpm = 120; // Default BPM, can be updated based on actual files
let beatsPerBar = 4; // Assuming 4/4 time signature
let barsPerLoop = 4; // Assuming 4 bar loops
let beatLengthSeconds = 60 / bpm;
let barLengthSeconds = beatsPerBar * beatLengthSeconds;
let loopLengthSeconds = barsPerLoop * barLengthSeconds;

// Create a master gain node for better audio handling
let masterGainNode = context.createGain();
masterGainNode.gain.value = 1;
masterGainNode.connect(context.destination);

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

// Add scheduler variables
let schedulerTimerID = null;

// Add a master scheduler object
let masterScheduler = {
  nextNoteTime: 0,
  currentBar: 0,
  lookahead: 0.1, // Look ahead 100ms
  scheduleInterval: null,
};

// Initialize Web Audio API with proper settings for best performance
function initAudio() {
  try {
    // Create a new AudioContext with larger buffer size for stability
    context = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "playback",
      sampleRate: 44100,
    });

    // Create master gain node
    masterGainNode = context.createGain();
    masterGainNode.gain.value = 1;
    masterGainNode.connect(context.destination);

    // Ensure audio context is running
    unlockAudioContext(context);

    // Setup periodic check to ensure audio context stays running
    setInterval(() => {
      if (context.state !== "running") {
        context
          .resume()
          .catch((e) => console.log("Error resuming context:", e));
      }
    }, 500);

    console.log("Audio system initialized successfully");
  } catch (error) {
    console.error("Error initializing audio system:", error);
  }
}

function unlockAudioContext(audioContext) {
  const resumeContext = async () => {
    if (audioContext.state !== "running") {
      try {
        await audioContext.resume();
        console.log("AudioContext is now running");
      } catch (e) {
        console.error("Failed to resume AudioContext:", e);
      }
    }
  };

  // Call immediately
  resumeContext();

  // Also set up events to unlock audio
  const events = ["touchstart", "touchend", "mousedown", "keydown", "click"];
  const unlockOnEvent = async () => {
    await resumeContext();
    events.forEach((event) => {
      document.body.removeEventListener(event, unlockOnEvent);
    });
    console.log("Audio context unlocked by user interaction");
  };

  events.forEach((event) => {
    document.body.addEventListener(event, unlockOnEvent, false);
  });
}

// Call initAudio instead of just unlocking
initAudio();

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

  // Handle clicks on audio files more reliably
  handleAudioSelection(data.src, data.list);
}

// New consolidated function to handle audio selection from both drop and click
async function handleAudioSelection(file, list) {
  try {
    console.log(`Loading audio: ${file} for track: ${list}`);

    // If there's currently playing audio for this track, stop it first
    if (currentlyPlaying[list].source) {
      try {
        currentlyPlaying[list].source.stop();
        currentlyPlaying[list].source = null;
      } catch (e) {
        console.log("Error stopping previous source:", e);
      }
    }

    // Ensure audio context is running before proceeding
    if (context.state !== "running") {
      await context.resume();
      console.log("Audio context resumed");
    }

    // Load the audio file
    const loadSuccess = await loadAudio(file, list);

    if (loadSuccess) {
      // Short timeout to ensure everything is ready
      setTimeout(() => {
        playAudio(list);
        console.log(`Successfully started playback for ${list}`);
      }, 50);
    } else {
      console.error(`Failed to load audio for ${list}`);
      // Optionally add retry logic here
    }
  } catch (error) {
    console.error("Error in handleAudioSelection:", error);
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

    try {
      var data = JSON.parse(e.originalEvent.dataTransfer.getData("text"));
      var file = data.src;
      list = data.list;

      if (file) {
        handleAudioSelection(file, list);
      }
    } catch (error) {
      console.error("Error in drop event:", error);
    }
  });
});

async function loadAudio(url, list) {
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {
      console.log(
        `Attempting to load audio (attempt ${retryCount + 1}): ${url}`
      );

      // Ensure audio context is running
      if (context.state !== "running") {
        await context.resume();
      }

      let response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch: ${response.status} ${response.statusText}`
        );
      }

      let arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error("Received empty array buffer");
      }

      // Use promise for decoding to handle errors better
      let audioData = await new Promise((resolve, reject) => {
        context.decodeAudioData(arrayBuffer, resolve, (err) =>
          reject(
            new Error(`Decoding error: ${err?.message || "Unknown error"}`)
          )
        );
      });

      // Check for valid audio data
      if (!audioData || audioData.duration === 0) {
        throw new Error("Invalid audio data (zero duration)");
      }

      // Check for silence at the beginning or end of the buffer
      checkForSilence(audioData);

      // Update BPM if this is the first track loaded
      if (Object.values(audioBuffers).filter(Boolean).length === 0) {
        updateBPMFromBuffer(audioData);
      }

      audioBuffers[list] = audioData;
      currentListOfAudioInDZ[list] = url;

      // Remove the "selected" class from all files in this category
      $(`.draggableContainer[data-list='${list}']`).removeClass("selected");

      // Add the "selected" class to the selected file
      const fileContainer = $(`div[data-audio='${url}']`);
      fileContainer.addClass("selected");

      console.log(`Successfully loaded audio for ${list}`);
      return true;
    } catch (error) {
      console.error(`Error loading audio (attempt ${retryCount + 1}):`, error);
      retryCount++;

      if (retryCount > maxRetries) {
        console.error(
          `Failed to load audio after ${maxRetries} attempts:`,
          error
        );
        return false;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return false;
}

function playAudio(list) {
  try {
    // If we don't have a buffer yet, exit
    if (!audioBuffers[list]) {
      console.error("No audio buffer found for", list);
      return;
    }

    console.log(
      `Starting playback for ${list} (buffer duration: ${audioBuffers[
        list
      ].duration.toFixed(3)}s)`
    );

    // Highlight the file name when playing starts
    updateFileHighlight(list, true);

    // Make sure context is running
    if (context.state !== "running") {
      console.log("Resuming audio context...");
      context
        .resume()
        .catch((e) => console.error("Error resuming context:", e));
    }

    // If there was a previous source, stop it properly
    if (currentlyPlaying[list].source) {
      try {
        currentlyPlaying[list].source.stop();
      } catch (e) {
        console.log("Error stopping previous source:", e);
      }
      currentlyPlaying[list].source = null;
    }

    // Create and set up gain node if it doesn't exist
    let gainNode;
    if (currentlyPlaying[list].gainNode) {
      gainNode = currentlyPlaying[list].gainNode;
      // Reset any scheduled values
      gainNode.gain.cancelScheduledValues(context.currentTime);
      gainNode.gain.setValueAtTime(isMuted[list] ? 0 : 1, context.currentTime);
    } else {
      gainNode = context.createGain();
      gainNode.gain.value = isMuted[list] ? 0 : 1;
    }

    // Check if the EQ settings for this list exist and create if needed
    if (!eqSettings[list].bass) {
      createEQ(list);
    }

    // If no audio is playing yet, start the master scheduler
    if (firstStartTime === null) {
      startMasterScheduler();
      console.log("Master scheduler started at time:", context.currentTime);
    }

    // Store the gain node reference
    currentlyPlaying[list].gainNode = gainNode;

    // Connect to analyzer for visualization if exists
    if (!masterAnalyser) {
      initializeVisualization();
    }

    // Calculate current position in the loop
    let currentLoopPosition = 0;
    if (firstStartTime !== null) {
      const elapsedTime = context.currentTime - firstStartTime;
      currentLoopPosition = elapsedTime % loopLengthSeconds;
      console.log(`Current loop position: ${currentLoopPosition.toFixed(3)}s`);
    }

    // Calculate the next exact bar boundary to start playback
    // Add a small scheduling delay (5ms) for better reliability
    const schedulingDelay = 0.005;
    const timeToNextBar =
      barLengthSeconds - (currentLoopPosition % barLengthSeconds);
    const startTime = context.currentTime + timeToNextBar + schedulingDelay;

    // Schedule the audio to start exactly on the bar boundary
    const source = context.createBufferSource();
    source.buffer = audioBuffers[list];

    // Make sure we have a valid buffer
    if (!source.buffer) {
      throw new Error(`Buffer for ${list} is invalid`);
    }

    // Connect the source to the audio chain
    if (eqSettings[list].bass) {
      source.connect(eqSettings[list].bass);
      eqSettings[list].bass.connect(eqSettings[list].mid);
      eqSettings[list].mid.connect(eqSettings[list].treble);
      eqSettings[list].treble.connect(gainNode);
    } else {
      source.connect(gainNode);
    }

    // Connect gain node to outputs
    gainNode.connect(masterAnalyser || context.destination);
    gainNode.connect(masterGainNode);

    // Calculate the exact offset in the buffer to start playback
    const startOffset =
      (currentLoopPosition + timeToNextBar) % loopLengthSeconds;

    // Start the source at the calculated time and offset
    source.start(startTime, startOffset);

    console.log(
      `Started ${list} at time ${startTime.toFixed(
        3
      )}, offset ${startOffset.toFixed(3)}`
    );

    // Store the source reference
    currentlyPlaying[list].source = source;

    // Monitor for errors - if source ends unexpectedly, restart it
    source.onended = (event) => {
      // Only handle unexpected endings (not when stop() was called)
      if (currentlyPlaying[list].source === source) {
        console.log(`Source for ${list} ended unexpectedly, restarting`);
        // Give a short delay before restarting
        setTimeout(() => {
          if (currentlyPlaying[list].source === source) {
            currentlyPlaying[list].source = null;
            playAudio(list);
          }
        }, 100);
      }
    };
  } catch (error) {
    console.error("Error in playAudio:", error);
  }
}

function resumeAudio(list) {
  if (paused[list] && audioBuffers[list]) {
    // Add highlight when resuming
    updateFileHighlight(list, true);

    // Create and set up gain node if it doesn't exist
    let gainNode;
    if (currentlyPlaying[list].gainNode) {
      gainNode = currentlyPlaying[list].gainNode;
      // Reset gain to avoid any leftover fade-outs
      gainNode.gain.cancelScheduledValues(context.currentTime);
      gainNode.gain.setValueAtTime(isMuted[list] ? 0 : 1, context.currentTime);
    } else {
      gainNode = context.createGain();
      gainNode.gain.value = isMuted[list] ? 0 : 1;
      currentlyPlaying[list].gainNode = gainNode;
    }

    // Connect gain node to outputs
    gainNode.connect(masterAnalyser || context.destination);
    gainNode.connect(masterGainNode);

    // Calculate current position in the loop
    let currentLoopPosition = 0;
    if (firstStartTime !== null) {
      const elapsedTime = context.currentTime - firstStartTime;
      currentLoopPosition = elapsedTime % loopLengthSeconds;
    } else {
      // If no track has started yet, start this one at time 0
      startMasterScheduler();
    }

    // Calculate the next exact bar boundary to start playback
    const timeToNextBar =
      barLengthSeconds - (currentLoopPosition % barLengthSeconds);
    const startTime = context.currentTime + timeToNextBar;

    // Schedule the audio to start exactly on the bar boundary
    const source = context.createBufferSource();
    source.buffer = audioBuffers[list];

    // Connect the source to the audio chain
    if (eqSettings[list].bass) {
      source.connect(eqSettings[list].bass);
      eqSettings[list].bass.connect(eqSettings[list].mid);
      eqSettings[list].mid.connect(eqSettings[list].treble);
      eqSettings[list].treble.connect(gainNode);
    } else {
      source.connect(gainNode);
    }

    // Connect gain node to outputs
    gainNode.connect(masterAnalyser || context.destination);
    gainNode.connect(masterGainNode);

    // Calculate the exact offset in the buffer to start playback
    const startOffset =
      (currentLoopPosition + timeToNextBar) % loopLengthSeconds;

    // Start the source at the calculated time and offset
    source.start(startTime, startOffset);

    console.log(`Resumed ${list} at time ${startTime}, offset ${startOffset}`);

    // Store the source reference
    currentlyPlaying[list].source = source;
    currentlyPlaying[list].gainNode = gainNode;

    // Reset pause state
    paused[list] = false;
    pauseTime[list] = 0;
  }
}

function pauseAudio(list) {
  if (currentlyPlaying[list].source) {
    // Store the current playback position for later resume
    paused[list] = true;
    pauseTime[list] =
      (context.currentTime - firstStartTime) % loopLengthSeconds;
    stopAudioSource(list);
  }
}

function stopAudio(list) {
  // Remove highlight when stopping
  updateFileHighlight(list, false);

  // Stop all sources for this track
  stopAudioSource(list);

  // Clear the current audio reference
  currentListOfAudioInDZ[list] = null;
}

// Simplify the stop function to handle our new setup
function stopAudioSource(list) {
  if (currentlyPlaying[list].source) {
    try {
      // Apply fade out to avoid clicks
      const gainNode = currentlyPlaying[list].gainNode;
      if (gainNode) {
        const currentTime = context.currentTime;
        gainNode.gain.cancelScheduledValues(currentTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
        gainNode.gain.linearRampToValueAtTime(0, currentTime + 0.05);
      }

      // Stop the source after a short delay to allow fade out
      setTimeout(() => {
        if (currentlyPlaying[list].source) {
          currentlyPlaying[list].source.stop();
          currentlyPlaying[list].source = null;
        }
      }, 60);
    } catch (e) {
      // Handle already stopped sources
      currentlyPlaying[list].source = null;
    }
  }
}

function muteAudio(list) {
  if (currentlyPlaying[list]?.gainNode) {
    if (!isMuted[list]) {
      // Smoothly transition to muted to avoid clicks
      const gainNode = currentlyPlaying[list].gainNode;
      gainNode.gain.linearRampToValueAtTime(0, context.currentTime + 0.05);
      isMuted[list] = true;
    } else {
      // Smoothly transition back to audible
      const gainNode = currentlyPlaying[list].gainNode;
      gainNode.gain.linearRampToValueAtTime(1, context.currentTime + 0.05);
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

// Initialize the audio visualization
function initializeVisualization() {
  if (!masterAnalyser) {
    masterAnalyser = context.createAnalyser();
    masterAnalyser.fftSize = 512; // Increased for better resolution
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

  // Create particle system for visualization
  const particles = createParticles(canvas.width, canvas.height, 75); // Create 75 particles

  // Start animation loop if not already running
  if (!visualizationActive) {
    visualizationActive = true;
    animateVisualization(canvasCtx, canvas, dataArray, bufferLength, particles);
  }
}

// Create a particle system
function createParticles(width, height, count) {
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 4 + 1,
      color: `hsl(${Math.random() * 360}, 80%, 60%)`,
      velocity: {
        x: Math.random() * 1 - 0.5,
        y: Math.random() * 1 - 0.5,
      },
      amplitude: 0,
    });
  }
  return particles;
}

// Enhanced visualization function
function animateVisualization(
  canvasCtx,
  canvas,
  dataArray,
  bufferLength,
  particles
) {
  // Check if any tracks are playing
  const isPlaying = Object.values(currentlyPlaying).some(
    (item) => item.source !== null
  );

  const time = Date.now() / 1000;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // Clear the canvas with semi-transparent black for motion blur effect
  canvasCtx.fillStyle = "rgba(0, 0, 0, 0.15)";
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  // Different animation when idle vs playing
  if (!isPlaying) {
    // Idle animation with flowing particles only
    updateParticlesIdle(particles, canvas.width, canvas.height, time);
    drawParticles(canvasCtx, particles, time);
  } else {
    try {
      // Active audio visualization
      masterAnalyser.getByteFrequencyData(dataArray);

      // Get amplitude data for different frequency bands
      const bassLevel = getFrequencyBandLevel(dataArray, 0, 5) / 255;
      const midLevel = getFrequencyBandLevel(dataArray, 6, 20) / 255;
      const highLevel = getFrequencyBandLevel(dataArray, 21, 50) / 255;

      // Update and draw particles based on audio
      updateParticles(
        particles,
        canvas.width,
        canvas.height,
        bassLevel,
        midLevel,
        highLevel
      );
      drawParticles(canvasCtx, particles, time);
    } catch (e) {
      console.error("Visualization error:", e);
    }
  }

  // Continue animation loop
  animationFrameId = requestAnimationFrame(() =>
    animateVisualization(canvasCtx, canvas, dataArray, bufferLength, particles)
  );
}

// New function to update particles in idle mode
function updateParticlesIdle(particles, width, height, time) {
  particles.forEach((particle) => {
    // Gentle circular motion
    particle.x += Math.sin(time + particle.radius) * 0.3;
    particle.y += Math.cos(time + particle.radius) * 0.3;

    // Keep particles within bounds
    if (particle.x < 0) particle.x = width;
    if (particle.x > width) particle.x = 0;
    if (particle.y < 0) particle.y = height;
    if (particle.y > height) particle.y = 0;

    // Add a gentle pulsing effect
    particle.radius = 1 + Math.sin(time * 2 + particle.x) * 0.5;
    particle.amplitude = 0.2 + Math.sin(time + particle.y) * 0.1;
  });
}

// Draw idle animation
function drawIdleAnimation(canvasCtx, canvas, time, particles) {
  // Update and draw particles with gentle motion
  updateParticlesIdle(particles, canvas.width, canvas.height, time);
  drawParticles(canvasCtx, particles, time);
}

// Get average level of a frequency band
function getFrequencyBandLevel(dataArray, startBin, endBin) {
  let sum = 0;
  for (let i = startBin; i <= endBin; i++) {
    sum += dataArray[i];
  }
  return sum / (endBin - startBin + 1);
}

// Update particles based on audio
function updateParticles(
  particles,
  width,
  height,
  bassLevel,
  midLevel,
  highLevel
) {
  particles.forEach((particle) => {
    // Bass affects particle size
    particle.radius = particle.radius * 0.95 + (2 + bassLevel * 5) * 0.05;

    // Mids affect particle speed
    const speed = 1 + midLevel * 4;
    particle.x += particle.velocity.x * speed;
    particle.y += particle.velocity.y * speed;

    // High frequencies affect particle direction
    if (Math.random() < highLevel * 0.3) {
      particle.velocity.x = Math.random() * 2 - 1;
      particle.velocity.y = Math.random() * 2 - 1;
    }

    // Keep particles within bounds with wraparound
    if (particle.x < 0) particle.x = width;
    if (particle.x > width) particle.x = 0;
    if (particle.y < 0) particle.y = height;
    if (particle.y > height) particle.y = 0;

    // Store amplitude for drawing
    particle.amplitude = bassLevel * 0.5 + midLevel * 0.3 + highLevel * 0.2;
  });
}

// Draw particles
function drawParticles(canvasCtx, particles, time) {
  particles.forEach((particle) => {
    canvasCtx.beginPath();
    canvasCtx.arc(
      particle.x,
      particle.y,
      particle.radius * 2,
      0,
      Math.PI * 2,
      false
    );

    // Glow effect with just white and blue shades
    const glow = 1 + particle.amplitude * 5;

    // Create gradient for each particle
    const gradient = canvasCtx.createRadialGradient(
      particle.x,
      particle.y,
      0,
      particle.x,
      particle.y,
      particle.radius * 2 * glow
    );

    // Calculate blue intensity based on amplitude
    const blueIntensity = Math.round(180 + particle.amplitude * 75);

    // White core, blue outer glow
    gradient.addColorStop(
      0,
      "rgba(255, 255, 255, " + (0.7 + particle.amplitude * 0.3) + ")"
    );
    gradient.addColorStop(
      0.6,
      "rgba(200, 230, 255, " + (0.3 + particle.amplitude * 0.3) + ")"
    );
    gradient.addColorStop(
      1,
      "rgba(70, 130, " +
        blueIntensity +
        ", " +
        (0.1 + particle.amplitude * 0.2) +
        ")"
    );

    canvasCtx.fillStyle = gradient;
    canvasCtx.fill();
  });
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

  // Apply highlight to any already selected files
  Object.entries(currentListOfAudioInDZ).forEach(([list, url]) => {
    if (url) {
      const fileContainer = $(`div[data-audio='${url}']`);
      fileContainer.addClass("selected");

      // Add yellow highlight to the file name
      const fileName = fileContainer.find(".fileName");
      if (fileName.length) {
        fileName.css("color", "#FFD700"); // Golden yellow color
        fileName.css("font-weight", "bold");
      }
    }
  });
});

// New function to update file highlighting based on playback status
function updateFileHighlight(list, isPlaying) {
  // First, reset all file highlights in this category
  $(`.draggableContainer[data-list='${list}'] .fileName`).each(function () {
    $(this).css("color", "");
    $(this).css("font-weight", "");
  });

  // Only highlight the current file if it's playing
  if (isPlaying && currentListOfAudioInDZ[list]) {
    const fileContainer = $(
      `div[data-audio='${currentListOfAudioInDZ[list]}']`
    );
    const fileName = fileContainer.find(".fileName");

    if (fileName.length) {
      fileName.css("color", "#FFD700"); // Golden yellow color
      fileName.css("font-weight", "bold");
    }
  }
}

// Update BPM based on buffer duration to ensure perfect loops
function updateBPMFromBuffer(buffer) {
  // Assuming samples are exactly one, two, or four bars
  // Calculate BPM based on buffer duration for precise timing
  const possibleBarCounts = [1, 2, 4, 8, 16];

  // If we don't have any active tracks yet, calculate BPM from the first track
  if (firstStartTime === null) {
    // Try to find the best match for number of bars
    let bestMatch = {
      barCount: 4, // Default to 4 bars if we can't determine
      bpm: 120, // Default BPM
    };

    let smallestError = Infinity;

    for (const barCount of possibleBarCounts) {
      // Calculate what the BPM would be if the buffer contained this many bars
      const calculatedBPM = (barCount * beatsPerBar * 60) / buffer.duration;

      // Round to nearest whole BPM as most music uses whole number BPMs
      const roundedBPM = Math.round(calculatedBPM);

      // Calculate the expected duration with this BPM and bar count
      const expectedDuration = (barCount * beatsPerBar * 60) / roundedBPM;

      // Calculate error between expected and actual duration
      const error = Math.abs(expectedDuration - buffer.duration);

      if (error < smallestError) {
        smallestError = error;
        bestMatch = {
          barCount: barCount,
          bpm: roundedBPM,
        };
      }
    }

    // Update the global timing variables
    bpm = bestMatch.bpm;
    barsPerLoop = bestMatch.barCount;
    beatLengthSeconds = 60 / bpm;
    barLengthSeconds = beatsPerBar * beatLengthSeconds;
    loopLengthSeconds = barsPerLoop * barLengthSeconds;

    console.log(
      `Estimated BPM: ${bpm}, Bars per loop: ${barsPerLoop}, Loop length: ${loopLengthSeconds.toFixed(
        3
      )}s`
    );
  }

  // Verify the buffer duration matches our calculated loop length
  const durationError = Math.abs(buffer.duration - loopLengthSeconds);

  if (durationError > 0.01) {
    console.warn(
      `Buffer duration (${buffer.duration.toFixed(
        3
      )}s) doesn't exactly match calculated loop length (${loopLengthSeconds.toFixed(
        3
      )}s). Difference: ${durationError.toFixed(3)}s`
    );
  }

  return {
    bpm,
    barsPerLoop,
    loopLengthSeconds,
  };
}

// Start the master scheduler
function startMasterScheduler() {
  if (masterScheduler.scheduleInterval !== null) {
    return; // Already running
  }

  masterScheduler.nextNoteTime = context.currentTime;
  masterScheduler.currentBar = 0;

  // Set the global start time to the beginning of the next bar
  firstStartTime = masterScheduler.nextNoteTime;

  masterScheduler.scheduleInterval = setInterval(() => {
    scheduleNextBar();
  }, masterScheduler.lookahead * 1000);
}

// Schedule the next bar of audio
function scheduleNextBar() {
  const currentTime = context.currentTime;

  // Schedule up to 1 bar ahead
  if (masterScheduler.nextNoteTime < currentTime + 1) {
    // Increment bar counter
    masterScheduler.currentBar++;

    // Calculate next bar time
    masterScheduler.nextNoteTime += barLengthSeconds;

    // Notify all loops that a new bar is starting
    Object.keys(currentlyPlaying).forEach((list) => {
      if (currentlyPlaying[list].source !== null) {
        // If we're at the end of a loop, start a new one
        if (masterScheduler.currentBar % barsPerLoop === 0) {
          scheduleNextLoop(list, masterScheduler.nextNoteTime);
        }
      }
    });
  }
}

// Schedule the next loop iteration for a specific track
function scheduleNextLoop(list, startTime) {
  if (!audioBuffers[list]) return;

  try {
    // Create new source for this loop
    const source = context.createBufferSource();
    source.buffer = audioBuffers[list];

    // Get the gain node for this track
    const gainNode = currentlyPlaying[list].gainNode;

    // Connect the source to the audio chain
    if (eqSettings[list].bass) {
      source.connect(eqSettings[list].bass);
      eqSettings[list].bass.connect(eqSettings[list].mid);
      eqSettings[list].mid.connect(eqSettings[list].treble);
      eqSettings[list].treble.connect(gainNode);
    } else {
      source.connect(gainNode);
    }

    // Make sure gain node is connected to outputs
    gainNode.connect(masterAnalyser || context.destination);
    gainNode.connect(masterGainNode);

    // Start the source exactly at the calculated time
    source.start(startTime);

    console.log(`Scheduled loop for ${list} at time ${startTime}`);

    // Store as current source for this track
    const previousSource = currentlyPlaying[list].source;
    currentlyPlaying[list].source = source;

    // Schedule the previous source to stop shortly after the new one starts
    if (previousSource) {
      previousSource.stop(startTime + 0.01);
    }
  } catch (error) {
    console.error("Error scheduling next loop:", error);
  }
}

// Check for silence at beginning or end of audio buffer
function checkForSilence(buffer) {
  const threshold = 0.01; // Silence threshold
  const checkDuration = 0.01; // Check 10ms at beginning and end

  const numSamplesToCheck = Math.floor(checkDuration * buffer.sampleRate);

  // Check beginning
  let startSilence = true;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < numSamplesToCheck && i < channelData.length; i++) {
      if (Math.abs(channelData[i]) > threshold) {
        startSilence = false;
        break;
      }
    }
    if (!startSilence) break;
  }

  // Check end
  let endSilence = true;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (
      let i = channelData.length - numSamplesToCheck;
      i < channelData.length;
      i++
    ) {
      if (Math.abs(channelData[i]) > threshold) {
        endSilence = false;
        break;
      }
    }
    if (!endSilence) break;
  }

  if (startSilence) {
    console.warn(
      "Detected silence at the beginning of the audio buffer. This may affect sync."
    );
  }

  if (endSilence) {
    console.warn(
      "Detected silence at the end of the audio buffer. This may affect sync."
    );
  }
}
