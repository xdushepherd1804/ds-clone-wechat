import { useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';

export interface PickedFile {
  uri: string;
  name: string;
  size: number | null;
  mimeType: string;
}

type FileCallback = (file: PickedFile) => void;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export function useFilePicker() {
  const pickFile = useCallback(
    async (callback: FileCallback) => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
        });

        if (result.canceled) return;

        if (result.assets && result.assets.length > 0) {
          const asset = result.assets[0];

          // Validate file size
          if (asset.size && asset.size > MAX_FILE_SIZE) {
            Alert.alert(
              '文件过大',
              `文件大小不能超过 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB`,
            );
            return;
          }

          callback({
            uri: asset.uri,
            name: asset.name || `file_${Date.now()}`,
            size: asset.size || null,
            mimeType: asset.mimeType || 'application/octet-stream',
          });
        }
      } catch {
        Alert.alert('选择失败', '无法选择文件，请重试');
      }
    },
    [],
  );

  const pickFiles = useCallback(
    async (maxCount: number = 10): Promise<PickedFile[]> => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
          multiple: true,
        });

        if (result.canceled) return [];

        if (result.assets) {
          const validFiles = result.assets.filter(
            (asset) => !asset.size || asset.size <= MAX_FILE_SIZE,
          );

          if (validFiles.length < result.assets.length) {
            Alert.alert(
              '文件过大',
              `部分文件超过 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB，已被跳过`,
            );
          }

          return validFiles.slice(0, maxCount).map((asset) => ({
            uri: asset.uri,
            name: asset.name || `file_${Date.now()}`,
            size: asset.size || null,
            mimeType: asset.mimeType || 'application/octet-stream',
          }));
        }
      } catch {
        Alert.alert('选择失败', '无法选择文件，请重试');
      }
      return [];
    },
    [],
  );

  return {
    pickFile,
    pickFiles,
  };
}
