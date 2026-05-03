import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useUserStore } from '@/store/userStore';
import { getUserCard, getScanResult } from '@/api/qrcode';
import QrCodeDisplay from '@/components/qrcode/QrCodeDisplay';
import { colors, spacing, fonts, sizes } from '@/theme';
import type { QrCodePayload } from '@wechat-clone/shared';

type TabKey = 'my_qr' | 'scan';

export default function QrCodeScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('my_qr');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

  const user = useUserStore((s) => s.user);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const fetchQrCode = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getUserCard(user.id, 'json');
      setDataUrl(result.dataUrl);
    } catch {
      setError('获取二维码失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'my_qr') {
      fetchQrCode();
    }
  }, [activeTab, fetchQrCode]);

  const handleBarCodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (scanned) return;
      setScanned(true);

      try {
        const payload = JSON.parse(data) as QrCodePayload;
        if (!payload.type) {
          Alert.alert('扫描结果', '无法识别的二维码');
          setScanned(false);
          return;
        }

        const result = await getScanResult(payload);
        switch (result.action) {
          case 'add_friend':
            Alert.alert('添加好友', `是否添加用户 ${result.uid} 为好友？`, [
              { text: '取消', style: 'cancel', onPress: () => setScanned(false) },
              { text: '添加', onPress: () => setScanned(false) },
            ]);
            break;
          case 'join_group':
            Alert.alert('加入群聊', '是否加入群聊？', [
              { text: '取消', style: 'cancel', onPress: () => setScanned(false) },
              { text: '加入', onPress: () => setScanned(false) },
            ]);
            break;
          case 'login':
            Alert.alert('扫码登录', '确认登录？', [
              { text: '取消', style: 'cancel', onPress: () => setScanned(false) },
              { text: '确认', onPress: () => setScanned(false) },
            ]);
            break;
          default:
            Alert.alert('扫描结果', '无法识别的二维码');
            setScanned(false);
            break;
        }
      } catch {
        Alert.alert('扫描结果', '无效的二维码内容');
        setScanned(false);
      }
    },
    [scanned],
  );

  const handleScanTabPress = useCallback(async () => {
    setActiveTab('scan');
    setScanned(false);
    if (!cameraPermission?.granted) {
      const perm = await requestCameraPermission();
      if (!perm.granted) {
        Alert.alert('需要摄像头权限', '请在设置中允许使用摄像头以扫描二维码');
      }
    }
  }, [cameraPermission, requestCameraPermission]);

  const renderMyQrTab = () => {
    if (loading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchQrCode}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!user) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>用户信息不可用</Text>
        </View>
      );
    }

    return (
      <View style={styles.qrContainer}>
        {dataUrl && (
          <QrCodeDisplay dataUrl={dataUrl} username={user.username} />
        )}
      </View>
    );
  };

  const renderScanTab = () => {
    if (!cameraPermission?.granted) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>需要摄像头权限</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={requestCameraPermission}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>授予权限</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        >
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>将二维码放入框内</Text>
          </View>
        </CameraView>
        {scanned && (
          <TouchableOpacity
            style={styles.scanAgainButton}
            onPress={() => setScanned(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.scanAgainText}>点击重新扫描</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'my_qr' && styles.tabActive]}
          onPress={() => setActiveTab('my_qr')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'my_qr' && styles.tabTextActive,
            ]}
          >
            我的二维码
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'scan' && styles.tabActive]}
          onPress={handleScanTabPress}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'scan' && styles.tabTextActive,
            ]}
          >
            扫一扫
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'my_qr' ? renderMyQrTab() : renderScanTab()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: fonts.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fonts.sm,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: fonts.sm,
    color: colors.danger,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  retryText: {
    color: colors.white,
    fontSize: fonts.md,
    fontWeight: '600',
  },
  qrContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: sizes.borderRadiusLg,
    backgroundColor: 'transparent',
  },
  scanHint: {
    marginTop: spacing.lg,
    fontSize: fonts.sm,
    color: colors.white,
  },
  scanAgainButton: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  scanAgainText: {
    color: colors.white,
    fontSize: fonts.md,
    fontWeight: '600',
  },
});
