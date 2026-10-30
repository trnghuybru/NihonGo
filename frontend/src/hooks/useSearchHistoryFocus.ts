import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Platform, View } from 'react-native';

export function useSearchHistoryFocus(active = true) {
  const [focused, setFocused] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const searchContainerRef = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !active || !historyOpen) return;
    const closeOutside = (event: Event) => {
      const container =
        searchContainerRef.current as unknown as HTMLElement | null;
      if (container && !container.contains(event.target as Node)) {
        setHistoryOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [active, historyOpen]);
  return {
    focused,
    setFocused,
    historyOpen,
    setHistoryOpen,
    searchContainerRef,
  };
}
