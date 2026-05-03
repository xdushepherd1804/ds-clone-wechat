import { StyleSheet } from 'react-native';

export const colors = {
  primary: '#07C160',
  primaryDark: '#06AD56',
  primaryLight: '#39D67A',
  background: '#EDEDED',
  white: '#FFFFFF',
  text: '#333333',
  textSecondary: '#999999',
  textTertiary: '#CCCCCC',
  border: '#E0E0E0',
  borderLight: '#EBEBEB',
  danger: '#FA5151',
  warning: '#FFC300',
  link: '#576B95',
  overlay: 'rgba(0, 0, 0, 0.5)',
  sentBubble: '#95EC69',
  receivedBubble: '#FFFFFF',
  tabBarActive: '#07C160',
  tabBarInactive: '#999999',
  headerBg: '#EDEDED',
  inputBg: '#F7F7F7',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const sizes = {
  avatarSm: 32,
  avatarMd: 40,
  avatarLg: 48,
  avatarXl: 64,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  iconXl: 32,
  chatInputHeight: 50,
  headerHeight: 44,
  tabBarHeight: 50,
  borderRadius: 6,
  borderRadiusLg: 12,
} as const;

export const fonts = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
} as const;

export const shadows = {
  light: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
} as const;

type ThemedStyleCallback<T extends StyleSheet.NamedStyles<T>> =
  | T
  | ((theme: typeof colors) => T);

export function createThemedStyleSheet<T extends StyleSheet.NamedStyles<T>>(
  stylesOrFactory: ThemedStyleCallback<T>,
): T {
  if (typeof stylesOrFactory === 'function') {
    return StyleSheet.create(stylesOrFactory(colors));
  }
  return StyleSheet.create(stylesOrFactory);
}
