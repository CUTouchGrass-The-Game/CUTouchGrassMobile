import { Stack } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";

export default function RootLayout() {
  LogBox.ignoreAllLogs(true);

  return (
    
      <Stack>
        <Stack.Screen 
          name="index" 
          options={{ 
            headerShown: false 
          }} 
        />
        <Stack.Screen 
          name="createGame" 
          options={{ 
            headerShown: false 
          }} 
        />
        <Stack.Screen 
          name="game" 
          options={{ 
            headerShown: false 
          }} 
        />
        <Stack.Screen 
          name="gameMap" 
          options={{ 
            headerShown: false,
            title: 'Game Map',
            gestureEnabled: false,
            presentation: 'modal'
          }} 
        />
      </Stack>
    
  );
}
