import * as Location from 'expo-location';
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
import { WebView } from 'react-native-webview';
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
  const [mapHtml, setMapHtml] = useState<string>('');

  useEffect(() => {
    if (gameId) {
      getLocationAsync();
      listenToGameData();
    }
  }, [gameId]);

  useEffect(() => {
    if (location && gameLocations.length >= 0) {
      generateMapHtml();
    }
  }, [location, gameLocations]);

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

  const generateMapHtml = () => {
    if (!location) return;

    const currentLat = location.coords.latitude;
    const currentLng = location.coords.longitude;
    
    // Generate markers for all players
    const markers = gameLocations.map((loc, index) => {
      const isCurrentPlayer = loc.playerId === currentPlayer?.deviceId;
      const markerColor = isCurrentPlayer ? 'blue' : 'red';
      const markerIcon = isCurrentPlayer ? 'user' : 'user-friends';
      
      return `
        L.marker([${loc.latitude}, ${loc.longitude}], {
          icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background-color: ${markerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(map).bindPopup('<b>${loc.playerName}</b><br>Last seen: ${new Date(loc.timestamp).toLocaleTimeString()}');
      `;
    }).join('\n');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Game Map</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>
          body { margin: 0; padding: 0; }
          #map { height: 100vh; width: 100vw; }
          .custom-marker { background: none !important; border: none !important; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
          const map = L.map('map').setView([${currentLat}, ${currentLng}], 15);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(map);
          
          // Add current player marker
          L.marker([${currentLat}, ${currentLng}], {
            icon: L.divIcon({
              className: 'custom-marker',
              html: '<div style="background-color: blue; width: 25px; height: 25px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>',
              iconSize: [25, 25],
              iconAnchor: [12, 12]
            })
          }).addTo(map).bindPopup('<b>You</b><br>Your current location');
          
          // Add other players
          ${markers}
          
          // Fit map to show all markers
          if (${gameLocations.length} > 0) {
            const group = new L.featureGroup();
            ${gameLocations.map(loc => `group.addLayer(L.marker([${loc.latitude}, ${loc.longitude}]));`).join('\n')}
            group.addLayer(L.marker([${currentLat}, ${currentLng}]));
            map.fitBounds(group.getBounds().pad(0.1));
          }
        </script>
      </body>
      </html>
    `;
    
    setMapHtml(html);
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
        {mapHtml ? (
          <WebView
            source={{ html: mapHtml }}
            style={styles.map}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={false}
            scrollEnabled={false}
            bounces={false}
          />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading map...</Text>
          </View>
        )}
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
