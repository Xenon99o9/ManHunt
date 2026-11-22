import React, { Component, ErrorInfo, ReactNode, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
          <Ionicons name="map-outline" size={32} color="#FFDD57" style={{ marginBottom: 8 }} />
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

function getEventIcon(eventType?: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (eventType) {
    case 'RISK_TAKEN':
    case 'RISK_SURVIVED':
      return { name: 'flash', color: '#FF9500' };
    case 'PLAYER_CAPTURED':
    case 'PLAYER_INFECTED':
      return { name: 'alert-circle', color: '#FF3B30' };
    case 'FIRST_PING':
      return { name: 'radio', color: '#4DEEEA' };
    case 'HOST_TRANSFERRED':
      return { name: 'shield-checkmark', color: '#FFDD57' };
    default:
      return { name: 'information-circle', color: '#FFDD57' };
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
  const eventIcon = getEventIcon(room.last_event?.type);

  return (
    <View style={styles.container}>
      {/* En-tête de partie */}
      <View style={styles.header}>
        <View style={styles.headerBadgeContainer}>
          <View>
            <Text style={styles.roomCode}>ROOM {room.code}</Text>
            <View style={styles.subStatusRow}>
              <MaterialCommunityIcons name="run" size={14} color="#34C759" />
              <Text style={styles.subStatusText}>{activeHuntedCount} en vie</Text>
              <Ionicons name="star" size={13} color="#FFDD57" style={{ marginLeft: 10 }} />
              <Text style={styles.subStatusText}>{me?.score_total || 0} pts</Text>
            </View>
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
            {isSpectator ? (
              <Ionicons name="eye-outline" size={14} color="#FFFFFF" />
            ) : role === 'CHASSEUR' ? (
              <MaterialCommunityIcons name="crosshairs-gps" size={14} color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="run" size={14} color="#FFFFFF" />
            )}
            <Text style={styles.roleText}>
              {isSpectator ? 'SPECTATEUR' : role === 'CHASSEUR' ? 'CHASSEUR' : 'CHASSÉ'}
            </Text>
          </View>
        </View>

        {/* Alerte de proximité Chasseur */}
        {isActiveHunted && me?.proximity_alert && (
          <View style={styles.proximityAlertBanner}>
            <MaterialCommunityIcons name="heart-pulse" size={16} color="#FFFFFF" />
            <Text style={styles.proximityAlertText}>
              ALERTE PROXIMITÉ : Un Chasseur est proche !
            </Text>
          </View>
        )}

        {/* Dernier événement en direct */}
        {room.last_event?.message && (
          <View style={styles.eventBanner}>
            <Ionicons
              name={eventIcon.name}
              size={14}
              color={eventIcon.color}
              style={{ marginRight: 6 }}
            />
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
            myPlayerId={playerId}
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
            <View style={styles.actionBtnHeader}>
              <Ionicons
                name="flash"
                size={14}
                color={
                  riskState?.used_in_current_ping_cycle && !riskState?.is_active
                    ? '#A0A0B0'
                    : '#12121C'
                }
              />
              <Text
                style={[
                  styles.riskButtonTitle,
                  riskState?.used_in_current_ping_cycle &&
                    !riskState?.is_active && { color: '#A0A0B0' },
                ]}
              >
                {riskState?.is_active
                  ? `SURVIE : ${riskLocalCountdown}s`
                  : riskState?.used_in_current_ping_cycle
                  ? 'RISQUE UTILISÉ'
                  : 'PRISE DE RISQUE'}
              </Text>
            </View>
            <Text
              style={[
                styles.riskButtonSub,
                riskState?.used_in_current_ping_cycle &&
                  !riskState?.is_active && { color: '#7A7A90' },
              ]}
            >
              {riskState?.is_active
                ? 'Survivez pour +80 pts'
                : riskState?.used_in_current_ping_cycle
                ? 'Dispo au prochain ping'
                : 'Révèle position (+80 pts)'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.capturedButton}
            onPress={() => setCaptureModalVisible(true)}
          >
            <View style={styles.actionBtnHeader}>
              <Ionicons name="flag" size={14} color="#FFFFFF" />
              <Text style={styles.capturedButtonTitle}>J'AI ÉTÉ TROUVÉ</Text>
            </View>
            <Text style={styles.capturedButtonSub}>Déclarer ma capture</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bandeau Spectateur si éliminé en mode Timer */}
      {isSpectator && (
        <View style={styles.spectatorBanner}>
          <Ionicons name="eye-outline" size={16} color="#9E9CFF" style={{ marginRight: 8 }} />
          <Text style={styles.spectatorBannerText}>
            Capturé par {me?.captured_by || 'Chasseur'}. Mode Spectateur jusqu'à la fin de la manche.
          </Text>
        </View>
      )}

      {/* Footer : Contrôles Hôte & Quitter */}
      <View style={styles.footerRow}>
        {isHost && (
          <TouchableOpacity style={styles.abortButton} onPress={endGameEarly}>
            <Ionicons name="stop-circle-outline" size={16} color="#FF9500" />
            <Text style={styles.abortButtonText}>ARRÊTER</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.quitButton} onPress={disconnect}>
          <Ionicons name="exit-outline" size={16} color="#FF3B30" />
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
            <View style={styles.modalTitleRow}>
              <Ionicons name="flag" size={20} color="#FF3B30" style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>QUI VOUS A TROUVÉ ?</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Sélectionnez le chasseur qui vous a attrapé pour lui attribuer les points :
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
                    <View style={styles.hunterSelectLeft}>
                      <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#FF3B30" />
                      <Text style={styles.hunterSelectName}>{hunter.name}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#FFDD57" />
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
                  <Text style={styles.hunterSelectName}>Confirmer ma capture (Solo)</Text>
                  <Ionicons name="checkmark" size={18} color="#FFDD57" />
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
  subStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  subStatusText: {
    color: '#A0A0B0',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginLeft: 5,
  },
  proximityAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 3,
  },
  proximityAlertText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
    marginLeft: 6,
  },
  eventBanner: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
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
  actionBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
    opacity: 0.8,
  },
  riskButtonTitle: {
    color: '#12121C',
    fontWeight: '900',
    fontSize: 12,
    marginLeft: 5,
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
    marginLeft: 5,
  },
  capturedButtonSub: {
    color: '#FFE5E5',
    fontWeight: '600',
    fontSize: 10,
    marginTop: 2,
  },
  spectatorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    flexShrink: 1,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  abortButton: {
    flex: 0.46,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2A2A3D',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9500',
    marginRight: 8,
  },
  abortButtonText: {
    color: '#FF9500',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 6,
  },
  quitButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2A2A3D',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  quitButtonText: {
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 6,
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
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    color: '#FFDD57',
    fontSize: 17,
    fontWeight: '900',
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
  hunterSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hunterSelectName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 10,
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
