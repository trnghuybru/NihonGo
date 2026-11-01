"""Test public LiveKit signaling and two disposable participants."""
import asyncio
import os
import uuid
from datetime import timedelta

from livekit import api, rtc


async def main():
    key = os.environ["LIVEKIT_API_KEY"]
    secret = os.environ["LIVEKIT_API_SECRET"]
    room_name = "beta-smoke-" + uuid.uuid4().hex
    rooms = []
    try:
        for index in (1, 2):
            token = (api.AccessToken(key, secret)
                     .with_identity(f"smoke-{index}")
                     .with_ttl(timedelta(minutes=2))
                     .with_grants(api.VideoGrants(room_join=True, room=room_name))
                     .to_jwt())
            room = rtc.Room()
            await asyncio.wait_for(room.connect(os.environ["LIVEKIT_PUBLIC_URL"], token), 25)
            rooms.append(room)
        for _ in range(20):
            if len(rooms[0].remote_participants) == 1 and len(rooms[1].remote_participants) == 1:
                break
            await asyncio.sleep(0.25)
        if len(rooms[0].remote_participants) != 1 or len(rooms[1].remote_participants) != 1:
            raise RuntimeError("participant_visibility_failed:" +
                               f"{len(rooms[0].remote_participants)},{len(rooms[1].remote_participants)}")
        print("game_transport=two_participants_connected")
    finally:
        for room in rooms:
            await room.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
