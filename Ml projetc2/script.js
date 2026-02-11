document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Recording UI Elements
  const recordBtn = document.getElementById('record-btn');
  const recordingActions = document.getElementById('recording-actions');
  const stopBtn = document.getElementById('stop-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const analyzeBtn = document.getElementById('analyze-btn');

  const timerDisplay = document.getElementById('timer');
  const statusText = document.getElementById('status-text');
  const waveformCanvas = document.getElementById('waveform');

  // Stats Elements
  const totalScansEl = document.getElementById('total-scans');
  const avgConfidenceEl = document.getElementById('avg-confidence');
  const historyList = document.getElementById('history-list');

  // Modal Elements
  const resultModal = document.getElementById('result-modal');
  const saveModalBtn = document.getElementById('save-modal-btn');
  const loadingState = document.getElementById('loading-state');
  const resultState = document.getElementById('result-state');

  // State
  let isRecording = false;
  let recordingStartTime;
  let timerInterval;
  let animationFrame;
  let scanCount = 0;
  let analysisTimeout;
  let confidenceScores = []; // Store history of scores

  // MediaRecorder
  let mediaRecorder;
  let audioChunks = [];
  let audioBlob;

  // Audio Player Elements
  const audioPlayer = document.getElementById('audio-player');
  const audioElement = document.getElementById('audio-element');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const playIcon = playPauseBtn.querySelector('.play-icon');
  const pauseIcon = playPauseBtn.querySelector('.pause-icon');
  const audioProgressBar = document.getElementById('audio-progress-bar');
  const currentTimeEl = document.getElementById('current-time');
  const durationTimeEl = document.getElementById('duration-time');

  // --- Tab Switching ---
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabContents.forEach(c => c.classList.remove('active'));

      // Add active to current
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // --- Visualizer Setup (Fake/Math-based) ---
  const barCount = 100;
  const bars = [];
  const waitingText = document.querySelector('.waiting-text');

  // Clean previous
  waveformCanvas.innerHTML = '';
  waveformCanvas.appendChild(waitingText);

  // Create bars
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement('div');
    bar.classList.add('wave-bar');
    bar.style.height = '4px';
    waveformCanvas.appendChild(bar);
    bars.push(bar);
  }

  function animateWaveform() {
    if (!isRecording) {
      bars.forEach(bar => bar.style.height = '4px');
      return;
    }

    bars.forEach((bar, index) => {
      // More dynamic wave math + randomness
      const time = Date.now() / 200;
      const wave = Math.sin((index * 0.2) + time) * 30; // Sine wave base
      const random = Math.random() * 50; // Noise

      let height = 10 + wave + random;
      if (height < 5) height = 5;
      if (height > 100) height = 100;

      bar.style.height = `${height}%`;
    });

    // Loop
    animationFrame = requestAnimationFrame(animateWaveform);
  }

  // --- Recording Logic ---

  function startRecording() {
    if (isRecording) return;
    isRecording = true;

    waitingText.style.display = 'none';

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          // Start Fake Visualizer
          animateWaveform();

          // Initialize Recorder
          // Use simplest options for max compatibility
          let options = {};
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options = { mimeType: 'audio/webm;codecs=opus' };
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options = { mimeType: 'audio/webm' };
          }

          try {
            mediaRecorder = new MediaRecorder(stream, options);
          } catch (e) {
            console.error("MediaRecorder creation failed with options, falling back to default:", e);
            mediaRecorder = new MediaRecorder(stream);
          }

          audioChunks = [];

          mediaRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
              audioChunks.push(event.data);
            }
          };

          mediaRecorder.onstop = () => {
            // Use the actual MIME type from the recorder
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            audioBlob = new Blob(audioChunks, { type: mimeType });
            console.log('Audio recorded. Size:', audioBlob.size, 'Type:', mimeType);

            if (audioBlob.size === 0) {
              alert("Recording failed: Audio data is empty.");
              return;
            }

            setupAudioPlayer();
          };

          mediaRecorder.start();

          // UI Updates
          recordBtn.classList.add('recording');
          recordBtn.classList.remove('hidden');
          recordBtn.innerHTML = '<span class="material-symbols-rounded">stop</span>';
          recordBtn.setAttribute('aria-label', "Stop Recording");
          recordBtn.onclick = stopRecording;

          statusText.innerText = "Recording... Speak now.";
          recordingStartTime = Date.now();
          updateTimer();
          timerInterval = setInterval(updateTimer, 1000);
        })
        .catch(err => {
          console.error("Error accessing microphone:", err);
          alert("Could not access microphone. Please allow permissions. Error: " + err.message);
          isRecording = false;
        });
    } else {
      alert("Microphone not supported in this browser.");
      isRecording = false;
    }
  }

  function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    clearInterval(timerInterval);

    // Stop animation
    cancelAnimationFrame(animationFrame);

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    // Stop Mic Stream (Important for cleanup)
    if (mediaRecorder && mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    // UI Updates
    recordBtn.classList.remove('recording');
    recordBtn.classList.add('hidden');

    recordingActions.classList.remove('hidden');
    statusText.innerText = "Recording captured. Ready to analyze.";

    bars.forEach(bar => bar.style.height = '4px');
  }

  function setupAudioPlayer() {
    if (!audioBlob) {
      console.error("setupAudioPlayer called but audioBlob is null");
      return;
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement.src = audioUrl;
    try {
      audioElement.volume = 1.0; // Force max volume
    } catch (e) {
      console.warn("Could not set volume programmatically", e);
    }
    audioElement.load();

    audioPlayer.classList.remove('hidden');

    // Debug play
    audioElement.onloadeddata = () => {
      console.log("Audio loaded. Duration:", audioElement.duration);
    };

    audioElement.onerror = (e) => {
      console.error("Audio Element Error:", e);
      alert("Error loading audio for playback.");
    };

    // Reset player state
    playPauseBtn.classList.remove('playing');
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    audioProgressBar.style.width = '0%';
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Audio Player Controls
  playPauseBtn.addEventListener('click', () => {
    if (audioElement.paused) {
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          playIcon.classList.add('hidden');
          pauseIcon.classList.remove('hidden');
          playPauseBtn.classList.add('playing');
        }).catch(error => {
          console.error("Playback failed:", error);
          alert("Playback failed: " + error.message);
        });
      }
    } else {
      audioElement.pause();
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
      playPauseBtn.classList.remove('playing');
    }
  });

  audioElement.addEventListener('loadedmetadata', () => {
    durationTimeEl.textContent = formatTime(audioElement.duration);
  });

  audioElement.addEventListener('timeupdate', () => {
    const progress = (audioElement.currentTime / audioElement.duration) * 100;
    audioProgressBar.style.width = `${progress}%`;
    currentTimeEl.textContent = formatTime(audioElement.currentTime);
  });

  audioElement.addEventListener('ended', () => {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    playPauseBtn.classList.remove('playing');
    audioProgressBar.style.width = '0%';
    audioElement.currentTime = 0;
  });

  // Click on progress bar to seek
  document.querySelector('.audio-progress').addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioElement.currentTime = percent * audioElement.duration;
  });

  function resetRecording() {
    isRecording = false;
    clearInterval(timerInterval);
    timerDisplay.innerText = "00:00";

    // UI Reset
    recordingActions.classList.add('hidden');
    recordBtn.classList.remove('hidden');
    recordBtn.innerHTML = '<span class="material-symbols-rounded">mic</span>';
    recordBtn.onclick = startRecording;
    recordBtn.setAttribute('aria-label', "Start Recording");

    statusText.innerText = "Tap the microphone to start recording";

    // Clear visualizer
    bars.forEach(bar => bar.style.height = '4px');

    // Hide and reset audio player
    audioPlayer.classList.add('hidden');

    // Prevent error alerts during cleanup
    audioElement.onerror = null;

    if (audioElement.src) {
      audioElement.pause();
      audioElement.currentTime = 0;
      if (audioElement.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioElement.src);
      }
      audioElement.removeAttribute('src'); // Better than src=''
      audioElement.load(); // Reset element to empty state
    }
  }

  function updateTimer() {
    const diff = Math.floor((Date.now() - recordingStartTime) / 1000);
    const m = Math.floor(diff / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${m}:${s}`;
  }

  // --- Analysis Logic ---

  async function startAnalysis(isFileUpload = false, fileToUpload = null) {
    console.log('Starting analysis...', { isFileUpload, hasFile: !!fileToUpload });

    // Reset UI
    resultModal.classList.remove('hidden');
    loadingState.classList.remove('hidden');
    resultState.classList.add('hidden');
    document.getElementById('detected-sound-name').innerText = "Analyzing...";
    document.querySelector('.result-badge').innerText = "--";

    if (analysisTimeout) clearTimeout(analysisTimeout);

    try {
      const formData = new FormData();
      let url = '';

      if (isFileUpload && fileToUpload) {
        // File Upload
        formData.append('file', fileToUpload);
        url = '/predict_file';
      } else {
        // Microphone Upload
        if (!audioBlob) throw new Error("No recording found.");

        // Convert to WAV for compatibility
        const arrayBuffer = await audioBlob.arrayBuffer();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const wavBuffer = audioBufferToWav(audioBuffer);
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });

        formData.append('audio', wavBlob, 'mic_recording.wav');
        url = '/predict_mic';
      }

      // Minimum loading time for UX (1.5s)
      const minTime = 1500;
      const start = Date.now();

      const response = await fetch(url, { method: 'POST', body: formData });
      const data = await response.json();

      console.log("Python Backend Response:", data); // Proof of Python integration

      const elapsed = Date.now() - start;
      const wait = Math.max(0, minTime - elapsed);

      setTimeout(() => {
        loadingState.classList.add('hidden');
        resultState.classList.remove('hidden');

        if (response.ok && !data.error) {
          document.getElementById('detected-sound-name').innerText = data.class || "Unknown";
          document.querySelector('.result-badge').innerText = data.confidence || "0%";

          // Store for Session Stats
          lastAnalysisResult = {
            label: data.class || "Unknown",
            confidence: data.confidence || "0%"
          };

          // Update Stats
          const statsCount = document.querySelector('.stat-number');
          if (statsCount) statsCount.innerText = "1"; // Increment logic can be added later
        } else {
          document.getElementById('detected-sound-name').innerText = "Error";
          alert(data.error || "Analysis failed");
        }
      }, wait);

    } catch (err) {
      console.error(err);
      loadingState.classList.add('hidden');
      resultState.classList.remove('hidden');
      document.getElementById('detected-sound-name').innerText = "Connection Error";
      alert("Failed to connect to backend. Is 'python app.py' running?");
    }
  }

  // --- WAV Encoder Helpers ---
  function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    let result;
    if (numChannels === 2) {
      result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
      result = buffer.getChannelData(0);
    }

    return encodeWAV(result, format, sampleRate, numChannels, bitDepth);
  }

  function interleave(inputL, inputR) {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;
    while (index < length) {
      result[index++] = inputL[inputIndex];
      result[index++] = inputR[inputIndex];
      inputIndex++;
    }
    return result;
  }

  function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, format, true);
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * blockAlign, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, blockAlign, true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length * bytesPerSample, true);

    // Float to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, s, true);
    }

    return view;
  }

  // --- Interaction Handlers ---
  // Initial Bind
  recordBtn.onclick = startRecording;

  // Actions Row Handlers

  // Button 1: Delete/Trash -> Reset to initial state
  deleteBtn.onclick = resetRecording;

  // Button 2: Middle Button (Mic Icon) -> Discard current and Start New
  stopBtn.innerHTML = '<span class="material-symbols-rounded">refresh</span>'; // Changed to refresh icon for clarity
  stopBtn.onclick = () => {
    resetRecording();
    startRecording();
  };

  // Button 3: Analyze -> Show Modal
  // Button 3: Analyze -> Show Modal
  analyzeBtn.onclick = () => {
    startAnalysis(false); // Mic mode
  };

  // State for Last Analysis
  let lastAnalysisResult = {
    label: "Unknown",
    confidence: "0%"
  };

  saveModalBtn.addEventListener('click', () => {
    // Close Modal
    resultModal.classList.add('hidden');
    resetRecording();

    // Update Stats
    scanCount++;
    totalScansEl.innerText = scanCount;

    // Parse confidence value (remove %)
    const currentConf = parseFloat(lastAnalysisResult.confidence.replace('%', ''));
    if (!isNaN(currentConf)) {
      confidenceScores.push(currentConf);
      const total = confidenceScores.reduce((acc, val) => acc + val, 0);
      const avg = total / confidenceScores.length;
      avgConfidenceEl.innerText = `${avg.toFixed(1)}%`;
    } else {
      avgConfidenceEl.innerText = lastAnalysisResult.confidence;
    }

    // Add to history
    const newItem = document.createElement('div');
    newItem.classList.add('stat-card');
    newItem.style.marginBottom = "10px";
    newItem.style.flexDirection = "row";
    newItem.style.justifyContent = "space-between";
    newItem.style.alignItems = "center";

    // Get current time formatted
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    newItem.innerHTML = `
            <div>
                <div class="stat-label">${timeString}</div>
                <div style="font-weight:600; text-transform: capitalize;">${lastAnalysisResult.label.replace(/_/g, ' ')}</div>
            </div>
            <span class="text-green">${lastAnalysisResult.confidence}</span>
        `;

    const empty = document.querySelector('.empty-state');
    if (empty) empty.remove();

    historyList.prepend(newItem);
  });

  // Close Modal via X button
  document.getElementById('close-modal-x').addEventListener('click', () => {
    resultModal.classList.add('hidden');
    if (analysisTimeout) clearTimeout(analysisTimeout);
  });

  // Close modal on outside click
  resultModal.addEventListener('click', (e) => {
    if (e.target === resultModal) {
      resultModal.classList.add('hidden');
      if (analysisTimeout) clearTimeout(analysisTimeout);
    }
  });

  // --- File Upload Logic ---
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.svg, .mp3, .wav';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  dropZone.addEventListener('click', (e) => {
    // Prevent click if clicking on controls inside the zone
    if (e.target.closest('.btn-primary') || e.target.closest('.play-pause-btn') || e.target.closest('.audio-progress')) {
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const fileUrl = URL.createObjectURL(file);

      // Inject Custom Player UI in Drop Zone
      dropZone.innerHTML = `
                <div class="upload-icon-circle" style="background-color: #d1fae5; color: var(--green);">
                    <span class="material-symbols-rounded">check_circle</span>
                </div>
                <h3>${file.name}</h3>
                <p>${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                
                <!-- Custom Mini Player -->
                <div class="audio-player" style="margin: 16px 0; width: 100%; max-width: 320px; background-color: #f3f4f6;">
                    <button class="play-pause-btn" id="upload-mini-play-btn">
                        <div class="play-icon">
                            <div class="play-triangle"></div>
                        </div>
                        <div class="pause-icon hidden">
                            <div class="pause-bar"></div>
                            <div class="pause-bar"></div>
                        </div>
                    </button>
                    <div class="audio-progress">
                        <div class="audio-progress-bar" id="upload-mini-progress"></div>
                    </div>
                    <div class="audio-time" style="min-width: 80px; text-align: right;">
                        <span id="upload-mini-time">0:00 / 0:00</span>
                    </div>
                    <audio id="upload-mini-audio" src="${fileUrl}"></audio>
                </div>

                <div style="display: flex; gap: 8px;">
                    <button class="btn-icon-secondary" id="remove-upload-btn" style="width: 48px; height: 48px;">
                        <span class="material-symbols-rounded">delete</span>
                    </button>
                    <button class="btn-primary" style="height: 48px;" id="process-upload-btn">
                        Analyze File
                    </button>
                </div>
            `;

      // --- Attach Listeners to Dynamic Elements ---

      const audio = document.getElementById('upload-mini-audio');
      const playBtn = document.getElementById('upload-mini-play-btn');
      const playIcon = playBtn.querySelector('.play-icon');
      const pauseIcon = playBtn.querySelector('.pause-icon');
      const progressBar = document.getElementById('upload-mini-progress');
      const timeDisplay = document.getElementById('upload-mini-time');
      const removeBtn = document.getElementById('remove-upload-btn');
      const processBtn = document.getElementById('process-upload-btn');

      // Play/Pause
      playBtn.addEventListener('click', () => {
        if (audio.paused) {
          audio.play();
          playIcon.classList.add('hidden');
          pauseIcon.classList.remove('hidden');
          playBtn.classList.add('playing');
        } else {
          audio.pause();
          playIcon.classList.remove('hidden');
          pauseIcon.classList.add('hidden');
          playBtn.classList.remove('playing');
        }
      });

      // Duration Load
      audio.addEventListener('loadedmetadata', () => {
        timeDisplay.textContent = `0:00 / ${formatTime(audio.duration)}`;
      });

      // Time Update
      audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
          const p = (audio.currentTime / audio.duration) * 100;
          progressBar.style.width = `${p}%`;
          timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
        }
      });

      // Ended
      audio.addEventListener('ended', () => {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        playBtn.classList.remove('playing');
        progressBar.style.width = '0%';
        audio.currentTime = 0;
      });

      // Seek
      playBtn.parentElement.querySelector('.audio-progress').addEventListener('click', (ev) => {
        const rect = ev.currentTarget.getBoundingClientRect();
        const p = (ev.clientX - rect.left) / rect.width;
        audio.currentTime = p * audio.duration;
      });

      // Remove / Reset
      removeBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        fileInput.value = '';
        dropZone.innerHTML = `
                <div class="upload-icon-circle">
                    <span class="material-symbols-rounded">cloud_upload</span>
                </div>
                <h3>Click to upload audio</h3>
                <p>SVG, MP3, or WAV (Max 10MB)</p>
          `;
      });

      // Analyze
      processBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        startAnalysis(true, file);
      });

    }
  });

});
