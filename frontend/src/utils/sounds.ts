/**
 * Sound manager for gamification audio effects
 */

export type SoundType =
  | 'win'
  | 'loss'
  | 'achievement'
  | 'levelup'
  | 'streak'
  | 'coin'
  | 'notification'
  | 'click'
  | 'error';

interface SoundConfig {
  src: string;
  volume: number;
  preload: boolean;
}

const SOUND_CONFIG: Record<SoundType, SoundConfig> = {
  win: { src: '/sounds/win.mp3', volume: 0.6, preload: true },
  loss: { src: '/sounds/loss.mp3', volume: 0.5, preload: true },
  achievement: { src: '/sounds/achievement.mp3', volume: 0.7, preload: true },
  levelup: { src: '/sounds/levelup.mp3', volume: 0.8, preload: false },
  streak: { src: '/sounds/streak.mp3', volume: 0.7, preload: false },
  coin: { src: '/sounds/coin.mp3', volume: 0.4, preload: true },
  notification: { src: '/sounds/notification.mp3', volume: 0.5, preload: true },
  click: { src: '/sounds/click.mp3', volume: 0.3, preload: true },
  error: { src: '/sounds/error.mp3', volume: 0.5, preload: false },
};

class SoundManager {
  private audioCache: Map<SoundType, HTMLAudioElement> = new Map();
  private enabled: boolean = true;
  private masterVolume: number = 1.0;
  private initialized: boolean = false;

  constructor() {
    // Defer initialization to avoid SSR issues
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Load enabled state from localStorage
    const stored = localStorage.getItem('warriors_sound_enabled');
    this.enabled = stored !== 'false';

    // Load master volume from localStorage
    const volumeStored = localStorage.getItem('warriors_sound_volume');
    if (volumeStored) {
      this.masterVolume = parseFloat(volumeStored);
    }

    // Preload sounds marked for preloading
    Object.entries(SOUND_CONFIG).forEach(([type, config]) => {
      if (config.preload) {
        this.preload(type as SoundType);
      }
    });
  }

  /**
   * Preload a sound into the cache
   */
  private preload(type: SoundType): void {
    if (typeof window === 'undefined') return;
    if (this.audioCache.has(type)) return;

    const config = SOUND_CONFIG[type];
    const audio = new Audio(config.src);
    audio.volume = config.volume * this.masterVolume;
    audio.preload = 'auto';
    this.audioCache.set(type, audio);
  }

  /**
   * Play a sound effect
   */
  play(type: SoundType): void {
    if (typeof window === 'undefined') return;
    if (!this.enabled) return;

    // Ensure initialized
    if (!this.initialized) {
      this.init();
    }

    const config = SOUND_CONFIG[type];

    // Use cached audio or create new
    let audio = this.audioCache.get(type);

    if (!audio) {
      audio = new Audio(config.src);
      this.audioCache.set(type, audio);
    }

    // Reset and play
    audio.volume = config.volume * this.masterVolume;
    audio.currentTime = 0;

    // Handle play promise (browsers require user interaction first)
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        // Auto-play was prevented, this is expected on first load
        console.debug('Sound play prevented:', error.message);
      });
    }
  }

  /**
   * Play multiple sounds in sequence
   */
  async playSequence(types: SoundType[], delayMs: number = 200): Promise<void> {
    for (const type of types) {
      this.play(type);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Enable or disable sounds
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('warriors_sound_enabled', String(enabled));
    }
  }

  /**
   * Check if sounds are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Toggle sounds on/off
   */
  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (typeof window !== 'undefined') {
      localStorage.setItem('warriors_sound_volume', String(this.masterVolume));
    }

    // Update all cached audio volumes
    this.audioCache.forEach((audio, type) => {
      const config = SOUND_CONFIG[type];
      audio.volume = config.volume * this.masterVolume;
    });
  }

  /**
   * Get master volume
   */
  getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Play appropriate sound for trade result
   */
  playTradeResult(isWin: boolean, profit: number): void {
    if (isWin) {
      this.play('win');
      // Extra celebration for big wins
      if (profit > 100) {
        setTimeout(() => this.play('coin'), 300);
      }
    } else {
      this.play('loss');
    }
  }

  /**
   * Play streak celebration
   */
  playStreakCelebration(streakLength: number): void {
    if (streakLength >= 10) {
      this.playSequence(['streak', 'achievement'], 500);
    } else if (streakLength >= 5) {
      this.play('streak');
    } else if (streakLength >= 3) {
      this.play('notification');
    }
  }

  /**
   * Play level up celebration
   */
  playLevelUp(): void {
    this.playSequence(['levelup', 'achievement'], 600);
  }
}

// Lazy singleton instance - only created when accessed on client side
let _soundManager: SoundManager | null = null;

function getSoundManager(): SoundManager {
  if (typeof window === 'undefined') {
    // Return a no-op proxy for SSR
    return {
      play: () => {},
      playSequence: async () => {},
      setEnabled: () => {},
      isEnabled: () => false,
      toggle: () => false,
      setMasterVolume: () => {},
      getMasterVolume: () => 1,
      playTradeResult: () => {},
      playStreakCelebration: () => {},
      playLevelUp: () => {},
    } as SoundManager;
  }

  if (!_soundManager) {
    _soundManager = new SoundManager();
  }
  return _soundManager;
}

// Export getter instead of direct instance
export const soundManager = {
  get instance() {
    return getSoundManager();
  },
  play: (type: SoundType) => getSoundManager().play(type),
  playSequence: (types: SoundType[], delayMs?: number) => getSoundManager().playSequence(types, delayMs),
  setEnabled: (enabled: boolean) => getSoundManager().setEnabled(enabled),
  isEnabled: () => getSoundManager().isEnabled(),
  toggle: () => getSoundManager().toggle(),
  setMasterVolume: (volume: number) => getSoundManager().setMasterVolume(volume),
  getMasterVolume: () => getSoundManager().getMasterVolume(),
  playTradeResult: (isWin: boolean, profit: number) => getSoundManager().playTradeResult(isWin, profit),
  playStreakCelebration: (streakLength: number) => getSoundManager().playStreakCelebration(streakLength),
  playLevelUp: () => getSoundManager().playLevelUp(),
};

// Convenience functions
export const playSound = (type: SoundType) => getSoundManager().play(type);
export const toggleSound = () => getSoundManager().toggle();
export const isSoundEnabled = () => getSoundManager().isEnabled();
export const setSoundEnabled = (enabled: boolean) => getSoundManager().setEnabled(enabled);
