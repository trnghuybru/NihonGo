import asyncio
from datetime import timedelta
from flask import current_app
from api_errors import ApiError


def configured():
    return all(current_app.config.get(k) for k in ('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'))


def room_name(identifier):
    return 'vocabulary-' + identifier


def access_token(row, identity, name, worker=False):
    from livekit import api
    cfg = current_app.config
    return (api.AccessToken(cfg['LIVEKIT_API_KEY'], cfg['LIVEKIT_API_SECRET'])
            .with_identity(identity).with_name(name).with_ttl(timedelta(hours=2))
            .with_grants(api.VideoGrants(room_join=True, room=room_name(row.id),
                can_publish=bool(not worker and row.state.get('phase') == 'reading' and row.state.get('holder') == identity),
                can_subscribe=True, can_publish_data=False, can_publish_sources=['microphone'], hidden=worker))
            .to_jwt())


async def update_permissions(config, identifier, identity, allowed):
    from livekit import api
    import aiohttp
    async with api.LiveKitAPI(config['LIVEKIT_URL'], config['LIVEKIT_API_KEY'], config['LIVEKIT_API_SECRET'],
                             timeout=aiohttp.ClientTimeout(total=5)) as client:
        await client.room.update_participant(api.UpdateParticipantRequest(room=room_name(identifier), identity=identity,
            permission=api.ParticipantPermission(can_publish=allowed, can_subscribe=True, can_publish_data=False,
                                                  can_publish_sources=[api.TrackSource.MICROPHONE])))


def permission(row, identity, allowed):
    if not configured():
        raise ApiError('Chưa cấu hình truyền âm thanh cho mode đọc.', 503, 'game_audio_unavailable')
    try:
        asyncio.run(update_permissions(dict(current_app.config), row.id, identity, allowed))
    except Exception as error:
        current_app.logger.warning('Game audio permission failed (%s)', type(error).__name__)
        raise ApiError('Chưa kết nối được micro trong phòng. Hãy kết nối lại âm thanh.', 503, 'game_audio_unavailable') from None
