import type { Room, RemoteTrack } from 'livekit-client';
export type GameAudio = {
  connect: (
    url: string,
    token: string,
    onStatus: (ready: boolean) => void,
  ) => Promise<void>;
  setSpeaking: (enabled: boolean) => Promise<void>;
  close: () => Promise<void>;
};
export function audioClient(platform: {
  autoplay?: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  attach: (track: RemoteTrack) => () => void;
}): GameAudio {
  let room: Room | null = null,
    generation = 0;
  let started = false;
  const cleanups: (() => void)[] = [];
  const close = async () => {
    generation++;
    const old = room;
    room = null;
    cleanups.splice(0).forEach(cleanup => cleanup());
    if (old) await old.disconnect();
    if (started) {
      started = false;
      await platform.stop();
    }
  };
  return {
    async connect(url, token, onStatus) {
      const { Room, RoomEvent, Track, createLocalAudioTrack } = await import(
        'livekit-client'
      );
      await close();
      const current = generation;
      try {
        await platform.start();
        started = true;
        // Check microphone permission in the lobby, without publishing any audio.
        const test = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
        });
        test.stop();
        if (current !== generation) {
          await close();
          return;
        }
        const next = new Room();
        room = next;
        next.on(RoomEvent.Disconnected, () => onStatus(false));
        next.on(RoomEvent.TrackSubscribed, track => {
          if (track.kind === Track.Kind.Audio)
            cleanups.push(platform.attach(track));
        });
        await next.connect(url, token);
        if (current !== generation) {
          await next.disconnect();
          return;
        }
        if (platform.autoplay) await next.startAudio();
        onStatus(true);
      } catch (error) {
        onStatus(false);
        await close();
        throw error;
      }
    },
    async setSpeaking(enabled) {
      const current = room;
      if (!current) return;
      if (enabled) {
        for (
          let n = 0;
          n < 10 && !current.localParticipant.permissions?.canPublish;
          n++
        )
          await new Promise<void>(resolve => setTimeout(resolve, 100));
      }
      if (current === room)
        await current.localParticipant.setMicrophoneEnabled(enabled, {
          echoCancellation: true,
          noiseSuppression: true,
        });
    },
    close,
  };
}
