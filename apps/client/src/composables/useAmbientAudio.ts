import { onBeforeUnmount, shallowRef } from "vue";

interface StartOptions {
  muted?: boolean;
}

export function useAmbientAudio() {
  const isMuted = shallowRef(false);
  const isPlaying = shallowRef(false);

  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let pulseTimer: number | null = null;
  let drones: OscillatorNode[] = [];

  function getAudioContext() {
    if (typeof window === "undefined") {
      return null;
    }
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    if (!context) {
      context = new AudioCtor();
    }
    return context;
  }

  function currentGainTarget() {
    return isMuted.value ? 0.0001 : 0.05;
  }

  function ensureMaster(ctx: AudioContext) {
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.0001;
      masterGain.connect(ctx.destination);
    }
    return masterGain;
  }

  function createDrone(ctx: AudioContext, frequency: number, detune: number, volume: number) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;
    gain.gain.value = volume;
    oscillator.connect(gain);
    gain.connect(ensureMaster(ctx));
    oscillator.start();
    drones.push(oscillator);
  }

  function playBell(ctx: AudioContext, frequency: number, delay = 0) {
    const now = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, now + 1.2);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isMuted.value ? 0.0001 : 0.02, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    oscillator.connect(gain);
    gain.connect(ensureMaster(ctx));
    oscillator.start(now);
    oscillator.stop(now + 1.6);
  }

  function startPulseLoop(ctx: AudioContext) {
    if (pulseTimer !== null) {
      window.clearInterval(pulseTimer);
    }
    playBell(ctx, 392);
    playBell(ctx, 523.25, 0.36);
    pulseTimer = window.setInterval(() => {
      playBell(ctx, 349.23);
      playBell(ctx, 466.16, 0.42);
    }, 8200);
  }

  async function start(options?: StartOptions) {
    if (options?.muted !== undefined) {
      isMuted.value = options.muted;
    }

    const ctx = getAudioContext();
    if (!ctx) {
      return;
    }

    await ctx.resume();
    ensureMaster(ctx);

    if (!drones.length) {
      createDrone(ctx, 110, -4, 0.011);
      createDrone(ctx, 164.81, 6, 0.009);
      createDrone(ctx, 220, 3, 0.006);
      startPulseLoop(ctx);
    }

    masterGain?.gain.cancelScheduledValues(ctx.currentTime);
    masterGain?.gain.linearRampToValueAtTime(currentGainTarget(), ctx.currentTime + 0.6);
    isPlaying.value = true;
  }

  function toggleMuted() {
    isMuted.value = !isMuted.value;
    if (!context || !masterGain) {
      return;
    }
    masterGain.gain.cancelScheduledValues(context.currentTime);
    masterGain.gain.linearRampToValueAtTime(currentGainTarget(), context.currentTime + 0.25);
  }

  function stop() {
    if (pulseTimer !== null) {
      window.clearInterval(pulseTimer);
      pulseTimer = null;
    }
    drones.forEach((oscillator) => oscillator.stop());
    drones = [];
    if (masterGain && context) {
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.setValueAtTime(0.0001, context.currentTime);
    }
    isPlaying.value = false;
  }

  onBeforeUnmount(() => {
    stop();
  });

  return {
    isMuted,
    isPlaying,
    start,
    stop,
    toggleMuted,
  };
}
