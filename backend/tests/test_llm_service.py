import unittest
from services.llm_service import trim_and_manage_context, MAX_HISTORY_MESSAGES, VOICE_SYSTEM_PROMPT

class TestLLMService(unittest.TestCase):
    def test_context_management_under_limit_vietnamese(self):
        messages = [
            {"role": "user", "content": "Xin chào"},
            {"role": "assistant", "content": "Chào bạn! Tôi có thể giúp gì cho bạn?"}
        ]
        result = trim_and_manage_context(messages, language="vi-VN")
        self.assertEqual(len(result), 3)  # 1 system + 2 messages
        self.assertEqual(result[0]["role"], "system")
        self.assertIn("trợ lý AI đàm thoại bằng giọng nói", result[0]["content"])
        self.assertEqual(result[1]["content"], "Xin chào")
        self.assertEqual(result[2]["content"], "Chào bạn! Tôi có thể giúp gì cho bạn?")

    def test_context_management_japanese_kaiwa(self):
        messages = [
            {"role": "user", "content": "こんにちは、ラーメンをお願いします。"},
            {"role": "assistant", "content": "いらっしゃいませ！どのラーメンにいたしますか？"}
        ]
        result = trim_and_manage_context(
            messages,
            level="N3",
            topic="restaurant",
            language="ja-JP"
        )
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["role"], "system")
        self.assertIn("あおい（Aoi）", result[0]["content"])
        self.assertIn("レストラン・居酒屋", result[0]["content"])
        self.assertIn("JLPT N3レベル", result[0]["content"])

    def test_context_management_sliding_window(self):
        # Tạo 10 tin nhắn
        messages = []
        for i in range(10):
            role = "user" if i % 2 == 0 else "assistant"
            messages.append({"role": role, "content": f"Message {i}"})

        result = trim_and_manage_context(
            messages,
            existing_summary="ユーザーはラーメンについて話している",
            language="ja-JP"
        )
        # Phải có: 1 system prompt (chứa summary) + MAX_HISTORY_MESSAGES tin gần nhất
        self.assertEqual(len(result), 1 + MAX_HISTORY_MESSAGES)
        self.assertIn("[前回の会話要約: ユーザーはラーメンについて話している]", result[0]["content"])
        # Kiểm tra tin nhắn cuối cùng phải là Message 9
        self.assertEqual(result[-1]["content"], "Message 9")
        # Kiểm tra tin nhắn đầu tiên của history được cắt đúng từ Message 4 đến Message 9 (6 tin)
        self.assertEqual(result[1]["content"], "Message 4")

if __name__ == "__main__":
    unittest.main()

