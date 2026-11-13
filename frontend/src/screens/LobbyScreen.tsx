import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useGame } from '../context/GameContext';
import { RoleMode, Role } from '../types/game';

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
  } = useGame();

  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!playerName.trim()) {
      alert('Veuillez entrer votre pseudo.');
      return;
    }
    if (!serverUrl.trim()) {
      alert('Veuillez renseigner l\'adresse du serveur.');
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
      alert('Veuillez renseigner l\'adresse du serveur.');
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

  const isHost = room?.players[playerId]?.is_host;
  const currentRoleMode = room?.role_mode || 'FREE';
  const currentRevealInterval = room?.reveal_interval || 300;
  const currentMaxHunters = room?.max_hunters || 1;

  // ÉCRAN LOBBY EN ATTENTE DANS UNE ROOM
  if (room) {
    const playersList = Object.values(room.players);
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitle}>ROOM: {room.code}</Text>
        <Text style={styles.subTitle}>Joueurs connectés ({playersList.length})</Text>

        {/* Panneau d'options pour l'hôte */}
        {isHost && (
          <View style={styles.hostConfigPanel}>
            <Text style={styles.configPanelTitle}>PARAMÈTRES DE JEU (HÔTE)</Text>

            {/* Mode d'attribution des rôles */}
            <Text style={styles.configLabel}>Attribution des Rôles :</Text>
            <View style={styles.modeRow}>
              {(['FREE', 'HOST', 'RANDOM'] as RoleMode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeChip, currentRoleMode === m && styles.modeChipActive]}
                  onPress={() => updateRoomConfig({ role_mode: m })}
                >
                  <Text style={[styles.modeChipText, currentRoleMode === m && styles.modeChipTextActive]}>
                    {m === 'FREE' ? 'Libre' : m === 'HOST' ? 'Par Hôte' : 'Aléatoire'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Intervalle de géolocalisation */}
            <Text style={styles.configLabel}>Envoi GPS toutes les :</Text>
            <View style={styles.modeRow}>
              {[
                { sec: 60, label: '1 min' },
                { sec: 120, label: '2 min' },
                { sec: 180, label: '3 min' },
                { sec: 300, label: '5 min' },
                { sec: 600, label: '10 min' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.sec}
                  style={[styles.modeChip, currentRevealInterval === item.sec && styles.modeChipActive]}
                  onPress={() => updateRoomConfig({ reveal_interval: item.sec })}
                >
                  <Text style={[styles.modeChipText, currentRevealInterval === item.sec && styles.modeChipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Nb Max Chasseurs pour mode aléatoire */}
            {currentRoleMode === 'RANDOM' && (
              <View style={styles.randomConfigRow}>
                <Text style={styles.configLabel}>Nb Max Chasseurs : {currentMaxHunters}</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => updateRoomConfig({ max_hunters: Math.max(1, currentMaxHunters - 1) })}
                  >
                    <Text style={styles.counterButtonText}>-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => updateRoomConfig({ max_hunters: currentMaxHunters + 1 })}
                  >
                    <Text style={styles.counterButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        <ScrollView style={styles.playerList}>
          {playersList.map((p) => (
            <View key={p.id} style={styles.playerCard}>
              <Text style={styles.playerName}>
                {p.name} {p.is_host ? '👑 (Hôte)' : ''}
              </Text>

              {/* Si l'hôte peut changer les rôles direct */}
              {isHost && currentRoleMode === 'HOST' ? (
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
                    {p.role === 'CHASSEUR' ? 'CHASSEUR (Changer)' : 'CHASSÉ (Changer)'}
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
                    {p.role === 'CHASSEUR' ? 'CHASSEUR' : 'CHASSÉ'}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {isHost ? (
          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>LANCER LA PARTIE</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingContainer}>
            <ActivityIndicator size="small" color="#4DEEEA" />
            <Text style={styles.waitingText}>En attente du lancement par l'hôte...</Text>
          </View>
        )}
      </View>
    );
  }

  // ÉCRAN DE CONFIGURATION INITIALE DU LOBBY
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>MANHUNT</Text>
      <Text style={styles.subTitle}>Cache-cache GPS grandeur nature</Text>

      {/* Saisie & Sélection de l'URL du serveur */}
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

        {/* Historique des serveurs récents enregistrés */}
        {serverHistory.length > 0 && (
          <View style={styles.historyContainer}>
            <Text style={styles.historyLabel}>Serveurs récents :</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.historyScroll}>
              {serverHistory.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.historyChip, serverUrl === item && styles.historyChipActive]}
                  onPress={() => setServerUrl(item)}
                  onLongPress={() => removeServerHistory(item)}
                >
                  <Text style={[styles.historyChipText, serverUrl === item && styles.historyChipTextActive]}>
                    {item.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Pseudo */}
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

      {/* Choix d'équipe */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Choisissez votre Équipe</Text>
        <View style={styles.roleContainer}>
          <TouchableOpacity
            style={[styles.roleButton, role === 'CHASSE' && styles.selectedHunted]}
            onPress={() => setRole('CHASSE')}
          >
            <Text style={styles.roleText}>CHASSÉ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleButton, role === 'CHASSEUR' && styles.selectedHunter]}
            onPress={() => setRole('CHASSEUR')}
          >
            <Text style={styles.roleText}>CHASSEUR</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Boutons d'action */}
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
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFDD57',
    textAlign: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFDD57',
    textAlign: 'center',
    marginTop: 40,
  },
  subTitle: {
    fontSize: 14,
    color: '#8A8A9E',
    textAlign: 'center',
    marginBottom: 20,
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
    marginVertical: 10,
  },
  playerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E2C',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  playerName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
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
    fontSize: 12,
  },
  startButton: {
    backgroundColor: '#34C759',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  startButtonText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 18,
  },
  waitingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  hostConfigPanel: {
    backgroundColor: '#1E1E2C',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  configPanelTitle: {
    color: '#FFDD57',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: 'center',
  },
  configLabel: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 4,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  modeChip: {
    backgroundColor: '#2A2A3D',
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    marginTop: 4,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counterButton: {
    backgroundColor: '#3A3A55',
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  counterButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 18,
  },
});
