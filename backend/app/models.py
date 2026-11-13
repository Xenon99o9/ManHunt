from enum import Enum
from typing import Dict, Optional, List
from pydantic import BaseModel, Field
import time


class Role(str, Enum):
    CHASSEUR = "CHASSEUR"
    CHASSE = "CHASSE"


class GameState(str, Enum):
    LOBBY = "LOBBY"
    HEAD_START = "HEAD_START"
    HUNTING = "HUNTING"
    ENDED = "ENDED"


class Location(BaseModel):
    latitude: float
    longitude: float
    timestamp: float = Field(default_factory=time.time)


class Player(BaseModel):
    id: str
    name: str
    role: Role
    is_host: bool = False
    is_connected: bool = True
    location: Optional[Location] = None


class Room(BaseModel):
    code: str
    state: GameState = GameState.LOBBY
    players: Dict[str, Player] = Field(default_factory=dict)
    created_at: float = Field(default_factory=time.time)
    start_time: Optional[float] = None
    head_start_duration: int = 300  # 5 minutes in seconds
    reveal_interval: int = 300      # 5 minutes in seconds
    last_reveal_time: Optional[float] = None
    next_reveal_time: Optional[float] = None


# WebSocket Incoming / Outgoing Event Payloads
class WSAction(str, Enum):
    JOIN_ROOM = "JOIN_ROOM"
    LEAVE_ROOM = "LEAVE_ROOM"
    START_GAME = "START_GAME"
    UPDATE_LOCATION = "UPDATE_LOCATION"
    ROOM_STATE = "ROOM_STATE"
    GAME_STARTED = "GAME_STARTED"
    TIMER_TICK = "TIMER_TICK"
    LOCATION_REVEAL = "LOCATION_REVEAL"
    ERROR = "ERROR"
    PONG = "PONG"
    PING = "PING"


class WSMessage(BaseModel):
    action: WSAction
    payload: Optional[dict] = None
