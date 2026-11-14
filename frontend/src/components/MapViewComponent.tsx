import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  PanResponder,
  TouchableOpacity,
  LayoutChangeEvent,
} from 'react-native';
import { Role, GameState, ChasseReveal } from '../types/game';

interface Props {
  role: Role;
  gameState: GameState;
  myLocation: { latitude: number; longitude: number } | null;
  chasseReveals: ChasseReveal[];
}

const TILE_SIZE = 256;
const MIN_ZOOM = 13;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 17; // Niveau rue / bâtiment très précis

// Coordonnées par défaut (Paris) avant le 1er fix GPS
const DEFAULT_LAT = 48.8566;
const DEFAULT_LON = 2.3522;

// Conversion Longitude -> Pixel global X (Projection Web Mercator EPSG:3857)
function lonToWorldX(lon: number, zoom: number): number {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  return ((lon + 180) / 360) * scale;
}

// Conversion Latitude -> Pixel global Y (Projection Web Mercator EPSG:3857)
function latToWorldY(lat: number, zoom: number): number {
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (clampedLat * Math.PI) / 180;
  const scale = TILE_SIZE * Math.pow(2, zoom);
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale;
}

// Conversion inverse Pixel global X -> Longitude
function worldXToLon(x: number, zoom: number): number {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  return (x / scale) * 360 - 180;
}

// Conversion inverse Pixel global Y -> Latitude
function worldYToLat(y: number, zoom: number): number {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Calcul de la distance exacte en mètres (Formule de Haversine)
function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const MapViewComponent: React.FC<Props> = ({
  role,
  gameState,
  myLocation,
  chasseReveals,
}) => {
  const [viewport, setViewport] = useState({ width: 360, height: 480 });
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [centerCoord, setCenterCoord] = useState<{ lat: number; lon: number }>({
    lat: DEFAULT_LAT,
    lon: DEFAULT_LON,
  });
  const [followUser, setFollowUser] = useState<boolean>(true);
  const [darkMap, setDarkMap] = useState<boolean>(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  // Décalage tactile en cours de glissement (en pixels)
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const centerRef = useRef(centerCoord);
  centerRef.current = centerCoord;

  // Vérification sécurisée de la position GPS personnelle
  const hasValidMyLocation = Boolean(
    myLocation &&
      typeof myLocation.latitude === 'number' &&
      typeof myLocation.longitude === 'number' &&
      !isNaN(myLocation.latitude) &&
      !isNaN(myLocation.longitude)
  );

  // Centrer automatiquement sur le joueur tant que le mode suivi est actif
  useEffect(() => {
    if (hasValidMyLocation && followUser && myLocation) {
      setCenterCoord({
        lat: myLocation.latitude,
        lon: myLocation.longitude,
      });
    }
  }, [hasValidMyLocation, myLocation?.latitude, myLocation?.longitude, followUser]);

  // Gestionnaire de déplacement tactile fluide (PanResponder 100% JS, zéro crash natif)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          setFollowUser(false);
        },
        onPanResponderMove: (_, gestureState) => {
          setDragOffset({ dx: gestureState.dx, dy: gestureState.dy });
        },
        onPanResponderRelease: (_, gestureState) => {
          const z = zoomRef.current;
          const currentCenter = centerRef.current;
          const newWorldX = lonToWorldX(currentCenter.lon, z) - gestureState.dx;
          const newWorldY = latToWorldY(currentCenter.lat, z) - gestureState.dy;
          setCenterCoord({
            lat: worldYToLat(newWorldY, z),
            lon: worldXToLon(newWorldX, z),
          });
          setDragOffset({ dx: 0, dy: 0 });
        },
        onPanResponderTerminate: () => {
          setDragOffset({ dx: 0, dy: 0 });
        },
      }),
    []
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setViewport({ width, height });
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + 1));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev - 1));
  };

  const handleRecenter = () => {
    setFollowUser(true);
    if (hasValidMyLocation && myLocation) {
      setCenterCoord({
        lat: myLocation.latitude,
        lon: myLocation.longitude,
      });
      setDragOffset({ dx: 0, dy: 0 });
    }
  };

  // Coordonnée pixel globale actuelle du centre de l'écran
  const centerWorldX = lonToWorldX(centerCoord.lon, zoom) - dragOffset.dx;
  const centerWorldY = latToWorldY(centerCoord.lat, zoom) - dragOffset.dy;

  // Calcul des tuiles OpenStreetMap visibles dans le viewport
  const maxTileIndex = Math.pow(2, zoom) - 1;
  const minTileX = Math.max(0, Math.floor((centerWorldX - viewport.width / 2) / TILE_SIZE) - 1);
  const maxTileX = Math.min(
    maxTileIndex,
    Math.floor((centerWorldX + viewport.width / 2) / TILE_SIZE) + 1
  );
  const minTileY = Math.max(0, Math.floor((centerWorldY - viewport.height / 2) / TILE_SIZE) - 1);
  const maxTileY = Math.min(
    maxTileIndex,
    Math.floor((centerWorldY + viewport.height / 2) / TILE_SIZE) + 1
  );

  const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];
  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const left = Math.round(viewport.width / 2 + (tx * TILE_SIZE - centerWorldX));
      const top = Math.round(viewport.height / 2 + (ty * TILE_SIZE - centerWorldY));
      const subdomain = ['a', 'b', 'c'][(tx + ty) % 3];
      const url = darkMap
        ? `https://${subdomain}.basemaps.cartocdn.com/dark_all/${zoom}/${tx}/${ty}.png`
        : `https://${subdomain}.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${tx}/${ty}.png`;
      tiles.push({
        key: `${darkMap ? 'd' : 'v'}_${zoom}_${tx}_${ty}`,
        url,
        left,
        top,
      });
    }
  }

  // Filtrage sécurisé des marqueurs de chassés
  const validChasseReveals = (chasseReveals || []).filter(
    (chasse) =>
      chasse &&
      typeof chasse.latitude === 'number' &&
      typeof chasse.longitude === 'number' &&
      !isNaN(chasse.latitude) &&
      !isNaN(chasse.longitude)
  );

  const isHunterLocked = role === 'CHASSEUR' && gameState === 'HEAD_START';

  // Position écran du joueur
  const myScreenPos =
    hasValidMyLocation && myLocation
      ? {
          left:
            viewport.width / 2 +
            (lonToWorldX(myLocation.longitude, zoom) - centerWorldX),
          top:
            viewport.height / 2 +
            (latToWorldY(myLocation.latitude, zoom) - centerWorldY),
        }
      : null;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Surface de carte interactive OpenStreetMap (0 module natif Google Maps = 0 crash Android) */}
      <View style={styles.mapSurface} {...panResponder.panHandlers}>
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{
              uri: tile.url,
              headers: { 'User-Agent': 'ManHuntMobile/1.0' },
            }}
            style={[
              styles.tile,
              {
                left: tile.left,
                top: tile.top,
              },
            ]}
            resizeMode="cover"
          />
        ))}

        {/* Marqueurs des Chassés (visibles uniquement pour les Chasseurs en phase HUNTING) */}
        {role === 'CHASSEUR' &&
          !isHunterLocked &&
          validChasseReveals.map((chasse, index) => {
            const screenLeft =
              viewport.width / 2 +
              (lonToWorldX(Number(chasse.longitude), zoom) - centerWorldX);
            const screenTop =
              viewport.height / 2 +
              (latToWorldY(Number(chasse.latitude), zoom) - centerWorldY);

            const rawTs = Number(chasse.timestamp ?? (chasse as any).last_updated);
            const formattedTime =
              rawTs && !isNaN(rawTs)
                ? new Date(rawTs * 1000).toLocaleTimeString()
                : 'Récemment';

            const distanceMeters =
              hasValidMyLocation && myLocation
                ? getDistanceMeters(
                    myLocation.latitude,
                    myLocation.longitude,
                    Number(chasse.latitude),
                    Number(chasse.longitude)
                  )
                : null;

            const markerId = chasse.player_id || `chasse_${index}`;
            const isSelected = selectedMarkerId === markerId;

            return (
              <View
                key={markerId}
                style={[
                  styles.markerWrapper,
                  {
                    left: screenLeft,
                    top: screenTop,
                  },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedMarkerId(isSelected ? null : markerId)}
                  style={styles.markerTouchArea}
                >
                  <View style={styles.huntedCallout}>
                    <Text style={styles.huntedCalloutTitle} numberOfLines={1}>
                      🎯 {chasse.player_name || 'Chassé'}
                      {distanceMeters !== null ? ` • ${distanceMeters} m` : ''}
                    </Text>
                    <Text style={styles.huntedCalloutSub}>Vu à {formattedTime}</Text>
                  </View>
                  <View style={styles.huntedPinOuter}>
                    <View style={styles.huntedPinInner} />
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}

        {/* Marqueur personnel du joueur */}
        {myScreenPos && (
          <View
            pointerEvents="none"
            style={[
              styles.myMarkerWrapper,
              {
                left: myScreenPos.left,
                top: myScreenPos.top,
              },
            ]}
          >
            <View
              style={[
                styles.myPulseRing,
                role === 'CHASSE' ? styles.myPulseGreen : styles.myPulseBlue,
              ]}
            />
            <View
              style={[
                styles.myDot,
                role === 'CHASSE' ? styles.myDotGreen : styles.myDotBlue,
              ]}
            />
          </View>
        )}
      </View>

      {/* Bandeau d'état GPS & Cibles (en haut de la carte) */}
      <View style={styles.topInfoBar} pointerEvents="box-none">
        <View style={styles.gpsStatusPill}>
          <View
            style={[
              styles.gpsDotIndicator,
              { backgroundColor: hasValidMyLocation ? '#34C759' : '#FFCC00' },
            ]}
          />
          <Text style={styles.gpsStatusText}>
            {hasValidMyLocation
              ? `GPS Précis (${myLocation!.latitude.toFixed(5)}, ${myLocation!.longitude.toFixed(5)})`
              : 'Acquisition du signal GPS...'}
          </Text>
        </View>

        {role === 'CHASSEUR' && !isHunterLocked && validChasseReveals.length > 0 && (
          <TouchableOpacity
            style={styles.targetFocusPill}
            onPress={() => {
              const target = validChasseReveals[0];
              setFollowUser(false);
              setCenterCoord({
                lat: Number(target.latitude),
                lon: Number(target.longitude),
              });
              setDragOffset({ dx: 0, dy: 0 });
            }}
          >
            <Text style={styles.targetFocusText}>
              🎯 Voir Chassé ({validChasseReveals.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Contrôles de Zoom, Thème et Recentrage GPS */}
      <View style={styles.controlsColumn} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => setDarkMap((prev) => !prev)}
        >
          <Text style={styles.controlButtonText}>{darkMap ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton} onPress={handleZoomIn}>
          <Text style={styles.controlButtonText}>＋</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton} onPress={handleZoomOut}>
          <Text style={styles.controlButtonText}>－</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            followUser && styles.controlButtonActive,
          ]}
          onPress={handleRecenter}
        >
          <Text style={styles.controlButtonText}>📍</Text>
        </TouchableOpacity>
      </View>

      {/* Mention OpenStreetMap */}
      <View style={styles.attributionBox} pointerEvents="none">
        <Text style={styles.attributionText}>© OpenStreetMap • Zoom {zoom}/19</Text>
      </View>

      {/* Superposition de verrouillage au-dessus de la carte pendant HEAD_START */}
      {isHunterLocked && (
        <View style={styles.lockedOverlay}>
          <Text style={styles.lockedTitle}>CARTE VERROUILLÉE</Text>
          <Text style={styles.lockedSub}>
            Les chassés s'enfuient ! Vous aurez accès à la carte dès la fin du compte à rebours.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1A1A28',
    borderWidth: 1,
    borderColor: '#2E2E42',
  },
  mapSurface: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#E5E3DF',
  },
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  myMarkerWrapper: {
    position: 'absolute',
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  myPulseRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    opacity: 0.3,
  },
  myPulseGreen: {
    backgroundColor: '#34C759',
  },
  myPulseBlue: {
    backgroundColor: '#007AFF',
  },
  myDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 4,
  },
  myDotGreen: {
    backgroundColor: '#34C759',
  },
  myDotBlue: {
    backgroundColor: '#007AFF',
  },
  markerWrapper: {
    position: 'absolute',
    width: 160,
    marginLeft: -80,
    marginTop: -62,
    alignItems: 'center',
    zIndex: 6,
  },
  markerTouchArea: {
    alignItems: 'center',
  },
  huntedCallout: {
    backgroundColor: 'rgba(18, 18, 28, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF3B30',
    marginBottom: 4,
    alignItems: 'center',
  },
  huntedCalloutTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  huntedCalloutSub: {
    color: '#FFDD57',
    fontSize: 10,
  },
  huntedPinOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  huntedPinInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  topInfoBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 7,
  },
  gpsStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 28, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  gpsDotIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  gpsStatusText: {
    color: '#E0E0E0',
    fontSize: 11,
    fontWeight: '600',
  },
  targetFocusPill: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  targetFocusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  controlsColumn: {
    position: 'absolute',
    right: 10,
    bottom: 28,
    zIndex: 7,
  },
  controlButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 18, 28, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  controlButtonActive: {
    borderColor: '#4DEEEA',
    backgroundColor: 'rgba(26, 46, 53, 0.95)',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  attributionBox: {
    position: 'absolute',
    bottom: 6,
    left: 10,
    backgroundColor: 'rgba(18, 18, 28, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 7,
  },
  attributionText: {
    color: '#A0A0B0',
    fontSize: 9,
  },
  lockedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1E1E2C',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  lockedTitle: {
    color: '#FFDD57',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  lockedSub: {
    color: '#A0A0B0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
