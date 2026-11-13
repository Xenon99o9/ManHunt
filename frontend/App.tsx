import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { GameProvider, useGame } from './src/context/GameContext';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { GameScreen } from './src/screens/GameScreen';

const MainNavigation: React.FC = () => {
  const { room } = useGame();

  // Switch between Lobby and Active Game view depending on game state
  const isGameActive = room && (room.state === 'HEAD_START' || room.state === 'HUNTING');

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {isGameActive ? <GameScreen /> : <LobbyScreen />}
    </View>
  );
};

export default function App() {
  return (
    <GameProvider>
      <SafeAreaView style={styles.safeArea}>
        <MainNavigation />
      </SafeAreaView>
    </GameProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#12121C',
  },
  container: {
    flex: 1,
    backgroundColor: '#12121C',
  },
});
