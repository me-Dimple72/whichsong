(function () {
  var $ = function (id) { return document.getElementById(id); };
  var orig = null, rev = null, playCtx = null, src = null;
  var raf = 0, startT = 0, rate = 1, playing = null;
  var mediaRec = null, chunks = [], stream = null, recording = false;
  var hits = 0, total = 0;
  var cv = $("wave"), g = cv.getContext("2d");

  function newCtx() { return new (window.AudioContext || window.webkitAudioContext)(); }
  function say(s, h) { $("status").textContent = s; if (h !== undefined) $("hint").textContent = h; }
  function err(m) { $("msg").textContent = m; }

  // copy every channel back to front
  function reverseBuffer(buf) {
    var out = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
    for (var c = 0; c < buf.numberOfChannels; c++) {
      var d = buf.getChannelData(c), r = out.getChannelData(c), n = d.length;
      for (var i = 0; i < n; i++) r[i] = d[n - 1 - i];
    }
    return out;
  }

  // quiet recordings get boosted so they are easy to hear
  function normalize(buf) {
    var peak = 0, c, i, d;
    for (c = 0; c < buf.numberOfChannels; c++) {
      d = buf.getChannelData(c);
      for (i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    if (peak === 0 || peak > 0.8) return;
    var gain = Math.min(0.9 / peak, 15);
    for (c = 0; c < buf.numberOfChannels; c++) {
      d = buf.getChannelData(c);
      for (i = 0; i < d.length; i++) d[i] *= gain;
    }
  }

  function draw(buf, progress) {
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth * dpr, h = cv.clientHeight * dpr;
    if (cv.width !== w) { cv.width = w; cv.height = h; }
    g.clearRect(0, 0, w, h);
    if (!buf) return;
    var d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / w));
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--wave").trim() || "#1c1b3a";
    for (var x = 0; x < w; x++) {
      var mx = 0;
      for (var j = 0; j < step; j += Math.max(1, step >> 4)) {
        var v = Math.abs(d[x * step + j] || 0);
        if (v > mx) mx = v;
      }
      var bh = Math.max(2, mx * h * 0.95);
      g.fillRect(x, (h - bh) / 2, 1, bh);
    }
    if (progress != null) { g.fillStyle = "#ff3d6e"; g.fillRect(progress * w, 0, 3, h); }
  }

  function ready(buf) {
    normalize(buf);
    orig = buf;
    rev = reverseBuffer(buf);
    ["playRev", "playFwd", "stop", "hit", "miss"].forEach(function (i) { $(i).disabled = false; });
    draw(rev, null);
    say("Clip ready", "Waveform shown is the backwards version. Press play.");
    err("");
  }

  function stopPlay() {
    if (src) { try { src.onended = null; src.stop(); } catch (e) {} src = null; }
    cancelAnimationFrame(raf);
    $("disc").classList.remove("spin");
    if (playing) draw(playing, null);
  }

  // A fresh AudioContext for every play. If the laptop switched audio devices
  // (for example Bluetooth earbuds changing mode after recording), an old
  // context can keep the wrong sample rate and play too fast and high-pitched.
  function play(buf, label) {
    stopPlay();
    if (playCtx) { try { playCtx.close(); } catch (e) {} }
    playCtx = newCtx();
    var c = playCtx;
    var sp = $("speed");
    rate = sp ? parseFloat(sp.value) : 1;
    playing = buf;
    src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(c.destination);
    startT = c.currentTime;
    src.start();
    $("disc").classList.add("spin");
    say(label);
    src.onended = function () { stopPlay(); say("Done", "Play again, reveal, or record a new one."); };
    (function tick() {
      draw(buf, Math.min(1, (c.currentTime - startT) * rate / buf.duration));
      raf = requestAnimationFrame(tick);
    })();
  }

  function decode(arrBuf) {
    var c = newCtx();
    c.decodeAudioData(arrBuf, function (buf) { c.close(); ready(buf); }, function () {
      c.close();
      err("Couldn’t read that audio. Try another recording or file.");
      say("Ready to record");
    });
  }

  $("rec").onclick = async function () {
    if (recording) { mediaRec.stop(); return; }
    stopPlay(); err("");
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      err("Recording isn’t supported in this browser. Use Upload audio instead.");
      return;
    }
    try {
      // voice-call filters off, they make singing sound thin and quiet
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (e) {
      err("Microphone is blocked. Allow it in your browser settings, or use Upload audio.");
      return;
    }
    chunks = [];
    mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    mediaRec.onstop = function () {
      recording = false;
      $("rec").textContent = "Record";
      $("disc").classList.remove("spin");
      stream.getTracks().forEach(function (t) { t.stop(); });
      // short wait so the audio device can settle back before we decode
      setTimeout(function () {
        new Blob(chunks, { type: mediaRec.mimeType }).arrayBuffer().then(decode);
      }, 400);
    };
    mediaRec.start();
    recording = true;
    $("rec").textContent = "Stop recording";
    $("disc").classList.add("spin");
    say("Recording…", "Sing or speak, then press Stop recording.");
  };

  function onFile(e) {
    var f = e.target.files[0];
    if (!f) return;
    stopPlay(); say("Reading file…");
    f.arrayBuffer().then(decode);
  }
  $("file").onchange = onFile;
  if ($("file2")) $("file2").onchange = onFile;

  $("playRev").onclick = function () { play(rev, "Playing backwards… what is it?"); };
  $("playFwd").onclick = function () { play(orig, "The original"); };
  $("stop").onclick = function () { stopPlay(); say("Stopped"); };
  $("hit").onclick = function () { hits++; total++; upd(); };
  $("miss").onclick = function () { total++; upd(); };
  $("reset").onclick = function () { hits = 0; total = 0; upd(); };
  function upd() { $("sh").textContent = hits; $("st").textContent = total; }

  if ($("speed")) {
    $("speed").oninput = function () {
      $("speedVal").textContent = parseFloat(this.value).toFixed(2) + "x";
    };
  }
  window.addEventListener("resize", function () { if (rev) draw(rev, null); });
})();