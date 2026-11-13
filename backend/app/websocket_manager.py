from typing import Dict, Set
from fastapi import WebSocket
from app.models import WSMessage


class ConnectionManager:
    """Manages WebSocket connections grouped by room_code."""

    def __init__(self):
        # room_code -> { player_id -> WebSocket }
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, room_code: str, player_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = {}
        self.active_connections[room_code][player_id] = websocket

    def disconnect(self, room_code: str, player_id: str):
        if room_code in self.active_connections:
            self.active_connections[room_code].pop(player_id, None)
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def send_personal_message(self, message: WSMessage, websocket: WebSocket):
        await websocket.send_json(message.model_dump())

    async def broadcast_to_room(self, room_code: str, message: WSMessage):
        if room_code in self.active_connections:
            connections = list(self.active_connections[room_code].items())
            for player_id, websocket in connections:
                try:
                    await websocket.send_json(message.model_dump())
                except Exception:
                    # Connection closed or dead socket
                    pass

    async def broadcast_to_role(self, room_code: str, role: str, room_players: dict, message: WSMessage):
        if room_code in self.active_connections:
            for player_id, websocket in list(self.active_connections[room_code].items()):
                player = room_players.get(player_id)
                if player and player.role == role:
                    try:
                        await websocket.send_json(message.model_dump())
                    except Exception:
                        pass


manager = ConnectionManager()
