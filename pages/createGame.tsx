import { useRouter } from 'expo-router';
import { getDatabase, ref, set } from 'firebase/database';
import React, { useState } from 'react';
import {
    Alert,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import firebaseApp from "../config/firebaseConfig";
import { getStoredDeviceId } from '../util/deviceId';
import { generateId } from '../util/generateId';

export default function CreateGameScreen() {
  const router = useRouter();
  const [gameName, setGameName] = useState('');
  const [hostName, setHostName] = useState('');

  const handleCreateGame = async () => {
    if (!gameName.trim()) {
      Alert.alert('Error', 'Please enter a game name');
      return;
    }
    if (!hostName.trim()) {
      Alert.alert('Error', 'Please enter your name as host');
      return;
    }

    const db = getDatabase(firebaseApp);
    const gameId = generateId();
    const deviceId = await getStoredDeviceId();
    
    const hostPlayerId = generateId();
    const gameData = {
      host: hostName,
      game: gameName,
      status: 'waiting',
      createdAt: new Date().toISOString(),
      players: {
        [hostPlayerId]: {
          id: hostPlayerId,
          name: hostName,
          joinedAt: new Date().toISOString(),
          isHost: true,
          deviceId: deviceId
        }
      }
    };

    set(ref(db, 'games/' + gameId), gameData).then(() => {
      Alert.alert('Success', `Game "${gameName}" created successfully!`, [
        {
          text: 'OK',
          onPress: () => router.push(`/game?gameId=${gameId}`)
        }
      ]);
    }).catch((error) => {
      Alert.alert('Error', 'Failed to create game');
      console.error('Error creating game:', error);
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create New Game</Text>
        <Text style={styles.subtitle}>Set up your jet lag adventure</Text>
      </View>

      {/* Form */}
      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Game Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter game name (e.g., 'Tokyo to NYC Challenge')"
            value={gameName}
            onChangeText={setGameName}
            maxLength={50}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Your Name (Host)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={hostName}
            onChangeText={setHostName}
            maxLength={30}
          />
        </View>

        {/* Game Settings Preview */}
        {/* <View style={styles.settingsPreview}>
          <Text style={styles.settingsTitle}>Game Settings</Text>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Max Players:</Text>
            <Text style={styles.settingValue}>6 (default)</Text>
          </View>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Game Duration:</Text>
            <Text style={styles.settingValue}>24 hours (default)</Text>
          </View>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>Difficulty:</Text>
            <Text style={styles.settingValue}>Medium (default)</Text>
          </View>
        </View> */}

        {/* Create Button */}
        <TouchableOpacity style={styles.createButton} onPress={handleCreateGame}>
          <Text style={styles.createButtonText}>Create Game</Text>
        </TouchableOpacity>

        {/* Info Text */}
        <Text style={styles.infoText}>
          Once created, other players can join your game using the game code that will be generated.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
  },
  form: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1E293B',
  },
  settingsPreview: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  settingLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  settingValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
  },
  createButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
});
