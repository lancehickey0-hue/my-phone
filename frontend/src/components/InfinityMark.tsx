import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

type Props = {
  size?: number;
};

export default function InfinityMark({ size = 44 }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Image
        source={require('../../assets/images/icon.png')}
        style={{ width: size, height: size, resizeMode: 'contain' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
