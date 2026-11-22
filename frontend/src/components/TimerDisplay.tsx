import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GameMode } from '../types/game';

interface Props {
  seconds: number;
  phase: 'HEAD_START' | 'HUNTING' | 'LOBBY';
  gameMode?: GameMode;
  gameRemainingSeconds?: number | null;
}

export const TimerDisplay: React.FC<Props> = ({
  seconds,
  phase,
  gameMode = 'TIMER',
  gameRemainingSeconds,
}) => {
  const formatTime = (totalSecs: number) => {
    const safeSecs =
      typeof totalSecs === 'number' && !isNaN(totalSecs) && totalSecs >= 0
        ? Math.floor(totalSecs)
        : 0;
    const mins = Math.floor(safeSecs / 60);
    const secs = safeSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPhaseTitle = () => {
    if (phase === 'HEAD_START') return 'AVANCE CHASSÉS (1ER PING)';
    if (phase === 'HUNTING') return 'PROCHAIN PING GPS';
    return 'LOBBY EN ATTENTE';
  };

  return (
    <View style={styles.container}>
      <View style={styles.mainTimerCol}>
        <Text style={styles.phaseTitle}>{getPhaseTitle()}</Text>
        <Text style={[styles.timerText, phase === 'HEAD_START' && styles.headStartColor]}>
          {formatTime(seconds)}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.secondaryTimerCol}>
        {gameMode === 'INFECTED' ? (
          <>
            <Text style={styles.secondaryLabel}>MODE DE JEU</Text>
            <View style={styles.infectedRow}>
              <MaterialCommunityIcons name="biohazard" size={18} color="#FF9500" />
              <Text style={styles.infectedModeText}>INFECTÉ</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.secondaryLabel}>FIN DE MANCHE</Text>
            <Text style={styles.secondaryTimerText}>
              {typeof gameRemainingSeconds === 'number'
                ? formatTime(gameRemainingSeconds)
                : '--:--'}
            </Text>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E2C',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  mainTimerCol: {
    flex: 1.3,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 38,
    backgroundColor: '#3A3A55',
    marginHorizontal: 10,
  },
  secondaryTimerCol: {
    flex: 0.9,
    alignItems: 'center',
  },
  phaseTitle: {
    color: '#8A8A9E',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    marginBottom: 2,
    textAlign: 'center',
  },
  timerText: {
    color: '#4DEEEA',
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  headStartColor: {
    color: '#FFDD57',
  },
  secondaryLabel: {
    color: '#8A8A9E',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  secondaryTimerText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  infectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  infectedModeText: {
    color: '#FF9500',
    fontSize: 15,
    fontWeight: '900',
    marginLeft: 5,
  },
});
