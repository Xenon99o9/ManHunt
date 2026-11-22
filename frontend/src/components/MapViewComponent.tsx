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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Role, GameState, ChasseReveal } from '../types/game';

interface Props {
  myPlayerId: string;
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
  myPlayerId,
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

  // Marqueurs figés des AUTRES participants (uniquement hors soi-même)
  const otherPlayersMarkers = (chasseReveals || []).filter(
    (m) =>
      m &&
      m.player_id !== myPlayerId &&
      typeof m.latitude === 'number' &&
      typeof m.longitude === 'number' &&
      !isNaN(m.latitude) &&
      !isNaN(m.longitude)
  );

  // Position personnelle en direct (Bleu Cyan #00E5FF)
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
      {/* CALQUE 1 : Surface de tuiles OpenStreetMap + gestion tactile */}
      <View style={styles.tilesLayer} {...panResponder.panHandlers}>
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
      </View>

      {/* CALQUE 2 : Marqueurs isolés au-dessus des tuiles (évite toute disparition sous Android) */}
      <View style={styles.markersLayer} pointerEvents="none">
        {gameState === 'HUNTING' &&
          otherPlayersMarkers.map((marker, index) => {
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
                ? 'Risque'
                : isHunterMarker
                ? 'Chasseur'
                : 'Chassé'
              : `${marker.display_name || marker.player_name || (isHunterMarker ? 'Chasseur' : 'Chassé')}${
                  distanceMeters !== null ? ` • ${distanceMeters}m` : ''
                }`;

            return (
              <View
                key={`marker_${marker.player_id || index}`}
                style={[
                  styles.pinAnchor,
                  {
                    left: screenLeft,
                    top: screenTop,
                  },
                ]}
              >
                {/* Bulle positionnée exactement au-dessus du point, sans déplacer l'ancrage GPS */}
                <View style={[styles.calloutBox, { borderColor: pinColor }]}>
                  <View style={styles.calloutTitleRow}>
                    {isRiskMarker ? (
                      <Ionicons name="flash" size={11} color="#FF9500" style={styles.calloutIcon} />
                    ) : isHunterMarker ? (
                      <MaterialCommunityIcons
                        name="crosshairs-gps"
                        size={11}
                        color="#FF3B30"
                        style={styles.calloutIcon}
                      />
                    ) : (
                      <MaterialCommunityIcons
                        name="run"
                        size={11}
                        color="#34C759"
                        style={styles.calloutIcon}
                      />
                    )}
                    <Text style={styles.calloutTitle} numberOfLines={1}>
                      {labelTitle}
                    </Text>
                  </View>
                  {!anonymousMarkers && formattedTime ? (
                    <Text style={styles.calloutSub}>Ping {formattedTime}</Text>
                  ) : null}
                </View>

                {/* Point exact centré sur la coordonnée GPS */}
                <View style={[styles.pinOuter, { backgroundColor: pinColor }]}>
                  <View style={styles.pinInner} />
                </View>
              </View>
            );
          })}

        {/* Point personnel en DIRECT (Bleu Cyan #00E5FF) */}
        {myScreenPos && (
          <View
            style={[
              styles.myMarkerAnchor,
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

      {/* CALQUE 3 : HUD & Contrôles */}
      <View style={styles.hudLayer} pointerEvents="box-none">
        {/* Légende + Bouton de focus sur les pings */}
        <View style={styles.topInfoBar} pointerEvents="box-none">
          <View style={styles.legendPill}>
            <View style={[styles.legendDot, { backgroundColor: '#00E5FF' }]} />
            <Text style={styles.legendText}>Moi</Text>
            <View style={[styles.legendDot, { backgroundColor: '#34C759', marginLeft: 8 }]} />
            <Text style={styles.legendText}>Chassé</Text>
            <View style={[styles.legendDot, { backgroundColor: '#FF3B30', marginLeft: 8 }]} />
            <Text style={styles.legendText}>Chasseur</Text>
          </View>

          {gameState === 'HUNTING' && otherPlayersMarkers.length > 0 && (
            <TouchableOpacity
              style={styles.targetFocusPill}
              onPress={() => {
                const nextIdx = targetIndex % otherPlayersMarkers.length;
                const target = otherPlayersMarkers[nextIdx];
                setTargetIndex(nextIdx + 1);
                setFollowUser(false);
                setCenterCoord({
                  lat: Number(target.latitude),
                  lon: Number(target.longitude),
                });
                setDragOffset({ dx: 0, dy: 0 });
              }}
            >
              <MaterialCommunityIcons name="crosshairs-gps" size={14} color="#12121C" />
              <Text style={styles.targetFocusText}>Ping ({otherPlayersMarkers.length})</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bandeau d'information pendant l'avance */}
        {gameState === 'HEAD_START' && (
          <View style={styles.headStartBanner} pointerEvents="none">
            <Ionicons name="time-outline" size={14} color="#FFDD57" style={{ marginRight: 6 }} />
            <Text style={styles.headStartBannerText}>
              Période d'avance : positions révélées au 1er Ping GPS
            </Text>
          </View>
        )}

        {/* Contrôles de Zoom et Recentrage */}
        <View style={styles.controlsColumn} pointerEvents="box-none">
          <TouchableOpacity style={styles.controlButton} onPress={handleZoomIn}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={handleZoomOut}>
            <Ionicons name="remove" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, followUser && styles.controlButtonActive]}
            onPress={handleRecenter}
          >
            <Ionicons
              name="locate"
              size={20}
              color={followUser ? '#00E5FF' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.attributionBox} pointerEvents="none">
          <Text style={styles.attributionText}>
            OpenStreetMap • Zoom {zoom}/19
          </Text>
        </View>
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
  tilesLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E5E3DF',
    zIndex: 1,
  },
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  markersLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
  },
  hudLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  myMarkerAnchor: {
    position: 'absolute',
    width: 36,
    height: 36,
    marginLeft: -18,
    marginTop: -18,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
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
  },
  pinAnchor: {
    position: 'absolute',
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    zIndex: 12,
  },
  calloutBox: {
    position: 'absolute',
    bottom: 26,
    minWidth: 90,
    maxWidth: 170,
    backgroundColor: 'rgba(18, 18, 28, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  calloutTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calloutIcon: {
    marginRight: 4,
  },
  calloutTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  calloutSub: {
    color: '#A0A0B0',
    fontSize: 9,
    marginTop: 1,
  },
  pinOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 28, 0.9)',
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFDD57',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  targetFocusText: {
    color: '#12121C',
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 4,
  },
  headStartBanner: {
    position: 'absolute',
    bottom: 32,
    left: 12,
    right: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 18, 28, 0.92)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFDD57',
  },
  headStartBannerText: {
    color: '#FFDD57',
    fontSize: 11,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  controlsColumn: {
    position: 'absolute',
    right: 10,
    bottom: 28,
  },
  controlButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 18, 28, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  controlButtonActive: {
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(20, 40, 50, 0.95)',
  },
  attributionBox: {
    position: 'absolute',
    bottom: 6,
    left: 10,
    backgroundColor: 'rgba(18, 18, 28, 0.72)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  attributionText: {
    color: '#A0A0B0',
    fontSize: 9,
  },
});
