import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import firebaseApp from '@/config/firebaseConfig';
import { getDatabase, onValue, ref } from 'firebase/database';
import { Game } from '../types';

export default function HomeScreen() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>();

  useEffect(() => {
    listenToGames();
  }, [])

  const listenToGames = () => {
    const db = getDatabase(firebaseApp);
    const gameRef = ref(db, `games`);
  
    const unsubscribe = onValue(gameRef, (snapshot) => {
        const gamesData = snapshot.val();
        if (gamesData) {
            // Filter out games with status 'ended'
            const gamesArray = Object.entries(gamesData || {})
              .map(([id, game]) => ({
                id,
                ...(game as any)
              }))
              .filter(game => game.status !== 'ended'); // Only show non-ended games
            setGames(gamesArray);
        } else {
            setGames([]);
        }
    });
  
    // Return unsubscribe function to clean up later
    return unsubscribe;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting':
        return '#10B981'; // green
      case 'in-progress':
        return '#F59E0B'; // amber
      case 'finished':
        return '#6B7280'; // gray
      case 'ended':
        return '#EF4444'; // red (though these won't be displayed)
      default:
        return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'waiting':
        return 'Waiting for players';
      case 'in-progress':
        return 'In Progress';
      case 'finished':
        return 'Finished';
      case 'ended':
        return 'Ended';
      default:
        return status;
    }
  };

  const handleJoinRandomGame = () => {
    // TODO: Implement join random game logic
    console.log('Joining random game...');
  };

  const handleCreateGame = () => {
    router.push('/createGame');
  };

  const handleJoinGame = (gameId: string) => {
    router.push(`/game?gameId=${gameId}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>CU Touch Grass</Text>
        <Text style={styles.subtitle}>Stop doomscrolling, go outside.</Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleCreateGame}>
          <Text style={styles.primaryButtonText}>Create Game</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.secondaryButton} onPress={handleJoinRandomGame}>
          <Text style={styles.secondaryButtonText}>Join Random Game</Text>
        </TouchableOpacity>
      </View>

      {/* Current Games Section */}
      <View style={styles.gamesSection}>
        <Text style={styles.sectionTitle}>Current Games</Text>
        
        <ScrollView style={styles.gamesList} showsVerticalScrollIndicator={false}>
          {games && games.map((game, index) => (
            <TouchableOpacity
              key={index}
              style={styles.gameCard}
              onPress={() => handleJoinGame(game.id)}
            >
              <View style={styles.gameHeader}>
                <Text style={styles.gameName}>{game.game}</Text>
                <View 
                style={[
                    styles.statusBadge, 
                    // { 
                    //     backgroundColor: getStatusColor(game.status) 
                    // }
                ]}>
                  <Text style={styles.statusText}>{getStatusText(game.host)}</Text>
                </View>
              </View>
              
              {/* <View style={styles.gameInfo}>
                <Text style={styles.playerCount}>
                  {game.players}/{game.maxPlayers} players
                </Text>
                {game.timeLeft && (
                  <Text style={styles.timeLeft}>⏱️ {game.timeLeft}</Text>
                )}
              </View> */}
              
              <View style={styles.joinButton}>
                <Text style={styles.joinButtonText}>View</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  secondaryButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  gamesSection: {
    flex: 1,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  gamesList: {
    flex: 1,
  },
  gameCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  gameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gameName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
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
  gameInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  playerCount: {
    fontSize: 14,
    color: '#64748B',
  },
  timeLeft: {
    fontSize: 14,
    color: '#64748B',
  },
  joinButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
});
