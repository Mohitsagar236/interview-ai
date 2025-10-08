class AudioLevelProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameCount = 0;
    this.outputSampleRate = 16000; // Target output sample rate
    this.inputSampleRate = null; // Will be set dynamically
    this.resampleBuffer = [];
    this.resampleRatio = 1;
    // Adaptive gain control state
    this.enableGain = false;
    this.targetRMS = 0.02; // target perceived rms after scaling
    this.currentGain = 1.0;
    this.maxGain = 10.0;  // hard clamp to avoid runaway
    this.minGain = 0.3;
    this.gainSmooth = 0.05; // smoothing factor
    this.lastPostedGain = 1.0;
    this.port.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'gain_control') {
        if (typeof msg.enable === 'boolean') this.enableGain = msg.enable;
        if (typeof msg.targetRMS === 'number') this.targetRMS = Math.max(0.002, Math.min(0.08, msg.targetRMS));
      }
    };
  }

  static get parameterDescriptors() {
    return [];
  }

  // Linear downsampling function
  downsampleLinear(input, fromRate, toRate) {
    if (fromRate === toRate) return input;
    
    const ratio = fromRate / toRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      
      output[i] = input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction;
    }
    
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
    const pcmBuffer = this.toPCM16(downsampled);

    // Send audio data
    this.port.postMessage({
      type: 'audio',
      buffer: pcmBuffer
    }, [pcmBuffer]);

    return true;
  }
}

registerProcessor('audio-level-processor', AudioLevelProcessor);
