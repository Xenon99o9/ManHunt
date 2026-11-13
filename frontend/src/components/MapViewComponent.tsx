import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Role, GameState, ChasseReveal } from '../types/game';

interface Props {
  role: Role;
  gameState: GameState;
  myLocation: { latitude: number; longitude: number } | null;
  chasseReveals: ChasseReveal[];
}

export const MapViewComponent: React.FC<Props> = ({
  role,
  gameState,
  myLocation,
  chasseReveals,
}) => {
  const [isMapReady, setIsMapReady] = useState(false);

  // Verification securisée de la position GPS initiale
  const hasValidMyLocation =
    myLocation &&
    typeof myLocation.latitude === 'number' &&
    typeof myLocation.longitude === 'number' &&
    !isNaN(myLocation.latitude) &&
    !isNaN(myLocation.longitude);

  const initialRegion = {
    latitude: hasValidMyLocation ? myLocation!.latitude : 48.8566,
    longitude: hasValidMyLocation ? myLocation!.longitude : 2.3522,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  // Filtrage ultra-sécurisé des marqueurs de chassés (évite tout crash JS ou C++ Android Native)
  const validChasseReveals = (chasseReveals || []).filter(
    (chasse) =>
      chasse &&
      typeof chasse.latitude === 'number' &&
      typeof chasse.longitude === 'number' &&
      !isNaN(chasse.latitude) &&
      !isNaN(chasse.longitude)
  );

  const isHunterLocked = role === 'CHASSEUR' && gameState === 'HEAD_START';

  return (
    <View style={styles.container}>
      {/* Toujours maintenir le MapView monté pour éviter les cycles d'instanciation C++ natifs */}
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        onMapReady={() => setIsMapReady(true)}
      >
        {/* Vue Chasseur : Marqueurs des chassés (rendu uniquement quand la carte est prête et hors verrouillage) */}
        {isMapReady &&
          role === 'CHASSEUR' &&
          !isHunterLocked &&
          validChasseReveals.map((chasse) => {
            const rawTs = Number(chasse.timestamp);
            const formattedTime =
              rawTs && !isNaN(rawTs)
                ? new Date(rawTs * 1000).toLocaleTimeString()
                : 'Récemment';

            return (
              <Marker
                key={chasse.player_id || Math.random().toString()}
                coordinate={{
                  latitude: Number(chasse.latitude),
                  longitude: Number(chasse.longitude),
                }}
                title={`${chasse.player_name || 'Chassé'}`}
                description={`Position connue à ${formattedTime}`}
                pinColor="#FF3B30"
                tracksViewChanges={false}
              />
            );
          })}

        {/* Marqueur personnel sécurisé */}
        {isMapReady && hasValidMyLocation && (
          <Marker
            coordinate={{
              latitude: Number(myLocation!.latitude),
              longitude: Number(myLocation!.longitude),
            }}
            title={role === 'CHASSE' ? 'Ma position (Chassé)' : 'Ma position (Chasseur)'}
            pinColor={role === 'CHASSE' ? '#34C759' : '#007AFF'}
            tracksViewChanges={false}
          />
        )}
      </MapView>

      {/* Superposition de verrouillage au-dessus de la carte sans démonter la vue native */}
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
  },
  map: {
    width: '100%',
    height: '100%',
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
