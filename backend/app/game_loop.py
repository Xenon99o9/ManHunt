import asyncio
import time
import logging
from app.state import ROOMS_DB
from app.models import GameState, Role, WSAction, WSMessage
from app.websocket_manager import manager

logger = logging.getLogger("manhunt.gameloop")

async def game_loop_task():
    """Background task running continuously to update room timers and trigger GPS location reveals every 5 minutes."""
    logger.info("Game loop background task started.")

    while True:
        try:
            current_now = time.time()
            # Iterate through a copy of rooms to avoid mutation during iteration
            room_codes = list(ROOMS_DB.keys())

            for code in room_codes:
                room = ROOMS_DB.get(code)
                if not room or room.state == GameState.LOBBY or room.state == GameState.ENDED:
                    continue

                # 1. HEAD_START PHASE (5-minute initial delay for Hunters)
                if room.state == GameState.HEAD_START:
                    elapsed = current_now - room.start_time
                    remaining_head_start = max(0, int(room.head_start_duration - elapsed))

                    # Broadcast timer tick to everyone
                    await manager.broadcast_to_room(
                        code,
                        WSMessage(
                            action=WSAction.TIMER_TICK,
                            payload={
                                "phase": GameState.HEAD_START,
                                "remaining_seconds": remaining_head_start,
                                "total_seconds": room.head_start_duration
                            }
                        )
                    )

                    # When Head Start completes -> transition to HUNTING phase
                    if remaining_head_start <= 0:
                        room.state = GameState.HUNTING
                        room.last_reveal_time = current_now
                        room.next_reveal_time = current_now + room.reveal_interval

                        logger.info(f"Room {code}: Head start finished. Transitioning to HUNTING state.")

                        # Broadcast first location reveal immediately as hunt starts
                        await broadcast_chassés_locations(room)

                # 2. HUNTING PHASE (Periodic 5-minute reveals)
                elif room.state == GameState.HUNTING:
                    time_until_next_reveal = max(0, int(room.next_reveal_time - current_now))

                    # Broadcast timer tick
                    await manager.broadcast_to_room(
                        code,
                        WSMessage(
                            action=WSAction.TIMER_TICK,
                            payload={
                                "phase": GameState.HUNTING,
                                "remaining_seconds": time_until_next_reveal,
                                "total_seconds": room.reveal_interval
                            }
                        )
                    )

                    # Trigger reveal if time reached
                    if current_now >= room.next_reveal_time:
                        logger.info(f"Room {code}: Triggering 5-minute location reveal.")
                        await broadcast_chassés_locations(room)
                        room.last_reveal_time = current_now
                        room.next_reveal_time = current_now + room.reveal_interval

        except Exception as e:
            logger.error(f"Error in game loop iteration: {e}", exc_info=True)

        await asyncio.sleep(1)  # Tick every second


async def broadcast_chassés_locations(room):
    """Gathers current GPS coordinates of all 'CHASSE' players and broadcasts to room."""
    chassés_locations = []

    for player in room.players.values():
        if player.role == Role.CHASSE and player.location is not None:
            chassés_locations.append({
                "player_id": player.id,
                "player_name": player.name,
                "latitude": player.location.latitude,
                "longitude": player.location.longitude,
                "timestamp": player.location.timestamp
            })

    reveal_message = WSMessage(
        action=WSAction.LOCATION_REVEAL,
        payload={
            "timestamp": time.time(),
            "chasses": chassés_locations
        }
    )

    # Send to all room members (or Hunters specifically)
    await manager.broadcast_to_room(room.code, reveal_message)
