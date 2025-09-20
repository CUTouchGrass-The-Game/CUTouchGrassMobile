import * as Location from 'expo-location';
import { MapView, Marker } from 'expo-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getDatabase, onValue, ref, set } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import firebaseApp from '../config/firebaseConfig';
import { getStoredDeviceId } from '../util/deviceId';

interface GameLocation {
  latitude: number;
  longitude: number;
  timestamp: string;
  playerId: string;
  playerName: string;
}

export default function GameMapScreen() {
  const router = useRouter();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gameLocations, setGameLocations] = useState<GameLocation[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<any>(null);

  useEffect(() => {
    if (gameId) {
      getLocationAsync();
      listenToGameData();
    }
  }, [gameId]);

  const getLocationAsync = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);
      
      // Update player location in Firebase
      await updatePlayerLocation(location);
    } catch (error) {
      setErrorMsg('Error getting location');
      console.error('Location error:', error);
    }
  };

  const updatePlayerLocation = async (location: Location.LocationObject) => {
    try {
      const deviceId = await getStoredDeviceId();
      const db = getDatabase(firebaseApp);
      
      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: new Date().toISOString(),
        playerId: deviceId,
        playerName: currentPlayer?.name || 'Unknown Player'
      };

      await set(ref(db, `games/${gameId}/locations/${deviceId}`), locationData);
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  const listenToGameData = async () => {
    try {
      const deviceId = await getStoredDeviceId();
      const db = getDatabase(firebaseApp);
      const gameRef = ref(db, `games/${gameId}`);

      const unsubscribe = onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          // Check if current player is host
          if (data.players) {
            const playersArray = Object.entries(data.players || {}).map(([id, player]) => ({
              ...(player as any)
            }));
            const existingPlayer = playersArray.find(player => player.deviceId === deviceId);
            setCurrentPlayer(existingPlayer || null);
            setIsHost(existingPlayer?.isHost === true || false);
          }

          // Get all player locations
          if (data.locations) {
            const locationsArray = Object.entries(data.locations || {}).map(([id, location]) => ({
              ...(location as GameLocation)
            }));
            setGameLocations(locationsArray);
          }
        }
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error listening to game data:', error);
    }
  };

  const handleStartGame = () => {
    Alert.alert(
      'Start Game?',
      'Are you sure you want to start the game?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              const db = getDatabase(firebaseApp);
              await set(ref(db, `games/${gameId}/status`), 'in-progress');
              Alert.alert('Game Started!', 'The game has begun!');
            } catch (error) {
              Alert.alert('Error', 'Failed to start game');
            }
          }
        }
      ]
    );
  };

  if (errorMsg) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!location) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Getting your location...</Text>
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
        <Text style={styles.title}>Game Map</Text>
        {isHost && (
          <TouchableOpacity style={styles.startButton} onPress={handleStartGame}>
            <Text style={styles.startButtonText}>Start Game</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {/* Current player marker */}
          <Marker
            coordinate={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }}
            title="You"
            description={currentPlayer?.name || 'Your location'}
            pinColor="blue"
          />
          
          {/* Other players markers */}
          {gameLocations
            .filter(loc => loc.playerId !== (currentPlayer?.deviceId))
            .map((loc, index) => (
              <Marker
                key={index}
                coordinate={{
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                }}
                title={loc.playerName}
                description={`Last seen: ${new Date(loc.timestamp).toLocaleTimeString()}`}
                pinColor="red"
              />
            ))}
        </MapView>
      </View>

      {/* Player List */}
      <View style={styles.playerList}>
        <Text style={styles.playerListTitle}>Players on Map ({gameLocations.length})</Text>
        {gameLocations.map((loc, index) => (
          <View key={index} style={styles.playerItem}>
            <View style={[styles.playerDot, { backgroundColor: loc.playerId === currentPlayer?.deviceId ? '#3B82F6' : '#EF4444' }]} />
            <Text style={styles.playerName}>{loc.playerName}</Text>
            <Text style={styles.playerTime}>
              {new Date(loc.timestamp).toLocaleTimeString()}
            </Text>
          </View>
        ))}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  startButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  playerList: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  playerListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  playerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  playerName: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },
  playerTime: {
    fontSize: 12,
    color: '#64748B',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748B',
  },
});
