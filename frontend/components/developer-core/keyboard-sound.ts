'use client';

/**
 * Premium Web Audio API Mechanical Keyboard Sound Synthesizer
 *
 * Characteristics:
 * - Ultra-low latency (< 15ms)
 * - Zero external asset dependencies
 * - Authentic tactile "thock" + crisp mechanical snap
 * - Distinct acoustical resonance for normal, large (Space, Enter), modifier, and escape keys
 * - ±3-6% micro pitch and volume randomization for non-robotic typing
 * - Automatic node cleanup after 80ms decay
 * - Throttled key-repeat protection
 */

type KeyCategory = 'normal' | 'large' | 'modifier' | 'escape';

class MechanicalSoundEngine {
  private ctx: AudioContext | null = null;
  private isEnabled: boolean = true;
  private lastPlayTime: number = 0;
  private repeatThrottleMs: number = 130; // Max ~7.5 clicks/sec when holding a key down

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public getSoundEnabled(): boolean {
    return this.isEnabled;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public toggleSound(): boolean {
    this.isEnabled = !this.isEnabled;
    if (this.isEnabled) {
      this.getContext();
    }
    return this.isEnabled;
  }

  private classifyKey(key: string, code?: string): KeyCategory {
    const k = key.toUpperCase();
    const c = (code || '').toUpperCase();

    if (k === 'ESCAPE' || c === 'ESCAPE' || k === 'ESC') {
      return 'escape';
    }

    if (
      k === ' ' ||
      k === 'SPACE' ||
      c === 'SPACE' ||
      k === 'ENTER' ||
      c === 'ENTER' ||
      k === 'BACKSPACE' ||
      c === 'BACKSPACE' ||
      k === 'TAB' ||
      c === 'TAB' ||
      k === 'SHIFT' ||
      c.startsWith('SHIFT') ||
      k === 'CAPSLOCK' ||
      c === 'CAPSLOCK'
    ) {
      return 'large';
    }

    if (
      k === 'CONTROL' ||
      k === 'CTRL' ||
      c.startsWith('CONTROL') ||
      k === 'ALT' ||
      c.startsWith('ALT') ||
      k === 'META' ||
      k === 'CMD' ||
      c.startsWith('META')
    ) {
      return 'modifier';
    }

    return 'normal';
  }

  /**
   * Synthesizes and plays a subtle mechanical switch click
   */
  public playKeyClick(key: string, isRepeat: boolean = false, code?: string): void {
    if (!this.isEnabled) return;

    const now = performance.now();
    // Protect against holding down a key and creating an uncontrolled audio storm
    if (isRepeat && now - this.lastPlayTime < this.repeatThrottleMs) {
      return;
    }
    this.lastPlayTime = now;

    const ctx = this.getContext();
    if (!ctx) return;

    const category = this.classifyKey(key, code);
    const audioTime = ctx.currentTime;

    // Micro pitch variation: ±3.5%
    const pitchVariation = 1 + (Math.random() - 0.5) * 0.07;
    // Micro volume variation: ±4%
    const volVariation = 1 + (Math.random() - 0.5) * 0.08;

    // Master volume: soft, premium, non-fatiguing
    const masterGain = ctx.createGain();
    const baseVolume = 0.09 * volVariation;
    masterGain.gain.setValueAtTime(baseVolume, audioTime);
    masterGain.connect(ctx.destination);

    // ─────────────────────────────────────────────────────────────
    // 1. TACTILE TRANSIENT (The mechanical contact "tick")
    // ─────────────────────────────────────────────────────────────
    let transientStartFreq = 2600 * pitchVariation;
    let transientEndFreq = 500 * pitchVariation;
    let transientDuration = 0.018;

    if (category === 'escape') {
      transientStartFreq = 3100 * pitchVariation;
      transientEndFreq = 700 * pitchVariation;
      transientDuration = 0.015;
    } else if (category === 'large') {
      transientStartFreq = 2100 * pitchVariation;
      transientEndFreq = 420 * pitchVariation;
      transientDuration = 0.022;
    } else if (category === 'modifier') {
      transientStartFreq = 2300 * pitchVariation;
      transientEndFreq = 480 * pitchVariation;
    }

    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(transientStartFreq, audioTime);
    clickOsc.frequency.exponentialRampToValueAtTime(transientEndFreq, audioTime + transientDuration);

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(1800 * pitchVariation, audioTime);
    clickFilter.Q.setValueAtTime(1.8, audioTime);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.7, audioTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, audioTime + transientDuration);

    clickOsc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(masterGain);

    clickOsc.start(audioTime);
    clickOsc.stop(audioTime + transientDuration);

    // ─────────────────────────────────────────────────────────────
    // 2. RESONANT HOUSING BODY (The bottom-out "thock")
    // ─────────────────────────────────────────────────────────────
    let bodyFreq = 145 * pitchVariation;
    let bodyDuration = 0.048;

    if (category === 'large') {
      // Deeper, heavier bottom-out resonance for Space, Enter, Backspace
      bodyFreq = 105 * pitchVariation;
      bodyDuration = 0.065;
    } else if (category === 'modifier') {
      bodyFreq = 125 * pitchVariation;
      bodyDuration = 0.052;
    } else if (category === 'escape') {
      bodyFreq = 175 * pitchVariation;
      bodyDuration = 0.042;
    }

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(bodyFreq, audioTime);
    bodyOsc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.75, audioTime + bodyDuration);

    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(750, audioTime);

    const bodyGain = ctx.createGain();
    const bodyAmp = category === 'large' ? 0.85 : 0.65;
    bodyGain.gain.setValueAtTime(bodyAmp, audioTime);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, audioTime + bodyDuration);

    bodyOsc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(masterGain);

    bodyOsc.start(audioTime);
    bodyOsc.stop(audioTime + bodyDuration);

    // ─────────────────────────────────────────────────────────────
    // 3. AUTOMATIC NODE DISPOSAL
    // ─────────────────────────────────────────────────────────────
    const totalLifetimeMs = Math.ceil(Math.max(transientDuration, bodyDuration) * 1000) + 30;
    setTimeout(() => {
      try {
        clickOsc.disconnect();
        clickFilter.disconnect();
        clickGain.disconnect();

        bodyOsc.disconnect();
        bodyFilter.disconnect();
        bodyGain.disconnect();

        masterGain.disconnect();
      } catch {
        // Safe disposal
      }
    }, totalLifetimeMs);
  }
}

// Global Singleton Instance
export const mechanicalAudio = new MechanicalSoundEngine();
