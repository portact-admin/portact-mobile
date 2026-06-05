import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet, Image, Pressable } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@components/ui/Typography';
import { useBiometricStore } from '@store/useBiometricStore';

const BRAND_BG  = '#0B1120';
const BRAND_BG2 = '#0F172A';

export function BiometricLockScreen() {
  const unlock = useBiometricStore((s) => s.unlock);

  const authenticate = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock PortAct',
      fallbackLabel: 'Use Passcode',
      disableDeviceFallback: false,
    });
    if (result.success) unlock();
  }, [unlock]);

  useEffect(() => {
    authenticate();
  }, [authenticate]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[BRAND_BG, BRAND_BG2]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(26,110,255,0.18)', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        pointerEvents="none"
      />

      <View style={styles.content}>
        <Image
          source={require('../../assets/logo.png')}
          style={{ width: 72, height: 72 }}
          resizeMode="contain"
        />
        <Typography variant="title2" weight="800" color="#FFFFFF">PortAct</Typography>

        <Pressable
          onPress={authenticate}
          accessibilityRole="button"
          accessibilityLabel="Authenticate to unlock"
          hitSlop={16}
          style={({ pressed }) => [styles.lockIcon, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="finger-print" size={48} color="#4D94FF" />
        </Pressable>

        <Typography variant="body" color="rgba(255,255,255,0.5)" align="center">
          Tap the icon to unlock
        </Typography>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 9999,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(77,148,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(77,148,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
});
