import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  seconds: number;
  phase: 'HEAD_START' | 'HUNTING' | 'LOBBY';
}

export const TimerDisplay: React.FC<Props> = ({ seconds, phase }) => {
  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPhaseTitle = () => {
    if (phase === 'HEAD_START') return '⏱️ CHRONO DE FUITE (5 MIN)';
    if (phase === 'HUNTING') return '🛰️ RECHARTAGE DANS';
    return 'LOBBY EN ATTENTE';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.phaseTitle}>{getPhaseTitle()}</Text>
      <Text style={[styles.timerText, phase === 'HEAD_START' && styles.headStartColor]}>
        {formatTime(seconds)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E2C',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  phaseTitle: {
    color: '#8A8A9E',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  timerText: {
    color: '#4DEEEA',
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  headStartColor: {
    color: '#FFDD57',
  },
});
