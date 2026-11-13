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
import { Role } from '../types/game';

export const LobbyScreen: React.FC = () => {
  const {
    serverUrl,
    setServerUrl,
    playerName,
    setPlayerName,
    role,
    setRole,
    room,
    playerId,
    createRoom,
    joinRoom,
    startGame,
  } = useGame();

  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!playerName.trim()) {
      alert('Veuillez entrer votre pseudo.');
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

  // LOBBY WAITING SCREEN WHEN IN ROOM
  if (room) {
    const playersList = Object.values(room.players);
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitle}>ROOM: {room.code}</Text>
        <Text style={styles.subTitle}>Joueurs connectés ({playersList.length})</Text>

        <ScrollView style={styles.playerList}>
          {playersList.map((p) => (
            <View key={p.id} style={styles.playerCard}>
              <Text style={styles.playerName}>
                {p.name} {p.is_host ? '👑 (Hôte)' : ''}
              </Text>

              <View
                style={[
                  styles.roleBadge,
                  p.role === 'CHASSEUR' ? styles.hunterBadge : styles.huntedBadge,
                ]}
              >
                <Text style={styles.roleBadgeText}>
                  {p.role === 'CHASSEUR' ? '🎯 CHASSEUR' : '🏃 CHASSÉ'}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {isHost ? (
          <TouchableOpacity style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>🚀 LANCER LA PARTIE</Text>
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

  // INITIAL LOBBY FORM SCREEN
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🏃 MANHUNT 🎯</Text>
      <Text style={styles.subTitle}>Cache-cache GPS grandeur nature</Text>

      {/* Server URL Config */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Adresse du Serveur Backend (FastAPI)</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="ws://YOUR_GCP_IP:8000"
          placeholderTextColor="#666"
          autoCapitalize="none"
        />
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

      {/* Role Selection */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Choisissez votre Équipe</Text>
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

      {/* Action Buttons */}
      <TouchableOpacity
        style={[styles.actionButton, styles.createButton]}
        onPress={handleCreate}
        disabled={loading}
      >
        <Text style={styles.buttonText}>✨ CRÉER UNE ROOM</Text>
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
    marginBottom: 24,
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
    marginVertical: 16,
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
    paddingVertical: 4,
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
});
