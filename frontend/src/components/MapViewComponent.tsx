import React from 'react';
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
  // Masquage de la carte pour les chasseurs pendant la période de fuite (HEAD_START)
  if (role === 'CHASSEUR' && gameState === 'HEAD_START') {
    return (
      <View style={styles.lockedContainer}>
        <Text style={styles.lockedTitle}>CARTE VERROUILLÉE</Text>
        <Text style={styles.lockedSub}>
          Les chassés s'enfuient ! Vous aurez accès à la carte dès la fin du compte à rebours.
        </Text>
      </View>
    );
  }

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

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {/* Vue Chasseur : Marqueurs des chassés filtrés et sécurisés */}
        {role === 'CHASSEUR' &&
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
              />
            );
          })}

        {/* Marqueur personnel sécurisé */}
        {hasValidMyLocation && (
          <Marker
            coordinate={{
              latitude: Number(myLocation!.latitude),
              longitude: Number(myLocation!.longitude),
            }}
            title={role === 'CHASSE' ? 'Ma position (Chassé)' : 'Ma position (Chasseur)'}
            pinColor={role === 'CHASSE' ? '#34C759' : '#007AFF'}
          />
        )}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  lockedContainer: {
    flex: 1,
    backgroundColor: '#1E1E2C',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    borderWidth: 2,
    borderColor: '#FFDD57',
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
