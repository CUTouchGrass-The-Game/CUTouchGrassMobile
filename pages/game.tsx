import { useLocalSearchParams, useRouter } from 'expo-router';
import { getDatabase, onValue, push, ref, set } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import firebaseApp from '../config/firebaseConfig';
import { GameData, Player } from '../types';
import { getStoredDeviceId } from '../util/deviceId';

export default function GameScreen() {
  const router = useRouter();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  console.log("g ",gameId);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    if (gameId) {
      listenToGame();
    }
  }, [gameId]);

  const listenToGame = async () => {
    const db = getDatabase(firebaseApp);
    const gameRef = ref(db, `games/${gameId}`);
    const deviceId = await getStoredDeviceId();

    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameData({ id: gameId, ...data });
        
        // Convert players object to array
        if (data.players) {
          const playersArray = Object.entries(data.players || {}).map(([id, player]) => ({
            ...(player as Player)
          }));
          setPlayers(playersArray);
          
          // Check if current device is already in the game
          const existingPlayer = playersArray.find(player => player.deviceId === deviceId);
          setCurrentPlayer(existingPlayer || null);
          
          // Check if current player is the host
          const hostPlayer = playersArray.find(player => player.isHost === true);
          setIsHost(existingPlayer?.isHost === true || false);
        } else {
          setPlayers([]);
          setCurrentPlayer(null);
          setIsHost(false);
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  };

  const handleJoinGame = () => {
    if (!gameData) return;
    
    console.log('handleJoinGame called:', { isHost, gameId });
    
    // If host, go to map screen
    if (isHost) {
      console.log('Navigating to gameMap with gameId:', gameId);
      router.push(`/gameMap?gameId=${gameId}`);
      return;
    }
    
    // Check if player is already in the game
    if (currentPlayer) {
      Alert.alert(
        'Already Joined', 
        `You're already in this game as "${currentPlayer.name}". Would you like to change your name?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change Name', onPress: () => setShowJoinModal(true) }
        ]
      );
      return;
    }
    
    setShowJoinModal(true);
  };

  const handleJoinSubmit = async () => {
    if (!playerName.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    
    const deviceId = await getStoredDeviceId();
    joinGameWithName(playerName.trim(), deviceId);
    setShowJoinModal(false);
    setPlayerName('');
  };

  const handleJoinCancel = () => {
    setShowJoinModal(false);
    setPlayerName('');
  };

  const joinGameWithName = async (playerName: string, deviceId: string) => {
    const db = getDatabase(firebaseApp);
    
    // Check if device is already in the game
    const existingPlayer = players.find(player => player.deviceId === deviceId);
    
    if (existingPlayer) {
      // Update existing player's name
      const playerRef = ref(db, `games/${gameId}/players/${existingPlayer.id}`);
      set(playerRef, {
        ...existingPlayer,
        name: playerName,
        joinedAt: new Date().toISOString(),
      }).then(() => {
        Alert.alert('Success', 'Name updated successfully!');
      }).catch((error) => {
        Alert.alert('Error', 'Failed to update name');
        console.error('Error updating player:', error);
      });
    } else {
      // Add new player
      const playersRef = ref(db, `games/${gameId}/players`);
      const newPlayerRef = push(playersRef);

      const newPlayer: Player = {
        id: newPlayerRef.key!,
        name: playerName,
        joinedAt: new Date().toISOString(),
        isHost: false,
        deviceId: deviceId
      };

      set(newPlayerRef, newPlayer)
        .then(() => {
          Alert.alert('Success', 'Joined game successfully!');
        })
        .catch((error) => {
          Alert.alert('Error', 'Failed to join game');
          console.error('Error joining game:', error);
        });
    }
  };

  const handleStartGame = () => {
    if (!gameData) return;

    // Double check player count before starting
    if (players.length < 2) {
      Alert.alert('Not Enough Players', 'You need at least 2 players to start the game.');
      return;
    }

    Alert.alert(
      'Start Game?',
      `Are you sure you want to start the game with ${players.length} players?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Start Game',
          onPress: () => {
            const db = getDatabase(firebaseApp);
            
            set(ref(db, `games/${gameId}/status`), 'in-progress')
              .then(() => {
                Alert.alert('Game Started!', `The game has begun with ${players.length} players!`);
              })
              .catch((error) => {
                Alert.alert('Error', 'Failed to start game');
                console.error('Error starting game:', error);
              });
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading game...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!gameData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Game not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{gameData.game}</Text>
          {isHost && (
            <View style={styles.hostIndicator}>
              <Text style={styles.hostIndicatorText}>👑 Host</Text>
            </View>
          )}
        </View>
        <Text style={styles.gameId}>Game ID: {gameId}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Game Info */}
        <View style={styles.gameInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Host:</Text>
            <Text style={styles.infoValue}>{gameData.host}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status:</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(gameData.status) }]}>
              <Text style={styles.statusText}>{getStatusText(gameData.status)}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Players:</Text>
            <Text style={styles.infoValue}>{players.length}</Text>
          </View>
        </View>

        {/* Players List */}
        <View style={styles.playersSection}>
          <Text style={styles.sectionTitle}>Players ({players.length})</Text>
          {players.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No players yet</Text>
            </View>
          ) : (
            players.map((player, index) => (
              <View key={index} style={styles.playerCard}>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>
                    {player.name} {player.isHost && '(Host)'}
                  </Text>
                  <Text style={styles.playerJoined}>
                    Joined {new Date(player.joinedAt).toLocaleTimeString()}
                  </Text>
                </View>
                {player.isHost && (
                  <View style={styles.hostBadge}>
                    <Text style={styles.hostBadgeText}>👑</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity 
            style={[styles.joinButton, currentPlayer && styles.joinedButton]} 
            onPress={handleJoinGame}
          >
            <Text style={[styles.joinButtonText, currentPlayer && styles.joinedButtonText]}>
              {isHost ? 'View Map' : currentPlayer ? `Joined as ${currentPlayer.name}` : 'Join Game'}
            </Text>
          </TouchableOpacity>
          
          {isHost && gameData.status === 'waiting' && players.length >= 2 && (
            <TouchableOpacity style={styles.startButton} onPress={handleStartGame}>
              <Text style={styles.startButtonText}>Start Game</Text>
            </TouchableOpacity>
          )}
          
          {isHost && gameData.status === 'waiting' && players.length < 2 && (
            <View style={styles.waitingMessage}>
              <Text style={styles.waitingText}>
                Waiting for more players... ({players.length}/2 minimum)
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Join Game Modal */}
      <Modal
        visible={showJoinModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleJoinCancel}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Join Game</Text>
              <Text style={styles.modalSubtitle}>Enter your name to join this game</Text>
              
              <TextInput
                style={styles.modalInput}
                placeholder="Your name"
                value={playerName}
                onChangeText={setPlayerName}
                autoFocus={true}
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={handleJoinSubmit}
              />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalCancelButton} onPress={handleJoinCancel}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalJoinButton} onPress={handleJoinSubmit}>
                  <Text style={styles.modalJoinText}>Join</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'waiting':
      return '#10B981';
    case 'in-progress':
      return '#F59E0B';
    case 'finished':
      return '#6B7280';
    default:
      return '#6B7280';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'waiting':
      return 'Waiting';
    case 'in-progress':
      return 'In Progress';
    case 'finished':
      return 'Finished';
    default:
      return status;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#64748B',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#EF4444',
    marginBottom: 16,
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
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  hostIndicator: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  hostIndicatorText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '600',
  },
  gameId: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: 'monospace',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  gameInfo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  infoValue: {
    fontSize: 16,
    color: '#64748B',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  playersSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
  },
  playerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  playerJoined: {
    fontSize: 14,
    color: '#64748B',
  },
  hostBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostBadgeText: {
    fontSize: 16,
  },
  actions: {
    gap: 12,
  },
  joinButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  joinedButton: {
    backgroundColor: '#10B981',
  },
  joinedButtonText: {
    color: '#FFFFFF',
  },
  startButton: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingMessage: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  waitingText: {
    color: '#92400E',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
  },
  modalJoinButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalJoinText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
