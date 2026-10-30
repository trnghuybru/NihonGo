import { DictionaryRecentHistory } from './DictionaryRecentHistory';
import { useSearchHistoryFocus } from '../hooks/useSearchHistoryFocus';
import type { DictionaryHistoryItem } from '../services/dictionaryService';
import { useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  colors,
  layout,
  radius,
  shadowMd,
  spacing,
  typography,
} from '../theme/theme';
import { HomeFeatureIcon } from './HomeFeatureIcon';

interface Props {
  onSearch: (query: string, entry?: DictionaryHistoryItem) => void;
}

export function VocabularySearchBar({ onSearch }: Props) {
  const [query, setQuery] = useState('');
  const {
    focused,
    setFocused,
    historyOpen,
    setHistoryOpen,
    searchContainerRef,
  } = useSearchHistoryFocus();
  const normalizedQuery = query.trim();

  function submit() {
    if (normalizedQuery) {
      setHistoryOpen(false);
      Keyboard.dismiss();
      onSearch(normalizedQuery);
    }
  }

  return (
    <View ref={searchContainerRef} style={styles.searchWrapper}>
      <View style={[styles.container, focused ? styles.focused : null]}>
        <HomeFeatureIcon
          name="search"
          color={focused ? colors.focus : colors.muted}
        />
        <TextInput
          accessibilityLabel="Tra từ vựng"
          accessibilityHint="Nhập tiếng Nhật, kana, romaji hoặc tiếng Việt"
          value={query}
          onChangeText={setQuery}
          onFocus={() => {
            setFocused(true);
            setHistoryOpen(true);
          }}
          onPressIn={() => setHistoryOpen(true)}
          {...(Platform.OS === 'web'
            ? { onClick: () => setHistoryOpen(true) }
            : {})}
          onBlur={() => {
            if (Platform.OS !== 'web') {
              setFocused(false);
              setHistoryOpen(false);
            }
          }}
          onKeyPress={event => {
            if (event.nativeEvent.key === 'Escape') setHistoryOpen(false);
          }}
          maxLength={100}
          onSubmitEditing={submit}
          placeholder="Tra từ Nhật, kana, romaji hoặc tiếng Việt"
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primaryText}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tìm từ"
          accessibilityState={{ disabled: !normalizedQuery }}
          disabled={!normalizedQuery}
          onPress={submit}
          hitSlop={4}
          style={({ pressed }) => [
            styles.submit,
            normalizedQuery ? styles.submitActive : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <HomeFeatureIcon
            name="arrow"
            size={20}
            color={normalizedQuery ? colors.onPrimary : colors.disabledText}
          />
        </Pressable>
      </View>
      <DictionaryRecentHistory
        active={historyOpen}
        visible={historyOpen}
        query={query}
        onOpen={item => {
          setHistoryOpen(false);
          Keyboard.dismiss();
          onSearch(item.word, item);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrapper: { position: 'relative', zIndex: 30 },
  container: {
    minHeight: layout.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    boxShadow: shadowMd,
  },
  focused: { borderColor: colors.focus },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: layout.inputHeight - 2,
    paddingVertical: spacing.md,
    ...typography.input,
    color: colors.inputText,
  },
  submit: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.disabled,
  },
  submitActive: { backgroundColor: colors.primary },
  pressed: { backgroundColor: colors.primaryPressed },
});
