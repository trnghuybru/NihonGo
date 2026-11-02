import type { Room, RemoteTrack } from 'livekit-client';
export type GameAudio = {
  connect: (
    url: string,
    token: string,
    onStatus: (ready: boolean) => void,
    onPlaybackBlocked?: (blocked: boolean) => void,
  ) => Promise<void>;
  setSpeaking: (enabled: boolean) => Promise<void>;
  resumePlayback: () => Promise<void>;
  close: () => Promise<void>;
};
export function audioClient(platform: {
  autoplay?: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  attach: (
    track: RemoteTrack,
    onBlocked: (blocked: boolean) => void,
  ) => () => void;
}): GameAudio {
  let room: Room | null = null,
    generation = 0;
  let started = false;
  const cleanups = new Map<RemoteTrack, () => void>();
  let microphoneQueue = Promise.resolve();
  let desiredSpeaking = false;
  let speakingRequest = 0;
  const close = async () => {
    generation++;
    const old = room;
    room = null;
    desiredSpeaking = false;
    speakingRequest++;
    cleanups.forEach(cleanup => cleanup());
    cleanups.clear();
    if (old) await old.disconnect();
    if (started) {
      started = false;
      await platform.stop();
    }
  };
  return {
    async connect(url, token, onStatus, onPlaybackBlocked = () => {}) {
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
          return;
        }
        const next = new Room();
        room = next;
        const blocked = (value: boolean) => {
          if (current === generation && next === room) onPlaybackBlocked(value);
        };
        const attach = (track: RemoteTrack) => {
          if (
            current === generation &&
            track.kind === Track.Kind.Audio &&
            !cleanups.has(track)
          )
            cleanups.set(track, platform.attach(track, blocked));
        };
        const reconcile = () => {
          for (const participant of next.remoteParticipants.values())
            for (const publication of participant.audioTrackPublications.values())
              if (publication.track) attach(publication.track);
        };
        next.on(RoomEvent.Disconnected, () => {
          if (next === room) onStatus(false);
        });
        next.on(RoomEvent.Reconnecting, () => {
          if (next === room) onStatus(false);
        });
        next.on(RoomEvent.Reconnected, () => {
          if (next === room) {
            reconcile();
            onStatus(true);
          }
        });
        next.on(RoomEvent.TrackSubscribed, attach);
        next.on(RoomEvent.TrackUnsubscribed, track => {
          cleanups.get(track)?.();
          cleanups.delete(track);
        });
        next.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          blocked(!next.canPlaybackAudio);
        });
        await next.connect(url, token, { autoSubscribe: true });
        if (current !== generation) {
          await next.disconnect();
          return;
        }
        reconcile();
        if (platform.autoplay) {
          try {
            await next.startAudio();
            blocked(!next.canPlaybackAudio);
          } catch {
            blocked(true);
          }
        }
        onStatus(true);
      } catch (error) {
        if (current === generation) {
          onStatus(false);
          await close();
        }
        throw error;
      }
    },
    setSpeaking(enabled) {
      desiredSpeaking = enabled;
      const request = ++speakingRequest;
      const current = room;
      // Permission updates and React effects can arrive in opposite orders.
      // Serialize track operations and discard obsolete requests after every await.
      const operation = microphoneQueue
        .catch(() => {})
        .then(async () => {
          if (!current || current !== room || request !== speakingRequest)
            return;
          if (enabled) {
            for (
              let n = 0;
              n < 40 && !current.localParticipant.permissions?.canPublish;
              n++
            ) {
              if (
                !desiredSpeaking ||
                request !== speakingRequest ||
                current !== room
              )
                return;
              await new Promise<void>(resolve => setTimeout(resolve, 100));
            }
            if (!current.localParticipant.permissions?.canPublish)
              throw new Error(
                'Chưa nhận được quyền phát micro. Hãy kết nối lại âm thanh.',
              );
          }
          if (current !== room || request !== speakingRequest) return;
          await current.localParticipant.setMicrophoneEnabled(enabled, {
            echoCancellation: true,
            noiseSuppression: true,
          });
          if (enabled && (!desiredSpeaking || current !== room))
            await current.localParticipant.setMicrophoneEnabled(false);
        });
      microphoneQueue = operation.catch(() => {});
      return operation;
    },
    async resumePlayback() {
      // Called directly by a user gesture, before any network/permission await.
      await room?.startAudio();
    },
    close,
  };
}
