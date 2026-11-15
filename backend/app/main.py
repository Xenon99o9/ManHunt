import asyncio
import logging
import math
import random
import secrets
import string
import time
from contextlib import asynccontextmanager
from typing import Dict, Optional, List, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configuration du logging détaillé pour la console Render
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("manhunt.backend")

# ============================================================================
# BARÈME DES POINTS (Ajusté et équilibré)
# ============================================================================
POINTS_PASSIVE_SURVIVAL_PER_MIN = 5       # +5 pts par minute survécue en phase HUNTING
POINTS_SURVIVED_PING = 20                 # +20 pts à chaque ping GPS survécu
POINTS_RISK_SUCCESS = 80                  # +80 pts si survie complète après Prise de Risque
POINTS_HUNTED_VICTORY = 150               # +150 pts pour les chassés survivants en fin de manche
POINTS_HUNTER_CAPTURE = 120               # +120 pts pour le chasseur qui réalise la capture
POINTS_HUNTER_RISK_INTERCEPT_BONUS = 50   # +50 pts bonus si capture pendant une Prise de Risque active
POINTS_HUNTER_ASSIST = 25                 # +25 pts aux autres chasseurs lors d'une capture
POINTS_HUNTER_CLEAN_SWEEP = 100           # +100 pts aux chasseurs d'origine si tous les chassés sont capturés


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcule la distance en mètres entre deux coordonnées GPS."""
    r = 6371000.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def apply_fuzz_offset(lat: float, lon: float, radius_meters: int) -> tuple[float, float]:
    """Décale aléatoirement une coordonnée GPS dans un rayon donné en mètres."""
    if radius_meters <= 0:
        return lat, lon
    # Distribution uniforme dans un disque de rayon radius_meters
    distance = radius_meters * math.sqrt(random.random())
    angle = random.uniform(0, 2 * math.pi)
    delta_lat = (distance * math.cos(angle)) / 111320.0
    cos_lat = max(0.0001, math.cos(math.radians(lat)))
    delta_lon = (distance * math.sin(angle)) / (111320.0 * cos_lat)
    return round(lat + delta_lat, 6), round(lon + delta_lon, 6)


# ============================================================================
# 1. STATE MANAGEMENT EN RAM (Dictionnaire Global sans BDD)
# ============================================================================

class PlayerConnection:
    """Représente un joueur dans une Room, ses scores, son état de risque et son GPS."""
    def __init__(self, player_id: str, role: str, websocket: WebSocket, name: str = ""):
        self.player_id = player_id
        self.name = name or player_id
        self.role = role.lower()          # 'chasseur' ou 'chasse'
        self.initial_role = self.role     # Rôle au lancement de la manche
        self.status = "ACTIVE"            # 'ACTIVE' ou 'SPECTATOR' (chassé éliminé en mode TIMER)
        self.websocket = websocket
        self.is_connected = True

        # Coordonnées GPS temps réel (privées côté serveur jusqu'au prochain ping)
        self.latitude: Optional[float] = None
        self.longitude: Optional[float] = None
        self.last_updated: Optional[float] = None

        # Scores et statistiques
        self.score_total: int = 0
        self.score_current_round: int = 0
        self.captures_count: int = 0
        self.times_captured: int = 0
        self.successful_risks: int = 0
        self.survived_seconds: int = 0
        self.last_survival_point_at: Optional[float] = None
        self.captured_by: Optional[str] = None

        # État "Prise de Risque"
        self.risk_used_in_cycle: bool = False
        self.risk_active: bool = False
        self.risk_activated_at: Optional[float] = None
        self.risk_expires_at: Optional[float] = None

        # Alerte de proximité
        self.proximity_alert_active: bool = False

    def reset_for_new_round(self):
        self.initial_role = self.role
        self.status = "ACTIVE"
        self.score_current_round = 0
        self.survived_seconds = 0
        self.last_survival_point_at = None
        self.captured_by = None
        self.risk_used_in_cycle = False
        self.risk_active = False
        self.risk_activated_at = None
        self.risk_expires_at = None
        self.proximity_alert_active = False

    def add_points(self, pts: int):
        if pts <= 0:
            return
        self.score_current_round += pts
        self.score_total += pts


class Room:
    """Représente une Room persistante en mémoire vive."""
    def __init__(self, code: str):
        self.code = code
        self.state: str = "LOBBY"  # 'LOBBY', 'HEAD_START', 'HUNTING'
        self.host_id: Optional[str] = None
        self.created_at: float = time.time()
        self.round_number: int = 0

        # Paramètres personnalisables par l'Hôte
        self.game_mode: str = "TIMER"               # 'TIMER' ou 'INFECTED'
        self.game_duration_seconds: int = 1200      # 20 min par défaut en mode TIMER
        self.head_start_duration: int = 120         # 2 min d'avance avant le 1er ping
        self.reveal_interval: int = 180             # 3 min entre chaque ping GPS
        self.max_hunters: int = 1                   # Nombre de chasseurs
        self.role_mode: str = "RANDOM"              # 'RANDOM', 'HOST', 'FREE'
        self.anonymous_markers: bool = False        # Masquer les noms sur la carte
        self.risk_survival_duration: int = 60       # 60s de survie pour valider une Prise de Risque
        self.ping_fuzz_radius_meters: int = 0       # Flou GPS (0m, 15m, 30m, 50m)
        self.proximity_alert_meters: int = 0        # Alerte proximité (0=Off, 50m, 100m)
        self.final_sprint_enabled: bool = True      # Pings 2x plus rapides dans les 2 dernières minutes

        # Timers de manche
        self.start_time: Optional[float] = None
        self.hunting_started_at: Optional[float] = None
        self.last_reveal_time: Optional[float] = None
        self.next_reveal_time: Optional[float] = None
        self.ping_cycle_index: int = 0

        # Snapshot de la carte figée (partagée entre tous les joueurs)
        self.last_ping_timestamp: Optional[float] = None
        self.snapshot_markers: List[Dict[str, Any]] = []

        # Résumé de la dernière manche terminée
        self.last_round_summary: Optional[Dict[str, Any]] = None
        # Événement flash récent (capture, prise de risque...)
        self.last_event: Optional[Dict[str, Any]] = None

        # Dictionnaire : player_id -> PlayerConnection
        self.players: Dict[str, PlayerConnection] = {}

    def ensure_host(self):
        """S'assure qu'il y a toujours un Hôte valide parmi les joueurs présents."""
        if not self.players:
            self.host_id = None
            return
        if self.host_id not in self.players:
            self.host_id = next(iter(self.players.keys()))
            logger.info(f"👑 [HOST AUTO-ASSIGN] Room [{self.code}] Nouvel hôte: [{self.host_id}]")


ROOMS: Dict[str, Room] = {}


def generate_unique_room_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        if code not in ROOMS:
            return code


def get_effective_reveal_interval(room: Room, current_time: float) -> int:
    """Calcule l'intervalle de ping actif (divisé par 2 en Sprint Final si activé)."""
    base = max(15, room.reveal_interval)
    if (
        room.game_mode == "TIMER"
        and room.final_sprint_enabled
        and room.hunting_started_at is not None
    ):
        elapsed_hunt = current_time - room.hunting_started_at
        remaining_game = room.game_duration_seconds - elapsed_hunt
        if remaining_game <= 120:
            return max(15, base // 2)
    return base


def take_map_snapshot(room: Room, current_time: float):
    """Prend une photo figée des positions de tous les joueurs actifs au moment du ping."""
    markers: List[Dict[str, Any]] = []
    for p in room.players.values():
        if p.status != "ACTIVE":
            continue
        if p.latitude is None or p.longitude is None:
            continue

        role_upper = p.role.upper()
        # Si le flou est activé, on l'applique sur les pings réguliers
        lat, lon = apply_fuzz_offset(p.latitude, p.longitude, room.ping_fuzz_radius_meters)
        display_name = (
            ("Chasseur" if role_upper == "CHASSEUR" else "Chassé")
            if room.anonymous_markers
            else p.name
        )
        markers.append({
            "player_id": p.player_id,
            "player_name": display_name,
            "display_name": display_name,
            "role": role_upper,
            "latitude": lat,
            "longitude": lon,
            "timestamp": current_time,
            "last_updated": current_time,
            "source": "PING",
        })

    room.last_ping_timestamp = current_time
    room.snapshot_markers = markers


def upsert_risk_marker_in_snapshot(room: Room, player: PlayerConnection, current_time: float):
    """Révèle immédiatement la position exacte (sans flou) d'un Chassé qui prend un risque."""
    if player.latitude is None or player.longitude is None:
        return
    display_name = "Chassé (Risque ⚡)" if room.anonymous_markers else f"{player.name} ⚡"
    new_marker = {
        "player_id": player.player_id,
        "player_name": display_name,
        "display_name": display_name,
        "role": "CHASSE",
        "latitude": player.latitude,
        "longitude": player.longitude,
        "timestamp": current_time,
        "last_updated": current_time,
        "source": "RISK_TAKEN",
    }
    updated = [m for m in room.snapshot_markers if m.get("player_id") != player.player_id]
    updated.append(new_marker)
    room.snapshot_markers = updated


def remove_player_from_snapshot(room: Room, player_id: str):
    """Retire ou met à jour le marqueur d'un joueur capturé."""
    room.snapshot_markers = [
        m for m in room.snapshot_markers if m.get("player_id") != player_id
    ]


def build_room_state_payload(room: Room) -> dict:
    room.ensure_host()
    current_time = time.time()
    players_dict = {}

    for p_id, p in room.players.items():
        risk_remaining = 0
        if p.risk_active and p.risk_expires_at:
            risk_remaining = max(0, int(p.risk_expires_at - current_time))

        players_dict[p_id] = {
            "id": p.player_id,
            "name": p.name,
            "role": p.role.upper(),
            "initial_role": p.initial_role.upper(),
            "status": p.status,
            "is_host": (p_id == room.host_id),
            "is_connected": p.is_connected,
            "score_total": p.score_total,
            "score_current_round": p.score_current_round,
            "captured_by": p.captured_by,
            "proximity_alert": p.proximity_alert_active,
            "stats": {
                "captures_count": p.captures_count,
                "times_captured": p.times_captured,
                "successful_risks": p.successful_risks,
                "survived_seconds": p.survived_seconds,
            },
            "risk_state": {
                "used_in_current_ping_cycle": p.risk_used_in_cycle,
                "is_active": p.risk_active,
                "remaining_seconds": risk_remaining,
                "activated_at": p.risk_activated_at,
                "expires_at": p.risk_expires_at,
            },
        }

    # Calcul des timers courants
    phase_remaining = 0
    phase_total = room.head_start_duration if room.state == "HEAD_START" else room.reveal_interval
    game_remaining: Optional[int] = None

    if room.state == "HEAD_START" and room.start_time:
        phase_remaining = max(0, int(room.head_start_duration - (current_time - room.start_time)))
        if room.game_mode == "TIMER":
            game_remaining = room.game_duration_seconds
    elif room.state == "HUNTING":
        if room.next_reveal_time:
            phase_remaining = max(0, int(room.next_reveal_time - current_time))
        if room.game_mode == "TIMER" and room.hunting_started_at:
            elapsed_hunt = current_time - room.hunting_started_at
            game_remaining = max(0, int(room.game_duration_seconds - elapsed_hunt))

    return {
        "code": room.code,
        "state": room.state,
        "host_id": room.host_id,
        "created_at": room.created_at,
        "round_number": room.round_number,
        "start_time": room.start_time,
        # Rétrocompatibilité + accès direct
        "head_start_duration": room.head_start_duration,
        "reveal_interval": room.reveal_interval,
        "role_mode": room.role_mode,
        "max_hunters": room.max_hunters,
        "config": {
            "game_mode": room.game_mode,
            "game_duration_seconds": room.game_duration_seconds,
            "head_start_duration": room.head_start_duration,
            "reveal_interval": room.reveal_interval,
            "initial_hunters_count": room.max_hunters,
            "role_assignment": room.role_mode,
            "anonymous_markers": room.anonymous_markers,
            "risk_survival_duration": room.risk_survival_duration,
            "ping_fuzz_radius_meters": room.ping_fuzz_radius_meters,
            "proximity_alert_meters": room.proximity_alert_meters,
            "final_sprint_enabled": room.final_sprint_enabled,
        },
        "timers": {
            "round_started_at": room.start_time,
            "hunting_started_at": room.hunting_started_at,
            "phase_remaining_seconds": phase_remaining,
            "phase_total_seconds": phase_total,
            "game_remaining_seconds": game_remaining,
            "game_total_seconds": room.game_duration_seconds if room.game_mode == "TIMER" else None,
            "next_reveal_at": room.next_reveal_time,
            "ping_cycle_index": room.ping_cycle_index,
        },
        "players": players_dict,
        "map_snapshot": {
            "last_ping_timestamp": room.last_ping_timestamp,
            "ping_cycle_index": room.ping_cycle_index,
            "markers": room.snapshot_markers,
        },
        "last_round_summary": room.last_round_summary,
        "last_event": room.last_event,
    }


async def broadcast_room_state(room_code: str):
    if room_code in ROOMS:
        room = ROOMS[room_code]
        payload_data = build_room_state_payload(room)
        message = {
            "action": "ROOM_STATE",
            "payload": payload_data,
        }
        for player in list(room.players.values()):
            try:
                await player.websocket.send_json(message)
            except Exception as e:
                logger.warning(f"⚠️ Erreur d'envoi ROOM_STATE au joueur {player.player_id}: {e}")


async def broadcast_map_snapshot(room: Room):
    """Diffuse le snapshot de la carte (positions figées au ping) à TOUS les joueurs."""
    payload = {
        "action": "HUNTED_POSITIONS_REVEAL",
        "type": "HUNTED_POSITIONS_REVEAL",
        "timestamp": room.last_ping_timestamp or time.time(),
        "ping_cycle_index": room.ping_cycle_index,
        "markers": room.snapshot_markers,
        "hunted_positions": room.snapshot_markers,
        "payload": {
            "chasses": room.snapshot_markers,
            "markers": room.snapshot_markers,
            "ping_cycle_index": room.ping_cycle_index,
        },
    }
    sent_count = 0
    for player in list(room.players.values()):
        try:
            await player.websocket.send_json(payload)
            sent_count += 1
        except Exception as e:
            logger.warning(f"⚠️ Erreur d'envoi MAP_SNAPSHOT au joueur {player.player_id}: {e}")

    logger.info(
        f"🛰️ [MAP SNAPSHOT] Room [{room.code}] Cycle #{room.ping_cycle_index}: "
        f"{len(room.snapshot_markers)} marqueur(s) transmis à {sent_count} joueur(s)."
    )


async def finish_round(room: Room, winner_team: str, reason: str):
    """Clôture la manche en cours, attribue les bonus de victoire et renvoie tout le monde au LOBBY."""
    current_time = time.time()
    duration = int(current_time - (room.start_time or current_time))

    if winner_team == "CHASSE":
        # Tous les chassés encore en vie gagnent le bonus de victoire
        for p in room.players.values():
            if p.role == "chasse" and p.status == "ACTIVE":
                p.add_points(POINTS_HUNTED_VICTORY)
    elif winner_team == "CHASSEUR":
        # Les chasseurs d'origine gagnent le bonus Clean Sweep
        for p in room.players.values():
            if p.initial_role == "chasseur":
                p.add_points(POINTS_HUNTER_CLEAN_SWEEP)

    # Déterminer le MVP de la manche
    mvp_player = None
    if room.players:
        mvp_player = max(room.players.values(), key=lambda pl: pl.score_current_round)

    # Construire le tableau des scores de la manche
    scoreboard = sorted(
        [
            {
                "player_id": p.player_id,
                "name": p.name,
                "initial_role": p.initial_role.upper(),
                "final_role": p.role.upper(),
                "status": p.status,
                "score_round": p.score_current_round,
                "score_total": p.score_total,
                "captures_count": p.captures_count,
                "successful_risks": p.successful_risks,
            }
            for p in room.players.values()
        ],
        key=lambda item: item["score_total"],
        reverse=True,
    )

    room.last_round_summary = {
        "round_number": room.round_number,
        "game_mode": room.game_mode,
        "winner_team": winner_team,
        "reason": reason,
        "duration_seconds": duration,
        "mvp_player_id": mvp_player.player_id if mvp_player else None,
        "mvp_player_name": mvp_player.name if mvp_player else None,
        "mvp_score_round": mvp_player.score_current_round if mvp_player else 0,
        "scoreboard": scoreboard,
    }

    # Retour au Lobby sans dissoudre la Room
    room.state = "LOBBY"
    room.start_time = None
    room.hunting_started_at = None
    room.next_reveal_time = None
    room.snapshot_markers = []
    for p in room.players.values():
        p.status = "ACTIVE"
        p.risk_active = False
        p.risk_used_in_cycle = False
        p.proximity_alert_active = False

    logger.info(
        f"🏁 [ROUND ENDED] Room [{room.code}] Manche #{room.round_number} terminée ! "
        f"Vainqueur={winner_team} Raison={reason}"
    )

    end_msg = {
        "action": "GAME_ENDED",
        "payload": room.last_round_summary,
    }
    for p in list(room.players.values()):
        try:
            await p.websocket.send_json(end_msg)
        except Exception:
            pass

    await broadcast_room_state(room.code)


def check_proximity_alerts(room: Room):
    """Vérifie si un chasseur est proche d'un chassé actif pour déclencher l'alerte proximité."""
    if room.proximity_alert_meters <= 0 or room.state != "HUNTING":
        for p in room.players.values():
            p.proximity_alert_active = False
        return

    hunters = [
        p for p in room.players.values()
        if p.role == "chasseur" and p.status == "ACTIVE" and p.latitude is not None and p.longitude is not None
    ]
    for p in room.players.values():
        if p.role == "chasse" and p.status == "ACTIVE" and p.latitude is not None and p.longitude is not None:
            near = False
            for h in hunters:
                dist = haversine_meters(p.latitude, p.longitude, h.latitude, h.longitude)
                if dist <= room.proximity_alert_meters:
                    near = True
                    break
            p.proximity_alert_active = near
        else:
            p.proximity_alert_active = False


# ============================================================================
# BOUCLE ASYNCHRONE DE GESTION DES PARTIES (Tick: 1s)
# ============================================================================

async def location_broadcast_loop():
    logger.info("⚡ Démarrage de la boucle asynchrone de gestion de partie (tick: 1s).")
    while True:
        try:
            await asyncio.sleep(1)
            current_time = time.time()

            for room_code, room in list(ROOMS.items()):
                if room.state == "HEAD_START":
                    elapsed = current_time - (room.start_time or current_time)
                    remaining = max(0, int(room.head_start_duration - elapsed))

                    tick_msg = {
                        "action": "TIMER_TICK",
                        "payload": {
                            "phase": "HEAD_START",
                            "remaining_seconds": remaining,
                            "total_seconds": room.head_start_duration,
                            "game_remaining_seconds": room.game_duration_seconds if room.game_mode == "TIMER" else None,
                            "game_total_seconds": room.game_duration_seconds if room.game_mode == "TIMER" else None,
                        },
                    }
                    for player in list(room.players.values()):
                        try:
                            await player.websocket.send_json(tick_msg)
                        except Exception:
                            pass

                    # Fin du temps d'avance -> 1er ping GPS et début de la chasse
                    if remaining <= 0:
                        room.state = "HUNTING"
                        room.hunting_started_at = current_time
                        room.ping_cycle_index = 1
                        effective_interval = get_effective_reveal_interval(room, current_time)
                        room.last_reveal_time = current_time
                        room.next_reveal_time = current_time + effective_interval

                        for p in room.players.values():
                            p.risk_used_in_cycle = False
                            p.last_survival_point_at = current_time

                        logger.info(
                            f"🎯 [TRANSITION STATE] Room [{room_code}] HEAD_START terminé -> "
                            f"HUNTING Démarré (1er Ping) !"
                        )

                        take_map_snapshot(room, current_time)
                        await broadcast_map_snapshot(room)
                        await broadcast_room_state(room_code)

                elif room.state == "HUNTING":
                    state_changed = False

                    # 1. Gestion des points de survie passive et expiration des Prises de Risque
                    for p in list(room.players.values()):
                        if p.role == "chasse" and p.status == "ACTIVE":
                            p.survived_seconds += 1
                            if p.last_survival_point_at is None:
                                p.last_survival_point_at = current_time
                            elif current_time - p.last_survival_point_at >= 60:
                                p.add_points(POINTS_PASSIVE_SURVIVAL_PER_MIN)
                                p.last_survival_point_at = current_time
                                state_changed = True

                            # Vérifier si la Prise de Risque est validée (survie réussie)
                            if p.risk_active and p.risk_expires_at and current_time >= p.risk_expires_at:
                                p.risk_active = False
                                p.risk_expires_at = None
                                p.successful_risks += 1
                                p.add_points(POINTS_RISK_SUCCESS)
                                room.last_event = {
                                    "type": "RISK_SURVIVED",
                                    "message": f"⚡ {p.name} a survécu à sa Prise de Risque (+{POINTS_RISK_SUCCESS} pts) !",
                                    "timestamp": current_time,
                                }
                                logger.info(
                                    f"⚡ [RISK SUCCESS] Room [{room_code}] Player [{p.name}] "
                                    f"survécu -> +{POINTS_RISK_SUCCESS} pts"
                                )
                                state_changed = True

                    # 2. Vérifier l'alerte de proximité
                    prev_alerts = {p.player_id: p.proximity_alert_active for p in room.players.values()}
                    check_proximity_alerts(room)
                    for p in room.players.values():
                        if prev_alerts.get(p.player_id) != p.proximity_alert_active:
                            state_changed = True

                    # 3. Vérifier la fin du timer global en mode TIMER
                    game_remaining: Optional[int] = None
                    if room.game_mode == "TIMER" and room.hunting_started_at is not None:
                        elapsed_hunt = current_time - room.hunting_started_at
                        game_remaining = max(0, int(room.game_duration_seconds - elapsed_hunt))
                        if game_remaining <= 0:
                            await finish_round(room, winner_team="CHASSE", reason="TIME_EXPIRED")
                            continue

                    # 4. Calculer le prochain ping GPS
                    effective_interval = get_effective_reveal_interval(room, current_time)
                    next_reveal = room.next_reveal_time or (current_time + effective_interval)
                    remaining_reveal = max(0, int(next_reveal - current_time))

                    tick_msg = {
                        "action": "TIMER_TICK",
                        "payload": {
                            "phase": "HUNTING",
                            "remaining_seconds": remaining_reveal,
                            "total_seconds": effective_interval,
                            "game_remaining_seconds": game_remaining,
                            "game_total_seconds": room.game_duration_seconds if room.game_mode == "TIMER" else None,
                        },
                    }
                    for player in list(room.players.values()):
                        try:
                            await player.websocket.send_json(tick_msg)
                        except Exception:
                            pass

                    # 5. Déclenchement d'un nouveau Ping GPS
                    if current_time >= next_reveal:
                        room.ping_cycle_index += 1
                        new_interval = get_effective_reveal_interval(room, current_time)
                        room.last_reveal_time = current_time
                        room.next_reveal_time = current_time + new_interval

                        # Créditer les chassés actifs qui ont survécu à ce ping et réinitialiser le quota de risque
                        for p in room.players.values():
                            p.risk_used_in_cycle = False
                            if p.role == "chasse" and p.status == "ACTIVE":
                                p.add_points(POINTS_SURVIVED_PING)

                        take_map_snapshot(room, current_time)
                        logger.info(
                            f"🛰️ [PING REVEAL #{room.ping_cycle_index}] Room [{room_code}] "
                            f"Nouvelle photo GPS figée."
                        )
                        await broadcast_map_snapshot(room)
                        state_changed = True

                    if state_changed:
                        await broadcast_room_state(room_code)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"❌ Erreur critique boucle de jeu: {e}", exc_info=True)


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
    description="Backend in-memory temps réel pour ManHunt (Modes Timer & Infecté)",
    version="3.0.0",
    lifespan=lifespan,
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
# 2. ENDPOINTS HTTP
# ============================================================================

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "ManHunt FastAPI Backend v3.0",
        "active_rooms_count": len(ROOMS),
    }


@app.post("/create-game", status_code=status.HTTP_201_CREATED)
@app.get("/create-game", status_code=status.HTTP_201_CREATED)
def create_game():
    room_code = generate_unique_room_code(length=6)
    new_room = Room(code=room_code)
    ROOMS[room_code] = new_room

    logger.info(f"✨ [HTTP CREATE_GAME] Room créée : [{room_code}]. Total rooms RAM: {len(ROOMS)}")
    return {
        "room_code": room_code,
        "message": "Game room created successfully",
        "created_at": new_room.created_at,
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
# 3. WEBSOCKET & ACTIONS DE JEU TEMPS RÉEL
# ============================================================================

@app.websocket("/ws/{room_code}/{player_id}/{role}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_id: str, role: str):
    room_code_upper = room_code.upper()
    normalized_role = role.lower()

    if normalized_role not in ("chasseur", "chasse"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid role")
        return

    if room_code_upper not in ROOMS:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Room code does not exist")
        return

    await websocket.accept()
    room = ROOMS[room_code_upper]

    # Si le joueur existait déjà (reconnexion rapide), conserver ses points
    if player_id in room.players:
        player_conn = room.players[player_id]
        player_conn.websocket = websocket
        player_conn.is_connected = True
        if room.state == "LOBBY":
            player_conn.role = normalized_role
    else:
        player_conn = PlayerConnection(player_id=player_id, role=normalized_role, websocket=websocket)
        room.players[player_id] = player_conn

    if room.host_id is None or room.host_id not in room.players:
        room.host_id = player_id

    logger.info(
        f"🔌 [WS CONNECT] Player [{player_id}] Role [{player_conn.role}] "
        f"Room [{room_code_upper}]. Joueurs: {len(room.players)}"
    )

    await broadcast_room_state(room_code_upper)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action") or data.get("type")
            payload = data.get("payload", {}) or {}

            if action == "JOIN_ROOM":
                if "player_name" in payload and str(payload["player_name"]).strip():
                    player_conn.name = str(payload["player_name"]).strip()
                if room.state == "LOBBY" and "role" in payload:
                    r = str(payload["role"]).lower()
                    if r in ("chasseur", "chasse"):
                        player_conn.role = r
                logger.info(f"👤 [JOIN_ROOM] Player [{player_id}] Pseudo=[{player_conn.name}]")
                await broadcast_room_state(room_code_upper)

            elif action == "UPDATE_CONFIG":
                if player_id == room.host_id and room.state == "LOBBY":
                    if "game_mode" in payload and payload["game_mode"] in ("TIMER", "INFECTED"):
                        room.game_mode = str(payload["game_mode"])
                    if "game_duration_seconds" in payload:
                        room.game_duration_seconds = max(60, int(payload["game_duration_seconds"]))
                    if "head_start_duration" in payload:
                        room.head_start_duration = max(10, int(payload["head_start_duration"]))
                    if "reveal_interval" in payload:
                        room.reveal_interval = max(15, int(payload["reveal_interval"]))
                    if "role_mode" in payload and payload["role_mode"] in ("RANDOM", "HOST", "FREE"):
                        room.role_mode = str(payload["role_mode"])
                    if "role_assignment" in payload and payload["role_assignment"] in ("RANDOM", "HOST", "FREE"):
                        room.role_mode = str(payload["role_assignment"])
                    if "max_hunters" in payload:
                        room.max_hunters = max(1, int(payload["max_hunters"]))
                    if "initial_hunters_count" in payload:
                        room.max_hunters = max(1, int(payload["initial_hunters_count"]))
                    if "anonymous_markers" in payload:
                        room.anonymous_markers = bool(payload["anonymous_markers"])
                    if "risk_survival_duration" in payload:
                        room.risk_survival_duration = max(15, int(payload["risk_survival_duration"]))
                    if "ping_fuzz_radius_meters" in payload:
                        room.ping_fuzz_radius_meters = max(0, int(payload["ping_fuzz_radius_meters"]))
                    if "proximity_alert_meters" in payload:
                        room.proximity_alert_meters = max(0, int(payload["proximity_alert_meters"]))
                    if "final_sprint_enabled" in payload:
                        room.final_sprint_enabled = bool(payload["final_sprint_enabled"])

                    logger.info(
                        f"⚙️ [UPDATE_CONFIG] Room [{room_code_upper}] Mode={room.game_mode} "
                        f"HeadStart={room.head_start_duration}s Ping={room.reveal_interval}s "
                        f"Duration={room.game_duration_seconds}s Anon={room.anonymous_markers}"
                    )
                    await broadcast_room_state(room_code_upper)

            elif action == "CHANGE_PLAYER_ROLE":
                target_id = payload.get("target_id") or player_id
                new_role = str(payload.get("role", "")).lower()
                can_change = (
                    room.state == "LOBBY"
                    and new_role in ("chasseur", "chasse")
                    and target_id in room.players
                    and (player_id == room.host_id or (room.role_mode == "FREE" and target_id == player_id))
                )
                if can_change:
                    room.players[target_id].role = new_role
                    logger.info(f"🔄 [CHANGE_ROLE] Player [{target_id}] -> [{new_role}]")
                    await broadcast_room_state(room_code_upper)

            elif action == "TRANSFER_HOST":
                target_id = payload.get("target_id")
                if player_id == room.host_id and target_id in room.players:
                    room.host_id = target_id
                    room.last_event = {
                        "type": "HOST_TRANSFERRED",
                        "message": f"👑 {room.players[target_id].name} est maintenant l'Hôte de la Room.",
                        "timestamp": time.time(),
                    }
                    logger.info(f"👑 [TRANSFER_HOST] Room [{room_code_upper}] Host -> [{target_id}]")
                    await broadcast_room_state(room_code_upper)

            elif action == "RESET_SCORES":
                if player_id == room.host_id and room.state == "LOBBY":
                    for p in room.players.values():
                        p.score_total = 0
                        p.score_current_round = 0
                        p.captures_count = 0
                        p.times_captured = 0
                        p.successful_risks = 0
                        p.survived_seconds = 0
                    room.last_round_summary = None
                    logger.info(f"🧹 [RESET_SCORES] Scores remis à zéro dans la Room [{room_code_upper}]")
                    await broadcast_room_state(room_code_upper)

            elif action == "START_GAME":
                if player_id == room.host_id and room.state == "LOBBY":
                    all_p_ids = list(room.players.keys())
                    if room.role_mode == "RANDOM" and len(all_p_ids) >= 2:
                        shuffled = list(all_p_ids)
                        random.shuffle(shuffled)
                        num_hunters = min(room.max_hunters, max(1, len(shuffled) - 1))
                        for idx, p_id in enumerate(shuffled):
                            room.players[p_id].role = "chasseur" if idx < num_hunters else "chasse"

                    for p in room.players.values():
                        p.reset_for_new_round()

                    room.round_number += 1
                    room.state = "HEAD_START"
                    room.start_time = time.time()
                    room.hunting_started_at = None
                    room.ping_cycle_index = 0
                    # Carte vide mais déverrouillée pendant le HEAD_START
                    room.snapshot_markers = []
                    room.last_ping_timestamp = None
                    room.last_event = {
                        "type": "GAME_STARTED",
                        "message": f"🚀 Manche #{room.round_number} lancée ! Les chassés ont {room.head_start_duration}s d'avance.",
                        "timestamp": time.time(),
                    }

                    logger.info(
                        f"🚀 [START_GAME] Room [{room_code_upper}] Manche #{room.round_number} "
                        f"Mode={room.game_mode} HeadStart={room.head_start_duration}s"
                    )

                    start_msg = {
                        "action": "GAME_STARTED",
                        "payload": {
                            "head_start_duration": room.head_start_duration,
                            "reveal_interval": room.reveal_interval,
                            "game_mode": room.game_mode,
                            "game_duration_seconds": room.game_duration_seconds,
                        },
                    }
                    for p in list(room.players.values()):
                        try:
                            await p.websocket.send_json(start_msg)
                        except Exception:
                            pass

                    await broadcast_room_state(room_code_upper)

            elif action == "TAKE_RISK":
                # Utilisable par un Chassé actif pendant HUNTING, 1 seule fois par cycle de ping
                if (
                    room.state == "HUNTING"
                    and player_conn.role == "chasse"
                    and player_conn.status == "ACTIVE"
                    and not player_conn.risk_used_in_cycle
                    and not player_conn.risk_active
                ):
                    now = time.time()
                    player_conn.risk_used_in_cycle = True
                    player_conn.risk_active = True
                    player_conn.risk_activated_at = now
                    player_conn.risk_expires_at = now + room.risk_survival_duration

                    upsert_risk_marker_in_snapshot(room, player_conn, now)
                    room.last_event = {
                        "type": "RISK_TAKEN",
                        "message": (
                            "⚡ Un Chassé a activé une PRISE DE RISQUE ! Sa position exacte est révélée !"
                            if room.anonymous_markers
                            else f"⚡ {player_conn.name} a activé une PRISE DE RISQUE ! Position exacte révélée !"
                        ),
                        "timestamp": now,
                    }
                    logger.info(f"⚡ [TAKE_RISK] Room [{room_code_upper}] Player [{player_conn.name}]")
                    await broadcast_map_snapshot(room)
                    await broadcast_room_state(room_code_upper)

            elif action == "DECLARE_CAPTURE":
                # C'est le joueur Chassé qui déclare par quel Chasseur il a été trouvé
                if (
                    room.state == "HUNTING"
                    and player_conn.role == "chasse"
                    and player_conn.status == "ACTIVE"
                ):
                    hunter_id = payload.get("hunter_id")
                    hunter = room.players.get(hunter_id) if hunter_id else None
                    was_in_risk = player_conn.risk_active

                    # Annuler la prise de risque en cours
                    player_conn.risk_active = False
                    player_conn.risk_expires_at = None
                    player_conn.times_captured += 1
                    player_conn.captured_by = hunter.name if hunter else "Chasseur"

                    # Attribution des points au Chasseur désigné et assistances
                    if hunter and hunter.role == "chasseur":
                        capture_pts = POINTS_HUNTER_CAPTURE + (
                            POINTS_HUNTER_RISK_INTERCEPT_BONUS if was_in_risk else 0
                        )
                        hunter.add_points(capture_pts)
                        hunter.captures_count += 1

                        for other in room.players.values():
                            if (
                                other.player_id != hunter.player_id
                                and other.role == "chasseur"
                                and other.status == "ACTIVE"
                            ):
                                other.add_points(POINTS_HUNTER_ASSIST)

                    # Appliquer les règles du mode de jeu
                    remaining_hunted_before = [
                        p for p in room.players.values()
                        if p.role == "chasse" and p.status == "ACTIVE" and p.player_id != player_id
                    ]

                    if room.game_mode == "INFECTED":
                        # Mode Infecté : le chassé devient immédiatement Chasseur
                        player_conn.role = "chasseur"
                        player_conn.status = "ACTIVE"
                        # S'il ne reste plus qu'un seul chassé, il reçoit le bonus de Dernier Survivant
                        if len(remaining_hunted_before) == 1:
                            last_survivor = remaining_hunted_before[0]
                            last_survivor.add_points(POINTS_HUNTED_VICTORY)
                        room.last_event = {
                            "type": "PLAYER_INFECTED",
                            "message": f"🧟 {player_conn.name} a été trouvé par {player_conn.captured_by} et devient CHASSEUR !",
                            "timestamp": time.time(),
                        }
                    else:
                        # Mode Timer : le chassé devient Spectateur
                        player_conn.status = "SPECTATOR"
                        remove_player_from_snapshot(room, player_id)
                        room.last_event = {
                            "type": "PLAYER_CAPTURED",
                            "message": f"🎯 {player_conn.name} a été capturé par {player_conn.captured_by} !",
                            "timestamp": time.time(),
                        }

                    logger.info(
                        f"🎯 [DECLARE_CAPTURE] Room [{room_code_upper}] Chassé=[{player_conn.name}] "
                        f"par Chasseur=[{player_conn.captured_by}] Mode={room.game_mode}"
                    )

                    # Vérifier s'il reste encore des chassés actifs
                    remaining_hunted = [
                        p for p in room.players.values()
                        if p.role == "chasse" and p.status == "ACTIVE"
                    ]
                    if len(remaining_hunted) == 0:
                        reason = "ALL_INFECTED" if room.game_mode == "INFECTED" else "ALL_HUNTED_CAPTURED"
                        await finish_round(room, winner_team="CHASSEUR", reason=reason)
                    else:
                        await broadcast_map_snapshot(room)
                        await broadcast_room_state(room_code_upper)

            elif action == "END_GAME_EARLY":
                if player_id == room.host_id and room.state in ("HEAD_START", "HUNTING"):
                    await finish_round(room, winner_team="NONE", reason="HOST_ABORTED")

            elif action == "UPDATE_LOCATION" or ("latitude" in data and "longitude" in data):
                loc_data = payload if action == "UPDATE_LOCATION" else data
                if "latitude" in loc_data and "longitude" in loc_data:
                    player_conn.latitude = float(loc_data["latitude"])
                    player_conn.longitude = float(loc_data["longitude"])
                    player_conn.last_updated = time.time()

            elif action == "PING":
                await websocket.send_json({"type": "PONG", "timestamp": time.time()})

    except WebSocketDisconnect:
        logger.info(f"👋 [WS DISCONNECT] Player [{player_id}] quitte la Room [{room_code_upper}].")
    except Exception as e:
        logger.error(f"❌ [WS ERROR] Player [{player_id}] Room [{room_code_upper}]: {e}", exc_info=True)
    finally:
        if room_code_upper in ROOMS:
            room = ROOMS[room_code_upper]
            room.players.pop(player_id, None)

            if len(room.players) == 0:
                del ROOMS[room_code_upper]
                logger.info(f"🧹 [GARBAGE COLLECTION] Room [{room_code_upper}] vide -> supprimée de la RAM.")
            else:
                room.ensure_host()
                await broadcast_room_state(room_code_upper)
