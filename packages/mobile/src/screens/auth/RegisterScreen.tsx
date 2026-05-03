import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {
  isValidUsername,
  isValidPassword,
  isValidNickname,
  isValidPhone,
} from '@wechat-clone/shared';
import { useUserStore } from '@/store/userStore';
import { register } from '@/api/auth';
import { colors, spacing, fonts } from '@/theme';
import type { RegisterScreenProps } from '@/navigation/types';

export default function RegisterScreen({ navigation }: RegisterScreenProps) {
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useUserStore((s) => s.setAuth);

  const handleRegister = async () => {
    if (!isValidNickname(nickname)) {
      Alert.alert('提示', '请输入昵称');
      return;
    }
    if (!isValidUsername(username)) {
      Alert.alert('提示', '用户名格式不正确（3-20位字母数字下划线，字母开头）');
      return;
    }
    if (phone && !isValidPhone(phone)) {
      Alert.alert('提示', '手机号格式不正确');
      return;
    }
    if (!isValidPassword(password)) {
      Alert.alert('提示', '密码至少6位');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('提示', '两次密码输入不一致');
      return;
    }

    setLoading(true);
    try {
      const res = await register({
        username,
        password,
        nickname,
        phone: phone || undefined,
      });
      setAuth(res.token, res.user);
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '注册失败，请稍后重试';
      Alert.alert('注册失败', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="昵称"
              placeholderTextColor={colors.textTertiary}
              value={nickname}
              onChangeText={setNickname}
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="用户名"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="手机号（选填）"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="密码"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="确认密码"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.registerButton, loading && styles.registerButtonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.registerButtonText}>注册</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.loginText}>已有账号？返回登录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  form: {
    gap: spacing.md,
  },
  inputContainer: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  input: {
    height: 48,
    fontSize: fonts.md,
    color: colors.text,
  },
  registerButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  registerButtonDisabled: {
    opacity: 0.7,
  },
  registerButtonText: {
    color: colors.white,
    fontSize: fonts.lg,
    fontWeight: '600',
  },
  loginLink: {
    alignItems: 'center',
    padding: spacing.md,
  },
  loginText: {
    color: colors.link,
    fontSize: fonts.sm,
  },
});
