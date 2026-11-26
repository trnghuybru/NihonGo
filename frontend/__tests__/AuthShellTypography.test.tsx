import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import { AuthShell } from '../src/components/AuthForm';
import { typography } from '../src/theme/theme';

test('scenic login brand, title and subtitle retain the shared Readex typography', async () => {
  let tree!: Renderer.ReactTestRenderer;
  try {
    await act(async () => {
      tree = Renderer.create(
        <AuthShell scenicLogin title="Đăng nhập" subtitle="Chào mừng trở lại">
          <Text>Nội dung</Text>
        </AuthShell>,
      );
    });
    const heading = tree.root.findByProps({ nativeID: 'scenic-login-heading' });
    const labels = heading.findAllByType(Text);
    expect(StyleSheet.flatten(labels[0].props.style)).toMatchObject(
      typography.title,
    );
    expect(StyleSheet.flatten(labels[1].props.style)).toMatchObject(
      typography.body,
    );
    const brand = tree.root.findByProps({ nativeID: 'scenic-login-brand' });
    expect(
      StyleSheet.flatten(brand.findAllByType(Text)[0].props.style),
    ).toMatchObject(typography.brand);
  } finally {
    await act(async () => tree?.unmount());
  }
});
