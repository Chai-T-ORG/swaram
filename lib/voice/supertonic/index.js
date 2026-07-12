// Local @supertone/supertonic package mock wave synthesizer (Zero-dependency)

class TTS {
  static async load(options = {}) {
    console.log("[Supertonic Mock] Loaded lightweight local mock engine.");
    return new TTS();
  }

  async getVoiceStyle(name) {
    return { name };
  }

  async synthesize(text, options = {}) {
    if (!text || !text.trim()) {
      return { wav: new Float32Array(0), duration: 0 };
    }

    console.log("[Supertonic Mock] Synthesizing waveform for:", text);
    const sampleRate = 44100;
    const duration = Math.max(0.5, text.length * 0.08); // proportional duration
    const numSamples = Math.floor(sampleRate * duration);
    const wav = new Float32Array(numSamples);
    
    // Generate a warmer, low-pass filtered voice-like wave to simulate offline synthesizers
    const fund = 150; // warmer fundamental pitch (150Hz)
    let lastVal = 0;
    
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      
      // Mix fundamental with soft harmonics
      const rawWave = Math.sin(2 * Math.PI * fund * t) +
                      0.5 * Math.sin(2 * Math.PI * fund * 2 * t) +
                      0.25 * Math.sin(2 * Math.PI * fund * 3 * t) +
                      0.12 * Math.sin(2 * Math.PI * fund * 4 * t);
                      
      // Simple 1st-order low-pass filter
      const alpha = 0.82;
      const filtered = lastVal * alpha + rawWave * (1 - alpha);
      lastVal = filtered;
      
      // Amplitude modulation for conversational cadence
      const envelope = Math.sin(Math.PI * (t / duration));
      const cadence = Math.sin(2 * Math.PI * 5 * t) > -0.3 ? 1.0 : 0.15;
      
      wav[i] = 0.18 * filtered * envelope * cadence;
    }

    return {
      wav,
      duration,
      samplingRate: sampleRate,
    };
  }
}

module.exports = { TTS };
