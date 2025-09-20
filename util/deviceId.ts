import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

const DEVICE_ID_KEY = 'device_id';

/**
 * Gets a unique device identifier using expo-device
 * Falls back to generated ID if device ID is not available
 */
export async function getDeviceId(): Promise<string> {
  try {
    // Try to get the device's unique identifier
    if (Device.osInternalBuildId) {
      return Device.osInternalBuildId;
    }
    
    // Fallback to device name + model if available
    if (Device.deviceName && Device.modelName) {
      return `${Device.deviceName}_${Device.modelName}`.replace(/\s+/g, '_');
    }
    
    // Final fallback to generated ID
    return generateFallbackId();
  } catch (error) {
    console.warn('Error getting device ID:', error);
    return generateFallbackId();
  }
}

/**
 * Generates a fallback device ID
 */
function generateFallbackId(): string {
  const platform = Device.osName || 'unknown';
  const randomId = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  
  return `${platform}_${timestamp}_${randomId}`;
}

/**
 * Gets stored device ID or creates and stores a new one
 */
export async function getStoredDeviceId(): Promise<string> {
  try {
    // Try to get stored device ID
    const storedId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    
    if (storedId) {
      return storedId;
    }
    
    // Generate and store new device ID
    const deviceId = await getDeviceId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    
    return deviceId;
  } catch (error) {
    console.warn('Error with stored device ID:', error);
    // Fallback to generating new ID each time
    return getDeviceId();
  }
}

/**
 * Clears the stored device ID (useful for testing)
 */
export async function clearStoredDeviceId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEVICE_ID_KEY);
  } catch (error) {
    console.warn('Error clearing device ID:', error);
  }
}
