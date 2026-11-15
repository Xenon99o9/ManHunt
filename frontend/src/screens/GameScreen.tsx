import React, { Component, ErrorInfo, ReactNode, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
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
    playerId,
    role,
    timerSeconds,
    gameRemainingSeconds,
    timerPhase,
    chasseReveals,
    myLocation,
    takeRisk,
    declareCapture,
    endGameEarly,
    disconnect,
  } = useGame();

  const [captureModalVisible, setCaptureModalVisible] = useState(false);
  const [riskLocalCountdown, setRiskLocalCountdown] = useState<number>(0);

  const me = room?.players?.[playerId];
  const isHost = Boolean(me?.is_host);
  const isSpectator = me?.status === 'SPECTATOR';
  const isActiveHunted = role === 'CHASSE' && !isSpectator;
  const riskState = me?.risk_state;

  // Synchroniser et décrémenter le compteur local de Prise de Risque
  useEffect(() => {
    if (riskState?.is_active && typeof riskState.remaining_seconds === 'number') {
      setRiskLocalCountdown(riskState.remaining_seconds);
    } else {
      setRiskLocalCountdown(0);
    }
  }, [riskState?.is_active, riskState?.remaining_seconds]);

  useEffect(() => {
    if (!riskState?.is_active || riskLocalCountdown <= 0) return;
    const t = setInterval(() => {
      setRiskLocalCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [riskState?.is_active, riskLocalCountdown > 0]);

  if (!room) return null;

  const allPlayers = Object.values(room.players || {});
  const huntersList = allPlayers.filter((p) => p.role === 'CHASSEUR');
  const activeHuntedCount = allPlayers.filter(
    (p) => p.role === 'CHASSE' && p.status !== 'SPECTATOR'
  ).length;

  const gameMode = room.config?.game_mode || 'TIMER';
  const anonymousMarkers = Boolean(room.config?.anonymous_markers);

  return (
    <View style={styles.container}>
      {/* En-tête de partie */}
      <View style={styles.header}>
        <View style={styles.headerBadgeContainer}>
          <View>
            <Text style={styles.roomCode}>ROOM: {room.code}</Text>
            <Text style={styles.subStatusText}>
              🏃 {activeHuntedCount} Chassé(s) en vie • ⭐ {me?.score_total || 0} pts
            </Text>
          </View>

          <View
            style={[
              styles.roleBadge,
              isSpectator
                ? styles.spectatorBadge
                : role === 'CHASSEUR'
                ? styles.hunterBadge
                : styles.huntedBadge,
            ]}
          >
            <Text style={styles.roleText}>
              {isSpectator
                ? '👻 SPECTATEUR'
                : role === 'CHASSEUR'
                ? '🎯 CHASSEUR'
                : '🏃 CHASSÉ'}
            </Text>
          </View>
        </View>

        {/* Alerte de proximité Chasseur */}
        {isActiveHunted && me?.proximity_alert && (
          <View style={styles.proximityAlertBanner}>
            <Text style={styles.proximityAlertText}>
              💓 ALERTE PROXIMITÉ : Un Chasseur est tout proche !
            </Text>
          </View>
        )}

        {/* Dernier événement en direct */}
        {room.last_event?.message && (
          <View style={styles.eventBanner}>
            <Text style={styles.eventBannerText} numberOfLines={1}>
              {room.last_event.message}
            </Text>
          </View>
        )}

        {/* Chronomètre Ping + Durée de manche */}
        <TimerDisplay
          seconds={timerSeconds}
          phase={timerPhase}
          gameMode={gameMode}
          gameRemainingSeconds={gameRemainingSeconds}
        />
      </View>

      {/* Carte OpenStreetMap unifiée */}
      <View style={styles.mapContainer}>
        <MapErrorBoundary>
          <MapViewComponent
            role={role}
            gameState={room.state}
            myLocation={myLocation}
            chasseReveals={chasseReveals}
            anonymousMarkers={anonymousMarkers}
          />
        </MapErrorBoundary>
      </View>

      {/* Barre d'actions In-Game pour les Chassés actifs en phase HUNTING */}
      {isActiveHunted && room.state === 'HUNTING' && (
        <View style={styles.huntedActionsRow}>
          <TouchableOpacity
            style={[
              styles.riskButton,
              (riskState?.used_in_current_ping_cycle || riskState?.is_active) &&
                styles.riskButtonDisabled,
              riskState?.is_active && styles.riskButtonActive,
            ]}
            disabled={Boolean(riskState?.used_in_current_ping_cycle || riskState?.is_active)}
            onPress={takeRisk}
          >
            <Text style={styles.riskButtonTitle}>
              {riskState?.is_active
                ? `⚡ SURVIE : ${riskLocalCountdown}s`
                : riskState?.used_in_current_ping_cycle
                ? '⚡ RISQUE UTILISÉ'
                : '⚡ PRISE DE RISQUE'}
            </Text>
            <Text style={styles.riskButtonSub}>
              {riskState?.is_active
                ? 'Survivez pour +80 pts !'
                : riskState?.used_in_current_ping_cycle
                ? 'Dispo au prochain ping'
                : 'Révèle votre position (+80 pts)'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.capturedButton}
            onPress={() => setCaptureModalVisible(true)}
          >
            <Text style={styles.capturedButtonTitle}>🚨 J'AI ÉTÉ TROUVÉ</Text>
            <Text style={styles.capturedButtonSub}>Déclarer ma capture</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bandeau Spectateur si éliminé en mode Timer */}
      {isSpectator && (
        <View style={styles.spectatorBanner}>
          <Text style={styles.spectatorBannerText}>
            👻 Vous avez été capturé ({me?.captured_by || 'Chasseur'}). Vous suivez la fin de manche en Spectateur.
          </Text>
        </View>
      )}

      {/* Footer : Contrôles Hôte & Quitter */}
      <View style={styles.footerRow}>
        {isHost && (
          <TouchableOpacity style={styles.abortButton} onPress={endGameEarly}>
            <Text style={styles.abortButtonText}>⏹ ARRÊTER LA MANCHE</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.quitButton} onPress={disconnect}>
          <Text style={styles.quitButtonText}>QUITTER LA ROOM</Text>
        </TouchableOpacity>
      </View>

      {/* Modale de déclaration de capture (Sélection du Chasseur) */}
      <Modal
        visible={captureModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCaptureModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🚨 QUI VOUS A TROUVÉ ?</Text>
            <Text style={styles.modalSubtitle}>
              Sélectionnez le chasseur qui vous a attrapé pour lui attribuer les points de capture :
            </Text>

            <ScrollView style={styles.hunterModalList}>
              {huntersList.length > 0 ? (
                huntersList.map((hunter) => (
                  <TouchableOpacity
                    key={hunter.id}
                    style={styles.hunterSelectBtn}
                    onPress={() => {
                      setCaptureModalVisible(false);
                      declareCapture(hunter.id);
                    }}
                  >
                    <Text style={styles.hunterSelectName}>🎯 {hunter.name}</Text>
                    <Text style={styles.hunterSelectAction}>Sélectionner →</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity
                  style={styles.hunterSelectBtn}
                  onPress={() => {
                    setCaptureModalVisible(false);
                    declareCapture(undefined);
                  }}
                >
                  <Text style={styles.hunterSelectName}>Confirmer ma capture (Solo / Test)</Text>
                  <Text style={styles.hunterSelectAction}>Valider →</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setCaptureModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>ANNULER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12121C',
    paddingTop: 38,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  header: {
    marginBottom: 4,
  },
  headerBadgeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roomCode: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  subStatusText: {
    color: '#A0A0B0',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
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
  spectatorBadge: {
    backgroundColor: '#5856D6',
  },
  roleText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  proximityAlertBanner: {
    backgroundColor: '#FF3B30',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 3,
    alignItems: 'center',
  },
  proximityAlertText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
  },
  eventBanner: {
    backgroundColor: '#252538',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 2,
    borderLeftWidth: 3,
    borderLeftColor: '#FFDD57',
  },
  eventBannerText: {
    color: '#E0E0E0',
    fontSize: 11,
    fontWeight: '600',
  },
  mapContainer: {
    flex: 1,
    marginVertical: 6,
  },
  huntedActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  riskButton: {
    flex: 0.49,
    backgroundColor: '#FF9500',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskButtonActive: {
    backgroundColor: '#34C759',
  },
  riskButtonDisabled: {
    backgroundColor: '#2E2E42',
    opacity: 0.75,
  },
  riskButtonTitle: {
    color: '#12121C',
    fontWeight: '900',
    fontSize: 12,
  },
  riskButtonSub: {
    color: '#1E1E2C',
    fontWeight: '700',
    fontSize: 10,
    marginTop: 2,
  },
  capturedButton: {
    flex: 0.49,
    backgroundColor: '#FF3B30',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capturedButtonTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
  },
  capturedButtonSub: {
    color: '#FFE5E5',
    fontWeight: '600',
    fontSize: 10,
    marginTop: 2,
  },
  spectatorBanner: {
    backgroundColor: '#1E1E2C',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#5856D6',
  },
  spectatorBannerText: {
    color: '#D0D0E0',
    fontSize: 11,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  abortButton: {
    flex: 0.48,
    backgroundColor: '#2A2A3D',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF9500',
    marginRight: 8,
  },
  abortButtonText: {
    color: '#FF9500',
    fontWeight: 'bold',
    fontSize: 12,
  },
  quitButton: {
    flex: 1,
    backgroundColor: '#2A2A3D',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  quitButtonText: {
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1E1E2C',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  modalTitle: {
    color: '#FFDD57',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSubtitle: {
    color: '#A0A0B0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
  },
  hunterModalList: {
    maxHeight: 220,
    marginBottom: 12,
  },
  hunterSelectBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2A2A3D',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  hunterSelectName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  hunterSelectAction: {
    color: '#FFDD57',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalCancelBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2A2A3D',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#A0A0B0',
    fontWeight: 'bold',
    fontSize: 13,
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
