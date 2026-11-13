import asyncio
import logging
import secrets
import string
import time
from contextlib import asynccontextmanager
from typing import Dict, Optional
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
    def __init__(self, player_id: str, role: str, websocket: WebSocket):
        self.player_id = player_id
        self.role = role.lower()  # 'chasseur' ou 'chasse'
        self.websocket = websocket
        self.latitude: Optional[float] = None
        self.longitude: Optional[float] = None
        self.last_updated: Optional[float] = None


class Room:
    """Représente une partie active en mémoire vive."""
    def __init__(self, code: str):
        self.code = code
        self.created_at: float = time.time()
        # Dictionnaire d'associativité : player_id -> PlayerConnection
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


# ============================================================================
# 4. FILTRAGE DE DIFFUSION (Boucle asynchrone 5 minutes)
# ============================================================================

async def location_broadcast_loop():
    """
    Tâche d'arrière-plan autonome s'exécutant toutes les 5 minutes (300 secondes).
    Récupère les positions GPS des 'chassés' de chaque room et les envoie
    EXCLUSIVEMENT aux WebSockets des 'chasseurs' de la même room.
    """
    logger.info("⚡ Démarrage de la boucle asynchrone de diffusion GPS (intervalle: 5 min).")
    while True:
        try:
            await asyncio.sleep(300)  # Attente de 5 minutes (300 secondes)
            current_time = time.time()

            # Parcours de toutes les rooms actives stockées en RAM
            for room_code, room in list(ROOMS.items()):
                # 1. Extraction des coordonnées GPS actuelles des "chassés"
                hunted_positions = []
                for player in room.players.values():
                    if player.role == "chasse" and player.latitude is not None and player.longitude is not None:
                        hunted_positions.append({
                            "player_id": player.player_id,
                            "latitude": player.latitude,
                            "longitude": player.longitude,
                            "last_updated": player.last_updated
                        })

                # 2. Construction du paquet JSON réservé aux chasseurs
                payload = {
                    "type": "HUNTED_POSITIONS_REVEAL",
                    "timestamp": current_time,
                    "hunted_count": len(hunted_positions),
                    "hunted_positions": hunted_positions
                }

                # 3. Diffusion EXCLUSIVE aux WebSockets des "chasseurs"
                hunted_sent_count = 0
                for player in list(room.players.values()):
                    if player.role == "chasseur":
                        try:
                            await player.websocket.send_json(payload)
                            hunted_sent_count += 1
                        except Exception as e:
                            logger.warning(f"Erreur d'envoi WebSocket au chasseur {player.player_id}: {e}")

                logger.info(
                    f"Room [{room_code}] : Révélation de {len(hunted_positions)} position(s) de chassé(s) "
                    f"transmise(s) à {hunted_sent_count} chasseur(s)."
                )

        except asyncio.CancelledError:
            logger.info("Boucle de diffusion GPS interrompue.")
            break
        except Exception as e:
            logger.error(f"Erreur dans la boucle de diffusion GPS: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Démarrage de la tâche de fond asyncio
    broadcast_task = asyncio.create_task(location_broadcast_loop())
    yield
    # Nettoyage à l'arrêt du serveur
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


# Schemas Pydantic
class LocationPayload(BaseModel):
    latitude: float
    longitude: float


# ============================================================================
# 2. CRÉATION DE ROOM SÉCURISÉE (Endpoint HTTP /create-game)
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
    """
    Génère et renvoie un code d'accès aléatoire et unique à 6 lettres majuscules (ex: 'AMONGU').
    Instancie la room associée dans le dictionnaire global en RAM.
    """
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
    """Endpoint de secours HTTP pour mise à jour GPS en arrière-plan."""
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
# 3. CONNEXION WEBSOCKET & 5. GARBAGE COLLECTION
# ============================================================================

@app.websocket("/ws/{room_code}/{player_id}/{role}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_id: str, role: str):
    """
    Endpoint WebSocket temps réel.
    - Rejette la connexion si le room_code n'existe pas en RAM.
    - Accepte la connexion et enregistre les coordonnées GPS reçues.
    - Supprime automatiquement la room (Garbage Collection) à la déconnexion du dernier joueur.
    """
    room_code_upper = room_code.upper()
    normalized_role = role.lower()

    # Validation du rôle
    if normalized_role not in ("chasseur", "chasse"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid role. Must be 'chasseur' or 'chasse'")
        return

    # 3. Validation de l'existence du room_code dans le dictionnaire RAM
    if room_code_upper not in ROOMS:
        logger.warning(f"⛔ Connexion WebSocket refusée. Code room inconnu : [{room_code_upper}]")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Room code does not exist")
        return

    # Connexion acceptée par le serveur
    await websocket.accept()
    room = ROOMS[room_code_upper]

    player_conn = PlayerConnection(player_id=player_id, role=normalized_role, websocket=websocket)
    room.players[player_id] = player_conn

    logger.info(f"🎮 Joueur [{player_id}] ({normalized_role}) connecté à la room [{room_code_upper}]. Total: {len(room.players)}")

    # Envoi de confirmation initiale au client
    await websocket.send_json({
        "type": "CONNECTED",
        "room_code": room_code_upper,
        "player_id": player_id,
        "role": normalized_role
    })

    try:
        while True:
            data = await websocket.receive_json()

            # Mise à jour continue des coordonnées GPS envoyées par l'application mobile
            if "latitude" in data and "longitude" in data:
                player_conn.latitude = float(data["latitude"])
                player_conn.longitude = float(data["longitude"])
                player_conn.last_updated = time.time()

            elif data.get("type") == "PING":
                await websocket.send_json({"type": "PONG", "timestamp": time.time()})

    except WebSocketDisconnect:
        logger.info(f"👋 Déconnexion du joueur [{player_id}] de la room [{room_code_upper}].")
    except Exception as e:
        logger.error(f"Erreur WebSocket joueur [{player_id}] room [{room_code_upper}]: {e}")
    finally:
        # 5. GARBAGE COLLECTION : Nettoyage en mémoire RAM
        if room_code_upper in ROOMS:
            room = ROOMS[room_code_upper]
            room.players.pop(player_id, None)

            # Si plus aucun joueur n'est connecté, suppression définitive de la room
            if len(room.players) == 0:
                del ROOMS[room_code_upper]
                logger.info(f"🧹 GARBAGE COLLECTION: La room [{room_code_upper}] est vide et a été définitivement supprimée de la RAM.")
