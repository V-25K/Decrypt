export type SfxKind = 'button' | 'correct' | 'wrong' | 'clear';

type SfxAssetKind = 'button' | 'correct' | 'wrong';

const sfxEnabledStorageKey = 'decrypt-sfx-enabled-v1';

const sfxAssetKinds: SfxAssetKind[] = ['button', 'correct', 'wrong'];
const criticalSfxAsset: SfxAssetKind = 'button';
type SfxPlaybackConfig = {
  asset: SfxAssetKind;
  gain: number;
  playbackRate?: number;
  detune?: number;
};

const sfxAssetPath: Record<SfxAssetKind, string> = {
  button: '/sounds/buttonClick.wav',
  correct: '/sounds/correct.wav',
  wrong: '/sounds/mistake.wav',
};

const sfxPlayback: Record<SfxKind, SfxPlaybackConfig> = {
  button: { asset: 'button', gain: 0.34, playbackRate: 1.02 },
  correct: { asset: 'correct', gain: 0.42 },
  wrong: { asset: 'wrong', gain: 0.52 },
  clear: { asset: 'correct', gain: 0.5, playbackRate: 1.07, detune: 45 },
};

const htmlAudioPoolSize = 3;
let audioContextInstance: AudioContext | null = null;
let masterGainNode: GainNode | null = null;

const decodedBuffers = new Map<SfxAssetKind, AudioBuffer>();
const loadingBuffers = new Map<SfxAssetKind, Promise<AudioBuffer | null>>();
const htmlAudioPools = new Map<SfxAssetKind, HTMLAudioElement[]>();
const htmlAudioIndices = new Map<SfxAssetKind, number>();
const primedHtmlAssets = new Set<SfxAssetKind>();
const activeBufferSources = new Set<AudioBufferSourceNode>();
let bootPrimed = false;

const readStoredSfxEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(sfxEnabledStorageKey);
    if (raw === '0' || raw === 'false') {
      return false;
    }
    if (raw === '1' || raw === 'true') {
      return true;
    }
  } catch (_error) {
    // Ignore storage failures and keep SFX enabled.
  }
  return true;
};

let sfxEnabled = readStoredSfxEnabled();

const isJSDom = (): boolean =>
  typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);

const getOutputNode = (context: AudioContext): GainNode => {
  if (!masterGainNode) {
    masterGainNode = context.createGain();
    masterGainNode.gain.value = 0.92;
    masterGainNode.connect(context.destination);
  }
  return masterGainNode;
};

const getHtmlAudioPool = (asset: SfxAssetKind): HTMLAudioElement[] | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const existingPool = htmlAudioPools.get(asset);
  if (existingPool) {
    return existingPool;
  }
  const pool = Array.from({ length: htmlAudioPoolSize }, () => {
    const audio = new Audio(sfxAssetPath[asset]);
    audio.preload = 'auto';
    audio.volume = 0.7;
    return audio;
  });
  htmlAudioPools.set(asset, pool);
  htmlAudioIndices.set(asset, 0);
  return pool;
};

const primeHtmlSfx = (): void => {
  if (isJSDom()) {
    return;
  }
  for (const asset of sfxAssetKinds) {
    if (primedHtmlAssets.has(asset)) {
      continue;
    }
    const pool = getHtmlAudioPool(asset);
    if (!pool) {
      continue;
    }
    for (const audio of pool) {
      try {
        audio.load();
      } catch (_error) {
        // Ignore preload failures.
      }
    }
    primedHtmlAssets.add(asset);
  }
};

const playHtmlSfx = (config: SfxPlaybackConfig): void => {
  if (!sfxEnabled) {
    return;
  }
  if (isJSDom()) {
    return;
  }
  const pool = getHtmlAudioPool(config.asset);
  if (!pool || pool.length === 0) {
    return;
  }
  const index = htmlAudioIndices.get(config.asset) ?? 0;
  const audio = pool[index % pool.length];
  if (!audio) {
    return;
  }
  htmlAudioIndices.set(config.asset, (index + 1) % pool.length);
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = config.playbackRate ?? 1;
    audio.volume = Math.min(1, Math.max(0.05, config.gain * 1.6));
    void audio.play();
  } catch (_error) {
    // Ignore playback errors.
  }
};

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined' || !window.AudioContext) {
    return null;
  }
  if (!audioContextInstance) {
    audioContextInstance = new window.AudioContext({
      latencyHint: 'interactive',
    });
    getOutputNode(audioContextInstance);
  }
  return audioContextInstance;
};

const persistSfxEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(sfxEnabledStorageKey, enabled ? '1' : '0');
  } catch (_error) {
    // Ignore storage failures.
  }
};

const stopAllSfxPlayback = (): void => {
  activeBufferSources.forEach((source) => {
    try {
      source.stop();
    } catch (_error) {
      // Ignore nodes that already ended.
    }
  });
  activeBufferSources.clear();
  htmlAudioPools.forEach((pool) => {
    pool.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_error) {
        // Ignore playback reset failures.
      }
    });
  });
};

const decodeAsset = async (asset: SfxAssetKind): Promise<AudioBuffer | null> => {
  const existingBuffer = decodedBuffers.get(asset);
  if (existingBuffer) {
    return existingBuffer;
  }

  const existingLoad = loadingBuffers.get(asset);
  if (existingLoad) {
    return existingLoad;
  }

  const nextLoad = (async () => {
    const context = getAudioContext();
    if (!context || typeof fetch === 'undefined') {
      return null;
    }

    try {
      const response = await fetch(sfxAssetPath[asset]);
      if (!response.ok) {
        return null;
      }
      const rawBuffer = await response.arrayBuffer();
      const decodedBuffer = await context.decodeAudioData(rawBuffer.slice(0));
      decodedBuffers.set(asset, decodedBuffer);
      return decodedBuffer;
    } catch (_error) {
      return null;
    } finally {
      loadingBuffers.delete(asset);
    }
  })();

  loadingBuffers.set(asset, nextLoad);
  return nextLoad;
};

const startBufferPlayback = (
  context: AudioContext,
  buffer: AudioBuffer,
  config: SfxPlaybackConfig,
  startAt = context.currentTime + 0.002
) => {
  if (!sfxEnabled) {
    return;
  }
  const source = context.createBufferSource();
  const gain = context.createGain();

  source.buffer = buffer;
  source.playbackRate.value = config.playbackRate ?? 1;
  if (typeof config.detune === 'number') {
    source.detune.value = config.detune;
  }

  gain.gain.value = config.gain;
  source.connect(gain);
  gain.connect(getOutputNode(context));
  activeBufferSources.add(source);
  source.start(startAt);
  source.onended = () => {
    activeBufferSources.delete(source);
    source.disconnect();
    gain.disconnect();
  };
};

export const isSfxEnabled = (): boolean => sfxEnabled;

export const setSfxEnabled = (enabled: boolean): boolean => {
  sfxEnabled = enabled;
  persistSfxEnabled(enabled);
  if (!enabled) {
    stopAllSfxPlayback();
    return sfxEnabled;
  }
  primeSfx();
  return sfxEnabled;
};

export const primeSfx = (): void => {
  if (!sfxEnabled) {
    return;
  }
  const context = getAudioContext();
  if (!context) {
    primeHtmlSfx();
    return;
  }

  if (context.state === 'suspended') {
    void context.resume();
  }

  primeHtmlSfx();
  const prioritizedAssets: SfxAssetKind[] = [
    criticalSfxAsset,
    ...sfxAssetKinds.filter((asset) => asset !== criticalSfxAsset),
  ];
  for (const asset of prioritizedAssets) {
    void decodeAsset(asset);
  }
};

export const primeSfxOnBoot = (): void => {
  if (bootPrimed || isJSDom()) {
    return;
  }
  bootPrimed = true;
  if (!sfxEnabled) {
    return;
  }
  primeHtmlSfx();
  const context = getAudioContext();
  if (!context) {
    return;
  }
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined);
  }
  void decodeAsset(criticalSfxAsset);
};

export const playSfx = (kind: SfxKind): void => {
  if (!sfxEnabled) {
    return;
  }
  const config = sfxPlayback[kind];
  const context = getAudioContext();
  if (!context) {
    playHtmlSfx(config);
    return;
  }

  if (context.state !== 'running') {
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
    playHtmlSfx(config);
    void decodeAsset(config.asset);
    return;
  }

  const readyBuffer = decodedBuffers.get(config.asset);
  if (readyBuffer) {
    startBufferPlayback(context, readyBuffer, config);
    return;
  }

  playHtmlSfx(config);
  void decodeAsset(config.asset);
};

export const disposeSfx = (): void => {
  stopAllSfxPlayback();
  if (!audioContextInstance) {
    return;
  }
  void audioContextInstance.close();
  audioContextInstance = null;
  masterGainNode = null;
  decodedBuffers.clear();
  loadingBuffers.clear();
  htmlAudioPools.clear();
  htmlAudioIndices.clear();
  primedHtmlAssets.clear();
  bootPrimed = false;
};
