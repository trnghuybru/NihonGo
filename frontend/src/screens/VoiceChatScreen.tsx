import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  StatusBar,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { voiceService } from '../services/voiceService';
import { ttsService } from '../services/ttsService';
import { chatStreamService, ChatMessage } from '../services/chatStreamService';
import { colors } from '../theme/theme';
import {
  MicIcon,
  VolumeIcon,
  VolumeXIcon,
  RefreshIcon,
  MessageSquareIcon,
  KeyboardIcon,
  XIcon,
} from '../components/icons';
import { CharacterView3D } from '../components/CharacterView3D';

type ConversationState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING';

export type KaiwaTopic =
  | 'free_talk'
  | 'restaurant'
  | 'konbini'
  | 'interview'
  | 'travel';

export type JLPTLevel = 'N5' | 'N4' | 'N3' | 'N2';

interface TopicItem {
  id: KaiwaTopic;
  title: string;
  subTitle: string;
  icon: string;
  samplePhrases: string[];
}

export const KAIWA_TOPICS: TopicItem[] = [
  {
    id: 'free_talk',
    title: 'フリートーク',
    subTitle: 'Tự do',
    icon: '🗣️',
    samplePhrases: [
      'こんにちは！はじめまして。',
      '最近、日本語を勉強しています。',
      '日本で一番好きな食べ物は何ですか？',
    ],
  },
  {
    id: 'restaurant',
    title: 'レストラン',
    subTitle: 'Quán ăn',
    icon: '🍜',
    samplePhrases: [
      'すみません、メニューをお願いします。',
      'おすすめの料理は何ですか？',
      'お会計をお願いします。',
    ],
  },
  {
    id: 'konbini',
    title: 'コンビニ',
    subTitle: 'Tiện lợi',
    icon: '🏪',
    samplePhrases: [
      'お弁当を温めてください。',
      'レジ袋はいりません。',
      'お箸を一膳つけてください。',
    ],
  },
  {
    id: 'interview',
    title: '面接',
    subTitle: 'Phỏng vấn',
    icon: '💼',
    samplePhrases: [
      'はじめまして。グエンと申します。',
      '週に三日ほど働くことができます。',
      '一生懸命頑張ります。よろしくお願いします。',
    ],
  },
  {
    id: 'travel',
    title: '旅行・観光',
    subTitle: 'Du lịch',
    icon: '✈️',
    samplePhrases: [
      'すみません、渋谷駅はどこですか？',
      '新宿までの切符を一枚ください。',
      '写真を撮ってもらえますか？',
    ],
  },
];

export const JLPT_LEVELS: JLPTLevel[] = ['N5', 'N4', 'N3', 'N2'];

const SILENCE_DELAY_MS = 1800; // Đợi 1.8 giây im lặng trước khi tự động gửi câu hỏi

export function VoiceChatScreen() {
  const insets = useSafeAreaInsets();
  const [conversationState, setConversationState] =
    useState<ConversationState>('IDLE');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [streamingAiText, setStreamingAiText] = useState('');
  const [locale] = useState<'ja-JP' | 'vi-VN' | 'en-US'>('ja-JP');
  const [selectedTopic, setSelectedTopic] = useState<KaiwaTopic>('free_talk');
  const [selectedLevel, setSelectedLevel] = useState<JLPTLevel>('N4');
  const [statusNote, setStatusNote] = useState(
    'Chạm micro để luyện Kaiwa cùng Aoi',
  );
  const [inputText, setInputText] = useState('');
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);
  const [isTextInputVisible, setIsTextInputVisible] = useState(false);

  const activeTopicItem =
    KAIWA_TOPICS.find((t) => t.id === selectedTopic) || KAIWA_TOPICS[0];

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const abortStreamRef = useRef<(() => void) | null>(null);
  const liveTranscriptRef = useRef('');
  const messagesRef = useRef<ChatMessage[]>([]);
  const onSpeechCompleteRef = useRef<(explicitText?: string) => void>(() => {});
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmittingRef = useRef(false);
  const historyScrollRef = useRef<any>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    liveTranscriptRef.current = liveTranscript;
  }, [liveTranscript]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /**
   * Gửi text tới Flask Backend SSE và phát giọng nói TTS tiếng Nhật
   */
  const dispatchQuestionToAi = useCallback(
    (userText: string) => {
      setConversationState('PROCESSING');
      setStatusNote('Aoi đang suy nghĩ câu trả lời...');
      setLiveTranscript('');

      const updatedMessages: ChatMessage[] = [
        ...messagesRef.current,
        { role: 'user', content: userText },
      ];
      setMessages(updatedMessages);
      setStreamingAiText('');

      if (isTtsEnabled) {
        ttsService.stop();
      }

      let accumulatedAnswer = '';

      const cancelStream = chatStreamService.streamVoiceChat(
        updatedMessages,
        {
          onToken: (token) => {
            setConversationState('SPEAKING');
            setStatusNote('Aoi đang trả lời...');
            accumulatedAnswer += token;
            setStreamingAiText(accumulatedAnswer);

            if (isTtsEnabled) {
              ttsService.feedToken(token);
            }
          },
          onDone: (fullText) => {
            isSubmittingRef.current = false;
            if (isTtsEnabled) {
              ttsService.flush();
            }
            const finalAnswer = (fullText || accumulatedAnswer).trim();

            if (finalAnswer) {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: finalAnswer },
              ]);
            }
            setStreamingAiText('');
            if (!isTtsEnabled || !ttsService.getIsSpeaking()) {
              setConversationState('IDLE');
              setStatusNote('Đến lượt bạn! Chạm micro để nói');
            }
          },
          onError: (err) => {
            isSubmittingRef.current = false;
            if (isTtsEnabled) {
              ttsService.stop();
            }
            console.warn('Lỗi stream AI:', err);
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `⚠️ ${err}`,
              },
            ]);
            setStreamingAiText('');
            setStatusNote('Có lỗi xảy ra');
            setConversationState('IDLE');
          },
        },
        {
          level: selectedLevel,
          topic: selectedTopic,
          language: locale,
        },
      );

      abortStreamRef.current = cancelStream;
    },
    [isTtsEnabled, selectedLevel, selectedTopic, locale],
  );

  /**
   * Xử lý khi người dùng hoàn tất câu nói (qua VAD hoặc bấm dừng chủ động)
   */
  const handleUserSpeechComplete = useCallback(
    (explicitText?: string) => {
      clearSilenceTimer();
      if (isSubmittingRef.current) return;

      const textToSend = (explicitText || liveTranscriptRef.current).trim();
      if (!textToSend) {
        setConversationState('IDLE');
        setStatusNote('Chưa nghe rõ câu nói, chạm micro để thử lại');
        return;
      }

      isSubmittingRef.current = true;
      voiceService.stop().catch(() => {});
      dispatchQuestionToAi(textToSend);
    },
    [clearSilenceTimer, dispatchQuestionToAi],
  );

  useEffect(() => {
    onSpeechCompleteRef.current = handleUserSpeechComplete;
  }, [handleUserSpeechComplete]);

  // Khởi tạo Voice (STT + VAD) và TTS
  useEffect(() => {
    ttsService.init((isSpeaking) => {
      if (!isSpeaking) {
        setConversationState((prevState) => {
          if (prevState === 'SPEAKING') {
            setStatusNote('Nhấn vào micro để nói chuyện');
            return 'IDLE';
          }
          return prevState;
        });
      } else {
        setConversationState('SPEAKING');
        setStatusNote('Aoi đang trả lời...');
      }
    });

    voiceService.init({
      onStart: () => {
        isSubmittingRef.current = false;
        clearSilenceTimer();
        setConversationState('LISTENING');
        setStatusNote('Đang lắng nghe... (Dừng 1.8s để gửi)');
        setLiveTranscript('');
      },
      onPartialResults: (partialText) => {
        setLiveTranscript(partialText);
        liveTranscriptRef.current = partialText;

        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          if (
            !isSubmittingRef.current &&
            liveTranscriptRef.current.trim().length > 0
          ) {
            onSpeechCompleteRef.current(liveTranscriptRef.current);
          }
        }, SILENCE_DELAY_MS);
      },
      onVolumeChanged: (volume) => {
        const targetScale = 1 + Math.min(Math.max(volume, 0) / 10, 0.4);
        Animated.timing(pulseAnim, {
          toValue: targetScale,
          duration: 70,
          useNativeDriver: true,
        }).start();
      },
      onEnd: () => {
        if (
          !silenceTimerRef.current &&
          liveTranscriptRef.current.trim().length > 0
        ) {
          silenceTimerRef.current = setTimeout(() => {
            if (!isSubmittingRef.current) {
              onSpeechCompleteRef.current(liveTranscriptRef.current);
            }
          }, 1200);
        }
      },
      onFinalResults: (finalText) => {
        if (finalText) {
          setLiveTranscript(finalText);
          liveTranscriptRef.current = finalText;
        }
      },
      onError: (friendlyMsg, rawMsg) => {
        clearSilenceTimer();
        if (
          liveTranscriptRef.current.trim().length > 0 &&
          !isSubmittingRef.current
        ) {
          onSpeechCompleteRef.current(liveTranscriptRef.current);
          return;
        }
        setConversationState('IDLE');
        setStatusNote(friendlyMsg || 'Chưa nghe rõ, vui lòng thử lại');

        if (
          rawMsg?.includes('300') ||
          rawMsg?.includes('Failed to initialize recognizer')
        ) {
          Alert.alert(
            "Cần Bật 'Đọc Chính Tả' (Dictation) trên iOS",
            "Lỗi 300: Hãy mở Settings -> General -> Keyboard -> Bật 'Enable Dictation' để kích hoạt micro.",
            [{ text: 'Đã hiểu' }],
          );
        }
      },
    });

    return () => {
      clearSilenceTimer();
      voiceService.destroy();
      ttsService.stop();
      abortStreamRef.current?.();
    };
  }, [clearSilenceTimer, pulseAnim]);

  // Hiệu ứng Pulse Animation cho nút Microphone
  useEffect(() => {
    if (conversationState === 'LISTENING' || conversationState === 'SPEAKING') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [conversationState, pulseAnim]);

  const handleSendTextInput = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    setIsTextInputVisible(false);
    dispatchQuestionToAi(text);
  }, [inputText, dispatchQuestionToAi]);

  const handleMicPress = useCallback(async () => {
    if (!voiceService.isAvailable()) {
      Alert.alert(
        'Module Microphone Chưa Sẵn Sàng',
        'Cần mở bằng Xcode và chạy lên iPhone thật để dùng Micro.',
        [{ text: 'Đã hiểu' }],
      );
      return;
    }

    if (conversationState === 'IDLE') {
      isSubmittingRef.current = false;
      clearSilenceTimer();
      await voiceService.start(locale);
    } else if (conversationState === 'LISTENING') {
      clearSilenceTimer();
      await voiceService.stop();
      handleUserSpeechComplete();
    } else if (
      conversationState === 'SPEAKING' ||
      conversationState === 'PROCESSING'
    ) {
      if (isTtsEnabled) {
        ttsService.stop();
      }
      abortStreamRef.current?.();
      setStreamingAiText('');
      isSubmittingRef.current = false;
      clearSilenceTimer();
      await voiceService.start(locale);
    }
  }, [
    conversationState,
    locale,
    isTtsEnabled,
    handleUserSpeechComplete,
    clearSilenceTimer,
  ]);

  const handleClearHistory = useCallback(() => {
    clearSilenceTimer();
    voiceService.cancel();
    if (isTtsEnabled) {
      ttsService.stop();
    }
    abortStreamRef.current?.();
    setMessages([]);
    setLiveTranscript('');
    setStreamingAiText('');
    setConversationState('IDLE');
    setStatusNote('Đã làm mới cuộc hội thoại');
  }, [clearSilenceTimer, isTtsEnabled]);

  const toggleTts = useCallback(() => {
    setIsTtsEnabled((prev) => {
      const next = !prev;
      if (!next) {
        ttsService.stop();
      }
      return next;
    });
  }, []);

  const cycleLevel = useCallback(() => {
    const currentIndex = JLPT_LEVELS.indexOf(selectedLevel);
    const nextIndex = (currentIndex + 1) % JLPT_LEVELS.length;
    setSelectedLevel(JLPT_LEVELS[nextIndex]);
  }, [selectedLevel]);

  const getMicButtonColor = () => {
    switch (conversationState) {
      case 'LISTENING':
        return colors.primary;
      case 'SPEAKING':
        return '#34C759';
      case 'PROCESSING':
        return '#FF9500';
      default:
        return '#582C83';
    }
  };

  const getStatusDotStyle = () => {
    switch (conversationState) {
      case 'SPEAKING':
        return styles.statusDotSpeaking;
      case 'LISTENING':
        return styles.statusDotListening;
      case 'PROCESSING':
        return styles.statusDotProcessing;
      default:
        return styles.statusDotIdle;
    }
  };

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ============================================================ */}
      {/* 1. SÂN KHẤU 3D CHỦ ĐẠO (HERO 3D CHARACTER STAGE)               */}
      {/* ============================================================ */}
      <View style={styles.heroStage}>
        {/* Nhân vật 3D WebGL GLTF */}
        <CharacterView3D
          isSpeaking={conversationState === 'SPEAKING'}
          characterName="Aoi (あおい)"
          showOverlayHeader={false}
          containerStyle={styles.characterContainer}
        />

        {/* Thanh trạng thái nổi phía trên (Floating Top Bar) */}
        <View style={[styles.floatingTopBar, { top: insets.top + 6 }]}>
          {/* Huy hiệu Aoi + Trạng thái hoạt động */}
          <View style={styles.characterPill}>
            <Text style={styles.characterPillTitle}>🌸 Aoi (あおい)</Text>
            <View style={styles.statusIndicator}>
              <View style={[styles.statusDot, getStatusDotStyle()]} />
              <Text style={styles.statusDotText}>
                {conversationState === 'SPEAKING'
                  ? 'Đang nói'
                  : conversationState === 'LISTENING'
                  ? 'Đang nghe'
                  : conversationState === 'PROCESSING'
                  ? 'Đang nghĩ'
                  : 'Sẵn sàng'}
              </Text>
            </View>
          </View>

          {/* Các nút công cụ nổi */}
          <View style={styles.topBarActions}>
            {/* Đổi Level JLPT */}
            <Pressable style={styles.levelBadge} onPress={cycleLevel}>
              <Text style={styles.levelBadgeText}>{selectedLevel}</Text>
            </Pressable>

            {/* Bật/Tắt giọng đọc TTS */}
            <Pressable style={styles.actionCircleButton} onPress={toggleTts}>
              {isTtsEnabled ? (
                <VolumeIcon size={18} color="#582C83" />
              ) : (
                <VolumeXIcon size={18} color={colors.muted} />
              )}
            </Pressable>

            {/* Làm mới hội thoại */}
            <Pressable
              style={styles.actionCircleButton}
              onPress={handleClearHistory}
            >
              <RefreshIcon size={18} color={colors.body} />
            </Pressable>
          </View>
        </View>

        {/* Thanh cuộn ngang chọn chủ đề Kaiwa nổi nhẹ */}
        <View style={[styles.topicBarContainer, { top: insets.top + 54 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topicScrollContent}
          >
            {KAIWA_TOPICS.map((topic) => {
              const isSelected = selectedTopic === topic.id;
              return (
                <Pressable
                  key={topic.id}
                  style={[
                    styles.floatingTopicChip,
                    isSelected && styles.floatingTopicChipActive,
                  ]}
                  onPress={() => setSelectedTopic(topic.id)}
                >
                  <Text style={styles.topicChipEmoji}>{topic.icon}</Text>
                  <Text
                    style={[
                      styles.topicChipTitle,
                      isSelected && styles.topicChipTitleActive,
                    ]}
                  >
                    {topic.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ============================================================ */}
        {/* Thẻ phụ đề trực tiếp (Floating Live Captions Glassmorphism)     */}
        {/* ============================================================ */}
        <View style={styles.liveSubtitleCard}>
          <View style={styles.liveSubtitleHeader}>
            <Text style={styles.liveSubtitleSpeaker}>
              {conversationState === 'LISTENING'
                ? '🗣️ Bạn đang nói:'
                : conversationState === 'SPEAKING' || streamingAiText
                ? '🤖 Aoi (あおい):'
                : conversationState === 'PROCESSING'
                ? '⏳ Aoi đang suy nghĩ...'
                : lastMessage?.role === 'user'
                ? '🗣️ Bạn vừa nói:'
                : '🤖 Aoi:'}
            </Text>

            <Pressable
              style={styles.historyShortcutButton}
              onPress={() => setIsHistoryModalVisible(true)}
            >
              <MessageSquareIcon size={14} color={colors.primary} />
              <Text style={styles.historyShortcutText}>
                Lịch sử ({messages.length})
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.liveSubtitleScroll}
            showsVerticalScrollIndicator={false}
          >
            {streamingAiText ? (
              <Text style={styles.liveSubtitleTextAoi}>
                {streamingAiText}
                <Text style={styles.cursorText}> ▍</Text>
              </Text>
            ) : conversationState === 'LISTENING' ? (
              <Text style={styles.liveSubtitleTextUser}>
                {liveTranscript || '... (Hãy nói câu tiếng Nhật của bạn)'}
                <Text style={styles.cursorText}> |</Text>
              </Text>
            ) : conversationState === 'PROCESSING' ? (
              <Text style={styles.liveSubtitleThinking}>
                Đang lắng nghe và suy nghĩ câu phản hồi phù hợp...
              </Text>
            ) : lastMessage ? (
              <Text style={styles.liveSubtitleTextAoi}>{lastMessage.content}</Text>
            ) : (
              <Text style={styles.liveSubtitlePlaceholder}>
                Konnichiwa! Chạm vào micro để bắt đầu luyện nói tiếng Nhật cùng Aoi, hoặc bấm vào câu mẫu bên dưới nhé! 🌸
              </Text>
            )}
          </ScrollView>
        </View>
      </View>

      {/* ============================================================ */}
      {/* 2. DOCK ĐIỀU KHIỂN GIỌNG NÓI (BOTTOM INTERACTION DOCK)         */}
      {/* ============================================================ */}
      <View style={[styles.bottomDock, { paddingBottom: insets.bottom + 8 }]}>
        {/* Hàng gợi ý câu nói tình huống (Chạm là gửi ngay) */}
        <View style={styles.sampleCarouselContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sampleCarouselContent}
          >
            {activeTopicItem.samplePhrases.map((phrase, idx) => (
              <Pressable
                key={`phrase-${idx}`}
                style={styles.samplePhraseChip}
                onPress={() => dispatchQuestionToAi(phrase)}
              >
                <Text style={styles.samplePhraseChipText}>👉 {phrase}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Nút thao tác khi đang nhận diện giọng nói */}
        {conversationState === 'LISTENING' &&
          liveTranscript.trim().length > 0 && (
            <View style={styles.liveActionRow}>
              <Pressable
                style={styles.liveSendNowButton}
                onPress={() => handleUserSpeechComplete()}
              >
                <Text style={styles.liveSendNowText}>✓ Gửi ngay</Text>
              </Pressable>
              <Pressable
                style={styles.liveCancelButton}
                onPress={() => {
                  clearSilenceTimer();
                  voiceService.cancel();
                  setLiveTranscript('');
                  setConversationState('IDLE');
                  setStatusNote('Đã huỷ câu nói');
                }}
              >
                <Text style={styles.liveCancelText}>✕ Huỷ</Text>
              </Pressable>
            </View>
          )}

        {/* Khu vực trung tâm: Nút Micro + Phím nhập text + Nút lịch sử */}
        <View style={styles.voiceControlRow}>
          {/* Nút bật bàn phím gõ text */}
          <Pressable
            style={[
              styles.dockSideButton,
              isTextInputVisible && styles.dockSideButtonActive,
            ]}
            onPress={() => setIsTextInputVisible((prev) => !prev)}
            accessibilityLabel="Gõ văn bản"
          >
            <KeyboardIcon
              size={22}
              color={isTextInputVisible ? colors.primary : colors.body}
            />
          </Pressable>

          {/* Nút Micro chính (Hero Mic Button 72px) */}
          <View style={styles.micWrapper}>
            {(conversationState === 'LISTENING' ||
              conversationState === 'SPEAKING') && (
              <Animated.View
                style={[
                  styles.pulseWave,
                  {
                    borderColor: getMicButtonColor(),
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 1.25],
                      outputRange: [0.6, 0.1],
                    }),
                  },
                ]}
              />
            )}

            <Pressable
              style={[
                styles.heroMicButton,
                { backgroundColor: getMicButtonColor() },
              ]}
              onPress={handleMicPress}
              accessibilityRole="button"
              accessibilityLabel="Microphone"
            >
              {conversationState === 'LISTENING' ? (
                <MicIcon size={34} color="#FFFFFF" />
              ) : conversationState === 'SPEAKING' ? (
                <VolumeIcon size={32} color="#FFFFFF" />
              ) : conversationState === 'PROCESSING' ? (
                <VolumeXIcon size={30} color="#FFFFFF" />
              ) : (
                <MicIcon size={34} color="#FFFFFF" />
              )}
            </Pressable>
          </View>

          {/* Nút mở Lịch sử hội thoại */}
          <Pressable
            style={styles.dockSideButton}
            onPress={() => setIsHistoryModalVisible(true)}
            accessibilityLabel="Xem lịch sử"
          >
            <MessageSquareIcon size={22} color={colors.body} />
          </Pressable>
        </View>

        {/* Chú thích trạng thái dưới Micro */}
        <Text style={styles.dockStatusNote}>{statusNote}</Text>

        {/* Thanh gõ phím khi bấm nút bàn phím */}
        {isTextInputVisible && (
          <View style={styles.floatingInputRow}>
            <TextInput
              style={styles.floatingTextInput}
              placeholder="Nhập câu tiếng Nhật..."
              placeholderTextColor={colors.placeholder}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSendTextInput}
              returnKeyType="send"
              autoFocus
            />
            <Pressable
              style={[
                styles.floatingSendButton,
                !inputText.trim() && styles.floatingSendButtonDisabled,
              ]}
              onPress={handleSendTextInput}
              disabled={!inputText.trim()}
            >
              <Text style={styles.floatingSendButtonText}>Gửi</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ============================================================ */}
      {/* 3. MODAL LỊCH SỬ HỘI THOẠI TOÀN DIỆN (CHAT HISTORY SHEET)     */}
      {/* ============================================================ */}
      <Modal
        visible={isHistoryModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsHistoryModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>📜 Lịch sử hội thoại</Text>
              <Text style={styles.modalSubTitle}>
                {messages.length} lượt đàm thoại với Aoi ({selectedLevel})
              </Text>
            </View>

            <View style={styles.modalHeaderActions}>
              <Pressable
                style={styles.modalClearButton}
                onPress={handleClearHistory}
              >
                <RefreshIcon size={16} color={colors.muted} />
                <Text style={styles.modalClearText}>Làm mới</Text>
              </Pressable>

              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setIsHistoryModalVisible(false)}
              >
                <XIcon size={20} color={colors.dark} />
              </Pressable>
            </View>
          </View>

          {/* Modal Chat Content */}
          <ScrollView
            ref={historyScrollRef}
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
          >
            {messages.length === 0 ? (
              <View style={styles.modalEmptyState}>
                <Text style={styles.modalEmptyEmoji}>🌸</Text>
                <Text style={styles.modalEmptyText}>
                  Chưa có tin nhắn nào trong phiên này
                </Text>
                <Text style={styles.modalEmptySubtext}>
                  Hãy nói chuyện với Aoi bằng micro để luyện phản xạ!
                </Text>
              </View>
            ) : (
              messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <View
                    key={`modal-msg-${idx}`}
                    style={[
                      styles.modalBubble,
                      isUser ? styles.modalUserBubble : styles.modalAssistantBubble,
                    ]}
                  >
                    <Text style={styles.modalBubbleRole}>
                      {isUser ? '🗣️ Bạn' : '🌸 Aoi (AI)'}
                    </Text>
                    <Text
                      style={[
                        styles.modalBubbleText,
                        isUser
                          ? styles.modalUserBubbleText
                          : styles.modalAssistantBubbleText,
                      ]}
                    >
                      {msg.content}
                    </Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF8FC',
  },

  /* 1. Sân khấu 3D Hero Stage */
  heroStage: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  characterContainer: {
    flex: 1,
  },

  /* Floating Top Bar */
  floatingTopBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  characterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#582C83',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  characterPillTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.dark,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3EEF8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotSpeaking: {
    backgroundColor: '#34C759',
  },
  statusDotListening: {
    backgroundColor: colors.primary,
  },
  statusDotProcessing: {
    backgroundColor: '#FF9500',
  },
  statusDotIdle: {
    backgroundColor: '#8E8E93',
  },
  statusDotText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.body,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  actionCircleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },

  /* Thanh chọn chủ đề nổi */
  topicBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 15,
  },
  topicScrollContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  floatingTopicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(235, 230, 245, 0.8)',
  },
  floatingTopicChipActive: {
    backgroundColor: '#FFF0F3',
    borderColor: colors.primary,
  },
  topicChipEmoji: {
    fontSize: 13,
  },
  topicChipTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.body,
  },
  topicChipTitleActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  /* Floating Live Captions */
  liveSubtitleCard: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 130,
    zIndex: 20,
    shadowColor: '#582C83',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#EFE7F6',
  },
  liveSubtitleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  liveSubtitleSpeaker: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.dark,
  },
  historyShortcutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF0F3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  historyShortcutText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  liveSubtitleScroll: {
    maxHeight: 80,
  },
  liveSubtitleTextAoi: {
    fontSize: 14,
    lineHeight: 21,
    color: '#2C1838',
    fontWeight: '500',
  },
  liveSubtitleTextUser: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.primary,
    fontWeight: '500',
  },
  liveSubtitleThinking: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
  },
  liveSubtitlePlaceholder: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  cursorText: {
    color: colors.primary,
    fontWeight: '700',
  },

  /* 2. Dock Điều Khiển Giọng Nói */
  bottomDock: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  sampleCarouselContainer: {
    marginBottom: 8,
  },
  sampleCarouselContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  samplePhraseChip: {
    backgroundColor: '#F8F5FB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFE7F6',
  },
  samplePhraseChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#582C83',
  },
  liveActionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  liveSendNowButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  liveSendNowText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  liveCancelButton: {
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  liveCancelText: {
    color: colors.dark,
    fontSize: 12,
    fontWeight: '600',
  },
  voiceControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 20,
    marginTop: 4,
  },
  dockSideButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F7F4FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EFE7F6',
  },
  dockSideButtonActive: {
    backgroundColor: '#FFF0F3',
    borderColor: colors.primary,
  },
  micWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseWave: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
  },
  heroMicButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#582C83',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  dockStatusNote: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
    marginTop: 6,
    marginBottom: 4,
  },
  floatingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 8,
  },
  floatingTextInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#F7F4FA',
    borderRadius: 21,
    paddingHorizontal: 16,
    fontSize: 13,
    color: colors.dark,
    borderWidth: 1,
    borderColor: '#EFE7F6',
  },
  floatingSendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingSendButtonDisabled: {
    backgroundColor: '#E5DFEE',
  },
  floatingSendButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  /* 3. Modal Lịch Sử Hội Thoại */
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  modalSubTitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalClearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F7F4FA',
  },
  modalClearText: {
    fontSize: 12,
    color: colors.body,
    fontWeight: '600',
  },
  modalCloseButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  modalEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 8,
  },
  modalEmptyEmoji: {
    fontSize: 48,
  },
  modalEmptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.dark,
  },
  modalEmptySubtext: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  modalBubble: {
    maxWidth: '84%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  modalUserBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  modalAssistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F4F0F8',
    borderBottomLeftRadius: 4,
  },
  modalBubbleRole: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    opacity: 0.8,
    color: '#FFFFFF',
  },
  modalBubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalUserBubbleText: {
    color: '#FFFFFF',
  },
  modalAssistantBubbleText: {
    color: colors.dark,
  },
});
