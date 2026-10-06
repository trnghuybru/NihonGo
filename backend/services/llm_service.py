import json
import os
import requests
from typing import Generator, List, Dict, Any, Optional
from dotenv import load_dotenv

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"

# System prompt súc tích, tối ưu riêng cho giao tiếp giọng nói (Voice AI / TTS)
VOICE_SYSTEM_PROMPT = (
    "Bạn là trợ lý AI đàm thoại bằng giọng nói tiếng Việt thân thiện, thông minh và súc tích. "
    "Quy tắc phản hồi bắt buộc: "
    "1. Trả lời trực tiếp, tự nhiên như trò chuyện ngoài đời thực, độ dài khoảng 1-3 câu ngắn. "
    "2. Tuyệt đối KHÔNG dùng markdown (không dùng dấu *, #, _, ~, gạch đầu dòng -, số thứ tự 1. 2.). "
    "3. KHÔNG viết code, KHÔNG dùng bảng biểu, KHÔNG dùng biểu tượng cảm xúc (emoji). "
    "4. Văn phong liền mạch, dùng câu chữ thuần túy để công cụ Text-to-Speech (TTS) đọc trôi chảy."
)

TOPIC_PROMPTS = {
    "free_talk": "日常会話（フリートーク）：天気、趣味、最近の出来事について楽しくおしゃべりする。",
    "restaurant": "レストラン・居酒屋：あなたは飲食店の店員です。学習者は客です。注文を受けたり、おすすめを案内したり、お会計をしてください。",
    "konbini": "コンビニ：あなたはコンビニの店員です。学習者は客です。温め、袋の要否、ポイントカードの確認などリアルに対応してください。",
    "interview": "アルバイト・就職面接：あなたは面接官です。志望動機や自己PR、シフトの希望などを優しく質問してください。",
    "travel": "日本旅行・観光：あなたは日本在住のガイドです。道案内や電車の乗り換え、観光地のおすすめを教えてあげてください。",
}

LEVEL_GUIDELINES = {
    "N5": "JLPT N5レベル：基本単語と初級文法（です・ます形）のみ使用。1文を短く、極めて分かりやすく返答すること。",
    "N4": "JLPT N4レベル：日常の基本会話（〜から、〜ので、〜たい、〜たことがある等）。丁寧語を基調とし、親しみやすく話すこと。",
    "N3": "JLPT N3レベル：より自然な日本語表現。場面に応じて丁寧語と普通形を自然に織り交ぜ、語彙の幅を広げて返答すること。",
    "N2": "JLPT N2/N1レベル：敬語（尊敬語・謙譲語）やビジネス表現、慣用句も含め、ネイティブに近い自然で豊かな表現を用いること。",
}


def build_kaiwa_system_prompt(
    level: str = "N4",
    topic: str = "free_talk",
    language: str = "ja-JP"
) -> str:
    """
    Tạo System Prompt tối ưu cho trợ lý luyện Kaiwa tiếng Nhật hoặc tiếng Việt.
    """
    if language == "vi-VN":
        return VOICE_SYSTEM_PROMPT

    topic_desc = TOPIC_PROMPTS.get(topic, TOPIC_PROMPTS["free_talk"])
    level_desc = LEVEL_GUIDELINES.get(level, LEVEL_GUIDELINES["N4"])

    return (
        "あなたは日本語会話（カイワ）練習パートナーの「あおい（Aoi）」です。親切で明るく、学習者の日本語会話の上達を温かくサポートします。\n\n"
        f"【シチュエーション】\n- {topic_desc}\n\n"
        f"【難易度・文法目安】\n- {level_desc}\n\n"
        "【絶対遵守のルール】\n"
        "1. すべて自然な日本語の話し言葉で返答してください。音声でテンポよく会話するため、1〜2文程度の簡潔な返答にします。\n"
        "2. 最後に必ず学習者が話し続けたくなるような質問や相槌を1つ入れてください。\n"
        "3. マークダウン（*、#、_、リスト等）、絵文字（emoji）、ルビやフリガナ表記は絶対に含めないでください。音声合成（TTS）がスムーズに読み上げられるプレーンテキストにしてください。\n"
        "4. 学習者が少し不自然な日本語を使っても会話を止めずに、自然な日本語で返しながら優しくリードしてください。"
    )


MAX_HISTORY_MESSAGES = 6  # Cửa sổ trượt: giữ tối đa 6 tin nhắn gần nhất (3 lượt trao đổi)


def trim_and_manage_context(
    messages: List[Dict[str, str]],
    existing_summary: Optional[str] = None,
    level: str = "N4",
    topic: str = "free_talk",
    language: str = "ja-JP"
) -> List[Dict[str, str]]:
    """
    Chiến lược quản lý Context Window:
    - Tạo System Prompt chuyên biệt cho Kaiwa theo level và topic.
    - Cắt tỉa theo Sliding Window để giảm token và latency.
    """
    formatted_messages: List[Dict[str, str]] = []

    system_content = build_kaiwa_system_prompt(level=level, topic=topic, language=language)
    if existing_summary:
        system_content += f"\n[前回の会話要約: {existing_summary}]"

    formatted_messages.append({"role": "system", "content": system_content})

    chat_history = [
        m for m in messages 
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]

    if len(chat_history) > MAX_HISTORY_MESSAGES:
        recent_history = chat_history[-MAX_HISTORY_MESSAGES:]
    else:
        recent_history = chat_history

    formatted_messages.extend(recent_history)
    return formatted_messages


def stream_voice_chat(
    messages: List[Dict[str, str]],
    summary: Optional[str] = None,
    api_key: Optional[str] = None,
    model: str = DEFAULT_MODEL,
    level: str = "N4",
    topic: str = "free_talk",
    language: str = "ja-JP"
) -> Generator[str, None, None]:
    """
    Gửi request streaming SSE tới OpenRouter API với model đã chọn.
    Trích xuất từng token `delta.content` và stream ngược lại cho client (React Native).
    """
    # Luôn đọc lại file .env với override=True để nhận key mới nhất mà không cần restart server thủ công
    load_dotenv(override=True)
    raw_key = api_key or os.getenv("OPENROUTER_API_KEY", "")
    effective_api_key = raw_key.strip().strip('"').strip("'")
    
    # Tự động loại bỏ chữ 'v' hoặc ký tự thừa ở cuối nếu người dùng lỡ bấm Cmd+V
    if effective_api_key.startswith("sk-or-v1-") and len(effective_api_key) == 74 and effective_api_key.endswith("v"):
        effective_api_key = effective_api_key[:-1]
    if not effective_api_key:
        err_msg = "Chưa cấu hình OPENROUTER_API_KEY trong backend/.env"
        yield f"data: {json.dumps({'error': err_msg, 'content': f'⚠️ {err_msg}'})}\n\n"
        yield "data: [DONE]\n\n"
        return

    prepared_messages = trim_and_manage_context(
        messages,
        existing_summary=summary,
        level=level,
        topic=topic,
        language=language
    )

    headers = {
        "Authorization": f"Bearer {effective_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://datn.local",
        "X-Title": "AI Kaiwa Japanese Assistant",
    }

    payload = {
        "model": model,
        "messages": prepared_messages,
        "stream": True,
        "temperature": 0.4,
        "max_tokens": 256,
        "reasoning": {"enabled": False, "exclude": True},
    }

    try:
        response = requests.post(
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            stream=True,
            timeout=30,
        )

        if response.status_code != 200:
            try:
                err_json = response.json()
                err_message = err_json.get("error", {}).get("message", response.text)
            except Exception:
                err_message = response.text
            err_msg = f"Lỗi OpenRouter ({response.status_code}): {err_message}"
            yield f"data: {json.dumps({'error': err_msg, 'content': f'⚠️ {err_msg}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        for line in response.iter_lines():
            if not line:
                continue
                
            line_str = line.decode("utf-8")
            if not line_str.startswith("data: "):
                continue

            data_str = line_str[6:].strip()
            if data_str == "[DONE]":
                yield "data: [DONE]\n\n"
                break

            try:
                parsed = json.loads(data_str)
                choices = parsed.get("choices", [])
                if not choices:
                    continue

                delta = choices[0].get("delta", {})
                content = delta.get("content")
                
                # Chỉ stream content văn bản thật sự, bỏ qua reasoning
                if content:
                    yield f"data: {json.dumps({'content': content})}\n\n"
            except json.JSONDecodeError:
                continue

    except Exception as e:
        err_msg = f"Lỗi kết nối OpenRouter: {str(e)}"
        yield f"data: {json.dumps({'error': err_msg, 'content': f'⚠️ {err_msg}'})}\n\n"
        yield "data: [DONE]\n\n"
