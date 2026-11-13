import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const LOCATION_TASK_NAME = 'BACKGROUND_MANHUNT_LOCATION_TASK';

let activeConfig: {
  roomCode: string;
  playerId: string;
  serverUrl: string;
  onLocationUpdate?: (lat: number, lng: number) => void;
} | null = null;

let foregroundSubscription: Location.LocationSubscription | null = null;

export const setBackgroundLocationConfig = (
  roomCode: string,
  playerId: string,
  serverUrl: string,
  onLocationUpdate?: (lat: number, lng: number) => void
) => {
  activeConfig = { roomCode, playerId, serverUrl, onLocationUpdate };
};

// 1. Définition impérativement au premier niveau de fichier (scope global)
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
      console.log(`[BackgroundLocation] GPS arrière-plan: ${latitude}, ${longitude}`);

      if (activeConfig.onLocationUpdate) {
        activeConfig.onLocationUpdate(latitude, longitude);
      }

      // Envoi synchrone de secours en HTTP
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

export async function requestLocationPermissions(): Promise<{ foreground: boolean; background: boolean }> {
  try {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') {
      return { foreground: false, background: false };
    }

    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    return { foreground: true, background: bg === 'granted' };
  } catch (err) {
    console.warn('[Location] Permission request warning:', err);
    return { foreground: false, background: false };
  }
}

export async function startBackgroundLocationUpdates(
  roomCode: string,
  playerId: string,
  serverUrl: string,
  onLocationUpdate?: (lat: number, lng: number) => void
): Promise<boolean> {
  setBackgroundLocationConfig(roomCode, playerId, serverUrl, onLocationUpdate);

  const permissions = await requestLocationPermissions();
  if (!permissions.foreground) {
    console.warn('[Location] Foreground location permission not granted.');
    return false;
  }

  // 1. Toujours activer le watcher de premier plan (sur et sans crash)
  try {
    if (foregroundSubscription) {
      foregroundSubscription.remove();
    }
    foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      (loc) => {
        if (loc?.coords) {
          onLocationUpdate?.(loc.coords.latitude, loc.coords.longitude);
        }
      }
    );
  } catch (e) {
    console.warn('[Location] Foreground watch position warning:', e);
  }

  // 2. Tenter d'activer la tâche d'arrière-plan si la permission est accordée
  if (permissions.background) {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (!isRegistered) {
        const options: Location.LocationOptions = {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 5000,
          foregroundService: {
            notificationTitle: 'ManHunt - GPS Actif',
            notificationBody: 'Transmet votre position aux chasseurs en arrière-plan.',
            notificationColor: '#FF3B30',
          },
        };

        if (Platform.OS === 'ios') {
          options.showsBackgroundLocationIndicator = true;
        }

        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, options);
        console.log('[Location] Background task started successfully.');
      }
    } catch (err) {
      console.warn('[Location] Background location task could not be started safely:', err);
    }
  }

  return true;
}

export async function stopBackgroundLocationUpdates(): Promise<void> {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      console.log('[Location] Background location updates stopped.');
    }
  } catch (err) {
    console.warn('[Location] Error stopping background updates:', err);
  }

  activeConfig = null;
}
