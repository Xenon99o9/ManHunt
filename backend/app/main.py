import asyncio
import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.models import Role, GameState, WSAction, WSMessage
from app.state import (
    create_room, get_room, join_room, remove_player, update_player_location
)
from app.websocket_manager import manager
from app.game_loop import game_loop_task

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("manhunt.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start async background game loop task
    game_task = asyncio.create_task(game_loop_task())
    yield
    # Shutdown: Cancel game loop task
    game_task.cancel()
    try:
        await game_task
    except asyncio.CancelledError:
        logger.info("Game loop task cancelled successfully.")


app = FastAPI(
    title="ManHunt API",
    description="Backend in-memory for multiplayer ManHunt game",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# HTTP Schemas
class CreateRoomRequest(BaseModel):
    host_name: str
    host_role: Role
    player_id: str


class LocationUpdateRequest(BaseModel):
    player_id: str
    latitude: float
    longitude: float


@app.get("/")
def read_root():
    return {"status": "online", "message": "ManHunt FastAPI Server Running"}


@app.post("/api/rooms/{room_code}/location")
def api_update_location(room_code: str, req: LocationUpdateRequest):
    success = update_player_location(room_code, req.player_id, req.latitude, req.longitude)
    if not success:
        raise HTTPException(status_code=404, detail="Room or player not found")
    return {"status": "success"}



@app.post("/api/rooms", status_code=status.HTTP_201_CREATED)
def api_create_room(req: CreateRoomRequest):
    room = create_room(
        host_name=req.host_name,
        host_role=req.host_role,
        host_player_id=req.player_id
    )
    return {
        "room_code": room.code,
        "player_id": req.player_id,
        "room": room.model_dump()
    }


@app.get("/api/rooms/{room_code}")
def api_get_room(room_code: str):
    room = get_room(room_code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room.model_dump()


@app.websocket("/ws/{room_code}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_id: str):
    room_code = room_code.upper()
    await manager.connect(room_code, player_id, websocket)
    logger.info(f"Player {player_id} connected to WebSocket room {room_code}")

    try:
        while True:
            data = await websocket.receive_json()
            message = WSMessage(**data)
            action = message.action
            payload = message.payload or {}

            room = get_room(room_code)
            if not room:
                await manager.send_personal_message(
                    WSMessage(action=WSAction.ERROR, payload={"message": "Room not found"}),
                    websocket
                )
                break

            # 1. JOIN ROOM EVENT
            if action == WSAction.JOIN_ROOM:
                player_name = payload.get("player_name", "Anonymous")
                role = Role(payload.get("role", Role.CHASSE))

                updated_room = join_room(room_code, player_id, player_name, role)

                # Broadcast updated room state to all players
                await manager.broadcast_to_room(
                    room_code,
                    WSMessage(
                        action=WSAction.ROOM_STATE,
                        payload=updated_room.model_dump()
                    )
                )

            # 2. START GAME EVENT (Only Host)
            elif action == WSAction.START_GAME:
                player = room.players.get(player_id)
                if not player or not player.is_host:
                    await manager.send_personal_message(
                        WSMessage(action=WSAction.ERROR, payload={"message": "Only host can start the game"}),
                        websocket
                    )
                    continue

                room.state = GameState.HEAD_START
                room.start_time = time.time()

                logger.info(f"Room {room_code}: Game started! Entering HEAD_START phase.")

                await manager.broadcast_to_room(
                    room_code,
                    WSMessage(
                        action=WSAction.GAME_STARTED,
                        payload={
                            "room_state": room.state,
                            "head_start_duration": room.head_start_duration,
                            "reveal_interval": room.reveal_interval
                        }
                    )
                )

            # 3. GPS LOCATION UPDATE EVENT (Received continuously from client background task)
            elif action == WSAction.UPDATE_LOCATION:
                lat = payload.get("latitude")
                lng = payload.get("longitude")

                if lat is not None and lng is not None:
                    update_player_location(room_code, player_id, lat, lng)
                    logger.debug(f"Room {room_code}: Updated location for player {player_id} ({lat}, {lng})")

            # 4. PING / HEARTBEAT
            elif action == WSAction.PING:
                await manager.send_personal_message(
                    WSMessage(action=WSAction.PONG, payload={"timestamp": time.time()}),
                    websocket
                )

    except WebSocketDisconnect:
        logger.info(f"Player {player_id} disconnected from room {room_code}")
        manager.disconnect(room_code, player_id)
        updated_room = remove_player(room_code, player_id)

        if updated_room:
            await manager.broadcast_to_room(
                room_code,
                WSMessage(
                    action=WSAction.ROOM_STATE,
                    payload=updated_room.model_dump()
                )
            )
    except Exception as e:
        logger.error(f"WebSocket error for player {player_id} in room {room_code}: {e}")
        manager.disconnect(room_code, player_id)
