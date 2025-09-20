import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getDatabase, onValue, push, ref, set } from 'firebase/database';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
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
  TouchableWithoutFeedback,
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

// Categorized questions for seekers
const QUESTION_CATEGORIES = {
  zoning: {
    name: "Zoning",
    icon: "🧭",
    coins: 40,
    color: "#3B82F6",
    questions: [
      "Are you north or south of the seeker's current latitude?",
      "Are you east or west of the seeker's current longitude?",
      "Are the seekers heading in the direction of your current location?",
      "What cardinal direction are you from the seeker?",
      "Are you closer to the seeker's starting position or current position?"
    ]
  },
  location: {
    name: "Location",
    icon: "📍",
    coins: 40,
    color: "#10B981",
    questions: [
      "What is the name of the nearest library to you?",
      "What is the name of the nearest eatery location to you?",
      "What is the name of the nearest park to you?",
      "What is the name of the nearest shopping center to you?",
      "What is the name of the nearest landmark to you?"
    ]
  },
  radar: {
    name: "Radar",
    icon: "📡",
    coins: 30,
    color: "#F59E0B",
    questions: [
      "Are you within 100ft, 500ft, 1000ft or 2000ft of me?",
      "How many city blocks away are you from me?",
      "Are you within walking distance (5 minutes) of me?",
      "Can you see me from your current location?",
      "Are you closer to me than to the nearest bus stop?"
    ]
  },
  gemini: {
    name: "Gemini",
    icon: "🤖",
    coins: 20,
    color: "#8B5CF6",
    questions: [
      "Coming soon...",
      "AI-generated questions will appear here",
      "Stay tuned for dynamic content!"
    ]
  }
};

// Fixed curses for hiders
const HIDER_CURSES = [
  { name: "Slow Movement", cost: 5, description: "Slows down seeker movement" },
  { name: "Blind Spot", cost: 10, description: "Hides your location for 30 seconds" },
  { name: "Fake Location", cost: 15, description: "Shows fake location to seeker" },
  { name: "Question Block", cost: 8, description: "Blocks one seeker question" },
  { name: "Coin Steal", cost: 12, description: "Steals 3 coins from seeker" }
];

export default function GameMapScreen() {
  const router = useRouter();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gameLocations, setGameLocations] = useState<GameLocation[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<any>(null);
  const [mapHtml, setMapHtml] = useState<string>('');
  const [locationInterval, setLocationInterval] = useState<number | null>(null);
  const [gameData, setGameData] = useState<any>(null);
  const [playerRole, setPlayerRole] = useState<'hider' | 'seeker' | null>(null);
  const [coins, setCoins] = useState(0);
  const [showSeekerMenu, setShowSeekerMenu] = useState(false);
  const [showHiderMenu, setShowHiderMenu] = useState(false);
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [currentQuestionCategory, setCurrentQuestionCategory] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof QUESTION_CATEGORIES>('zoning');
  const [answerType, setAnswerType] = useState<'text' | 'photo'>('text');
  const [answerPhoto, setAnswerPhoto] = useState<string | null>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [photos, setPhotos] = useState<any[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [showCurseAlert, setShowCurseAlert] = useState(false);
  const [curseAlertData, setCurseAlertData] = useState<any>(null);
  const [showPhotoAlert, setShowPhotoAlert] = useState(false);
  const [photoAlertData, setPhotoAlertData] = useState<any>(null);
  const [showAnswerAlert, setShowAnswerAlert] = useState(false);
  const [answerAlertData, setAnswerAlertData] = useState<any>(null);
  const [shownNotifications, setShownNotifications] = useState<Set<string>>(new Set());
  const webViewRef = useRef<any>(null);

  useEffect(() => {
    if (gameId) {
      getLocationAsync();
      listenToGameData();
      listenToQuestions();
      listenToAnswers();
      listenToNotifications();
      listenToPhotos();
      // Location tracking will start when gameData is available
    }
    
    // Keyboard listeners
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });
    
    // Cleanup on unmount
    return () => {
      stopLocationTracking();
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, [gameId]);


  useEffect(() => {
    if (gameData) startLocationTracking();
    return () => {
      stopLocationTracking();
    };
  }, [gameData]);

  useEffect(() => {
    if (location && !mapHtml) {
      generateMapHtml(); // Only generate map once when first location is available
    }
  }, [location, mapHtml]);

  useEffect(() => {
    if (gameLocations.length > 0 && mapHtml) {
      updateMapMarkers(); // Update markers without recreating map
    }
  }, [gameLocations]); // Only update markers when gameLocations change

  // Update current player location without regenerating map
  useEffect(() => {
    if (location && mapHtml && webViewRef.current) {
      updateCurrentPlayerLocation();
    }
  }, [location]);

  const getLocationAsync = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 1,
      });
      setLocation(location);
      
      // Update player location in Firebase
      await updatePlayerLocation(location);
    } catch (error) {
      setErrorMsg('Error getting location');
      console.error('Location error:', error);
    }
  };

  const startLocationTracking = () => {
    // Clear any existing interval
    if (locationInterval) {
      clearInterval(locationInterval);
    }

    // Start new interval for location updates every 5 seconds
    const interval = setInterval(async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const newLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 1,
          });
          
          setLocation(newLocation);
          await updatePlayerLocation(newLocation);
        } else {
        }
      } catch (error) {
        console.error('Error updating location:', error);
      }
    }, 2000); // Update every 5 seconds

    setLocationInterval(interval);
  };

  const stopLocationTracking = () => {
    if (locationInterval) {
      clearInterval(locationInterval);
      setLocationInterval(null);
    }
  };

  const updatePlayerLocation = async (location: Location.LocationObject) => {
    try {
      const deviceId = await getStoredDeviceId();
      const db = getDatabase(firebaseApp);
      
      // Use currentPlayer state if available, otherwise fallback to gameData lookup
      let playerName = currentPlayer?.name || 'Unknown Player';
      
      // If currentPlayer is not available, try to get from gameData
      if (!currentPlayer && gameData && gameData.players) {
        const playersArray = Object.entries(gameData.players || {}).map(([id, player]) => ({
          ...(player as any)
        }));
        const existingPlayer = playersArray.find(player => player.deviceId === deviceId);
        if (existingPlayer) {
          playerName = existingPlayer.name;
        }
      }
      
      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: new Date().toISOString(),
        playerId: deviceId,
        playerName: playerName
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
          setGameData(data);
          
          // Check if current player is host and get role
          if (data.players) {
            const playersArray = Object.entries(data.players || {}).map(([id, player]) => ({
              ...(player as any)
            }));
            const existingPlayer = playersArray.find(player => player.deviceId === deviceId);
            setCurrentPlayer(existingPlayer || null);
            setIsHost(existingPlayer?.isHost === true || false);
            setPlayerRole(existingPlayer?.role || null);
            
            // Update coins from player data
            if (existingPlayer?.coins !== undefined) {
              setCoins(existingPlayer.coins);
            }
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

  const listenToQuestions = async () => {
    try {
      const db = getDatabase(firebaseApp);
      const currentQuestionRef = ref(db, `games/${gameId}/currentQuestion`);

      const unsubscribe = onValue(currentQuestionRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          // Show the current question
          setCurrentQuestion(data.text);
          setCurrentQuestionCategory(data.category);
        } else {
          // No current question, clear it
          setCurrentQuestion(null);
          setCurrentQuestionCategory(null);
        }
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error listening to questions:', error);
    }
  };

  const listenToAnswers = async () => {
    try {
      const db = getDatabase(firebaseApp);
      const answersRef = ref(db, `games/${gameId}/answers`);

      const unsubscribe = onValue(answersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const answersArray = Object.entries(data || {}).map(([id, answer]) => ({
            id,
            ...(answer as any)
          }));
          setAnswers(answersArray);
        }
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error listening to answers:', error);
    }
  };

  const listenToNotifications = async () => {
    try {
      const db = getDatabase(firebaseApp);
      const notificationsRef = ref(db, `games/${gameId}/notifications`);

      const unsubscribe = onValue(notificationsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const notificationsArray = Object.entries(data || {}).map(([id, notification]) => ({
            id,
            ...(notification as any)
          }));
          setNotifications(notificationsArray);
          
          // Check for new curse, photo, and answer notifications for seekers
          if (playerRole === 'seeker') {
            notificationsArray.forEach(notification => {
              if ((notification.type === 'curse' || notification.type === 'photo' || notification.type === 'answer') && !shownNotifications.has(notification.id)) {
                if (notification.type === 'curse') {
                  showCurseNotification(notification);
                } else if (notification.type === 'photo') {
                  showPhotoNotification(notification);
                } else if (notification.type === 'answer') {
                  showAnswerNotification(notification);
                }
                setShownNotifications(prev => new Set([...prev, notification.id]));
              }
            });
          }
        }
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error listening to notifications:', error);
    }
  };

  const listenToPhotos = async () => {
    try {
      const db = getDatabase(firebaseApp);
      const photosRef = ref(db, `games/${gameId}/photos`);

      const unsubscribe = onValue(photosRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const photosArray = Object.entries(data || {}).map(([id, photo]) => ({
            id,
            ...(photo as any)
          }));
          setPhotos(photosArray);
        }
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error listening to photos:', error);
    }
  };

  const generateMapHtml = () => {
    if (!location) return;

    const currentLat = location.coords.latitude;
    const currentLng = location.coords.longitude;
    
    // Generate markers and circles for all players
    const markers = gameLocations.map((loc, index) => {
      const isCurrentPlayer = loc.playerId === currentPlayer?.deviceId;
      const markerColor = isCurrentPlayer ? 'blue' : 'red';
      const circleColor = isCurrentPlayer ? '#3B82F6' : '#EF4444';
      
      return `
        // Player marker
        const marker${index} = L.marker([${loc.latitude}, ${loc.longitude}], {
          icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background-color: ${markerColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(map).bindPopup('<b>${loc.playerName}</b><br>Last seen: ${new Date(loc.timestamp).toLocaleTimeString()}');
        
        // Player radius circle (50 meters)
        const circle${index} = L.circle([${loc.latitude}, ${loc.longitude}], {
          color: '${circleColor}',
          fillColor: '${circleColor}',
          fillOpacity: 0.1,
          radius: 50
        }).addTo(map);
        
        // Store playerId for future updates
        marker${index}.playerId = '${loc.playerId}';
        circle${index}.playerId = '${loc.playerId}';
        
        // Add to tracking arrays
        window.playerMarkers.push(marker${index});
        window.playerCircles.push(circle${index});
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
          
          // Store markers and circles for updates
          window.playerMarkers = [];
          window.playerCircles = [];
          window.currentPlayerMarker = null;
          window.currentPlayerCircle = null;
          
          // Add current player marker
          // window.currentPlayerMarker = L.marker([${currentLat}, ${currentLng}], {
          //   icon: L.divIcon({
          //     className: 'custom-marker',
          //     html: '<div style="background-color: blue; width: 25px; height: 25px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>',
          //     iconSize: [25, 25],
          //     iconAnchor: [12, 12]
          //   })
          // }).addTo(map).bindPopup('<b>You</b><br>Your current location');
          
          // Add other players
          ${markers}
          
          // Function to update all markers
          window.updateAllMarkers = function(locations) {
            // Create a map of existing markers by playerId for quick lookup
            const existingMarkers = {};
            const existingCircles = {};
            
            window.playerMarkers.forEach((marker, index) => {
              if (marker.playerId) {
                existingMarkers[marker.playerId] = marker;
              }
            });
            
            window.playerCircles.forEach((circle, index) => {
              if (circle.playerId) {
                existingCircles[circle.playerId] = circle;
              }
            });
            
            // Update existing markers or create new ones
            locations.forEach((loc) => {
              if (existingMarkers[loc.playerId]) {
                // Update existing marker position
                existingMarkers[loc.playerId].setLatLng([loc.latitude, loc.longitude]);
                existingMarkers[loc.playerId].setPopupContent('<b>' + loc.playerName + '</b><br>Last seen: ' + new Date(loc.timestamp).toLocaleTimeString());
                
                // Update existing circle position
                if (existingCircles[loc.playerId]) {
                  existingCircles[loc.playerId].setLatLng([loc.latitude, loc.longitude]);
                }
              } else {
                // Create new marker for new player
                const markerColor = 'red';
                const circleColor = '#EF4444';
                
                const marker = L.marker([loc.latitude, loc.longitude], {
                  icon: L.divIcon({
                    className: 'custom-marker',
                    html: '<div style="background-color: ' + markerColor + '; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                  })
                }).addTo(map).bindPopup('<b>' + loc.playerName + '</b><br>Last seen: ' + new Date(loc.timestamp).toLocaleTimeString());
                
                const circle = L.circle([loc.latitude, loc.longitude], {
                  color: circleColor,
                  fillColor: circleColor,
                  fillOpacity: 0.1,
                  radius: 50
                }).addTo(map);
                
                // Store playerId for future updates
                marker.playerId = loc.playerId;
                circle.playerId = loc.playerId;
                
                window.playerMarkers.push(marker);
                window.playerCircles.push(circle);
              }
            });
            
            // Remove markers for players who are no longer in the game
            const currentPlayerIds = locations.map(loc => loc.playerId);
            window.playerMarkers = window.playerMarkers.filter(marker => {
              if (marker.playerId && !currentPlayerIds.includes(marker.playerId)) {
                map.removeLayer(marker);
                return false;
              }
              return true;
            });
            
            window.playerCircles = window.playerCircles.filter(circle => {
              if (circle.playerId && !currentPlayerIds.includes(circle.playerId)) {
                map.removeLayer(circle);
                return false;
              }
              return true;
            });
          };
          
          // Function to update current player location
          window.updateCurrentPlayerLocation = function(lat, lng) {
            if (window.currentPlayerMarker) {
              window.currentPlayerMarker.setLatLng([lat, lng]);
            }
          };
          
          // Listen for messages from React Native
          window.addEventListener('message', function(event) {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'updateMarkers') {
                window.updateAllMarkers(data.locations);
              } else if (data.type === 'updateCurrentPlayerLocation') {
                window.updateCurrentPlayerLocation(data.latitude, data.longitude);
              }
            } catch (e) {
              console.log('Error parsing message:', e);
            }
          });
          
          // Fit map to show all markers only on initial load
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

  const updateMapMarkers = () => {
    if (!mapHtml || !webViewRef.current) return;
    
    // Send message to WebView to update markers
    const message = JSON.stringify({
      type: 'updateMarkers',
      locations: gameLocations
    });
    
    webViewRef.current.postMessage(message);
  };

  const updateCurrentPlayerLocation = () => {
    if (!mapHtml || !webViewRef.current || !location) return;
    
    // Send message to WebView to update current player location
    const message = JSON.stringify({
      type: 'updateCurrentPlayerLocation',
      latitude: location.coords.latitude,
      longitude: location.coords.longitude
    });
    
    webViewRef.current.postMessage(message);
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

  // Seeker functions
  const handleAskQuestion = async (question: string, category: string) => {
    try {
      const db = getDatabase(firebaseApp);
      const questionsRef = ref(db, `games/${gameId}/questions`);
      
      // Push question to Firebase
      const newQuestionRef = push(questionsRef);
      await set(newQuestionRef, {
        text: question,
        category: category,
        askedBy: currentPlayer?.name || 'Unknown Player',
        timestamp: new Date().toISOString(),
        coins: QUESTION_CATEGORIES[category as keyof typeof QUESTION_CATEGORIES]?.coins || 20
      });

      // Set as current question for all players
      await set(ref(db, `games/${gameId}/currentQuestion`), {
        text: question,
        category: category,
        askedBy: currentPlayer?.name || 'Unknown Player',
        timestamp: new Date().toISOString(),
        coins: QUESTION_CATEGORIES[category as keyof typeof QUESTION_CATEGORIES]?.coins || 20
      });

      // Send notification to all hiders
      const notificationsRef = ref(db, `games/${gameId}/notifications`);
      const notificationRef = push(notificationsRef);
      await set(notificationRef, {
        type: 'question',
        message: `New question from ${currentPlayer?.name || 'Seeker'}: "${question}"`,
        timestamp: new Date().toISOString(),
        category: category,
        coins: QUESTION_CATEGORIES[category as keyof typeof QUESTION_CATEGORIES]?.coins || 20
      });

      setCurrentQuestion(question);
      setCurrentQuestionCategory(category);
      setShowSeekerMenu(false);
    } catch (error) {
      console.error('Error asking question:', error);
      Alert.alert('Error', 'Failed to ask question');
    }
  };

  const handleSubmitAnswer = async () => {
    if (answerType === 'text' && !answerInput.trim()) return;
    if (answerType === 'photo' && !answerPhoto) return;
    
    try {
      const deviceId = await getStoredDeviceId();
      const db = getDatabase(firebaseApp);
      
      // Award coins based on category
      const categoryKey = currentQuestionCategory as keyof typeof QUESTION_CATEGORIES;
      const coinReward = QUESTION_CATEGORIES[categoryKey]?.coins || 20;
      const newCoinTotal = coins + coinReward;
      
      // Update player's coins in Firebase
      const playerKey = Object.keys(gameData?.players || {}).find(key => 
        gameData?.players[key].deviceId === deviceId
      );
      
      if (playerKey) {
        await set(ref(db, `games/${gameId}/players/${playerKey}/coins`), newCoinTotal);
      }
      
      let answerData: any = {
        question: currentQuestion,
        category: currentQuestionCategory,
        timestamp: new Date().toISOString(),
        playerName: currentPlayer?.name || 'Unknown Player',
        playerId: deviceId,
        coinsEarned: coinReward,
        answerType: answerType
      };

      if (answerType === 'text') {
        answerData.answer = answerInput.trim();
      } else if (answerType === 'photo' && answerPhoto) {
        // Upload photo answer to Firebase Storage
        const response = await fetch(answerPhoto);
        const blob = await response.blob();
        const timestamp = Date.now();
        const filename = `answers/${gameId}/${deviceId}_${timestamp}.jpg`;
        
        const storage = getStorage(firebaseApp);
        const photoRef = storageRef(storage, filename);
        await uploadBytes(photoRef, blob);
        const downloadURL = await getDownloadURL(photoRef);
        
        answerData.answerPhoto = downloadURL;
        answerData.answer = 'Photo answer';
      }
      
      // Store answer in Firebase
      const answersRef = ref(db, `games/${gameId}/answers`);
      const answerRef = push(answersRef);
      await set(answerRef, answerData);
      
      // Clear the current question for all players
      await set(ref(db, `games/${gameId}/currentQuestion`), null);
      
      // Send notification to seeker
      const notificationsRef = ref(db, `games/${gameId}/notifications`);
      const notificationRef = push(notificationsRef);
      await set(notificationRef, {
        type: 'answer',
        message: `${currentPlayer?.name || 'Hider'} answered with ${answerType === 'photo' ? 'a photo' : 'text'}`,
        timestamp: new Date().toISOString(),
        playerName: currentPlayer?.name || 'Unknown Player',
        coinsEarned: coinReward,
        answerType: answerType,
        answerPhoto: answerData.answerPhoto
      });
      
      setCoins(newCoinTotal);
      setAnswerInput('');
      setAnswerPhoto(null);
      setAnswerType('text');
      setCurrentQuestion(null);
      setCurrentQuestionCategory(null);
      
      Alert.alert('Answer Submitted!', `You earned ${coinReward} coins!`);
    } catch (error) {
      console.error('Error submitting answer:', error);
      Alert.alert('Error', 'Failed to submit answer');
    }
  };

  // Photo functions
  const handleTakePhoto = async () => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos.');
        return;
      }

      // Take photo
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handlePickPhoto = async () => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Media library permission is needed to select photos.');
        return;
      }

      // Pick photo from library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking photo:', error);
      Alert.alert('Error', 'Failed to pick photo');
    }
  };

  const uploadPhoto = async (uri: string) => {
    try {
      setIsUploadingPhoto(true);
      
      // Convert URI to blob
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Generate unique filename
      const deviceId = await getStoredDeviceId();
      const timestamp = Date.now();
      const filename = `photos/${gameId}/${deviceId}_${timestamp}.jpg`;
      
      // Upload to Firebase Storage
      const storage = getStorage(firebaseApp);
      const photoRef = storageRef(storage, filename);
      await uploadBytes(photoRef, blob);
      
      // Get download URL
      const downloadURL = await getDownloadURL(photoRef);
      
      // Save photo info to Firebase Database
      const db = getDatabase(firebaseApp);
      const photosRef = ref(db, `games/${gameId}/photos`);
      const photoDataRef = push(photosRef);
      
      await set(photoDataRef, {
        url: downloadURL,
        uploadedBy: currentPlayer?.name || 'Unknown Player',
        playerId: deviceId,
        timestamp: new Date().toISOString(),
        role: playerRole
      });
      
      // Send notification
      const notificationsRef = ref(db, `games/${gameId}/notifications`);
      const notificationRef = push(notificationsRef);
      await set(notificationRef, {
        type: 'photo',
        message: `${currentPlayer?.name || 'Player'} shared a photo!`,
        timestamp: new Date().toISOString(),
        playerName: currentPlayer?.name || 'Unknown Player',
        photoUrl: downloadURL,
        role: playerRole
      });
      
      Alert.alert('Photo Shared!', 'Your photo has been shared with other players.');
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to upload photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const openPhoto = (photo: any) => {
    setSelectedPhoto(photo);
    setShowPhotoViewer(true);
  };

  const showCurseNotification = (curseData: any) => {
    setCurseAlertData(curseData);
    setShowCurseAlert(true);
  };

  const showPhotoNotification = (photoData: any) => {
    setPhotoAlertData(photoData);
    setShowPhotoAlert(true);
  };

  const showAnswerNotification = (answerData: any) => {
    setAnswerAlertData(answerData);
    setShowAnswerAlert(true);
  };

  const handleTakeAnswerPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setAnswerPhoto(result.assets[0].uri);
        setAnswerType('photo');
      }
    } catch (error) {
      console.error('Error taking answer photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handlePickAnswerPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Media library permission is needed to select photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setAnswerPhoto(result.assets[0].uri);
        setAnswerType('photo');
      }
    } catch (error) {
      console.error('Error picking answer photo:', error);
      Alert.alert('Error', 'Failed to pick photo');
    }
  };

  // Hider functions
  const handleUseCurse = async (curse: typeof HIDER_CURSES[0]) => {
    if (coins < curse.cost) {
      Alert.alert('Not Enough Coins', `You need ${curse.cost} coins to use this curse.`);
      return;
    }

    Alert.alert(
      'Use Curse?',
      `Use ${curse.name} for ${curse.cost} coins?\n\n${curse.description}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use',
          onPress: async () => {
            try {
              const deviceId = await getStoredDeviceId();
              const db = getDatabase(firebaseApp);
              const newCoinTotal = coins - curse.cost;
              
              // Update player's coins in Firebase
              const playerKey = Object.keys(gameData?.players || {}).find(key => 
                gameData?.players[key].deviceId === deviceId
              );
              
              if (playerKey) {
                await set(ref(db, `games/${gameId}/players/${playerKey}/coins`), newCoinTotal);
              }
              
              // Send notification to seeker about curse usage
              const notificationsRef = ref(db, `games/${gameId}/notifications`);
              const notificationRef = push(notificationsRef);
              await set(notificationRef, {
                type: 'curse',
                message: `${currentPlayer?.name || 'Hider'} used ${curse.name}!`,
                timestamp: new Date().toISOString(),
                playerName: currentPlayer?.name || 'Unknown Player',
                curseName: curse.name,
                curseDescription: curse.description,
                coinsSpent: curse.cost
              });
              
              setCoins(newCoinTotal);
              setShowHiderMenu(false);
              
              Alert.alert('Curse Used!', `${curse.name} has been activated!`);
            } catch (error) {
              console.error('Error using curse:', error);
              Alert.alert('Error', 'Failed to use curse');
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
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingContainer}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Game Map</Text>
            <View style={styles.trackingIndicator}>
              <View style={styles.trackingDot} />
              <Text style={styles.trackingText}>Live</Text>
            </View>
          </View>
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
              ref={webViewRef}
              source={{ html: mapHtml }}
              style={styles.map}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              scalesPageToFit={false}
              scrollEnabled={false}
              bounces={false}
              onMessage={(event) => {
                // Handle messages from WebView if needed
              }}
              onLoadEnd={() => {
                // Send initial markers when WebView is ready
                if (gameLocations.length > 0) {
                  setTimeout(() => {
                    updateMapMarkers();
                  }, 500);
                }
              }}
            />
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading map...</Text>
            </View>
          )}
        </View>

        {/* Role-based UI */}
        {playerRole && (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView 
              style={styles.roleUI}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
              scrollEnabled={true}
              bounces={true}
              alwaysBounceVertical={true}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.roleUIContent}
            >
            {/* Seeker UI */}
            {playerRole === 'seeker' && (
              <View style={styles.seekerUI}>
                <View style={styles.seekerHeader}>
                  <Text style={styles.roleTitle}>🔍 Seeker</Text>
                </View>
                <View style={styles.seekerButtons}>
                  <TouchableOpacity 
                    style={[styles.menuButton, styles.questionsButton]}
                    onPress={() => setShowSeekerMenu(true)}
                  >
                    <Text style={styles.menuButtonText}>Questions</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.menuButton, styles.photoButton]}
                    onPress={handleTakePhoto}
                    disabled={isUploadingPhoto}
                  >
                    <Text style={styles.menuButtonText}>
                      {isUploadingPhoto ? '📸...' : '📸 Photo'}
                    </Text>
                  </TouchableOpacity>
                  {(answers.length > 0 || notifications.length > 0) && (
                    <TouchableOpacity 
                      style={[styles.menuButton, styles.activityButton]}
                      onPress={() => setShowActivityFeed(true)}
                    >
                      <Text style={styles.menuButtonText}>Activity ({notifications.length})</Text>
                    </TouchableOpacity>
                  )}
                  
                </View>
                
                {currentQuestion ? (
                  <View style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                      <Text style={styles.questionText}>Current Question:</Text>
                      {currentQuestionCategory && (
                        <View style={[
                          styles.categoryBadge,
                          { backgroundColor: QUESTION_CATEGORIES[currentQuestionCategory as keyof typeof QUESTION_CATEGORIES]?.color || '#64748B' }
                        ]}>
                          <Text style={styles.categoryBadgeText}>
                            {QUESTION_CATEGORIES[currentQuestionCategory as keyof typeof QUESTION_CATEGORIES]?.icon} {currentQuestionCategory?.toUpperCase()} - {QUESTION_CATEGORIES[currentQuestionCategory as keyof typeof QUESTION_CATEGORIES]?.coins} coins
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.questionContent}>"{currentQuestion}"</Text>
                    <Text style={styles.questionHint}>Waiting for hiders to answer...</Text>
                  </View>
                ) : (
                  <View style={styles.noQuestionCard}>
                    <Text style={styles.noQuestionText}>No active question</Text>
                    <Text style={styles.noQuestionSubtext}>Ask a question to get started!</Text>
                  </View>
                )}
              </View>
            )}

            {/* Hider UI */}
            {playerRole === 'hider' && (
              <View style={styles.hiderUI}>
                <View style={styles.hiderHeader}>
                  <View style={styles.hiderInfo}>
                    <Text style={styles.roleTitle}>🏃 Hider</Text>
                    <View style={styles.coinsContainer}>
                      <Text style={styles.coinsText}>💰 {coins}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.hiderButtons}>
                  <TouchableOpacity 
                    style={[styles.menuButton, styles.photoButton]}
                    onPress={handleTakePhoto}
                    disabled={isUploadingPhoto}
                  >
                    <Text style={styles.menuButtonText}>
                      {isUploadingPhoto ? '📸...' : '📸 Photo'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.menuButton}
                    onPress={() => setShowHiderMenu(true)}
                  >
                    <Text style={styles.menuButtonText}>Curses</Text>
                  </TouchableOpacity>
                </View>

                {currentQuestion && (
                  <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.answerCardContainer}
                  >
                    <View style={styles.answerCard}>
                      <View style={styles.questionHeader}>
                        <Text style={styles.questionText}>Seeker asks:</Text>
                        {currentQuestionCategory && (
                          <View style={[
                            styles.categoryBadge,
                            { backgroundColor: QUESTION_CATEGORIES[currentQuestionCategory as keyof typeof QUESTION_CATEGORIES]?.color || '#64748B' }
                          ]}>
                            <Text style={styles.categoryBadgeText}>
                              {QUESTION_CATEGORIES[currentQuestionCategory as keyof typeof QUESTION_CATEGORIES]?.icon} {currentQuestionCategory?.toUpperCase()} - {QUESTION_CATEGORIES[currentQuestionCategory as keyof typeof QUESTION_CATEGORIES]?.coins} coins
                            </Text>
                          </View>
                        )}
                      </View>
                    <Text style={styles.questionContent}>"{currentQuestion}"</Text>
                    
                    {/* Answer Type Toggle */}
                    <View style={styles.answerTypeToggle}>
                      <TouchableOpacity 
                        style={[styles.answerTypeButton, answerType === 'text' && styles.answerTypeButtonActive]}
                        onPress={() => setAnswerType('text')}
                      >
                        <Text style={[styles.answerTypeButtonText, answerType === 'text' && styles.answerTypeButtonTextActive]}>
                          📝 Text
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.answerTypeButton, answerType === 'photo' && styles.answerTypeButtonActive]}
                        onPress={() => setAnswerType('photo')}
                      >
                        <Text style={[styles.answerTypeButtonText, answerType === 'photo' && styles.answerTypeButtonTextActive]}>
                          📸 Photo
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.answerInputContainer}>
                      {answerType === 'text' ? (
                        <TextInput
                          style={styles.answerInput}
                          placeholder="Your answer..."
                          value={answerInput}
                          onChangeText={setAnswerInput}
                          multiline
                          returnKeyType="done"
                          blurOnSubmit={true}
                          onSubmitEditing={() => Keyboard.dismiss()}
                        />
                      ) : (
                        <View style={styles.photoAnswerContainer}>
                          {answerPhoto ? (
                            <View style={styles.photoAnswerPreview}>
                              <Image source={{ uri: answerPhoto }} style={styles.photoAnswerImage} />
                              <TouchableOpacity 
                                style={styles.removePhotoButton}
                                onPress={() => {
                                  setAnswerPhoto(null);
                                  setAnswerType('text');
                                }}
                              >
                                <Text style={styles.removePhotoButtonText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={styles.photoAnswerButtons}>
                              <TouchableOpacity 
                                style={styles.photoAnswerButton}
                                onPress={handleTakeAnswerPhoto}
                              >
                                <Text style={styles.photoAnswerButtonText}>📸 Take Photo</Text>
                              </TouchableOpacity>
                              <TouchableOpacity 
                                style={styles.photoAnswerButton}
                                onPress={handlePickAnswerPhoto}
                              >
                                <Text style={styles.photoAnswerButtonText}>🖼️ Choose from Gallery</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                      
                      <View style={styles.buttonContainer}>
                        <TouchableOpacity 
                          style={styles.doneButton}
                          onPress={() => Keyboard.dismiss()}
                        >
                          <Text style={styles.doneButtonText}>Done</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.submitButton}
                          onPress={() => {
                            Keyboard.dismiss();
                            handleSubmitAnswer();
                          }}
                        >
                          <Text style={styles.submitButtonText}>Submit (+{QUESTION_CATEGORIES[currentQuestionCategory as keyof typeof QUESTION_CATEGORIES]?.coins || 20} coins)</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    </View>
                  </KeyboardAvoidingView>
                )}
              </View>
            )}

            {/* Photo Gallery */}
            {photos.length > 0 && (
              <View style={styles.photoGallery}>
                <Text style={styles.photoGalleryTitle}>Recent Photos ({photos.length})</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoScrollView}
                >
                  {photos.slice(-5).reverse().map((photo, index) => (
                    <TouchableOpacity 
                      key={photo.id || index} 
                      style={styles.photoItem}
                      onPress={() => openPhoto(photo)}
                    >
                      <Image 
                        source={{ uri: photo.url }} 
                        style={styles.photoThumbnail}
                        resizeMode="cover"
                      />
                      <Text style={styles.photoCaption}>
                        {photo.uploadedBy} ({photo.role})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

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
            </ScrollView>
          </TouchableWithoutFeedback>
        )}
      </KeyboardAvoidingView>

      {/* Seeker Questions Modal */}
      <Modal
        visible={showSeekerMenu}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSeekerMenu(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ask a Question</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowSeekerMenu(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {/* Category Tabs */}
            <View style={styles.tabContainer}>
              {Object.entries(QUESTION_CATEGORIES).map(([key, category]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.tab,
                    selectedCategory === key && styles.activeTab,
                    { borderBottomColor: category.color }
                  ]}
                  onPress={() => setSelectedCategory(key as keyof typeof QUESTION_CATEGORIES)}
                >
                  <Text style={[
                    styles.tabText,
                    selectedCategory === key && styles.activeTabText
                  ]}>
                    {category.icon} {category.name}
                  </Text>
                  <Text style={[
                    styles.tabCoins,
                    selectedCategory === key && styles.activeTabCoins
                  ]}>
                    {category.coins} coins
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Questions List */}
            <ScrollView style={styles.questionsList} showsVerticalScrollIndicator={false}>
              {QUESTION_CATEGORIES[selectedCategory].questions.map((question, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.questionItem,
                    { borderLeftColor: QUESTION_CATEGORIES[selectedCategory].color }
                  ]}
                  onPress={() => handleAskQuestion(question, selectedCategory)}
                >
                  <Text style={styles.questionItemText}>{question}</Text>
                  <View style={styles.questionReward}>
                    <Text style={[
                      styles.questionRewardText,
                      { color: QUESTION_CATEGORIES[selectedCategory].color }
                    ]}>
                      +{QUESTION_CATEGORIES[selectedCategory].coins} coins
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Hider Curses Modal */}
      <Modal
        visible={showHiderMenu}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowHiderMenu(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Curses Shop</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowHiderMenu(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.cursesList} showsVerticalScrollIndicator={false}>
              {HIDER_CURSES.map((curse, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.curseItem,
                    coins < curse.cost && styles.curseItemDisabled
                  ]}
                  onPress={() => handleUseCurse(curse)}
                  disabled={coins < curse.cost}
                >
                  <View style={styles.curseInfo}>
                    <Text style={[
                      styles.curseName,
                      coins < curse.cost && styles.curseNameDisabled
                    ]}>
                      {curse.name}
                    </Text>
                    <Text style={styles.curseDescription}>{curse.description}</Text>
                  </View>
                  <View style={styles.curseCost}>
                    <Text style={[
                      styles.curseCostText,
                      coins < curse.cost && styles.curseCostTextDisabled
                    ]}>
                      💰 {curse.cost}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Activity Feed Modal */}
      <Modal
        visible={showActivityFeed}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowActivityFeed(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Activity Feed</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowActivityFeed(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.activityFeedList} showsVerticalScrollIndicator={false}>
              {notifications.length === 0 ? (
                <View style={styles.emptyActivity}>
                  <Text style={styles.emptyActivityText}>No activity yet</Text>
                  <Text style={styles.emptyActivitySubtext}>Answers and curse usage will appear here</Text>
                </View>
              ) : (
                notifications.slice().reverse().map((notification, index) => (
                        <View key={notification.id || index} style={styles.notificationItem}>
                          <View style={styles.notificationHeader}>
                            <Text style={styles.notificationType}>
                              {notification.type === 'answer' ? '💬' : 
                               notification.type === 'curse' ? '⚡' : 
                               notification.type === 'photo' ? '📸' : '❓'}
                            </Text>
                            <Text style={styles.notificationTime}>
                              {new Date(notification.timestamp).toLocaleTimeString()}
                            </Text>
                          </View>
                          <Text style={styles.notificationMessage}>{notification.message}</Text>
                          {notification.photoUrl && (
                            <TouchableOpacity onPress={() => openPhoto({
                              url: notification.photoUrl,
                              uploadedBy: notification.playerName,
                              role: notification.role,
                              timestamp: notification.timestamp
                            })}>
                              <Image 
                                source={{ uri: notification.photoUrl }} 
                                style={styles.notificationPhoto}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          )}
                          {notification.answerPhoto && (
                            <TouchableOpacity onPress={() => openPhoto({
                              url: notification.answerPhoto,
                              uploadedBy: notification.playerName,
                              role: 'hider',
                              timestamp: notification.timestamp
                            })}>
                              <Image 
                                source={{ uri: notification.answerPhoto }} 
                                style={styles.notificationPhoto}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          )}
                          {notification.coinsEarned && (
                            <Text style={styles.coinNotification}>
                              +{notification.coinsEarned} coins earned
                            </Text>
                          )}
                          {notification.coinsSpent && (
                            <Text style={styles.curseNotification}>
                              -{notification.coinsSpent} coins spent
                            </Text>
                          )}
                        </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Photo Viewer Modal */}
      <Modal
        visible={showPhotoViewer}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotoViewer(false)}
      >
        <View style={styles.photoViewerOverlay}>
          <View style={styles.photoViewerContainer}>
            <View style={styles.photoViewerHeader}>
              <Text style={styles.photoViewerTitle}>
                {selectedPhoto?.uploadedBy} ({selectedPhoto?.role})
              </Text>
              <TouchableOpacity 
                style={styles.photoViewerCloseButton}
                onPress={() => setShowPhotoViewer(false)}
              >
                <Text style={styles.photoViewerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {selectedPhoto && (
              <View style={styles.photoViewerContent}>
                <Image 
                  source={{ uri: selectedPhoto.url }} 
                  style={styles.photoViewerImage}
                  resizeMode="contain"
                />
                <Text style={styles.photoViewerTimestamp}>
                  {new Date(selectedPhoto.timestamp).toLocaleString()}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Curse Alert Modal */}
      <Modal
        visible={showCurseAlert}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCurseAlert(false)}
      >
        <View style={styles.curseAlertOverlay}>
          <View style={styles.curseAlertContainer}>
            <View style={styles.curseAlertHeader}>
              <Text style={styles.curseAlertTitle}>⚡ You've Been Cursed!</Text>
            </View>
            
            {curseAlertData && (
              <View style={styles.curseAlertContent}>
                <Text style={styles.curseAlertPlayer}>
                  {curseAlertData.playerName} used a curse on you!
                </Text>
                <View style={styles.curseAlertDetails}>
                  <Text style={styles.curseAlertCurseName}>
                    {curseAlertData.curseName}
                  </Text>
                  <Text style={styles.curseAlertDescription}>
                    {curseAlertData.curseDescription}
                  </Text>
                  <Text style={styles.curseAlertCost}>
                    Cost: {curseAlertData.coinsSpent} coins
                  </Text>
                </View>
                
                <TouchableOpacity 
                  style={styles.curseAlertButton}
                  onPress={() => setShowCurseAlert(false)}
                >
                  <Text style={styles.curseAlertButtonText}>OK</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Photo Alert Modal */}
      <Modal
        visible={showPhotoAlert}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotoAlert(false)}
      >
        <View style={styles.photoAlertOverlay}>
          <View style={styles.photoAlertContainer}>
            <View style={styles.photoAlertHeader}>
              <Text style={styles.photoAlertTitle}>📸 New Photo Shared!</Text>
            </View>
            
            {photoAlertData && (
              <View style={styles.photoAlertContent}>
                <Text style={styles.photoAlertPlayer}>
                  {photoAlertData.playerName} shared a photo!
                </Text>
                {photoAlertData.photoUrl && (
                  <Image 
                    source={{ uri: photoAlertData.photoUrl }} 
                    style={styles.photoAlertImage}
                    resizeMode="cover"
                  />
                )}
                
                <TouchableOpacity 
                  style={styles.photoAlertButton}
                  onPress={() => setShowPhotoAlert(false)}
                >
                  <Text style={styles.photoAlertButtonText}>OK</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Answer Alert Modal */}
      <Modal
        visible={showAnswerAlert}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAnswerAlert(false)}
      >
        <View style={styles.answerAlertOverlay}>
          <View style={styles.answerAlertContainer}>
            <View style={styles.answerAlertHeader}>
              <Text style={styles.answerAlertTitle}>💬 Answer Received!</Text>
            </View>
            
            {answerAlertData && (
              <View style={styles.answerAlertContent}>
                <Text style={styles.answerAlertPlayer}>
                  {answerAlertData.playerName} answered your question!
                </Text>
                
                {answerAlertData.answerType === 'photo' && answerAlertData.answerPhoto ? (
                  <TouchableOpacity 
                    onPress={() => {
                      setShowAnswerAlert(false);
                      openPhoto({
                        url: answerAlertData.answerPhoto,
                        uploadedBy: answerAlertData.playerName,
                        role: 'hider',
                        timestamp: answerAlertData.timestamp
                      });
                    }}
                  >
                    <Image 
                      source={{ uri: answerAlertData.answerPhoto }} 
                      style={styles.answerAlertImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.answerAlertImageText}>Tap to view full size</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.answerAlertTextContainer}>
                    <Text style={styles.answerAlertText}>"{answerAlertData.message?.replace(`${answerAlertData.playerName} answered with text`, '') || 'Text answer'}"</Text>
                  </View>
                )}
                
                {answerAlertData.coinsEarned && (
                  <Text style={styles.answerAlertCoins}>
                    +{answerAlertData.coinsEarned} coins earned
                  </Text>
                )}
                
                <TouchableOpacity 
                  style={styles.answerAlertButton}
                  onPress={() => setShowAnswerAlert(false)}
                >
                  <Text style={styles.answerAlertButtonText}>OK</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  keyboardAvoidingContainer: {
    flex: 1,
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
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  trackingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  trackingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
    height: 300,
    minHeight: 300,
  },
  map: {
    flex: 1,
  },
  playerList: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
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
  // Role-based UI styles
  roleUI: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flex: 1,
  },
  roleUIContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  seekerUI: {
    padding: 16,
  },
  seekerHeader: {
    marginBottom: 12,
  },
  seekerButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  questionsButton: {
    backgroundColor: '#3B82F6',
  },
  activityButton: {
    backgroundColor: '#10B981',
  },
  photoButton: {
    backgroundColor: '#8B5CF6',
  },
  hiderButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  hiderUI: {
    padding: 16,
  },
  hiderHeader: {
    marginBottom: 12,
  },
  hiderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  coinsContainer: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  coinsText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  menuButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    flex: 1,
    maxWidth: 120,
    alignItems: 'center',
  },
  menuButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  questionCard: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  questionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  questionContent: {
    fontSize: 16,
    color: '#1E293B',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  questionHint: {
    fontSize: 12,
    color: '#64748B',
  },
  noQuestionCard: {
    backgroundColor: '#F1F5F9',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  noQuestionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  noQuestionSubtext: {
    fontSize: 14,
    color: '#94A3B8',
  },
  answerCardContainer: {
    marginBottom: 8,
  },
  answerCard: {
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  answerInputContainer: {
    marginTop: 12,
    gap: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  doneButton: {
    backgroundColor: '#6B7280',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  answerInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1E293B',
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: 'bold',
  },
  questionsList: {
    padding: 20,
    maxHeight: 400,
  },
  questionItem: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  questionItemText: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
    flex: 1,
  },
  questionReward: {
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  questionRewardText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3B82F6',
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  activeTabText: {
    color: '#1E293B',
  },
  tabCoins: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  activeTabCoins: {
    color: '#64748B',
  },
  // Category badge styles
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  // Notifications styles
  notificationsCard: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notificationsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  notificationsList: {
    maxHeight: 200,
  },
  notificationItem: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationType: {
    fontSize: 16,
  },
  notificationTime: {
    fontSize: 12,
    color: '#64748B',
  },
  notificationMessage: {
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 4,
  },
  coinNotification: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  curseNotification: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  notificationPhoto: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginTop: 8,
  },
  cursesList: {
    padding: 20,
    maxHeight: 400,
  },
  curseItem: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  curseItemDisabled: {
    backgroundColor: '#F1F5F9',
    opacity: 0.6,
  },
  curseInfo: {
    flex: 1,
    marginRight: 12,
  },
  curseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  curseNameDisabled: {
    color: '#94A3B8',
  },
  curseDescription: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  curseCost: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  curseCostText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  curseCostTextDisabled: {
    color: '#94A3B8',
  },
  // Activity feed modal styles
  activityFeedList: {
    padding: 20,
    maxHeight: 500,
  },
  emptyActivity: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyActivityText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 8,
  },
  emptyActivitySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  // Photo gallery styles
  photoGallery: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    marginTop: 8,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  photoGalleryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  photoScrollView: {
    flexDirection: 'row',
  },
  photoItem: {
    marginRight: 12,
    alignItems: 'center',
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  photoCaption: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  // Photo viewer modal styles
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerContainer: {
    width: '95%',
    height: '90%',
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoViewerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  photoViewerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  photoViewerCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerCloseText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  photoViewerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  photoViewerImage: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
  },
  photoViewerTimestamp: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 8,
    opacity: 0.7,
  },
  // Curse alert modal styles
  curseAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  curseAlertContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    margin: 20,
    maxWidth: 350,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  curseAlertHeader: {
    backgroundColor: '#EF4444',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  curseAlertTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  curseAlertContent: {
    padding: 20,
  },
  curseAlertPlayer: {
    fontSize: 16,
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  curseAlertDetails: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 20,
  },
  curseAlertCurseName: {
    fontSize: 18,
    color: '#DC2626',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  curseAlertDescription: {
    fontSize: 14,
    color: '#7F1D1D',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  curseAlertCost: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'center',
    fontWeight: '600',
  },
  curseAlertButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
  },
  curseAlertButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Photo answer styles
  answerTypeToggle: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 4,
  },
  answerTypeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  answerTypeButtonActive: {
    backgroundColor: '#3B82F6',
  },
  answerTypeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  answerTypeButtonTextActive: {
    color: '#FFFFFF',
  },
  photoAnswerContainer: {
    minHeight: 120,
    justifyContent: 'center',
  },
  photoAnswerPreview: {
    position: 'relative',
    alignItems: 'center',
  },
  photoAnswerImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  photoAnswerButtons: {
    gap: 12,
  },
  photoAnswerButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  photoAnswerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Photo alert modal styles
  photoAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoAlertContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    margin: 20,
    maxWidth: 350,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  photoAlertHeader: {
    backgroundColor: '#8B5CF6',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  photoAlertTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  photoAlertContent: {
    padding: 20,
  },
  photoAlertPlayer: {
    fontSize: 16,
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  photoAlertImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 16,
  },
  photoAlertButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
  },
  photoAlertButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Answer alert modal styles
  answerAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  answerAlertContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    margin: 20,
    maxWidth: 350,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  answerAlertHeader: {
    backgroundColor: '#10B981',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  answerAlertTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  answerAlertContent: {
    padding: 20,
  },
  answerAlertPlayer: {
    fontSize: 16,
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  answerAlertImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  answerAlertImageText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  answerAlertTextContainer: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  answerAlertText: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  answerAlertCoins: {
    fontSize: 14,
    color: '#10B981',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 16,
  },
  answerAlertButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
  },
  answerAlertButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
