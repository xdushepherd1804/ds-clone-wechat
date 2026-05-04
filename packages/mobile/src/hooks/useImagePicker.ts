import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  type?: string;
  fileName?: string;
  fileSize?: number;
}

type ImageCallback = (image: PickedImage) => void;

export function useImagePicker() {
  const requestMediaPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        '需要相册权限',
        '请在设置中允许访问相册以选择图片',
      );
      return false;
    }
    return true;
  }, []);

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        '需要摄像头权限',
        '请在设置中允许使用摄像头以拍摄照片',
      );
      return false;
    }
    return true;
  }, []);

  const pickImage = useCallback(
    async (callback: ImageCallback) => {
      const hasPermission = await requestMediaPermission();
      if (!hasPermission) return;

      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
          aspect: [1, 1],
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          callback({
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            type: asset.mimeType || 'image/jpeg',
            fileName: asset.fileName || `image_${Date.now()}.jpg`,
            fileSize: asset.fileSize,
          });
        }
      } catch {
        Alert.alert('选择失败', '无法选择图片，请重试');
      }
    },
    [requestMediaPermission],
  );

  const pickMultipleImages = useCallback(
    async (maxCount: number = 9): Promise<PickedImage[]> => {
      const hasPermission = await requestMediaPermission();
      if (!hasPermission) return [];

      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: true,
          selectionLimit: maxCount,
          quality: 0.8,
        });

        if (!result.canceled && result.assets) {
          return result.assets.map((asset) => ({
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            type: asset.mimeType || 'image/jpeg',
            fileName: asset.fileName || `image_${Date.now()}.jpg`,
            fileSize: asset.fileSize,
          }));
        }
      } catch {
        Alert.alert('选择失败', '无法选择图片，请重试');
      }
      return [];
    },
    [requestMediaPermission],
  );

  const takePhoto = useCallback(
    async (callback: ImageCallback) => {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return;

      try {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
          aspect: [1, 1],
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          callback({
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            type: asset.mimeType || 'image/jpeg',
            fileName: asset.fileName || `photo_${Date.now()}.jpg`,
            fileSize: asset.fileSize,
          });
        }
      } catch {
        Alert.alert('拍照失败', '无法拍摄照片，请重试');
      }
    },
    [requestCameraPermission],
  );

  return {
    pickImage,
    pickMultipleImages,
    takePhoto,
  };
}
