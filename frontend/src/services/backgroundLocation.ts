import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const LOCATION_TASK_NAME = 'BACKGROUND_MANHUNT_LOCATION_TASK';

// Shared state for background task to know active target server & credentials
let activeConfig: {
  roomCode: string;
  playerId: string;
  serverUrl: string;
  onLocationUpdate?: (lat: number, lng: number) => void;
} | null = null;

export const setBackgroundLocationConfig = (
  roomCode: string,
  playerId: string,
  serverUrl: string,
  onLocationUpdate?: (lat: number, lng: number) => void
) => {
  activeConfig = { roomCode, playerId, serverUrl, onLocationUpdate };
};

// 1. TOP-LEVEL TaskManager Task Definition (Required by Expo)
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundLocation] TaskManager error:', error.message);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const latestLocation = locations[locations.length - 1];

    if (latestLocation && activeConfig) {
      const { latitude, longitude } = latestLocation.coords;
      console.log(`[BackgroundLocation] GPS Ping in background: ${latitude}, ${longitude}`);

      // Notify in-app state if callback registered
      if (activeConfig.onLocationUpdate) {
        activeConfig.onLocationUpdate(latitude, longitude);
      }

      // HTTP Direct Fallback / Sync Endpoint to guarantee delivery if WebSocket drops in background
      try {
        let httpUrl = activeConfig.serverUrl.trim().replace(/\/+$/, '');
        if (httpUrl.startsWith('wss://')) httpUrl = httpUrl.replace(/^wss:\/\//, 'https://');
        else if (httpUrl.startsWith('ws://')) httpUrl = httpUrl.replace(/^ws:\/\//, 'http://');
        else if (!httpUrl.startsWith('http://') && !httpUrl.startsWith('https://')) httpUrl = `https://${httpUrl}`;

        await fetch(`${httpUrl}/api/rooms/${activeConfig.roomCode}/location?player_id=${activeConfig.playerId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude,
            longitude,
          }),
        }).catch(() => {});
      } catch (err) {
        console.warn('[BackgroundLocation] Failed sending background location HTTP sync:', err);
      }
    }
  }
});

// 2. Permission Request Function
export async function requestLocationPermissions(): Promise<boolean> {
  // Request Foreground permission
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    console.warn('[Location] Foreground permission denied');
    return false;
  }

  // Request Background permission
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') {
    console.warn('[Location] Background permission denied');
    return false;
  }

  return true;
}

// 3. Start Background Updates
export async function startBackgroundLocationUpdates(
  roomCode: string,
  playerId: string,
  serverUrl: string,
  onLocationUpdate?: (lat: number, lng: number) => void
): Promise<boolean> {
  const hasPermissions = await requestLocationPermissions();
  if (!hasPermissions) {
    console.error('[Location] Cannot start background updates without permissions.');
    return false;
  }

  setBackgroundLocationConfig(roomCode, playerId, serverUrl, onLocationUpdate);

  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    console.log('[Location] Background task already running. Updating config.');
    return true;
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 10,  // Minimum update interval in meters
    timeInterval: 5000,    // Minimum time interval in ms (5s)
    deferredUpdatesInterval: 5000,
    foregroundService: {
      notificationTitle: 'ManHunt - GPS Actif',
      notificationBody: 'Transmet votre position aux chasseurs en arrière-plan.',
      notificationColor: '#FF3B30',
    },
    showsBackgroundLocationIndicator: true, // Needed for iOS blue bar
  });

  console.log('[Location] Background location updates started successfully.');
  return true;
}

// 4. Stop Background Updates
export async function stopBackgroundLocationUpdates(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    console.log('[Location] Background location updates stopped.');
  }
  activeConfig = null;
}
