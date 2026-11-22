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

function toHttpUrl(rawUrl: string): string {
  let httpUrl = rawUrl.trim().replace(/\/+$/, '');
  if (httpUrl.startsWith('wss://')) httpUrl = httpUrl.replace(/^wss:\/\//, 'https://');
  else if (httpUrl.startsWith('ws://')) httpUrl = httpUrl.replace(/^ws:\/\//, 'http://');
  else if (!httpUrl.startsWith('http://') && !httpUrl.startsWith('https://')) {
    httpUrl = `https://${httpUrl}`;
  }
  return httpUrl;
}

export async function postLocationHttpFallback(
  roomCode: string,
  playerId: string,
  serverUrl: string,
  latitude: number,
  longitude: number
): Promise<void> {
  try {
    const httpUrl = toHttpUrl(serverUrl);
    await fetch(
      `${httpUrl}/api/rooms/${roomCode}/location?player_id=${encodeURIComponent(playerId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude }),
      }
    );
  } catch {
    // Silencieux en cas de perte réseau temporaire
  }
}

export const setBackgroundLocationConfig = (
  roomCode: string,
  playerId: string,
  serverUrl: string,
  onLocationUpdate?: (lat: number, lng: number) => void
) => {
  activeConfig = { roomCode, playerId, serverUrl, onLocationUpdate };
};

// Définition blindée au premier niveau de fichier (scope global Headless JS)
TaskManager.defineTask(LOCATION_TASK_NAME, async (taskBody) => {
  try {
    const { data, error } = taskBody || {};
    if (error || !data) {
      return;
    }

    const locations = (data as any)?.locations;
    if (!Array.isArray(locations) || locations.length === 0) {
      return;
    }

    const latestLocation = locations[locations.length - 1];
    if (!latestLocation?.coords) {
      return;
    }

    const { latitude, longitude } = latestLocation.coords;
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      isNaN(latitude) ||
      isNaN(longitude)
    ) {
      return;
    }

    if (activeConfig) {
      if (activeConfig.onLocationUpdate) {
        activeConfig.onLocationUpdate(latitude, longitude);
      }

      await postLocationHttpFallback(
        activeConfig.roomCode,
        activeConfig.playerId,
        activeConfig.serverUrl,
        latitude,
        longitude
      );
    }
  } catch (err) {
    console.warn('[BackgroundLocation] TaskManager error caught safely:', err);
  }
});

export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
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

  // 1. Acquisition immédiate + watcher de premier plan haute précision
  try {
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown?.coords) {
      onLocationUpdate?.(lastKnown.coords.latitude, lastKnown.coords.longitude);
    }

    // Demande de fix GPS actif en parallèle sans bloquer le démarrage du watcher
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((curr) => {
        if (curr?.coords) {
          onLocationUpdate?.(curr.coords.latitude, curr.coords.longitude);
        }
      })
      .catch(() => {});

    if (foregroundSubscription) {
      foregroundSubscription.remove();
    }
    foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 3000,
        distanceInterval: 0,
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

  // 2. Tâche d'arrière-plan si la permission est accordée
  if (permissions.background) {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
      if (!isRegistered) {
        const options: Location.LocationTaskOptions = {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 5000,
          foregroundService: {
            notificationTitle: 'ManHunt - GPS Actif',
            notificationBody: 'Synchronisation de votre position GPS pendant la partie.',
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
