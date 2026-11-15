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
  anonymousMarkers?: boolean;
}

const TILE_SIZE = 256;
const MIN_ZOOM = 13;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 17;

const DEFAULT_LAT = 48.8566;
const DEFAULT_LON = 2.3522;

function lonToWorldX(lon: number, zoom: number): number {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  return ((lon + 180) / 360) * scale;
}

function latToWorldY(lat: number, zoom: number): number {
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (clampedLat * Math.PI) / 180;
  const scale = TILE_SIZE * Math.pow(2, zoom);
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale;
}

function worldXToLon(x: number, zoom: number): number {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  return (x / scale) * 360 - 180;
}

function worldYToLat(y: number, zoom: number): number {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

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
  gameState,
  myLocation,
  chasseReveals,
  anonymousMarkers = false,
}) => {
  const [viewport, setViewport] = useState({ width: 360, height: 480 });
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [centerCoord, setCenterCoord] = useState<{ lat: number; lon: number }>({
    lat: DEFAULT_LAT,
    lon: DEFAULT_LON,
  });
  const [followUser, setFollowUser] = useState<boolean>(true);
  const [targetIndex, setTargetIndex] = useState<number>(0);

  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const centerRef = useRef(centerCoord);
  centerRef.current = centerCoord;

  const hasValidMyLocation = Boolean(
    myLocation &&
      typeof myLocation.latitude === 'number' &&
      typeof myLocation.longitude === 'number' &&
      !isNaN(myLocation.latitude) &&
      !isNaN(myLocation.longitude)
  );

  useEffect(() => {
    if (hasValidMyLocation && followUser && myLocation) {
      setCenterCoord({
        lat: myLocation.latitude,
        lon: myLocation.longitude,
      });
    }
  }, [hasValidMyLocation, myLocation?.latitude, myLocation?.longitude, followUser]);

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

  const handleZoomIn = () => setZoom((prev) => Math.min(MAX_ZOOM, prev + 1));
  const handleZoomOut = () => setZoom((prev) => Math.max(MIN_ZOOM, prev - 1));

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

  const centerWorldX = lonToWorldX(centerCoord.lon, zoom) - dragOffset.dx;
  const centerWorldY = latToWorldY(centerCoord.lat, zoom) - dragOffset.dy;

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
      const url = `https://${subdomain}.tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
      tiles.push({
        key: `osm_${zoom}_${tx}_${ty}`,
        url,
        left,
        top,
      });
    }
  }

  // Marqueurs figés du dernier ping (visibles pour TOUS les joueurs en phase HUNTING)
  const validSnapshotMarkers = (chasseReveals || []).filter(
    (m) =>
      m &&
      typeof m.latitude === 'number' &&
      typeof m.longitude === 'number' &&
      !isNaN(m.latitude) &&
      !isNaN(m.longitude)
  );

  // Position personnelle en direct (couleur distincte Cyan #00E5FF)
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

        {/* Marqueurs figés issus du dernier Ping GPS ou d'une Prise de Risque */}
        {gameState === 'HUNTING' &&
          validSnapshotMarkers.map((marker, index) => {
            const screenLeft =
              viewport.width / 2 +
              (lonToWorldX(Number(marker.longitude), zoom) - centerWorldX);
            const screenTop =
              viewport.height / 2 +
              (latToWorldY(Number(marker.latitude), zoom) - centerWorldY);

            const isHunterMarker = marker.role === 'CHASSEUR';
            const isRiskMarker = marker.source === 'RISK_TAKEN';

            const rawTs = Number(marker.timestamp ?? marker.last_updated);
            const formattedTime =
              rawTs && !isNaN(rawTs)
                ? new Date(rawTs * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '';

            const distanceMeters =
              hasValidMyLocation && myLocation
                ? getDistanceMeters(
                    myLocation.latitude,
                    myLocation.longitude,
                    Number(marker.latitude),
                    Number(marker.longitude)
                  )
                : null;

            const pinColor = isRiskMarker
              ? '#FF9500'
              : isHunterMarker
              ? '#FF3B30'
              : '#34C759';

            const labelTitle = anonymousMarkers
              ? isRiskMarker
                ? '⚡ Risque'
                : isHunterMarker
                ? 'Chasseur'
                : 'Chassé'
              : `${isRiskMarker ? '⚡ ' : ''}${
                  marker.display_name || marker.player_name || (isHunterMarker ? 'Chasseur' : 'Chassé')
                }${distanceMeters !== null ? ` • ${distanceMeters}m` : ''}`;

            return (
              <View
                key={`${marker.player_id || index}_${marker.source || 'PING'}`}
                pointerEvents="none"
                style={[
                  styles.markerWrapper,
                  {
                    left: screenLeft,
                    top: screenTop,
                  },
                ]}
              >
                <View style={[styles.calloutBox, { borderColor: pinColor }]}>
                  <Text style={styles.calloutTitle} numberOfLines={1}>
                    {labelTitle}
                  </Text>
                  {!anonymousMarkers && formattedTime ? (
                    <Text style={styles.calloutSub}>Ping {formattedTime}</Text>
                  ) : null}
                </View>
                <View style={[styles.pinOuter, { backgroundColor: pinColor }]}>
                  <View style={styles.pinInner} />
                </View>
              </View>
            );
          })}

        {/* Point personnel en DIRECT (Cyan #00E5FF distinct des pings figés) */}
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
            <View style={styles.myPulseRing} />
            <View style={styles.myDot} />
          </View>
        )}
      </View>

      {/* Barre supérieure : Légende + Navigation entre les points du dernier Ping */}
      <View style={styles.topInfoBar} pointerEvents="box-none">
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: '#00E5FF' }]} />
          <Text style={styles.legendText}>Moi (Direct)</Text>
          <View style={[styles.legendDot, { backgroundColor: '#34C759', marginLeft: 8 }]} />
          <Text style={styles.legendText}>Chassé</Text>
          <View style={[styles.legendDot, { backgroundColor: '#FF3B30', marginLeft: 8 }]} />
          <Text style={styles.legendText}>Chasseur</Text>
        </View>

        {gameState === 'HUNTING' && validSnapshotMarkers.length > 0 && (
          <TouchableOpacity
            style={styles.targetFocusPill}
            onPress={() => {
              const nextIdx = targetIndex % validSnapshotMarkers.length;
              const target = validSnapshotMarkers[nextIdx];
              setTargetIndex(nextIdx + 1);
              setFollowUser(false);
              setCenterCoord({
                lat: Number(target.latitude),
                lon: Number(target.longitude),
              });
              setDragOffset({ dx: 0, dy: 0 });
            }}
          >
            <Text style={styles.targetFocusText}>
              🎯 Ping ({validSnapshotMarkers.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bandeau d'information pendant l'avance (Carte non verrouillée mais vide de pings) */}
      {gameState === 'HEAD_START' && (
        <View style={styles.headStartBanner} pointerEvents="none">
          <Text style={styles.headStartBannerText}>
            ⏳ Période d'avance : les positions seront révélées au 1er Ping GPS
          </Text>
        </View>
      )}

      {/* Contrôles de Zoom et Recentrage GPS */}
      <View style={styles.controlsColumn} pointerEvents="box-none">
        <TouchableOpacity style={styles.controlButton} onPress={handleZoomIn}>
          <Text style={styles.controlButtonText}>＋</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlButton} onPress={handleZoomOut}>
          <Text style={styles.controlButtonText}>－</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, followUser && styles.controlButtonActive]}
          onPress={handleRecenter}
        >
          <Text style={styles.controlButtonText}>📍</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.attributionBox} pointerEvents="none">
        <Text style={styles.attributionText}>
          © OpenStreetMap • Zoom {zoom}/19 • Pings figés
        </Text>
      </View>
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
    zIndex: 8,
  },
  myPulseRing: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#00E5FF',
    opacity: 0.32,
  },
  myDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#00E5FF',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 5,
  },
  markerWrapper: {
    position: 'absolute',
    width: 160,
    marginLeft: -80,
    marginTop: -56,
    alignItems: 'center',
    zIndex: 6,
  },
  calloutBox: {
    backgroundColor: 'rgba(18, 18, 28, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1.5,
    marginBottom: 3,
    alignItems: 'center',
  },
  calloutTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  calloutSub: {
    color: '#A0A0B0',
    fontSize: 9,
  },
  pinOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  pinInner: {
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
    zIndex: 9,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 28, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    color: '#E0E0E0',
    fontSize: 10,
    fontWeight: 'bold',
  },
  targetFocusPill: {
    backgroundColor: '#FFDD57',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  targetFocusText: {
    color: '#12121C',
    fontSize: 11,
    fontWeight: '900',
  },
  headStartBanner: {
    position: 'absolute',
    bottom: 32,
    left: 14,
    right: 64,
    backgroundColor: 'rgba(18, 18, 28, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFDD57',
    zIndex: 9,
  },
  headStartBannerText: {
    color: '#FFDD57',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  controlsColumn: {
    position: 'absolute',
    right: 10,
    bottom: 28,
    zIndex: 9,
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
    borderColor: '#00E5FF',
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
    backgroundColor: 'rgba(18, 18, 28, 0.72)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 7,
  },
  attributionText: {
    color: '#A0A0B0',
    fontSize: 9,
  },
});
