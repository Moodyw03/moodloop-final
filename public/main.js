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

// Initialize Web Audio API with proper settings for best performance
function initAudio() {
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
      context.resume().catch((e) => console.log("Error resuming context:", e));
    }
  }, 500);
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
  try {
    let response = await fetch(url);
    let arrayBuffer = await response.arrayBuffer();

    // Use promise for decoding to handle errors better
    let audioData = await new Promise((resolve, reject) => {
      context.decodeAudioData(arrayBuffer, resolve, reject);
    });

    audioBuffers[list] = audioData;
    currentListOfAudioInDZ[list] = url;

    // Remove the "selected" class from all files in this category
    $(`.draggableContainer[data-list='${list}']`).removeClass("selected");

    // Add the "selected" class to the selected file
    const fileContainer = $(`div[data-audio='${url}']`);
    fileContainer.addClass("selected");

    // We'll update the highlighting in playAudio function instead of here

    return true;
  } catch (error) {
    console.error("Error loading audio:", error);
    return false;
  }
}

function playAudio(list) {
  // If we don't have a buffer yet, exit
  if (!audioBuffers[list]) {
    console.error("No audio buffer found for", list);
    return;
  }

  // Highlight the file name when playing starts
  updateFileHighlight(list, true);

  // Make sure context is running
  if (context.state !== "running") {
    console.log("Resuming audio context...");
    context.resume().catch((e) => console.error("Error resuming context:", e));
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

  // Set the global start time if not set
  if (firstStartTime === null) {
    firstStartTime = context.currentTime;
    console.log("Set first start time to", firstStartTime);
  }

  try {
    // Try the crossfade approach first
    scheduleBufferWithCrossfade(list, gainNode);

    // Connect to analyzer for visualization if exists
    if (!masterAnalyser) {
      initializeVisualization();
    }
  } catch (error) {
    console.error("Error in playAudio:", error);
    // If crossfade fails, fall back to simple looping
    fallbackPlayAudio(list, gainNode);
  }
}

// Schedule a single segment with proper crossfading
function scheduleSegment(list, gainNode, startTime, offset, duration) {
  const buffer = audioBuffers[list];
  if (!buffer) return;

  try {
    // Create source for this segment
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = false; // We handle looping manually

    // Create individual gain node for this segment for crossfading
    const segmentGain = context.createGain();
    segmentGain.gain.setValueAtTime(1, startTime);

    // Connect source -> segment gain -> EQ chain -> main gain -> output
    source.connect(segmentGain);
    segmentGain.connect(eqSettings[list].bass);
    eqSettings[list].bass.connect(eqSettings[list].mid);
    eqSettings[list].mid.connect(eqSettings[list].treble);
    eqSettings[list].treble.connect(gainNode);

    // Make sure gain node is connected to outputs
    gainNode.connect(masterAnalyser || context.destination);
    gainNode.connect(masterGainNode);

    // Start the source at the specified time and offset
    // Make sure duration is positive and valid
    const validDuration = Math.min(
      duration + CROSSFADE_DURATION,
      buffer.duration
    );
    if (validDuration <= 0) {
      console.error("Invalid duration for audio segment:", validDuration);
      return;
    }

    source.start(startTime, offset, validDuration);
    console.log(
      `Started segment at ${startTime}, offset ${offset}, duration ${validDuration}`
    );

    // Store the current active source
    currentlyPlaying[list].source = source;

    // Calculate next segment start time (with overlap for crossfade)
    const nextSegmentStartTime = startTime + duration - CROSSFADE_DURATION;

    // Apply crossfade - fade out current segment at crossfade point
    segmentGain.gain.setValueAtTime(1, nextSegmentStartTime);
    segmentGain.gain.linearRampToValueAtTime(
      0,
      nextSegmentStartTime + CROSSFADE_DURATION
    );

    // Schedule the next segment to start at the crossfade point
    // Only schedule if we're not stopping
    setTimeout(() => {
      // Check if we're still meant to be playing
      if (currentlyPlaying[list].source === source) {
        scheduleSegment(
          list,
          gainNode,
          nextSegmentStartTime,
          0,
          buffer.duration
        );
      }
    }, Math.max(0, (nextSegmentStartTime - context.currentTime - 0.1) * 1000));
  } catch (error) {
    console.error("Error scheduling audio segment:", error);

    // Fallback to simpler playback method if crossfade fails
    fallbackPlayAudio(list, gainNode);
  }
}

// Add a fallback playback method that uses simpler looping
function fallbackPlayAudio(list, gainNode) {
  console.log("Using fallback audio playback for", list);
  try {
    const buffer = audioBuffers[list];
    if (!buffer) return;

    // Create a simple looping source as fallback
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Make simple connections
    source.connect(eqSettings[list].bass);
    eqSettings[list].bass.connect(eqSettings[list].mid);
    eqSettings[list].mid.connect(eqSettings[list].treble);
    eqSettings[list].treble.connect(gainNode);

    // Connect gain to outputs
    gainNode.connect(masterAnalyser || context.destination);
    gainNode.connect(masterGainNode);

    // Start with simple offset if we have a global start time
    let offset = 0;
    if (firstStartTime !== null) {
      offset = (context.currentTime - firstStartTime) % buffer.duration;
    }

    source.start(0, offset);
    currentlyPlaying[list].source = source;
    currentlyPlaying[list].gainNode = gainNode;

    console.log("Fallback audio started successfully");
  } catch (error) {
    console.error("Fallback audio also failed:", error);
  }
}

// New function to schedule audio buffer with crossfading at loop points
function scheduleBufferWithCrossfade(list, gainNode) {
  const buffer = audioBuffers[list];
  if (!buffer) return;

  try {
    const loopDuration = buffer.duration;
    const currentTime = context.currentTime;

    // Calculate initial offset based on global start time
    let offset = 0;
    if (firstStartTime !== null) {
      const timeSinceStart = currentTime - firstStartTime;
      offset = timeSinceStart % loopDuration;
    }

    // Start time with a small delay for buffer preparation
    const startTime = currentTime + 0.05;

    // Schedule first buffer segment
    scheduleSegment(list, gainNode, startTime, offset, loopDuration - offset);

    // Store references
    currentlyPlaying[list].gainNode = gainNode;

    // Ensure gain node is connected to output
    gainNode.connect(masterAnalyser || context.destination);
    gainNode.connect(masterGainNode);
  } catch (error) {
    console.error("Error in scheduleBufferWithCrossfade:", error);
    fallbackPlayAudio(list, gainNode);
  }
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

  // Clear the scheduled sources array
  if (scheduledSources[list]) {
    scheduledSources[list] = [];
  }
}

function pauseAudio(list) {
  // Check if the audio is playing and if source exists
  if (currentlyPlaying[list] && currentlyPlaying[list].source) {
    // Remove the highlight when paused
    updateFileHighlight(list, false);

    // If the audio is playing, stop it and remember the time it was paused
    paused[list] = true;
    pauseTime[list] = context.currentTime - firstStartTime;
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

    // If no track has started yet, start this one at time 0
    if (firstStartTime === null) {
      firstStartTime = context.currentTime;
    }

    // Calculate precise offset from pause time
    const offset = pauseTime[list] % audioBuffers[list].duration;

    // Schedule with proper crossfade
    const startTime = context.currentTime + 0.05;
    scheduleSegment(
      list,
      gainNode,
      startTime,
      offset,
      audioBuffers[list].duration - offset
    );

    // Reset the pause state
    paused[list] = false;
    pauseTime[list] = 0;
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
