import { audioClient } from './gameAudioCore';
export type { GameAudio } from './gameAudioCore';
export function createGameAudio() {
  return audioClient({
    autoplay: true,
    start: async () => {},
    stop: async () => {},
    attach(track, onBlocked) {
      const element = track.attach();
      element.style.display = 'none';
      document.body.appendChild(element);
      let disposed = false;
      // Tracks arriving after connect also need playback handling (Safari/mobile).
      element.play().catch(error => {
        if (!disposed && error?.name !== 'AbortError') onBlocked(true);
      });
      return () => {
        disposed = true;
        track.detach(element);
        element.remove();
      };
    },
  });
}
