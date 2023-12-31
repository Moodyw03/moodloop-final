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


function unlockAudioContext(audioContext) {
    if (audioContext.state === 'suspended' && 'ontouchstart' in window) {
        const unlock = async () => {
            await audioContext.resume();

            document.body.removeEventListener('touchstart', unlock);
            document.body.removeEventListener('touchend', unlock);
        };

        document.body.addEventListener('touchstart', unlock, false);
        document.body.addEventListener('touchend', unlock, false);
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

    // let gainNode = context.createGain(); // Create a gain node
    let gainNode;
    if (currentlyPlaying[list].gainNode) {
        gainNode = currentlyPlaying[list].gainNode;
    } else {
        gainNode = context.createGain();
        gainNode.gain.value = 1;  // Set the initial gain value to 1.
    }

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
function pauseAudio(list) {
    // Check if the audio is playing and if source exists
    if (currentlyPlaying[list] && currentlyPlaying[list].source) {
        // If the audio is playing, stop it and remember the time it was paused
        paused[list] = true;
        pauseTime[list] = context.currentTime - firstStartTime;
        currentlyPlaying[list].source.stop();
        currentlyPlaying[list].source = null; // Here set the source to null instead of the entire object
    }
}
function stopAudio(list) {
    // Check if the audio is playing and if source exists
    if (currentlyPlaying[list] && currentlyPlaying[list].source) {
        currentlyPlaying[list].source.stop();
        currentlyPlaying[list].source = null; // Here set the source to null instead of the entire object
    }
}
function resumeAudio(list) {
    if (paused[list]) {
        // If the audio is paused, start it from the pause time
        let source = context.createBufferSource();
        source.buffer = audioBuffers[list];
        source.loop = true;

        // If there's already a gainNode for this list, connect the source to the existing gainNode
        if (currentlyPlaying[list].gainNode) {
            source.connect(currentlyPlaying[list].gainNode);
        } else {
            // Otherwise, create a new gainNode and connect the source to it
            let gainNode = context.createGain();
            source.connect(gainNode);
            gainNode.connect(context.destination);
            currentlyPlaying[list].gainNode = gainNode;
        }
        // If no track has started yet, start this one at time 0
        if (firstStartTime === null) {
            firstStartTime = context.currentTime;
        }
        // Calculate the offset based on the pause time and the first start time
        let offset = pauseTime[list] - (firstStartTime - context.currentTime);

        // Start the audio from the pause time
        source.start(0, offset);

        // Reset the pause state
        paused[list] = false;
        pauseTime[list] = 0;
        currentlyPlaying[list].source = source;
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
    // Stop the current audio if it is playing
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
    if (!isSolo) {
        isSolo = true;
        // Pause the dropzone
        pauseAudio("rhythm");
        pauseAudio("bass");
        pauseAudio("percussion");
        pauseAudio("synth");
        // Get the container element and its data
        let container = $(event.target).closest(".draggableContainer");
        let audioSource = container.attr("data-audio");
        // Create a new audio player and start playing the audio
        audioPlayer = new Audio(audioSource);
        audioPlayer.play();

        // Remove any existing audio controls
        $("#audio_controls").empty();
        // Add new controls to the audio_controls div
        let controlsHtml = ``;
        $("#audio_controls").append(controlsHtml);
    } else {
        isSolo = false;
        // Pause the dropzone
        $("#audio_controls").empty();

        resumeAudio("rhythm");
        resumeAudio("bass");
        resumeAudio("percussion");
        resumeAudio("synth");
    }
}


function muteTheAudio(event) {
    // Get the container element and its data
    let container = $(event.target).closest(".draggableContainer");
    let list = container.attr("data-list");

    // Call the muteAudio function with the list value
    muteAudio(list);
}
function stopTheAudio() {
    // Call the stopAudio function with the list value
    stopAudio("rhythm");
    stopAudio("bass");
    stopAudio("percussion");
    stopAudio("synth");
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

document.getElementById('showModalBtn').addEventListener('click', function () {
    document.getElementById('myModal').style.display = 'block';
});

document.getElementById('closeModalBtn').addEventListener('click', function () {
    document.getElementById('myModal').style.display = 'none';
});

