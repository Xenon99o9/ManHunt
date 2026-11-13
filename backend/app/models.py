from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
import time


class Role(str, Enum):
    CHASSEUR = "chasseur"
    CHASSE = "chasse"


class GameState(str, Enum):
    LOBBY = "LOBBY"
    IN_GAME = "IN_GAME"
    FINISHED = "FINISHED"


class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    timestamp: float = Field(default_factory=time.time)


class CreateGameResponse(BaseModel):
    room_code: str
    message: str
