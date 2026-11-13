import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useGame } from '../context/GameContext';
import { TimerDisplay } from '../components/TimerDisplay';
import { MapViewComponent } from '../components/MapViewComponent';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class MapErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[MapErrorBoundary] Map Component Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>CHARGEMENT DE LA CARTE</Text>
          <Text style={styles.errorSub}>
            Affichage des coordonnées en cours d'initialisation...
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export const GameScreen: React.FC = () => {
  const {
    room,
    role,
    timerSeconds,
    timerPhase,
    chasseReveals,
    myLocation,
    disconnect,
  } = useGame();

  if (!room) return null;

  return (
    <View style={styles.container}>
      {/* Header Info */}
      <View style={styles.header}>
        <View style={styles.headerBadgeContainer}>
          <Text style={styles.roomCode}>ROOM: {room.code}</Text>
          <View
            style={[
              styles.roleBadge,
              role === 'CHASSEUR' ? styles.hunterBadge : styles.huntedBadge,
            ]}
          >
            <Text style={styles.roleText}>
              {role === 'CHASSEUR' ? 'CHASSEUR' : 'CHASSÉ'}
            </Text>
          </View>
        </View>

        {/* Chronomètre dynamique */}
        <TimerDisplay seconds={timerSeconds} phase={timerPhase} />
      </View>

      {/* Vue de Carte sécurisée par un ErrorBoundary anti-crash */}
      <View style={styles.mapContainer}>
        <MapErrorBoundary>
          <MapViewComponent
            role={role}
            gameState={room.state}
            myLocation={myLocation}
            chasseReveals={chasseReveals}
          />
        </MapErrorBoundary>
      </View>

      {/* Footer controls */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.quitButton} onPress={disconnect}>
          <Text style={styles.quitButtonText}>QUITTER LA PARTIE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12121C',
    paddingTop: 45,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 10,
  },
  headerBadgeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roomCode: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hunterBadge: {
    backgroundColor: '#FF3B30',
  },
  huntedBadge: {
    backgroundColor: '#34C759',
  },
  roleText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  mapContainer: {
    flex: 1,
    marginVertical: 10,
  },
  footer: {
    marginTop: 10,
  },
  quitButton: {
    backgroundColor: '#2A2A3D',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  quitButtonText: {
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#1E1E2C',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  errorTitle: {
    color: '#FFDD57',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  errorSub: {
    color: '#A0A0B0',
    fontSize: 13,
    textAlign: 'center',
  },
});
