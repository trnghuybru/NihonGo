import { audioClient } from './gameAudioCore';
export type { GameAudio } from './gameAudioCore';
export function createGameAudio() {
  const outputs = new Set<HTMLMediaElement>();
  const blocked = new Set<HTMLMediaElement>();
  let report = (_blocked: boolean) => {};
  const play = async (element: HTMLMediaElement) => {
    try {
      element.muted = false;
      await element.play();
      blocked.delete(element);
    } catch (error) {
      if (outputs.has(element) && (error as Error)?.name !== 'AbortError')
        blocked.add(element);
    }
    if (outputs.has(element)) report(blocked.size > 0);
  };
  const resume = async () => {
    await Promise.all([...outputs].map(play));
    if (blocked.size)
      throw new Error('Trình duyệt chưa cho phép phát âm thanh.');
  };
  const unlock = () => {
    resume().catch(() => {});
  };
  const visible = () => {
    if (document.visibilityState === 'visible') unlock();
  };
  return audioClient({
    autoplay: true,
    start: async () => {
      // A gesture after joining must also unlock tracks that arrive later.
      document.addEventListener('pointerup', unlock);
      document.addEventListener('keydown', unlock);
      document.addEventListener('visibilitychange', visible);
    },
    stop: async () => {
      document.removeEventListener('pointerup', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visible);
    },
    resume,
    attach(track, onBlocked) {
      report = onBlocked;
      const element = track.attach();
      element.setAttribute('playsinline', '');
      element.style.display = 'none';
      document.body.appendChild(element);
      outputs.add(element);
      const retry = () => {
        play(element).catch(() => {});
      };
      // A track can survive several turns, muting and unmuting between them.
      track.on('unmuted', retry);
      element.addEventListener('pause', retry);
      retry();
      return () => {
        outputs.delete(element);
        blocked.delete(element);
        track.off('unmuted', retry);
        element.removeEventListener('pause', retry);
        track.detach(element);
        element.remove();
        report(blocked.size > 0);
      };
    },
  });
}
