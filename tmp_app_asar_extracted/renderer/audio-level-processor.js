class AudioLevelProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameCount = 0;
    this.outputSampleRate = 16000; // Target output sample rate
    this.inputSampleRate = null; // Will be set dynamically
  this.resampleRatio = 1;
  this.downsampleRemainder = new Float32Array(0);
  this.sampleAccumulator = new Float32Array(0);
  this.targetChunkSamples = 320; // 20ms of audio at 16kHz
    // Adaptive gain control state
    this.enableGain = false;
    this.targetRMS = 0.02; // target perceived rms after scaling
    this.currentGain = 1.0;
    this.maxGain = 10.0;  // hard clamp to avoid runaway
    this.minGain = 0.3;
    this.gainSmooth = 0.05; // smoothing factor
    this.lastPostedGain = 1.0;
    this.totalBytesSent = 0;
    this.lastLogTime = 0;
    this.port.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'gain_control') {
        if (typeof msg.enable === 'boolean') this.enableGain = msg.enable;
        if (typeof msg.targetRMS === 'number') this.targetRMS = Math.max(0.002, Math.min(0.08, msg.targetRMS));
      }
    };
    console.log('[AudioWorklet] AudioLevelProcessor initialized');
  }

  static get parameterDescriptors() {
    return [];
  }

  // Linear downsampling function
  downsampleLinear(input, fromRate, toRate) {
    if (fromRate === toRate) return input;

    const ratio = fromRate / toRate;
    let source;

    if (this.downsampleRemainder.length) {
      source = new Float32Array(this.downsampleRemainder.length + input.length);
      source.set(this.downsampleRemainder, 0);
      source.set(input, this.downsampleRemainder.length);
    } else {
      source = input;
    }

    if (source.length < 2) {
      this.downsampleRemainder = source;
      return new Float32Array(0);
    }

    const outputLength = Math.max(0, Math.floor((source.length - 1) / ratio));
    if (outputLength === 0) {
      this.downsampleRemainder = source;
      return new Float32Array(0);
    }

    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, source.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      output[i] = source[srcIndexFloor] * (1 - fraction) + source[srcIndexCeil] * fraction;
    }

    const consumedSamples = Math.min(source.length, Math.floor(outputLength * ratio));
    this.downsampleRemainder = source.slice(consumedSamples);
    return output;
  }

  // Convert float32 to PCM16
  toPCM16(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      const pcm = Math.round(sample * 0x7FFF);
      view.setInt16(i * 2, pcm, true); // little-endian
    }
    
    return buffer;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputBuffer = input[0];
    
    // Set input sample rate on first call
    if (!this.inputSampleRate) {
      this.inputSampleRate = sampleRate; // AudioWorkletGlobalScope's sampleRate
      this.resampleRatio = this.inputSampleRate / this.outputSampleRate;
      console.log(`[AudioWorklet] Input sample rate: ${this.inputSampleRate} Hz, will downsample to ${this.outputSampleRate} Hz`);
    }

    // Compute RMS BEFORE gain for adaptive control
    let sum = 0;
    for (let i = 0; i < inputBuffer.length; i++) {
      sum += inputBuffer[i] * inputBuffer[i];
    }
    const rms = Math.sqrt(sum / inputBuffer.length) || 0;

    // Adaptive gain update (slow smoothing)
    let processed = inputBuffer;
    if (this.enableGain) {
      // Avoid division by zero
      const desiredGain = rms > 1e-7 ? this.targetRMS / rms : this.maxGain;
      // Clamp target gain
      const clampedDesired = Math.min(this.maxGain, Math.max(this.minGain, desiredGain));
      // Exponential smoothing
      this.currentGain = this.currentGain + this.gainSmooth * (clampedDesired - this.currentGain);
      if (Math.abs(this.currentGain - this.lastPostedGain) / this.lastPostedGain > 0.15) {
        this.lastPostedGain = this.currentGain;
        this.port.postMessage({ type: 'gain_update', gain: this.currentGain });
      }
      // Apply gain
      processed = new Float32Array(inputBuffer.length);
      for (let i = 0; i < inputBuffer.length; i++) {
        let v = inputBuffer[i] * this.currentGain;
        // Soft clip
        if (v > 1) v = 1; else if (v < -1) v = -1;
        processed[i] = v;
      }
    }

    // Send level info every ~400ms (approximate)
    if (++this.frameCount % 10 === 0) {
      this.port.postMessage({
        type: 'level',
        rms: rms,
        silence: rms < 0.0005
      });
    }

    // Downsample audio for transmission (use processed buffer)
    const downsampled = this.downsampleLinear(processed, this.inputSampleRate, this.outputSampleRate);
    if (downsampled.length) {
      const combinedSamples = new Float32Array(this.sampleAccumulator.length + downsampled.length);
      combinedSamples.set(this.sampleAccumulator, 0);
      combinedSamples.set(downsampled, this.sampleAccumulator.length);

      let offset = 0;
      while (combinedSamples.length - offset >= this.targetChunkSamples) {
        const slice = combinedSamples.subarray(offset, offset + this.targetChunkSamples);
        const pcmBuffer = this.toPCM16(slice);
        this.totalBytesSent += pcmBuffer.byteLength;
        const now = Date.now();
        if (now - this.lastLogTime > 5000) {
          this.lastLogTime = now;
          console.log(`[AudioWorklet] Sent ${this.totalBytesSent} bytes, current RMS: ${rms.toFixed(6)}, gain: ${this.currentGain.toFixed(2)}`);
        }
        this.port.postMessage({
          type: 'audio',
          buffer: pcmBuffer
        }, [pcmBuffer]);
        offset += this.targetChunkSamples;
      }

      this.sampleAccumulator = combinedSamples.slice(offset);
    }

    return true;
  }
}

registerProcessor('audio-level-processor', AudioLevelProcessor);
