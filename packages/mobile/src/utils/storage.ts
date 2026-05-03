import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'wechat_clone_token';
const REFRESH_TOKEN_KEY = 'wechat_clone_refresh_token';

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    // silently fail
  }
}

export async function removeToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // silently fail
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch {
    // silently fail
  }
}

export async function removeRefreshToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // silently fail
  }
}

export async function clearAll(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY]);
  } catch {
    // silently fail
  }
}
