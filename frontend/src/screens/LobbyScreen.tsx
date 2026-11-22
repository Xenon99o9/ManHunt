import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useGame } from '../context/GameContext';
import { DurationInput } from '../components/DurationInput';
import { RoleMode, Role, GameMode } from '../types/game';

export const LobbyScreen: React.FC = () => {
  const {
    serverUrl,
    setServerUrl,
    serverHistory,
    removeServerHistory,
    playerName,
    setPlayerName,
    room,
    playerId,
    createRoom,
    joinRoom,
    startGame,
    updateRoomConfig,
    changePlayerRole,
    transferHost,
    resetScores,
    disconnect,
  } = useGame();

  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const handleCreate = async () => {
    if (!playerName.trim()) {
      alert('Veuillez entrer votre pseudo.');
      return;
    }
    if (!serverUrl.trim()) {
      alert("Veuillez renseigner l'adresse du serveur.");
      return;
    }
    try {
      setLoading(true);
      await createRoom(playerName.trim());
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la création de la Room');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !inputCode.trim()) {
      alert('Veuillez remplir votre pseudo et le code de la Room.');
      return;
    }
    if (!serverUrl.trim()) {
      alert("Veuillez renseigner l'adresse du serveur.");
      return;
    }
    try {
      setLoading(true);
      await joinRoom(inputCode.trim().toUpperCase(), playerName.trim());
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la connexion à la Room');
    } finally {
      setLoading(false);
    }
  };

  const isHost = Boolean(room?.players?.[playerId]?.is_host);
  const cfg = room?.config;

  const gameMode: GameMode = cfg?.game_mode || 'TIMER';
  const gameDurationSec = cfg?.game_duration_seconds || 1200;
  const headStartSec = cfg?.head_start_duration || room?.head_start_duration || 120;
  const revealIntervalSec = cfg?.reveal_interval || room?.reveal_interval || 180;
  const roleAssignment: RoleMode = cfg?.role_assignment || room?.role_mode || 'RANDOM';
  const maxHunters = cfg?.initial_hunters_count || room?.max_hunters || 1;
  const anonymousMarkers = Boolean(cfg?.anonymous_markers);
  const riskSurvivalSec = cfg?.risk_survival_duration || 60;
  const fuzzRadiusMeters = cfg?.ping_fuzz_radius_meters ?? 0;
  const proximityAlertMeters = cfg?.proximity_alert_meters ?? 0;
  const finalSprintEnabled = cfg?.final_sprint_enabled ?? true;

  const formatDurationLabel = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    if (mins === 0) return `${rem}s`;
    if (rem === 0) return `${mins}m`;
    return `${mins}m ${rem.toString().padStart(2, '0')}s`;
  };

  // ============================================================================
  // VUE LOBBY DE LA ROOM ACTIVE
  // ============================================================================
  if (room) {
    const playersList = Object.values(room.players).sort(
      (a, b) => (b.score_total || 0) - (a.score_total || 0)
    );
    const maxAllowedHunters = Math.max(1, playersList.length - 1);
    const summary = room.last_round_summary;

    return (
      <View style={styles.roomContainer}>
        {/* En-tête de la Room */}
        <View style={styles.roomTopRow}>
          <View>
            <Text style={styles.headerTitle}>ROOM {room.code}</Text>
            <Text style={styles.roomSubTitle}>
              {playersList.length} joueur(s) • Manche #{(room.round_number || 0) + 1}
            </Text>
          </View>

          <TouchableOpacity style={styles.leaveSmallBtn} onPress={disconnect}>
            <Ionicons name="exit-outline" size={14} color="#FF3B30" />
            <Text style={styles.leaveSmallText}>Quitter</Text>
          </TouchableOpacity>
        </View>

        {/* Résumé des paramètres actifs + Boutons Hôte */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryTagsWrap}>
            <View style={styles.summaryTag}>
              <MaterialCommunityIcons
                name={gameMode === 'INFECTED' ? 'biohazard' : 'timer-outline'}
                size={13}
                color="#4DEEEA"
              />
              <Text style={styles.summaryTagText}>
                {gameMode === 'INFECTED'
                  ? 'Infecté'
                  : `Timer (${formatDurationLabel(gameDurationSec)})`}
              </Text>
            </View>

            <View style={styles.summaryTag}>
              <MaterialCommunityIcons name="run" size={13} color="#34C759" />
              <Text style={styles.summaryTagText}>
                Avance {formatDurationLabel(headStartSec)}
              </Text>
            </View>

            <View style={styles.summaryTag}>
              <Ionicons name="radio-outline" size={13} color="#FFDD57" />
              <Text style={styles.summaryTagText}>
                Ping {formatDurationLabel(revealIntervalSec)}
              </Text>
            </View>

            <View style={styles.summaryTag}>
              <Ionicons
                name={
                  roleAssignment === 'RANDOM'
                    ? 'shuffle'
                    : roleAssignment === 'HOST'
                    ? 'shield-checkmark-outline'
                    : 'people-outline'
                }
                size={13}
                color="#E0E0E0"
              />
              <Text style={styles.summaryTagText}>
                {roleAssignment === 'RANDOM'
                  ? `Aléatoire (${maxHunters} Ch.)`
                  : roleAssignment === 'HOST'
                  ? 'Par Hôte'
                  : 'Libre'}
              </Text>
            </View>

            <View style={styles.summaryTag}>
              <Ionicons
                name={anonymousMarkers ? 'eye-off-outline' : 'eye-outline'}
                size={13}
                color="#A0A0B0"
              />
              <Text style={styles.summaryTagText}>
                {anonymousMarkers ? 'Anonyme' : 'Noms visibles'}
              </Text>
            </View>
          </View>

          {isHost && (
            <View style={styles.hostActionRow}>
              <TouchableOpacity
                style={styles.openSettingsBtn}
                onPress={() => setSettingsModalVisible(true)}
              >
                <Ionicons name="settings-outline" size={15} color="#12121C" />
                <Text style={styles.openSettingsBtnText}>PARAMÈTRES DE LA PARTIE</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.resetScoresBtn} onPress={resetScores}>
                <Ionicons name="refresh-outline" size={14} color="#A0A0B0" />
                <Text style={styles.resetScoresBtnText}>Reset</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Résumé de la manche précédente */}
        {summary && (
          <View style={styles.lastRoundCard}>
            <View style={styles.lastRoundRow}>
              <Ionicons name="trophy" size={15} color="#4DEEEA" />
              <Text style={styles.lastRoundTitle}>
                MANCHE #{summary.round_number} —{' '}
                {summary.winner_team === 'CHASSE'
                  ? 'VICTOIRE DES CHASSÉS'
                  : summary.winner_team === 'CHASSEUR'
                  ? 'VICTOIRE DES CHASSEURS'
                  : 'MANCHE ARRÊTÉE'}
              </Text>
            </View>
            {summary.mvp_player_name && (
              <View style={styles.lastRoundMvpRow}>
                <Ionicons name="star" size={13} color="#FFDD57" />
                <Text style={styles.lastRoundMvp}>
                  MVP : {summary.mvp_player_name} (+{summary.mvp_score_round} pts)
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Liste des joueurs et Classement */}
        <Text style={styles.sectionTitle}>
          JOUEURS & SCORES{' '}
          {roleAssignment === 'FREE'
            ? '(CLIQUEZ SUR VOTRE RÔLE POUR CHANGER)'
            : roleAssignment === 'HOST' && isHost
            ? '(CLIQUEZ SUR UN RÔLE POUR ATTRIBUER)'
            : ''}
        </Text>
        <ScrollView style={styles.playerList}>
          {playersList.map((p, idx) => {
            const totalPts = p.score_total || 0;
            const roundPts = p.score_current_round || 0;
            const canToggleRole =
              (roleAssignment === 'HOST' && isHost) ||
              (roleAssignment === 'FREE' && (p.id === playerId || isHost));

            return (
              <View key={p.id} style={styles.playerCard}>
                <View style={styles.playerInfoLeft}>
                  <View style={styles.playerNameRow}>
                    <Text style={styles.rankBadge}>#{idx + 1}</Text>
                    <Text style={styles.playerName}>{p.name}</Text>
                    {p.is_host && (
                      <MaterialCommunityIcons
                        name="crown"
                        size={15}
                        color="#FFDD57"
                        style={{ marginLeft: 6 }}
                      />
                    )}
                    {!p.is_connected && (
                      <View style={styles.offlineTag}>
                        <Ionicons name="cloud-offline-outline" size={11} color="#FF9500" />
                        <Text style={styles.offlineTagText}>Reconnexion...</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.scoreRow}>
                    <Ionicons name="star" size={12} color="#4DEEEA" />
                    <Text style={styles.scoreTotalBadge}>{totalPts} pts</Text>
                    {roundPts > 0 && (
                      <Text style={styles.scoreRoundBadge}>+{roundPts} dernière manche</Text>
                    )}
                  </View>
                </View>

                <View style={styles.playerActionsRight}>
                  {canToggleRole ? (
                    <TouchableOpacity
                      style={[
                        styles.roleBadge,
                        p.role === 'CHASSEUR' ? styles.hunterBadge : styles.huntedBadge,
                      ]}
                      onPress={() => {
                        const newRole: Role = p.role === 'CHASSEUR' ? 'CHASSE' : 'CHASSEUR';
                        changePlayerRole(p.id, newRole);
                      }}
                    >
                      <MaterialCommunityIcons
                        name={p.role === 'CHASSEUR' ? 'crosshairs-gps' : 'run'}
                        size={13}
                        color="#FFFFFF"
                      />
                      <Text style={styles.roleBadgeText}>
                        {p.role === 'CHASSEUR' ? 'CHASSEUR' : 'CHASSÉ'}
                      </Text>
                      <Ionicons name="swap-horizontal" size={12} color="#FFFFFF" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={[
                        styles.roleBadge,
                        roleAssignment === 'RANDOM'
                          ? styles.randomBadge
                          : p.role === 'CHASSEUR'
                          ? styles.hunterBadge
                          : styles.huntedBadge,
                      ]}
                    >
                      {roleAssignment === 'RANDOM' ? (
                        <Ionicons name="shuffle" size={13} color="#FFFFFF" />
                      ) : (
                        <MaterialCommunityIcons
                          name={p.role === 'CHASSEUR' ? 'crosshairs-gps' : 'run'}
                          size={13}
                          color="#FFFFFF"
                        />
                      )}
                      <Text style={styles.roleBadgeText}>
                        {roleAssignment === 'RANDOM'
                          ? 'ALÉATOIRE'
                          : p.role === 'CHASSEUR'
                          ? 'CHASSEUR'
                          : 'CHASSÉ'}
                      </Text>
                    </View>
                  )}

                  {isHost && p.id !== playerId && (
                    <TouchableOpacity
                      style={styles.makeHostBtn}
                      onPress={() => transferHost(p.id)}
                    >
                      <MaterialCommunityIcons name="crown-outline" size={12} color="#FFDD57" />
                      <Text style={styles.makeHostBtnText}>Nommer Hôte</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Bouton Lancer la Partie ou Attente */}
        {isHost ? (
          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Ionicons name="play" size={18} color="#FFFFFF" />
            <Text style={styles.startButtonText}>
              LANCER LA PARTIE {room.round_number ? `(MANCHE #${room.round_number + 1})` : ''}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingContainer}>
            <ActivityIndicator size="small" color="#4DEEEA" />
            <Text style={styles.waitingText}>En attente du lancement par l'hôte...</Text>
          </View>
        )}

        {/* MODALE COMPLÈTE "PARAMÈTRES DE LA PARTIE" (Hôte uniquement) */}
        <Modal
          visible={settingsModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setSettingsModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <Ionicons name="settings-outline" size={18} color="#FFDD57" />
                  <Text style={styles.modalTitle}>PARAMÈTRES DE LA PARTIE</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeModalBtn}
                  onPress={() => setSettingsModalVisible(false)}
                >
                  <Ionicons name="close" size={18} color="#E0E0E0" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* 1. Mode de Jeu */}
                <Text style={styles.configLabel}>Mode de Jeu</Text>
                <View style={styles.modeRow}>
                  {[
                    { id: 'TIMER' as GameMode, label: 'Timer (Classique)', icon: 'timer-outline' as const },
                    { id: 'INFECTED' as GameMode, label: 'Infecté', icon: 'biohazard' as const },
                  ].map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.modeChip, gameMode === m.id && styles.modeChipActive]}
                      onPress={() => updateRoomConfig({ game_mode: m.id })}
                    >
                      <MaterialCommunityIcons
                        name={m.icon}
                        size={14}
                        color={gameMode === m.id ? '#12121C' : '#A0A0B0'}
                      />
                      <Text
                        style={[
                          styles.modeChipText,
                          gameMode === m.id && styles.modeChipTextActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 2. Saisies manuelles MM:SS pour TOUS les chronos */}
                {gameMode === 'TIMER' && (
                  <DurationInput
                    label="Durée maximale de la manche (Mode Timer)"
                    valueSeconds={gameDurationSec}
                    minSeconds={30}
                    maxSeconds={7200}
                    stepSeconds={60}
                    onChangeSeconds={(sec) => updateRoomConfig({ game_duration_seconds: sec })}
                  />
                )}

                <DurationInput
                  label="Temps d'avance des Chassés (avant 1er Ping)"
                  valueSeconds={headStartSec}
                  minSeconds={5}
                  maxSeconds={1800}
                  stepSeconds={15}
                  onChangeSeconds={(sec) => updateRoomConfig({ head_start_duration: sec })}
                />

                <DurationInput
                  label="Intervalle entre chaque Ping GPS"
                  valueSeconds={revealIntervalSec}
                  minSeconds={10}
                  maxSeconds={1800}
                  stepSeconds={15}
                  onChangeSeconds={(sec) => updateRoomConfig({ reveal_interval: sec })}
                />

                <DurationInput
                  label="Temps de survie pour valider une Prise de Risque"
                  valueSeconds={riskSurvivalSec}
                  minSeconds={10}
                  maxSeconds={600}
                  stepSeconds={10}
                  onChangeSeconds={(sec) => updateRoomConfig({ risk_survival_duration: sec })}
                />

                {/* 3. Attribution des Équipes (Aléatoire / Par l'Hôte / Libre) */}
                <Text style={styles.configLabel}>Attribution des Équipes</Text>
                <View style={styles.modeRow}>
                  {[
                    { id: 'RANDOM' as RoleMode, label: 'Aléatoire', icon: 'shuffle' as const },
                    { id: 'HOST' as RoleMode, label: 'Par Hôte', icon: 'shield-checkmark-outline' as const },
                    { id: 'FREE' as RoleMode, label: 'Libre', icon: 'people-outline' as const },
                  ].map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.modeChip,
                        roleAssignment === m.id && styles.modeChipActive,
                      ]}
                      onPress={() => updateRoomConfig({ role_mode: m.id })}
                    >
                      <Ionicons
                        name={m.icon}
                        size={14}
                        color={roleAssignment === m.id ? '#12121C' : '#A0A0B0'}
                      />
                      <Text
                        style={[
                          styles.modeChipText,
                          roleAssignment === m.id && styles.modeChipTextActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {roleAssignment === 'RANDOM' && (
                  <View style={styles.randomConfigRow}>
                    <Text style={styles.configLabelInline}>
                      Nombre de Chasseurs : {Math.min(maxHunters, maxAllowedHunters)}
                    </Text>
                    <View style={styles.counterRow}>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() =>
                          updateRoomConfig({ max_hunters: Math.max(1, maxHunters - 1) })
                        }
                      >
                        <Ionicons name="remove" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() =>
                          updateRoomConfig({
                            max_hunters: Math.min(Math.max(maxAllowedHunters, 1), maxHunters + 1),
                          })
                        }
                      >
                        <Ionicons name="add" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* 4. Anonymat sur la carte */}
                <Text style={styles.configLabel}>Anonymat sur la carte</Text>
                <View style={styles.modeRow}>
                  {[
                    { val: false, label: 'Noms affichés', icon: 'eye-outline' as const },
                    { val: true, label: 'Anonyme', icon: 'eye-off-outline' as const },
                  ].map((item) => (
                    <TouchableOpacity
                      key={String(item.val)}
                      style={[
                        styles.modeChip,
                        anonymousMarkers === item.val && styles.modeChipActive,
                      ]}
                      onPress={() => updateRoomConfig({ anonymous_markers: item.val })}
                    >
                      <Ionicons
                        name={item.icon}
                        size={14}
                        color={anonymousMarkers === item.val ? '#12121C' : '#A0A0B0'}
                      />
                      <Text
                        style={[
                          styles.modeChipText,
                          anonymousMarkers === item.val && styles.modeChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 5. Paramètres Bonus */}
                <Text style={styles.configLabel}>Flou de proximité des Pings réguliers</Text>
                <View style={styles.modeRow}>
                  {[
                    { m: 0, label: 'Exact (0m)' },
                    { m: 15, label: '15m' },
                    { m: 30, label: '30m' },
                    { m: 50, label: '50m' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.m}
                      style={[
                        styles.modeChip,
                        fuzzRadiusMeters === item.m && styles.modeChipActive,
                      ]}
                      onPress={() => updateRoomConfig({ ping_fuzz_radius_meters: item.m })}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          fuzzRadiusMeters === item.m && styles.modeChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.configLabel}>Alerte Proximité Chasseur (pour les Chassés)</Text>
                <View style={styles.modeRow}>
                  {[
                    { m: 0, label: 'Désactivée' },
                    { m: 50, label: '< 50m' },
                    { m: 100, label: '< 100m' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.m}
                      style={[
                        styles.modeChip,
                        proximityAlertMeters === item.m && styles.modeChipActive,
                      ]}
                      onPress={() => updateRoomConfig({ proximity_alert_meters: item.m })}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          proximityAlertMeters === item.m && styles.modeChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {gameMode === 'TIMER' && (
                  <>
                    <Text style={styles.configLabel}>
                      Sprint Final (Pings 2x plus rapides dans les 2 dernières min)
                    </Text>
                    <View style={styles.modeRow}>
                      {[
                        { val: true, label: 'Activé' },
                        { val: false, label: 'Désactivé' },
                      ].map((item) => (
                        <TouchableOpacity
                          key={String(item.val)}
                          style={[
                            styles.modeChip,
                            finalSprintEnabled === item.val && styles.modeChipActive,
                          ]}
                          onPress={() => updateRoomConfig({ final_sprint_enabled: item.val })}
                        >
                          <Text
                            style={[
                              styles.modeChipText,
                              finalSprintEnabled === item.val && styles.modeChipTextActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </ScrollView>

              <TouchableOpacity
                style={styles.saveSettingsBtn}
                onPress={() => setSettingsModalVisible(false)}
              >
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.saveSettingsBtnText}>VALIDER</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  // ============================================================================
  // ÉCRAN D'ACCUEIL ÉPURÉ : SERVEUR + PSEUDO + CRÉER / REJOINDRE UNE ROOM
  // ============================================================================
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#12121C' }}
    >
      <ScrollView
        contentContainerStyle={styles.homeContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandBlock}>
          <View style={styles.logoBadge}>
            <MaterialCommunityIcons name="radar" size={40} color="#FFDD57" />
          </View>
          <Text style={styles.title}>MANHUNT</Text>
          <Text style={styles.subTitle}>Cache-cache GPS multijoueur temps réel</Text>
        </View>

        {/* Carte Serveur */}
        <View style={styles.homeCard}>
          <View style={styles.inputLabelRow}>
            <Ionicons name="server-outline" size={15} color="#4DEEEA" />
            <Text style={styles.label}>Serveur Backend</Text>
          </View>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="https://votre-app.onrender.com"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {serverHistory.length > 0 && (
            <View style={styles.historyContainer}>
              <Text style={styles.historyLabel}>Récents (appui long pour supprimer) :</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.historyScroll}
              >
                {serverHistory.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.historyChip, serverUrl === item && styles.historyChipActive]}
                    onPress={() => setServerUrl(item)}
                    onLongPress={() => removeServerHistory(item)}
                  >
                    <Text
                      style={[
                        styles.historyChipText,
                        serverUrl === item && styles.historyChipTextActive,
                      ]}
                    >
                      {item.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Carte Joueur & Room */}
        <View style={styles.homeCard}>
          <View style={styles.inputLabelRow}>
            <Ionicons name="person-outline" size={15} color="#FFDD57" />
            <Text style={styles.label}>Votre Pseudo</Text>
          </View>
          <TextInput
            style={styles.input}
            value={playerName}
            onChangeText={setPlayerName}
            placeholder="Entrez votre pseudo"
            placeholderTextColor="#666"
          />

          <TouchableOpacity
            style={[styles.actionButton, styles.createButton, loading && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#12121C" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="#12121C" />
                <Text style={styles.buttonText}>CRÉER UNE ROOM</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OU REJOINDRE</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.joinRow}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={inputCode}
              onChangeText={setInputCode}
              placeholder="CODE"
              placeholderTextColor="#666"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.actionButton, styles.joinButton, loading && { opacity: 0.6 }]}
              onPress={handleJoin}
              disabled={loading}
            >
              <Ionicons name="log-in-outline" size={18} color="#12121C" />
              <Text style={styles.buttonText}>REJOINDRE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  homeContainer: {
    flexGrow: 1,
    backgroundColor: '#12121C',
    padding: 20,
    justifyContent: 'center',
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#1E1E2C',
    borderWidth: 1.5,
    borderColor: '#3A3A55',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFDD57',
    letterSpacing: 3,
  },
  subTitle: {
    fontSize: 13,
    color: '#8A8A9E',
    marginTop: 4,
  },
  homeCard: {
    backgroundColor: '#1A1A28',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2E2E42',
    marginBottom: 14,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  input: {
    backgroundColor: '#12121C',
    color: '#FFF',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  codeInput: {
    flex: 1,
    marginRight: 10,
    textAlign: 'center',
    letterSpacing: 4,
    fontWeight: 'bold',
  },
  actionButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  createButton: {
    backgroundColor: '#4DEEEA',
    marginTop: 14,
  },
  joinButton: {
    backgroundColor: '#FFDD57',
    paddingHorizontal: 16,
  },
  buttonText: {
    color: '#12121C',
    fontWeight: '900',
    fontSize: 14,
    marginLeft: 6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2E2E42',
  },
  dividerText: {
    color: '#6E6E85',
    fontSize: 11,
    fontWeight: 'bold',
    marginHorizontal: 10,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyContainer: {
    marginTop: 10,
  },
  historyLabel: {
    color: '#8A8A9E',
    fontSize: 11,
    marginBottom: 6,
  },
  historyScroll: {
    flexDirection: 'row',
  },
  historyChip: {
    backgroundColor: '#12121C',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  historyChipActive: {
    borderColor: '#4DEEEA',
    backgroundColor: '#1A2E35',
  },
  historyChipText: {
    color: '#8A8A9E',
    fontSize: 11,
    fontWeight: 'bold',
  },
  historyChipTextActive: {
    color: '#4DEEEA',
  },
  // Lobby Room Styles
  roomContainer: {
    flex: 1,
    backgroundColor: '#12121C',
    paddingHorizontal: 16,
    paddingTop: 38,
    paddingBottom: 16,
  },
  roomTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFDD57',
    letterSpacing: 1.5,
  },
  roomSubTitle: {
    fontSize: 12,
    color: '#8A8A9E',
    marginTop: 2,
  },
  leaveSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  leaveSmallText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  summaryBar: {
    backgroundColor: '#1E1E2C',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3A3A55',
    marginBottom: 10,
  },
  summaryTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3D',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  summaryTagText: {
    color: '#E0E0E0',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  hostActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  openSettingsBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFDD57',
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
  },
  openSettingsBtnText: {
    color: '#12121C',
    fontWeight: '900',
    fontSize: 12,
    marginLeft: 6,
  },
  resetScoresBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3D',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  resetScoresBtnText: {
    color: '#A0A0B0',
    fontSize: 11,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  lastRoundCard: {
    backgroundColor: '#1A2E35',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4DEEEA',
    marginBottom: 10,
  },
  lastRoundRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastRoundTitle: {
    color: '#4DEEEA',
    fontWeight: '900',
    fontSize: 12,
    marginLeft: 6,
  },
  lastRoundMvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  lastRoundMvp: {
    color: '#FFDD57',
    fontWeight: 'bold',
    fontSize: 11,
    marginLeft: 5,
  },
  sectionTitle: {
    color: '#8A8A9E',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  playerList: {
    flex: 1,
    marginVertical: 4,
  },
  playerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E2C',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2A3D',
  },
  playerInfoLeft: {
    flex: 1,
    marginRight: 8,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rankBadge: {
    color: '#FFDD57',
    fontWeight: '900',
    fontSize: 13,
    marginRight: 6,
  },
  playerName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  offlineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: '#3A2812',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  offlineTagText: {
    color: '#FF9500',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 3,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  scoreTotalBadge: {
    color: '#4DEEEA',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 4,
    marginRight: 8,
  },
  scoreRoundBadge: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: 'bold',
  },
  playerActionsRight: {
    alignItems: 'flex-end',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hunterBadge: {
    backgroundColor: '#FF3B30',
  },
  huntedBadge: {
    backgroundColor: '#34C759',
  },
  randomBadge: {
    backgroundColor: '#3A3A55',
  },
  roleBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 11,
    marginLeft: 4,
  },
  makeHostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#2A2A3D',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFDD57',
  },
  makeHostBtnText: {
    color: '#FFDD57',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  startButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 8,
  },
  startButtonText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 15,
    marginLeft: 8,
  },
  waitingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  waitingText: {
    color: '#8A8A9E',
    marginLeft: 10,
  },
  // Modal Settings
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A28',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderColor: '#3A3A55',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFDD57',
    fontWeight: '900',
    fontSize: 16,
    marginLeft: 8,
  },
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#2A2A3D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    marginBottom: 12,
  },
  configLabel: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 6,
  },
  configLabelInline: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A3D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  modeChipActive: {
    backgroundColor: '#FFDD57',
  },
  modeChipText: {
    color: '#A0A0B0',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  modeChipTextActive: {
    color: '#12121C',
  },
  randomConfigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#252538',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counterButton: {
    backgroundColor: '#3A3A55',
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  saveSettingsBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveSettingsBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    marginLeft: 6,
  },
});
