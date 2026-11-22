import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DurationInputProps {
  label: string;
  valueSeconds: number;
  minSeconds: number;
  maxSeconds?: number;
  stepSeconds?: number;
  onChangeSeconds: (newTotalSeconds: number) => void;
}

export const DurationInput: React.FC<DurationInputProps> = ({
  label,
  valueSeconds,
  minSeconds,
  maxSeconds = 7200,
  stepSeconds = 15,
  onChangeSeconds,
}) => {
  const [minText, setMinText] = useState(String(Math.floor(valueSeconds / 60)));
  const [secText, setSecText] = useState(String(valueSeconds % 60).padStart(2, '0'));

  useEffect(() => {
    setMinText(String(Math.floor(valueSeconds / 60)));
    setSecText(String(valueSeconds % 60).padStart(2, '0'));
  }, [valueSeconds]);

  const commit = (rawMin: string, rawSec: string) => {
    const parsedMin = parseInt(rawMin.replace(/[^0-9]/g, ''), 10) || 0;
    const parsedSec = parseInt(rawSec.replace(/[^0-9]/g, ''), 10) || 0;
    const total = Math.max(minSeconds, Math.min(maxSeconds, parsedMin * 60 + parsedSec));
    setMinText(String(Math.floor(total / 60)));
    setSecText(String(total % 60).padStart(2, '0'));
    if (total !== valueSeconds) {
      onChangeSeconds(total);
    }
  };

  const adjustByStep = (delta: number) => {
    const next = Math.max(minSeconds, Math.min(maxSeconds, valueSeconds + delta));
    onChangeSeconds(next);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => adjustByStep(-stepSeconds)}
        >
          <Ionicons name="remove" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.inputsGroup}>
          <View style={styles.unitBox}>
            <TextInput
              style={styles.numInput}
              value={minText}
              onChangeText={(txt) => setMinText(txt.replace(/[^0-9]/g, ''))}
              onEndEditing={() => commit(minText, secText)}
              onBlur={() => commit(minText, secText)}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
            />
            <Text style={styles.unitText}>min</Text>
          </View>

          <Text style={styles.colon}>:</Text>

          <View style={styles.unitBox}>
            <TextInput
              style={styles.numInput}
              value={secText}
              onChangeText={(txt) => setSecText(txt.replace(/[^0-9]/g, ''))}
              onEndEditing={() => commit(minText, secText)}
              onBlur={() => commit(minText, secText)}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
            />
            <Text style={styles.unitText}>sec</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => adjustByStep(stepSeconds)}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  label: {
    color: '#E0E0E0',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252538',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#3A3A55',
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: '#3A3A55',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unitBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A28',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#4A4A68',
  },
  numInput: {
    color: '#FFDD57',
    fontSize: 16,
    fontWeight: '900',
    minWidth: 32,
    textAlign: 'center',
    paddingVertical: 2,
  },
  unitText: {
    color: '#8A8A9E',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  colon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginHorizontal: 8,
  },
});
