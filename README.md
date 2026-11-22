A small browser game: record yourself singing or saying something, play it back in reverse, and let guess what it was.

python -m http.server 8000
```

Then open http://localhost:8000

## How it works

- `MediaRecorder` records from the mic
- `AudioContext.decodeAudioData` turns the recording into raw samples
- each channel's sample array is copied in reverse order
- the reversed buffer is played with an `AudioBufferSourceNode`
- a `<canvas>` draws the waveform and the playhead

If the mic is blocked, you can upload an audio file or use your phone's recorder app instead.
