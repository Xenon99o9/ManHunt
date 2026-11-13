import secrets
import string
from typing import Dict, Optional
from app.models import Room, Player, Role, GameState, Location

# RAM Storage: room_code -> Room
ROOMS_DB: Dict[str, Room] = {}


def generate_room_code(length: int = 4) -> str:
    """Generates a random uppercase room code (e.g., 'MH8X')."""
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        if code not in ROOMS_DB:
            return code


def create_room(host_name: str, host_role: Role, host_player_id: str) -> Room:
    code = generate_room_code()
    host_player = Player(
        id=host_player_id,
        name=host_name,
        role=host_role,
        is_host=True,
        is_connected=True
    )
    room = Room(code=code, players={host_player_id: host_player})
    ROOMS_DB[code] = room
    return room


def get_room(room_code: str) -> Optional[Room]:
    return ROOMS_DB.get(room_code.upper())


def join_room(room_code: str, player_id: str, player_name: str, role: Role) -> Optional[Room]:
    room = get_room(room_code)
    if not room:
        return None

    if player_id in room.players:
        # Reconnecting existing player
        room.players[player_id].is_connected = True
        room.players[player_id].name = player_name
        room.players[player_id].role = role
    else:
        # New player
        new_player = Player(
            id=player_id,
            name=player_name,
            role=role,
            is_host=False,
            is_connected=True
        )
        room.players[player_id] = new_player

    return room


def remove_player(room_code: str, player_id: str) -> Optional[Room]:
    room = get_room(room_code)
    if not room:
        return None

    if player_id in room.players:
        room.players[player_id].is_connected = False

    # Clean up room if all disconnected
    active_players = [p for p in room.players.values() if p.is_connected]
    if not active_players:
        ROOMS_DB.pop(room_code, None)
        return None

    return room


def update_player_location(room_code: str, player_id: str, lat: float, lng: float) -> bool:
    room = get_room(room_code)
    if not room or player_id not in room.players:
        return False

    room.players[player_id].location = Location(latitude=lat, longitude=lng)
    return True
