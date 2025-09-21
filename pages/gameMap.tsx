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
// TODO Uncomment
// import { generateAllPromptsForGame } from "../services/geminiService";
import { getStoredDeviceId } from '../util/deviceId';

interface GameLocation {
  latitude: number;
  longitude: number;
  altitude: number;
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
      "Are you north or south of the seeker's current position?",
      "Are you east or west of the seeker's current position?",
      "Is you elevation higher or lower than the seeker's?",
    ]
  },
  location: {
    name: "Location",
    icon: "📍",
    coins: 30,
    color: "#10B981",
    questions: [
      "Is the library closest to you the same as mine?",
      "Is the eatery location closest to you the same as mine?",
      "Can you see a natural water formation right now?",
      "Are you above the ground floor in a building?"
    ],
  },
  radar: {
    name: "Radar",
    icon: "📡",
    coins: 30,
    color: "#F59E0B",
    questions: [
      "Are you within 100ft of me?",
      "Are you within 500ft of me?",
      "Are you within 1000ft of me?",
      "Are you within 2000ft of me?",
    ]
  },
  media: {
    name: "Media",
    icon: "📷",
    coins: 15,
    color: "#99704dff",
    questions: [
      "Send a picture of the tallest visible building you can see right now.",
      "Send a picture of what is directly above you at this moment.",
      "Send a picture of you touching the nearest plant.",
      "Send a picture of the nearest bus station.",
    ],
  },
  gemini: {
    name: "Gemini",
    icon: "🤖",
    coins: 20,
    color: "#8B5CF6",
    questions: [
      "AI-generated questions will appear here",
      "Once the game begins",
    ],
  },
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
  const [gameTimer, setGameTimer] = useState<number>(600); // 10 minute timer
  const [gameEnded, setGameEnded] = useState(false);
  const [gameStartTime, setGameStartTime] = useState<number | null>(null);
  const [timerData, setTimerData] = useState<any>(null);
  const [isEndingGame, setIsEndingGame] = useState(false);
  const [isGameEndInitiator, setIsGameEndInitiator] = useState(false);
  const isGameEndInitiatorRef = useRef(false);
  const [questionCooldown, setQuestionCooldown] = useState(0);
  const [isOnCooldown, setIsOnCooldown] = useState(false);
  const webViewRef = useRef<any>(null);

  useEffect(() => {
    if (gameId) {
      getLocationAsync();
      listenToGameData();
      listenToQuestions();
      listenToAnswers();
      listenToNotifications();
      listenToPhotos();
      listenToGameTimer();
      listenToGameStatus();
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

  // Timer countdown effect
  useEffect(() => {
    if (!timerData || !timerData.isActive || gameEnded || isEndingGame) {
      console.log('Timer effect skipped:', { timerData: !!timerData, isActive: timerData?.isActive, gameEnded, isEndingGame });
      return;
    }

    console.log('Starting timer countdown for player role:', playerRole);

    const updateTimer = () => {
      if (gameEnded || isEndingGame) return; // Additional guard
      
      const now = Date.now();
      const elapsed = now - timerData.startTime;
      const remaining = Math.max(0, timerData.duration - elapsed);
      const remainingSeconds = Math.ceil(remaining / 1000);
      
      console.log('Timer update:', { remainingSeconds, playerRole });
      setGameTimer(remainingSeconds);
      
      if (remainingSeconds <= 0 && !gameEnded && !isEndingGame) {
        console.log('Timer reached 0, calling endGame for player role:', playerRole);
        endGame();
      } else if (gameEnded || isEndingGame) {
        console.log('Timer update skipped - game already ending/ended');
        return;
      }
    };

    // Update immediately
    updateTimer();
    
    // Update every second
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [timerData, gameEnded, isEndingGame, playerRole]);

  // Question cooldown effect
  useEffect(() => {
    if (!isOnCooldown || questionCooldown <= 0) return;

    const updateCooldown = () => {
      setQuestionCooldown(prev => {
        if (prev <= 1) {
          setIsOnCooldown(false);
          return 0;
        }
        return prev - 1;
      });
    };

    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [isOnCooldown, questionCooldown]);

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

  const onGameStart = async () => {
    // TODO Uncomment
    // const geminiPrompts = await generateAllPromptsForGame(gameId);
    // QUESTION_CATEGORIES.gemini.questions = [...geminiPrompts.photo, ...geminiPrompts.see]
  };

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
        altitude: location.coords.altitude,
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
          console.log('Current playerRole:', playerRole);
          console.log('All notifications:', notificationsArray);
          console.log('Shown notifications:', Array.from(shownNotifications));
          
          if (playerRole === 'seeker') {
            notificationsArray.forEach(notification => {
              console.log('Processing notification:', notification.type, 'ID:', notification.id, 'Already shown:', shownNotifications.has(notification.id));
              if ((notification.type === 'curse' || notification.type === 'photo' || notification.type === 'answer') && !shownNotifications.has(notification.id)) {
                console.log('NEW SEEKER NOTIFICATION DETECTED:', notification.type, notification);
                if (notification.type === 'curse') {
                  console.log('Showing curse notification');
                  showCurseNotification(notification);
                } else if (notification.type === 'photo') {
                  console.log('Showing photo notification');
                  showPhotoNotification(notification);
                } else if (notification.type === 'answer') {
                  console.log('Showing answer notification');
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

  const listenToGameTimer = async () => {
    try {
      const db = getDatabase(firebaseApp);
      const timerRef = ref(db, `games/${gameId}/gameTimer`);
      
      onValue(timerRef, (snapshot) => {
        const data = snapshot.val();
        console.log('Timer data received:', data);
        setTimerData(data);
        if (data && data.isActive) {
          setGameStartTime(data.startTime);
          console.log('Timer is active, start time:', data.startTime);
        } else {
          setGameStartTime(null);
          setGameTimer(60);
          console.log('Timer is not active, resetting to 60');
        }
      });
    } catch (error) {
      console.error('Error listening to game timer:', error);
    }
  };

  const listenToGameStatus = async () => {
    try {
      const db = getDatabase(firebaseApp);
      const statusRef = ref(db, `games/${gameId}/status`);
      
      onValue(statusRef, (snapshot) => {
        const status = snapshot.val();
        console.log('Game status changed to:', status);
        
        if (status === 'ended' && !isGameEndInitiatorRef.current) {
          // Game status changed to ended (but not by this player)
          console.log('Game status changed to ended - ending for all players');
          handleGameEndForAll();
        } else if (status === 'ended' && isGameEndInitiatorRef.current) {
          console.log('Game ended by this player - skipping status listener navigation');
        }
      });
    } catch (error) {
      console.error('Error listening to game status:', error);
    }
  };

  const handleGameEndForAll = () => {
    if (gameEnded || isEndingGame) {
      console.log('handleGameEndForAll blocked - already ending or ended');
      return; // Prevent multiple calls
    }
    
    try {
      console.log('Handling game end for all players - role:', playerRole);
      
      // Set states first to prevent multiple calls
      setGameEnded(true);
      setIsEndingGame(true);
      
      // Stop all tracking
      stopLocationTracking();
      
      // Navigate to home screen
      router.push('/');
      
      // Show alert after a short delay to ensure navigation happens
      setTimeout(() => {
        Alert.alert('Game Ended', 'The game has ended and all players have been returned to the home screen.');
      }, 100);
      
    } catch (error) {
      console.error('Error in handleGameEndForAll:', error);
      // Still try to navigate even if there's an error
      router.push('/');
    }
  };

  const generateMapHtml = () => {
    if (!location) return;

    const currentLat = location.coords.latitude;
    const currentLng = location.coords.longitude;
    
    // Generate markers and circles for players based on current player's role
    const markers = gameLocations
      .filter((loc) => {
        // Hiders can see all players, seekers can only see themselves
        if (playerRole === 'hider') {
          return true; // Show all players
        } else if (playerRole === 'seeker') {
          return loc.playerId === currentPlayer?.deviceId; // Only show current player
        }
        return true; // Default to showing all if role is unknown
      })
      .map((loc, index) => {
        const isCurrentPlayer = loc.playerId === currentPlayer?.deviceId;
        
        // Determine marker color based on player role (role-based, not current player)
        let markerColor, circleColor;
        const playerRole = gameData?.players && Object.keys(gameData.players).length > 0 ? 
          (Object.values(gameData.players).find((p: any) => p.deviceId === loc.playerId) as any)?.role || null : null;
        
        console.log('Map marker for player:', loc.playerName, 'role:', playerRole, 'isCurrentPlayer:', isCurrentPlayer, 'currentPlayerRole:', playerRole);
        
        if (playerRole === 'hider') {
          markerColor = 'blue';
          circleColor = '#3B82F6';
        } else if (playerRole === 'seeker') {
          markerColor = 'red';
          circleColor = '#EF4444';
        } else {
          // Default to red if role is unknown
          markerColor = 'red';
          circleColor = '#EF4444';
        }
      
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
          window.updateAllMarkers = function(locations, players) {
            // Filter locations based on current player role
            const filteredLocations = locations.filter((loc) => {
              // Hiders can see all players, seekers can only see themselves
              if ('${playerRole}' === 'hider') {
                return true; // Show all players
              } else if ('${playerRole}' === 'seeker') {
                return loc.playerId === '${currentPlayer?.deviceId}'; // Only show current player
              }
              return true; // Default to showing all if role is unknown
            });
            
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
            filteredLocations.forEach((loc) => {
              if (existingMarkers[loc.playerId]) {
                // Update existing marker position
                existingMarkers[loc.playerId].setLatLng([loc.latitude, loc.longitude]);
                existingMarkers[loc.playerId].setPopupContent('<b>' + loc.playerName + '</b><br>Last seen: ' + new Date(loc.timestamp).toLocaleTimeString());
                
                // Update existing circle position
                if (existingCircles[loc.playerId]) {
                  existingCircles[loc.playerId].setLatLng([loc.latitude, loc.longitude]);
                }
              } else {
                // Create new marker for new player with role-based coloring
                let markerColor, circleColor;
                
                // Find player role
                const playerRole = players ? 
                  Object.values(players).find(p => p.deviceId === loc.playerId)?.role : null;
                
                if (playerRole === 'hider') {
                  markerColor = 'blue';
                  circleColor = '#3B82F6';
                } else if (playerRole === 'seeker') {
                  markerColor = 'red';
                  circleColor = '#EF4444';
                } else {
                  // Default to red if role is unknown
                  markerColor = 'red';
                  circleColor = '#EF4444';
                }
                
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
            const currentPlayerIds = filteredLocations.map(loc => loc.playerId);
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
                window.updateAllMarkers(data.locations, data.players);
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
      locations: gameLocations,
      players: gameData?.players || {}
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
              await startGameTimer(); // Start the synchronized timer
              Alert.alert('Game Started!', 'The game has begun! Timer is now running.');
              onGameStart();
            } catch (error) {
              Alert.alert('Error', 'Failed to start game');
            }
          }
        }
      ]
    );
  };

  // Haversine
  const calculateDistance = (lat1 : number, lon1 : number, lat2 : number, lon2 : number) => {
    // Convert degrees to approximate meters (rough approximation)
    const latDifferenceInMeters = (lat1 - lat2) * 111320; // 1 degree lat ≈ 111,320 meters
    const lonDifferenceInMeters = (lon1 - lon2) * 111320 * Math.cos(lat2 * Math.PI / 180);
    
    // Use Pythagorean theorem: distance = sqrt(x² + y²)
    const distanceInMeters = Math.sqrt(
      latDifferenceInMeters * latDifferenceInMeters + 
      lonDifferenceInMeters * lonDifferenceInMeters
  );
  
  return distanceInMeters;
  };
  
  const getDisplayQuestion = () => {
    if (!currentQuestion) return null;
    
    // Only modify radar questions and only for hiders
    if (playerRole === 'hider' && currentQuestionCategory === 'radar' && location && gameLocations.length > 0) {
      // Find the seeker's location
      const seekerLocation = gameLocations.find(loc => loc.playerId !== currentPlayer?.deviceId);
      
      if (seekerLocation) {
        const distance = calculateDistance(
          seekerLocation.latitude, 
          seekerLocation.longitude, 
          location.coords.latitude, 
          location.coords.longitude
        );
        const distanceInFeet = Math.round(distance * 3.28084);
        return `${currentQuestion} (You are approximately ${distanceInFeet} feet from the seeker; less accurate at close ranges)`;
      }
    }

    // Only modify elevation question
    if (playerRole === 'hider' && currentQuestion === 'Is you elevation higher or lower than the seeker\'s?' && location && gameLocations.length > 0) {
      // Find the seeker's location
      const seekerLocation = gameLocations.find(loc => loc.playerId !== currentPlayer?.deviceId);

      if (seekerLocation) {
        const distance = (location.coords.altitude || 0) - (seekerLocation.altitude || 0);
        const distanceInFeet = Math.round(distance * 3.28084);
        if (distanceInFeet > 0) {
          return `${currentQuestion} (You are ${distanceInFeet} feet higher than the seeker)`;
        } else {
          return `${currentQuestion} (You are ${-distanceInFeet} feet lower than the seeker)`;
        }
      }
    }
    
    return currentQuestion;
  };

  // Seeker functions
  const handleAskQuestion = async (question: string, category: string) => {
    if (isOnCooldown) {
      Alert.alert('Cooldown Active', `Please wait ${questionCooldown} seconds before asking another question.`);
      return;
    }

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

      // Start 3-minute cooldown
      setQuestionCooldown(180); // 3 minutes = 180 seconds
      setIsOnCooldown(true);

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
      
      // Remove any undefined fields before saving to Firebase
      Object.keys(answerData).forEach(key => {
        if (answerData[key] === undefined) {
          delete answerData[key];
        }
      });
      
      // Store answer in Firebase
      const answersRef = ref(db, `games/${gameId}/answers`);
      const answerRef = push(answersRef);
      await set(answerRef, answerData);
      
      // Clear the current question for all players
      await set(ref(db, `games/${gameId}/currentQuestion`), null);
      
      // Send notification to seeker
      const notificationsRef = ref(db, `games/${gameId}/notifications`);
      const notificationRef = push(notificationsRef);
      
      // Build notification data, only including defined fields
      const notificationData: any = {
        type: 'answer',
        message: `${currentPlayer?.name || 'Hider'} answered: "${answerData.answer}"`,
        timestamp: new Date().toISOString(),
        playerName: currentPlayer?.name || 'Unknown Player',
        coinsEarned: coinReward,
        answerType: answerType
      };
      
      // Only include answerPhoto if it exists
      if (answerData.answerPhoto) {
        notificationData.answerPhoto = answerData.answerPhoto;
      }
      
      await set(notificationRef, notificationData);
      
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
    try {
      console.log('Opening photo:', photo);
      setSelectedPhoto(photo);
      setShowPhotoViewer(true);
    } catch (error) {
      console.error('Error opening photo:', error);
    }
  };

  const showCurseNotification = (curseData: any) => {
    console.log('showCurseNotification called with:', curseData);
    setCurseAlertData(curseData);
    setShowCurseAlert(true);
  };

  const showPhotoNotification = (photoData: any) => {
    setPhotoAlertData(photoData);
    setShowPhotoAlert(true);
  };

  const showAnswerNotification = (answerData: any) => {
    console.log('showAnswerNotification called with:', answerData);
    setAnswerAlertData(answerData);
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      setAnswerAlertData(null);
    }, 10000);
  };

  const startGameTimer = async () => {
    try {
      console.log('Starting game timer for gameId:', gameId);
      const db = getDatabase(firebaseApp);
      const timerRef = ref(db, `games/${gameId}/gameTimer`);
      const startTime = Date.now();
      
      console.log('Setting timer data:', { startTime, duration: 600000, isActive: true });
      
      // Set the start time in Firebase
      await set(timerRef, {
        startTime: startTime,
        duration: 600000, // 10 minutes in milliseconds
        isActive: true
      });
      
      console.log('Timer data saved to Firebase successfully');
      setGameStartTime(startTime);
    } catch (error) {
      console.error('Error starting game timer:', error);
    }
  };

  const endGame = async () => {
    console.log('endGame called for player role:', playerRole, 'isEndingGame:', isEndingGame, 'gameEnded:', gameEnded);
    
    if (isEndingGame || gameEnded) {
      console.log('endGame blocked - already ending or ended');
      return; // Prevent multiple calls
    }
    
    try {
      console.log('Starting game end process for player role:', playerRole);
      setIsEndingGame(true);
      setGameEnded(true);
      setIsGameEndInitiator(true); // Mark this player as the initiator
      isGameEndInitiatorRef.current = true; // Set ref immediately for synchronous access
      
      const db = getDatabase(firebaseApp);
      
      // Set status to 'ended' to notify all players
      console.log('Setting game status to ended to notify all players...');
      const statusRef = ref(db, `games/${gameId}/status`);
      await set(statusRef, 'ended');
      
      // Stop location tracking
      stopLocationTracking();
      
      console.log('Game status changed to ended - all players will be notified');
      
      // Navigate this player immediately (they won't get the listener notification due to isGameEndInitiator flag)
      // Other players will get the listener notification and navigate via handleGameEndForAll
      router.push('/');
      
      // Show alert
      setTimeout(() => {
        Alert.alert('Game Ended', 'The game has ended and all players have been returned to the home screen.');
      }, 100);
      
      return; // Prevent further execution
    } catch (error) {
      console.error('Error ending game:', error);
      setIsEndingGame(false); // Reset on error
    }
  };

  const handleExitGame = () => {
    Alert.alert(
      'End Game',
      'Are you sure you want to end the game? This will end the game for all players.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'End Game',
          style: 'destructive',
          onPress: endGame,
        },
      ]
    );
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
              const curseNotification = {
                type: 'curse',
                message: `${currentPlayer?.name || 'Hider'} used ${curse.name}!`,
                timestamp: new Date().toISOString(),
                playerName: currentPlayer?.name || 'Unknown Player',
                curseName: curse.name,
                curseDescription: curse.description,
                coinsSpent: curse.cost
              };
              console.log('Creating curse notification:', curseNotification);
              await set(notificationRef, curseNotification);
              
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
          <TouchableOpacity style={styles.backButton} onPress={handleExitGame}>
            <Text style={styles.backButtonText}>← Exit</Text>
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Game Map</Text>
            <View style={styles.headerInfo}>
              <View style={styles.trackingIndicator}>
                <View style={styles.trackingDot} />
                <Text style={styles.trackingText}>Live</Text>
              </View>
              <View style={[
                styles.timerContainer,
                gameTimer <= 10 && gameTimer > 0 && styles.timerContainerWarning
              ]}>
                <Text style={[
                  styles.timerText,
                  gameTimer <= 10 && gameTimer > 0 && styles.timerTextWarning
                ]}>
                  ⏱️ {gameStartTime ? `${Math.floor(gameTimer / 60)}:${(gameTimer % 60).toString().padStart(2, '0')}` : 'Ready'}
                </Text>
              </View>
            </View>
          </View>
          
          <View style={styles.headerRight}>
            {isHost && !gameStartTime && (
              <TouchableOpacity style={styles.startButton} onPress={handleStartGame}>
                <Text style={styles.startButtonText}>Start Game</Text>
              </TouchableOpacity>
            )}
          </View>
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
                    style={[
                      styles.menuButton, 
                      styles.questionsButton,
                      isOnCooldown && styles.disabledButton
                    ]}
                    onPress={() => setShowSeekerMenu(true)}
                    disabled={isOnCooldown}
                  >
                    <Text style={[
                      styles.menuButtonText,
                      isOnCooldown && styles.disabledButtonText
                    ]}>
                      {isOnCooldown ? `Questions (${Math.floor(questionCooldown / 60)}:${(questionCooldown % 60).toString().padStart(2, '0')})` : 'Questions'}
                    </Text>
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

                {/* Timer Warning */}
                {gameStartTime && gameTimer <= 10 && gameTimer > 0 && (
                  <View style={styles.timerWarningCard}>
                    <Text style={styles.timerWarningText}>
                      ⚠️ Game ends in {gameTimer} seconds!
                    </Text>
                  </View>
                )}

                {/* Answer Card - shows when hider answers */}
                {answerAlertData && (
                  <View style={styles.answerCard}>
                    <View style={styles.answerHeader}>
                      <Text style={styles.answerText}>Answer Received!</Text>
                      <Text style={styles.answerPlayer}>{answerAlertData.playerName} answered:</Text>
                    </View>
                    <Text style={styles.answerContent}>"{answerAlertData.message?.replace(`${answerAlertData.playerName} answered: `, '') || 'Answer received'}"</Text>
                    {answerAlertData.answerType === 'photo' && answerAlertData.answerPhoto && (
                      <TouchableOpacity 
                        onPress={() => openPhoto({
                          url: answerAlertData.answerPhoto,
                          uploadedBy: answerAlertData.playerName,
                          role: 'hider',
                          timestamp: answerAlertData.timestamp
                        })}
                        style={styles.answerPhotoContainer}
                      >
                        <Image 
                          source={{ uri: answerAlertData.answerPhoto }} 
                          style={styles.answerPhoto}
                          resizeMode="cover"
                        />
                        <Text style={styles.answerPhotoText}>Tap to view full size</Text>
                      </TouchableOpacity>
                    )}
                    {answerAlertData.coinsEarned && (
                      <Text style={styles.answerCoins}>+{answerAlertData.coinsEarned} coins earned</Text>
                    )}
                    <TouchableOpacity 
                      style={styles.answerDismissButton}
                      onPress={() => setAnswerAlertData(null)}
                    >
                      <Text style={styles.answerDismissText}>Dismiss</Text>
                    </TouchableOpacity>
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
                    <Text style={styles.questionContent}>"{getDisplayQuestion()}"</Text>
                    
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
              {gameLocations.map((loc, index) => {
                // Determine player role for coloring
                const playerRole = gameData?.players && Object.keys(gameData.players).length > 0 ? 
                  (Object.values(gameData.players).find((p: any) => p.deviceId === loc.playerId) as any)?.role || null : null;
                
                // Color based on role: hider = blue, seeker = red
                let dotColor = '#EF4444'; // Default to red
                if (playerRole === 'hider') {
                  dotColor = '#3B82F6'; // Blue for hiders
                } else if (playerRole === 'seeker') {
                  dotColor = '#EF4444'; // Red for seekers
                }
                
                return (
                  <View key={index} style={styles.playerItem}>
                    <View style={[styles.playerDot, { backgroundColor: dotColor }]} />
                    <Text style={styles.playerName}>{loc.playerName}</Text>
                    <Text style={styles.playerTime}>
                      {new Date(loc.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                );
              })}
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
                              <TouchableOpacity 
                                disabled={true}
                                style={styles.photoClickable}
                              >
                              <Image 
                                source={{ uri: notification.photoUrl }} 
                                style={styles.notificationPhoto}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          )}
                            {notification.answerPhoto && (
                              <TouchableOpacity 
                                disabled={true}
                                style={styles.photoClickable}
                              >
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
        onRequestClose={() => {
          console.log('Photo viewer close requested');
          setShowPhotoViewer(false);
          setSelectedPhoto(null);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          console.log('Photo viewer background tapped');
          setShowPhotoViewer(false);
          setSelectedPhoto(null);
        }}>
          <View style={styles.photoViewerOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.photoViewerContainer}>
                <View style={styles.photoViewerHeader}>
                  <Text style={styles.photoViewerTitle}>
                    {selectedPhoto?.uploadedBy} ({selectedPhoto?.role})
                  </Text>
                  <TouchableOpacity 
                    style={styles.photoViewerCloseButton}
                    onPress={() => {
                      console.log('Photo viewer close button pressed');
                      setShowPhotoViewer(false);
                      setSelectedPhoto(null);
                    }}
                  >
                    <Text style={styles.photoViewerCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
                
                {selectedPhoto && selectedPhoto.url ? (
                  <View style={styles.photoViewerContent}>
                    <Image 
                      source={{ uri: selectedPhoto.url }} 
                      style={styles.photoViewerImage}
                      resizeMode="contain"
                      onError={(error) => {
                        console.error('Error loading photo:', error);
                        setShowPhotoViewer(false);
                        setSelectedPhoto(null);
                      }}
                    />
                    <Text style={styles.photoViewerTimestamp}>
                      {new Date(selectedPhoto.timestamp).toLocaleString()}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.photoViewerContent}>
                    <Text style={styles.photoViewerError}>Photo not available</Text>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
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
                    <Text style={styles.answerAlertText}>"{answerAlertData.message?.replace(`${answerAlertData.playerName} answered: `, '') || 'Text answer'}"</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    minHeight: 60,
  },
  backButton: {
    width: 60,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    width: 60,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  trackingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
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
  timerContainer: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  timerText: {
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '700',
  },
  timerContainerWarning: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  timerTextWarning: {
    color: '#DC2626',
  },
  timerWarningCard: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#F87171',
    marginTop: 8,
  },
  timerWarningText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
    textAlign: 'center',
  },
  startButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexShrink: 0,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#E2E8F0',
    opacity: 0.6,
  },
  disabledButtonText: {
    color: '#94A3B8',
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
  // Answer card styles (copied from question card)
  answerCard: {
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    marginTop: 12,
  },
  answerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  answerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  answerPlayer: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  answerContent: {
    fontSize: 16,
    color: '#1E293B',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  answerPhotoContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  answerPhoto: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  answerPhotoText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
    fontStyle: 'italic',
  },
  answerCoins: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 8,
  },
  answerDismissButton: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  answerDismissText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  answerCardContainer: {
    marginBottom: 8,
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
    width: 100,
    height: 100,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: '#f0f0f0',
  },
  photoClickable: {
    alignSelf: 'flex-start',
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
  photoViewerError: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    padding: 20,
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
