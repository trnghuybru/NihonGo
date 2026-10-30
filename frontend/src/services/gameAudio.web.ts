import { audioClient } from './gameAudioCore';
export type { GameAudio } from './gameAudioCore';
export function createGameAudio() {
  return audioClient({
    autoplay: true,
    start: async () => {},
    stop: async () => {},
    attach(track) {
      const element = track.attach();
      element.style.display = 'none';
      document.body.appendChild(element);
      return () => {
        track.detach(element);
        element.remove();
      };
    },
  });
}
