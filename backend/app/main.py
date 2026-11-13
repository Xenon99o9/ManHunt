import asyncio
import logging
import random
import secrets
import string
import time
from contextlib import asynccontextmanager
from typing import Dict, Optional, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("manhunt.backend")

# ============================================================================
# 1. STATE MANAGEMENT EN RAM (Dictionnaire Global sans BDD)
# ============================================================================

class PlayerConnection:
    """Représente un joueur connecté et ses coordonnées GPS actuelles."""
    def __init__(self, player_id: str, role: str, websocket: WebSocket, name: str = ""):
        self.player_id = player_id
        self.name = name or player_id
        self.role = role.lower()  # 'chasseur' ou 'chasse'
        self.websocket = websocket
        self.latitude: Optional[float] = None
        self.longitude: Optional[float] = None
        self.last_updated: Optional[float] = None


class Room:
    """Représente une partie active en mémoire vive."""
    def __init__(self, code: str):
        self.code = code
        self.state: str = "LOBBY"
        self.created_at: float = time.time()
        self.start_time: Optional[float] = None

        # Options configurables par l'hôte
        self.head_start_duration: int = 300  # 5 minutes de fuite par défaut
        self.reveal_interval: int = 300      # 5 minutes par défaut entre chaque reveal (60s, 120s, 180s, 300s, 600s)
        self.role_mode: str = "FREE"         # 'FREE' (libre), 'HOST' (par l'hôte), 'RANDOM' (aléatoire)
        self.max_hunters: int = 1            # Utilisé pour le mode aléatoire

        self.last_reveal_time: Optional[float] = None
        self.next_reveal_time: Optional[float] = None

        # Dictionnaire : player_id -> PlayerConnection
        self.players: Dict[str, PlayerConnection] = {}


# Dictionnaire global stocké exclusivement en RAM (Aucune BDD)
ROOMS: Dict[str, Room] = {}


def generate_unique_room_code(length: int = 6) -> str:
    """Génère un code d'accès unique à 6 lettres majuscules (ex: 'AMONGU')."""
    alphabet = string.ascii_uppercase
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        if code not in ROOMS:
            return code


def build_room_state_payload(room: Room) -> dict:
    """Formate l'état de la room pour l'envoi au frontend React Native."""
    players_dict = {}
    player_ids = list(room.players.keys())
    for p_id, p in room.players.items():
        players_dict[p_id] = {
            "id": p.player_id,
            "name": p.name,
            "role": p.role.upper(),
            "is_host": (p_id == player_ids[0]),
            "is_connected": True,
            "location": {
                "latitude": p.latitude,
                "longitude": p.longitude,
                "timestamp": p.last_updated
            } if p.latitude is not None else None
        }
    return {
        "code": room.code,
        "state": room.state,
        "created_at": room.created_at,
        "start_time": room.start_time,
        "head_start_duration": room.head_start_duration,
        "reveal_interval": room.reveal_interval,
        "role_mode": room.role_mode,
        "max_hunters": room.max_hunters,
        "players": players_dict
    }


async def broadcast_room_state(room_code: str):
    """Envoie l'état mis à jour de la room à tous les joueurs connectés."""
    if room_code in ROOMS:
        room = ROOMS[room_code]
        message = {
            "action": "ROOM_STATE",
            "payload": build_room_state_payload(room)
        }
        for player in list(room.players.values()):
            try:
                await player.websocket.send_json(message)
            except Exception:
                pass


async def broadcast_hunted_positions(room: Room):
    """Extraction et envoi des coordonnées GPS des chassés aux chasseurs."""
    current_time = time.time()
    hunted_positions = []
    for player in room.players.values():
        if player.role == "chasse" and player.latitude is not None and player.longitude is not None:
            hunted_positions.append({
                "player_id": player.player_id,
                "player_name": player.name,
                "latitude": player.latitude,
                "longitude": player.longitude,
                "last_updated": player.last_updated or current_time
            })

    payload = {
        "action": "HUNTED_POSITIONS_REVEAL",
        "type": "HUNTED_POSITIONS_REVEAL",
        "timestamp": current_time,
        "hunted_count": len(hunted_positions),
        "hunted_positions": hunted_positions,
        "payload": {
            "chasses": hunted_positions
        }
    }

    hunted_sent_count = 0
    for player in list(room.players.values()):
        if player.role == "chasseur":
            try:
                await player.websocket.send_json(payload)
                hunted_sent_count += 1
            except Exception as e:
                logger.warning(f"Erreur d'envoi WebSocket au chasseur {player.player_id}: {e}")

    logger.info(f"Room [{room.code}] : Révélation de {len(hunted_positions)} position(s) transmise(s) à {hunted_sent_count} chasseur(s).")


# ============================================================================
# 4. FILTRAGE ET TIMERS DE DIFFUSION (Boucle 1s)
# ============================================================================

async def location_broadcast_loop():
    """
    Tâche d'arrière-plan autonome s'exécutant chaque seconde.
    - Met à jour les décomptes TIMER_TICK (1s).
    - Déclenche le passage de HEAD_START -> HUNTING quand le chrono atteint 0.
    - Déclenche la révélation des positions des chassés aux chasseurs selon l'intervalle choisi.
    """
    logger.info("⚡ Démarrage de la boucle asynchrone autonome (tick: 1s).")
    while True:
        try:
            await asyncio.sleep(1)
            current_time = time.time()

            for room_code, room in list(ROOMS.items()):
                if room.state == "HEAD_START":
                    elapsed = current_time - (room.start_time or current_time)
                    remaining = max(0, int(room.head_start_duration - elapsed))

                    # Diffuser le tick d'une seconde
                    tick_msg = {
                        "action": "TIMER_TICK",
                        "payload": {
                            "phase": "HEAD_START",
                            "remaining_seconds": remaining,
                            "total_seconds": room.head_start_duration
                        }
                    }
                    for player in list(room.players.values()):
                        try:
                            await player.websocket.send_json(tick_msg)
                        except Exception:
                            pass

                    # Fin du chrono de fuite -> passage en chasse active
                    if remaining <= 0:
                        room.state = "HUNTING"
                        room.last_reveal_time = current_time
                        room.next_reveal_time = current_time + room.reveal_interval
                        logger.info(f"Room [{room_code}] : Fin du chrono de fuite. Début de la HUNTING phase !")

                        await broadcast_hunted_positions(room)
                        await broadcast_room_state(room_code)

                elif room.state == "HUNTING":
                    next_reveal = room.next_reveal_time or (current_time + room.reveal_interval)
                    remaining_reveal = max(0, int(next_reveal - current_time))

                    tick_msg = {
                        "action": "TIMER_TICK",
                        "payload": {
                            "phase": "HUNTING",
                            "remaining_seconds": remaining_reveal,
                            "total_seconds": room.reveal_interval
                        }
                    }
                    for player in list(room.players.values()):
                        try:
                            await player.websocket.send_json(tick_msg)
                        except Exception:
                            pass

                    # Intervalle atteint -> Nouvelle révélation des positions
                    if current_time >= next_reveal:
                        await broadcast_hunted_positions(room)
                        room.last_reveal_time = current_time
                        room.next_reveal_time = current_time + room.reveal_interval

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Erreur dans la boucle de jeu: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    broadcast_task = asyncio.create_task(location_broadcast_loop())
    yield
    broadcast_task.cancel()
    try:
        await broadcast_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="ManHunt Backend API",
    description="Backend in-memory sécurisé pour jeu mobile cache-cache GPS",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LocationPayload(BaseModel):
    latitude: float
    longitude: float


# ============================================================================
# 2. CRÉATION DE ROOM SÉCURISÉE
# ============================================================================

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "ManHunt FastAPI Backend",
        "active_rooms_count": len(ROOMS)
    }


@app.post("/create-game", status_code=status.HTTP_201_CREATED)
@app.get("/create-game", status_code=status.HTTP_201_CREATED)
def create_game():
    room_code = generate_unique_room_code(length=6)
    new_room = Room(code=room_code)
    ROOMS[room_code] = new_room

    logger.info(f"✨ Nouvelle partie créée. Room Code: [{room_code}]")
    return {
        "room_code": room_code,
        "message": "Game room created successfully",
        "created_at": new_room.created_at
    }


@app.post("/api/rooms/{room_code}/location")
def update_location_http(room_code: str, player_id: str, payload: LocationPayload):
    room_code_upper = room_code.upper()
    if room_code_upper not in ROOMS:
        raise HTTPException(status_code=404, detail="Room not found")

    room = ROOMS[room_code_upper]
    if player_id in room.players:
        player = room.players[player_id]
        player.latitude = payload.latitude
        player.longitude = payload.longitude
        player.last_updated = time.time()
        return {"status": "success"}

    raise HTTPException(status_code=404, detail="Player not found in room")


# ============================================================================
# 3. WEBSOCKET & ACTIONS DE JEU
# ============================================================================

@app.websocket("/ws/{room_code}/{player_id}/{role}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_id: str, role: str):
    room_code_upper = room_code.upper()
    normalized_role = role.lower()

    if normalized_role not in ("chasseur", "chasse"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid role. Must be 'chasseur' or 'chasse'")
        return

    if room_code_upper not in ROOMS:
        logger.warning(f"⛔ Connexion WebSocket refusée. Code room inconnu : [{room_code_upper}]")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Room code does not exist")
        return

    await websocket.accept()
    room = ROOMS[room_code_upper]

    player_conn = PlayerConnection(player_id=player_id, role=normalized_role, websocket=websocket)
    room.players[player_id] = player_conn

    logger.info(f"🎮 Joueur [{player_id}] ({normalized_role}) connecté à [{room_code_upper}]. Total: {len(room.players)}")

    await broadcast_room_state(room_code_upper)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action") or data.get("type")

            if action == "JOIN_ROOM":
                payload = data.get("payload", {})
                if "player_name" in payload:
                    player_conn.name = payload["player_name"]
                await broadcast_room_state(room_code_upper)

            # Mise à jour de la configuration de la partie par l'hôte
            elif action == "UPDATE_CONFIG":
                player = room.players.get(player_id)
                player_ids = list(room.players.keys())
                if player and player_ids and player_id == player_ids[0]:  # Verifier que c'est l'hôte
                    payload = data.get("payload", {})
                    if "reveal_interval" in payload:
                        interval = int(payload["reveal_interval"])
                        room.reveal_interval = interval
                        room.head_start_duration = interval  # Met également à jour le temps de fuite initial !
                    if "role_mode" in payload:
                        room.role_mode = str(payload["role_mode"])
                    if "max_hunters" in payload:
                        room.max_hunters = int(payload["max_hunters"])
                    await broadcast_room_state(room_code_upper)

            # L'hôte modifie le rôle d'un joueur directement
            elif action == "CHANGE_PLAYER_ROLE":
                player = room.players.get(player_id)
                player_ids = list(room.players.keys())
                if player and player_ids and player_id == player_ids[0]:
                    payload = data.get("payload", {})
                    target_id = payload.get("target_id")
                    new_role = payload.get("role", "").lower()
                    if target_id in room.players and new_role in ("chasseur", "chasse"):
                        room.players[target_id].role = new_role
                        await broadcast_room_state(room_code_upper)

            # Lancement de la partie
            elif action == "START_GAME":
                player = room.players.get(player_id)
                player_ids = list(room.players.keys())
                if player and player_ids and player_id == player_ids[0]:
                    # Attribution aléatoire si le mode RANDOM est activé
                    if room.role_mode == "RANDOM":
                        all_p_ids = list(room.players.keys())
                        random.shuffle(all_p_ids)
                        num_hunters = min(room.max_hunters, len(all_p_ids))
                        for idx, p_id in enumerate(all_p_ids):
                            if idx < num_hunters:
                                room.players[p_id].role = "chasseur"
                            else:
                                room.players[p_id].role = "chasse"

                    room.state = "HEAD_START"
                    room.start_time = time.time()

                    start_msg = {
                        "action": "GAME_STARTED",
                        "payload": {
                            "head_start_duration": room.head_start_duration,
                            "reveal_interval": room.reveal_interval
                        }
                    }
                    for p in list(room.players.values()):
                        try:
                            await p.websocket.send_json(start_msg)
                        except Exception:
                            pass
                    await broadcast_room_state(room_code_upper)

            elif "latitude" in data and "longitude" in data:
                player_conn.latitude = float(data["latitude"])
                player_conn.longitude = float(data["longitude"])
                player_conn.last_updated = time.time()

            elif action == "PING":
                await websocket.send_json({"type": "PONG", "timestamp": time.time()})

    except WebSocketDisconnect:
        logger.info(f"👋 Déconnexion de [{player_id}] de [{room_code_upper}].")
    except Exception as e:
        logger.error(f"Erreur WebSocket [{player_id}] room [{room_code_upper}]: {e}")
    finally:
        if room_code_upper in ROOMS:
            room = ROOMS[room_code_upper]
            room.players.pop(player_id, None)

            if len(room.players) == 0:
                del ROOMS[room_code_upper]
                logger.info(f"🧹 GARBAGE COLLECTION: [{room_code_upper}] supprimée de la RAM.")
            else:
                await broadcast_room_state(room_code_upper)
