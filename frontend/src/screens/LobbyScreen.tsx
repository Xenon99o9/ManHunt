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
} from 'react-native';
import { useGame } from '../context/GameContext';
import { RoleMode, Role, GameMode } from '../types/game';

export const LobbyScreen: React.FC = () => {
  const {
    serverUrl,
    setServerUrl,
    serverHistory,
    removeServerHistory,
    playerName,
    setPlayerName,
    role,
    setRole,
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
      await createRoom(playerName.trim(), role);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !inputCode.trim()) {
      alert('Veuillez remplir votre pseudo et le code de la room.');
      return;
    }
    if (!serverUrl.trim()) {
      alert("Veuillez renseigner l'adresse du serveur.");
      return;
    }
    try {
      setLoading(true);
      await joinRoom(inputCode.trim().toUpperCase(), playerName.trim(), role);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la connexion');
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
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)} min`;
  };

  // ============================================================================
  // VUE LOBBY DE LA ROOM ACTIVE
  // ============================================================================
  if (room) {
    // Trier les joueurs par score total décroissant
    const playersList = Object.values(room.players).sort(
      (a, b) => (b.score_total || 0) - (a.score_total || 0)
    );
    const summary = room.last_round_summary;

    return (
      <View style={styles.roomContainer}>
        {/* En-tête de la Room */}
        <View style={styles.roomTopRow}>
          <View>
            <Text style={styles.headerTitle}>ROOM: {room.code}</Text>
            <Text style={styles.roomSubTitle}>
              {playersList.length} joueur(s) • Manche #{(room.round_number || 0) + 1}
            </Text>
          </View>

          <TouchableOpacity style={styles.leaveSmallBtn} onPress={disconnect}>
            <Text style={styles.leaveSmallText}>Quitter</Text>
          </TouchableOpacity>
        </View>

        {/* Résumé des Paramètres actifs + Bouton "Paramètres de la partie" pour l'Hôte */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryTagsWrap}>
            <View style={styles.summaryTag}>
              <Text style={styles.summaryTagText}>
                {gameMode === 'INFECTED'
                  ? '🧟 Mode Infecté'
                  : `⏱️ Timer (${formatDurationLabel(gameDurationSec)})`}
              </Text>
            </View>
            <View style={styles.summaryTag}>
              <Text style={styles.summaryTagText}>
                🏃 Avance: {formatDurationLabel(headStartSec)}
              </Text>
            </View>
            <View style={styles.summaryTag}>
              <Text style={styles.summaryTagText}>
                🛰️ Ping: {formatDurationLabel(revealIntervalSec)}
              </Text>
            </View>
            <View style={styles.summaryTag}>
              <Text style={styles.summaryTagText}>
                {roleAssignment === 'RANDOM'
                  ? `🎲 Aléatoire (${maxHunters} Chasseur${maxHunters > 1 ? 's' : ''})`
                  : '👑 Équipes par Hôte'}
              </Text>
            </View>
            <View style={styles.summaryTag}>
              <Text style={styles.summaryTagText}>
                {anonymousMarkers ? '🕵️ Carte Anonyme' : '🏷️ Noms visibles'}
              </Text>
            </View>
          </View>

          {isHost && (
            <View style={styles.hostActionRow}>
              <TouchableOpacity
                style={styles.openSettingsBtn}
                onPress={() => setSettingsModalVisible(true)}
              >
                <Text style={styles.openSettingsBtnText}>
                  ⚙️ PARAMÈTRES DE LA PARTIE
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.resetScoresBtn} onPress={resetScores}>
                <Text style={styles.resetScoresBtnText}>🧹 Reset Scores</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Résumé de la manche précédente s'il y en a une */}
        {summary && (
          <View style={styles.lastRoundCard}>
            <Text style={styles.lastRoundTitle}>
              🏆 FIN DE MANCHE #{summary.round_number} —{' '}
              {summary.winner_team === 'CHASSE'
                ? 'VICTOIRE DES CHASSÉS !'
                : summary.winner_team === 'CHASSEUR'
                ? 'VICTOIRE DES CHASSEURS !'
                : 'MANCHE INTERROMPUE'}
            </Text>
            {summary.mvp_player_name && (
              <Text style={styles.lastRoundMvp}>
                ⭐ MVP de la manche : {summary.mvp_player_name} (+{summary.mvp_score_round} pts)
              </Text>
            )}
          </View>
        )}

        {/* Liste des joueurs et Classement des Points */}
        <Text style={styles.sectionTitle}>JOUEURS & CLASSEMENT DE LA SESSION</Text>
        <ScrollView style={styles.playerList}>
          {playersList.map((p, idx) => {
            const totalPts = p.score_total || 0;
            const roundPts = p.score_current_round || 0;

            return (
              <View key={p.id} style={styles.playerCard}>
                <View style={styles.playerInfoLeft}>
                  <View style={styles.playerNameRow}>
                    <Text style={styles.rankBadge}>#{idx + 1}</Text>
                    <Text style={styles.playerName}>
                      {p.name} {p.is_host ? '👑' : ''}
                    </Text>
                  </View>

                  <View style={styles.scoreRow}>
                    <Text style={styles.scoreTotalBadge}>⭐ {totalPts} pts</Text>
                    {roundPts > 0 && (
                      <Text style={styles.scoreRoundBadge}>+{roundPts} dernière manche</Text>
                    )}
                  </View>
                </View>

                <View style={styles.playerActionsRight}>
                  {/* Attribution manuelle du rôle par l'Hôte si mode HOST */}
                  {isHost && roleAssignment === 'HOST' ? (
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
                      <Text style={styles.roleBadgeText}>
                        {p.role === 'CHASSEUR' ? '🎯 CHASSEUR ↻' : '🏃 CHASSÉ ↻'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={[
                        styles.roleBadge,
                        p.role === 'CHASSEUR' ? styles.hunterBadge : styles.huntedBadge,
                      ]}
                    >
                      <Text style={styles.roleBadgeText}>
                        {roleAssignment === 'RANDOM'
                          ? '🎲 ALÉATOIRE'
                          : p.role === 'CHASSEUR'
                          ? '🎯 CHASSEUR'
                          : '🏃 CHASSÉ'}
                      </Text>
                    </View>
                  )}

                  {/* Bouton pour céder la couronne d'Hôte à ce joueur */}
                  {isHost && p.id !== playerId && (
                    <TouchableOpacity
                      style={styles.makeHostBtn}
                      onPress={() => transferHost(p.id)}
                    >
                      <Text style={styles.makeHostBtnText}>👑 Nommer Hôte</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Bouton Lancer la Partie (Hôte) ou Attente */}
        {isHost ? (
          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>
              🚀 LANCER LA PARTIE {room.round_number ? `(MANCHE #${room.round_number + 1})` : ''}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingContainer}>
            <ActivityIndicator size="small" color="#4DEEEA" />
            <Text style={styles.waitingText}>
              En attente du lancement par l'hôte...
            </Text>
          </View>
        )}

        {/* MODALE COMPLÈTE "PARAMÈTRES DE LA PARTIE" (Hôte uniquement) */}
        <Modal
          visible={settingsModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setSettingsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>⚙️ PARAMÈTRES DE LA PARTIE</Text>
                <TouchableOpacity
                  style={styles.closeModalBtn}
                  onPress={() => setSettingsModalVisible(false)}
                >
                  <Text style={styles.closeModalBtnText}>Fermer ✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* 1. Mode de Jeu */}
                <Text style={styles.configLabel}>1. Mode de Jeu :</Text>
                <View style={styles.modeRow}>
                  {[
                    { id: 'TIMER' as GameMode, label: '⏱️ Mode Timer (Classique)' },
                    { id: 'INFECTED' as GameMode, label: '🧟 Mode Infecté' },
                  ].map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.modeChip, gameMode === m.id && styles.modeChipActive]}
                      onPress={() => updateRoomConfig({ game_mode: m.id })}
                    >
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

                {/* 2. Durée Max de la partie (uniquement en Mode Timer) */}
                {gameMode === 'TIMER' && (
                  <>
                    <Text style={styles.configLabel}>2. Durée maximale de la manche :</Text>
                    <View style={styles.modeRow}>
                      {[
                        { sec: 300, label: '5 min' },
                        { sec: 600, label: '10 min' },
                        { sec: 900, label: '15 min' },
                        { sec: 1200, label: '20 min' },
                        { sec: 1800, label: '30 min' },
                        { sec: 2700, label: '45 min' },
                      ].map((item) => (
                        <TouchableOpacity
                          key={item.sec}
                          style={[
                            styles.modeChip,
                            gameDurationSec === item.sec && styles.modeChipActive,
                          ]}
                          onPress={() => updateRoomConfig({ game_duration_seconds: item.sec })}
                        >
                          <Text
                            style={[
                              styles.modeChipText,
                              gameDurationSec === item.sec && styles.modeChipTextActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* 3. Temps d'avance des Chassés */}
                <Text style={styles.configLabel}>
                  3. Temps d'avance des Chassés (avant 1er Ping) :
                </Text>
                <View style={styles.modeRow}>
                  {[
                    { sec: 30, label: '30 sec' },
                    { sec: 60, label: '1 min' },
                    { sec: 120, label: '2 min' },
                    { sec: 180, label: '3 min' },
                    { sec: 300, label: '5 min' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.sec}
                      style={[
                        styles.modeChip,
                        headStartSec === item.sec && styles.modeChipActive,
                      ]}
                      onPress={() => updateRoomConfig({ head_start_duration: item.sec })}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          headStartSec === item.sec && styles.modeChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 4. Intervalle entre chaque Ping GPS */}
                <Text style={styles.configLabel}>
                  4. Intervalle entre chaque Ping GPS :
                </Text>
                <View style={styles.modeRow}>
                  {[
                    { sec: 30, label: '30 sec' },
                    { sec: 60, label: '1 min' },
                    { sec: 120, label: '2 min' },
                    { sec: 180, label: '3 min' },
                    { sec: 300, label: '5 min' },
                    { sec: 600, label: '10 min' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.sec}
                      style={[
                        styles.modeChip,
                        revealIntervalSec === item.sec && styles.modeChipActive,
                      ]}
                      onPress={() => updateRoomConfig({ reveal_interval: item.sec })}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          revealIntervalSec === item.sec && styles.modeChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 5. Attribution des équipes */}
                <Text style={styles.configLabel}>5. Attribution des Équipes :</Text>
                <View style={styles.modeRow}>
                  {[
                    { id: 'RANDOM' as RoleMode, label: '🎲 Aléatoire' },
                    { id: 'HOST' as RoleMode, label: '👑 Sélection manuelle par Hôte' },
                  ].map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.modeChip,
                        roleAssignment === m.id && styles.modeChipActive,
                      ]}
                      onPress={() => updateRoomConfig({ role_mode: m.id })}
                    >
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

                {/* Nombre de chasseurs (en mode Aléatoire) */}
                {roleAssignment === 'RANDOM' && (
                  <View style={styles.randomConfigRow}>
                    <Text style={styles.configLabel}>
                      Nombre de Chasseurs au départ : {maxHunters}
                    </Text>
                    <View style={styles.counterRow}>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() =>
                          updateRoomConfig({ max_hunters: Math.max(1, maxHunters - 1) })
                        }
                      >
                        <Text style={styles.counterButtonText}>－</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.counterButton}
                        onPress={() => updateRoomConfig({ max_hunters: maxHunters + 1 })}
                      >
                        <Text style={styles.counterButtonText}>＋</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* 6. Anonymat sur la carte */}
                <Text style={styles.configLabel}>6. Anonymat sur la carte :</Text>
                <View style={styles.modeRow}>
                  {[
                    { val: false, label: '🏷️ Afficher les noms' },
                    { val: true, label: '🕵️ Anonyme (Noms masqués)' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={String(item.val)}
                      style={[
                        styles.modeChip,
                        anonymousMarkers === item.val && styles.modeChipActive,
                      ]}
                      onPress={() => updateRoomConfig({ anonymous_markers: item.val })}
                    >
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

                {/* 7. Temps de survie Prise de Risque */}
                <Text style={styles.configLabel}>
                  7. Durée de survie pour valider une "Prise de Risque" :
                </Text>
                <View style={styles.modeRow}>
                  {[
                    { sec: 30, label: '30 sec' },
                    { sec: 60, label: '1 min' },
                    { sec: 90, label: '1m 30s' },
                    { sec: 120, label: '2 min' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.sec}
                      style={[
                        styles.modeChip,
                        riskSurvivalSec === item.sec && styles.modeChipActive,
                      ]}
                      onPress={() => updateRoomConfig({ risk_survival_duration: item.sec })}
                    >
                      <Text
                        style={[
                          styles.modeChipText,
                          riskSurvivalSec === item.sec && styles.modeChipTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 8. Paramètres Bonus : Flou GPS, Alerte Proximité, Sprint Final */}
                <Text style={styles.configLabel}>
                  8. Précision / Flou des Pings réguliers :
                </Text>
                <View style={styles.modeRow}>
                  {[
                    { m: 0, label: 'Exact (0m)' },
                    { m: 15, label: 'Flou 15m' },
                    { m: 30, label: 'Flou 30m' },
                    { m: 50, label: 'Flou 50m' },
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

                <Text style={styles.configLabel}>
                  9. Alerte de Proximité "Battement de cœur" (Chassés) :
                </Text>
                <View style={styles.modeRow}>
                  {[
                    { m: 0, label: 'Désactivée' },
                    { m: 50, label: 'Moins de 50m' },
                    { m: 100, label: 'Moins de 100m' },
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
                      10. Sprint Final (Pings 2x plus rapides dans les 2 dernières min) :
                    </Text>
                    <View style={styles.modeRow}>
                      {[
                        { val: true, label: '⚡ Activé' },
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
                <Text style={styles.saveSettingsBtnText}>VALIDER LES PARAMÈTRES</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ============================================================================
  // ÉCRAN D'ACCUEIL : CRÉATION OU CONNEXION À UNE ROOM
  // ============================================================================
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>MANHUNT</Text>
      <Text style={styles.subTitle}>Cache-cache GPS multijoueur temps réel</Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Adresse du Serveur Backend (FastAPI)</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="https://votre-app.onrender.com"
          placeholderTextColor="#666"
          autoCapitalize="none"
        />

        {serverHistory.length > 0 && (
          <View style={styles.historyContainer}>
            <Text style={styles.historyLabel}>Serveurs récents :</Text>
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

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Votre Pseudo</Text>
        <TextInput
          style={styles.input}
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="Entrez votre pseudo"
          placeholderTextColor="#666"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Rôle souhaité par défaut</Text>
        <View style={styles.roleContainer}>
          <TouchableOpacity
            style={[styles.roleButton, role === 'CHASSE' && styles.selectedHunted]}
            onPress={() => setRole('CHASSE')}
          >
            <Text style={styles.roleText}>🏃 CHASSÉ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleButton, role === 'CHASSEUR' && styles.selectedHunter]}
            onPress={() => setRole('CHASSEUR')}
          >
            <Text style={styles.roleText}>🎯 CHASSEUR</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.actionButton, styles.createButton]}
        onPress={handleCreate}
        disabled={loading}
      >
        <Text style={styles.buttonText}>CRÉER UNE ROOM</Text>
      </TouchableOpacity>

      <View style={styles.divider}>
        <Text style={styles.dividerText}>OU REJOINDRE</Text>
      </View>

      <View style={styles.joinRow}>
        <TextInput
          style={[styles.input, styles.codeInput]}
          value={inputCode}
          onChangeText={setInputCode}
          placeholder="CODE"
          placeholderTextColor="#666"
          autoCapitalize="characters"
          maxLength={6}
        />
        <TouchableOpacity
          style={[styles.actionButton, styles.joinButton]}
          onPress={handleJoin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>REJOINDRE</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#12121C',
    padding: 20,
    justifyContent: 'center',
  },
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
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFDD57',
    textAlign: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFDD57',
  },
  roomSubTitle: {
    fontSize: 12,
    color: '#8A8A9E',
    marginTop: 2,
  },
  leaveSmallBtn: {
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
  },
  subTitle: {
    fontSize: 14,
    color: '#8A8A9E',
    textAlign: 'center',
    marginBottom: 20,
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
  },
  hostActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  openSettingsBtn: {
    flex: 1,
    backgroundColor: '#FFDD57',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  openSettingsBtnText: {
    color: '#12121C',
    fontWeight: '900',
    fontSize: 12,
  },
  resetScoresBtn: {
    backgroundColor: '#2A2A3D',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  resetScoresBtnText: {
    color: '#A0A0B0',
    fontSize: 11,
    fontWeight: 'bold',
  },
  lastRoundCard: {
    backgroundColor: '#1A2E35',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4DEEEA',
    marginBottom: 10,
  },
  lastRoundTitle: {
    color: '#4DEEEA',
    fontWeight: '900',
    fontSize: 12,
  },
  lastRoundMvp: {
    color: '#FFDD57',
    fontWeight: 'bold',
    fontSize: 11,
    marginTop: 3,
  },
  sectionTitle: {
    color: '#8A8A9E',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 6,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#E0E0E0',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1E1E2C',
    color: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
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
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roleButton: {
    flex: 0.48,
    paddingVertical: 14,
    backgroundColor: '#1E1E2C',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedHunted: {
    borderColor: '#34C759',
    backgroundColor: '#1A382B',
  },
  selectedHunter: {
    borderColor: '#FF3B30',
    backgroundColor: '#3D1E24',
  },
  roleText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButton: {
    backgroundColor: '#4DEEEA',
  },
  joinButton: {
    backgroundColor: '#FFDD57',
    paddingHorizontal: 20,
  },
  buttonText: {
    color: '#12121C',
    fontWeight: '900',
    fontSize: 16,
  },
  divider: {
    marginVertical: 20,
    alignItems: 'center',
  },
  dividerText: {
    color: '#666',
    fontWeight: 'bold',
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  scoreTotalBadge: {
    color: '#4DEEEA',
    fontSize: 12,
    fontWeight: '800',
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
  roleBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 11,
  },
  makeHostBtn: {
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
  },
  startButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  startButtonText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 16,
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
  historyContainer: {
    marginTop: 8,
  },
  historyLabel: {
    color: '#8A8A9E',
    fontSize: 12,
    marginBottom: 6,
  },
  historyScroll: {
    flexDirection: 'row',
  },
  historyChip: {
    backgroundColor: '#1E1E2C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
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
    fontSize: 12,
    fontWeight: 'bold',
  },
  historyChipTextActive: {
    color: '#4DEEEA',
  },
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
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: '#3A3A55',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#FFDD57',
    fontWeight: '900',
    fontSize: 16,
  },
  closeModalBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#2A2A3D',
    borderRadius: 8,
  },
  closeModalBtnText: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalScroll: {
    marginBottom: 12,
  },
  configLabel: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 6,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modeChip: {
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
  },
  modeChipTextActive: {
    color: '#12121C',
  },
  randomConfigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#252538',
    padding: 10,
    borderRadius: 10,
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
  counterButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 18,
  },
  saveSettingsBtn: {
    backgroundColor: '#34C759',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveSettingsBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
});
