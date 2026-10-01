import os
from flask import Flask, jsonify, request, Response, stream_with_context, send_file
from flask_cors import CORS
from dotenv import load_dotenv

from services.llm_service import stream_voice_chat, trim_and_manage_context
from auth import init_auth
from learning import init_learning

load_dotenv()

app = Flask(__name__, static_folder=os.path.abspath(os.path.join(os.path.dirname(__file__), "static")))
# Cho phép CORS cho mọi nguồn trong môi trường dev / mobile
CORS(app, resources={r"/*": {"origins": "*"}})
init_auth(app)
init_learning(app)


@app.get("/")
def index():
    return jsonify({
        "status": "ok",
        "service": "Voice AI Backend",
        "openrouter_configured": bool(os.getenv("OPENROUTER_API_KEY")),
    })


@app.get("/api/assets/character/talking.glb")
def get_talking_glb():
    """
    Phục vụ file 3D character talking.glb (GLTF 2.0 Binary) cho Three.js GLTFLoader.
    Hỗ trợ HTTP 206 Partial Content (Range requests) cho iOS WebKit.
    """
    glb_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend/src/assets/characters/talking.glb"))
    if not os.path.exists(glb_path):
        return jsonify({"error": "Character GLB file not found"}), 404
    response = send_file(glb_path, mimetype="model/gltf-binary", as_attachment=False, conditional=True)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.get("/api/assets/character/talking.fbx")
def get_talking_fbx():
    """
    Fallback endpoint cho talking.fbx.
    """
    fbx_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend/src/assets/characters/talking.fbx"))
    if os.path.exists(fbx_path):
        response = send_file(fbx_path, mimetype="application/octet-stream", as_attachment=False, conditional=True)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Cache-Control"] = "public, max-age=86400"
        return response
@app.get("/view-character")
def view_character_page():
    """
    Trang web preview trực tiếp nhân vật 3D trên trình duyệt.
    """
    html = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Aoi 3D Character Preview</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; background: #1a1a24; overflow: hidden; font-family: sans-serif; color: #fff; }
    #info { position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(0,0,0,0.6); padding: 8px 14px; border-radius: 8px; font-size: 13px; }
    #canvas { width: 100vw; height: 100vh; display: block; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
  <div id="info">🌸 Aoi 3D Character Preview - <span id="status">Đang tải...</span></div>
  <div id="canvas"></div>
  <script>
    let scene, camera, renderer, mixer, clock, controls;
    function init() {
      clock = new THREE.Clock();
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x221c2b);

      camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 1.4, 1.6);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      document.getElementById('canvas').appendChild(renderer.domElement);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.25, 0);
      controls.update();

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xfffaed, 1.5);
      keyLight.position.set(2, 3, 2);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xe8f0fe, 0.8);
      fillLight.position.set(-2, 2, 2);
      scene.add(fillLight);

      const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
      grid.position.y = 0;
      scene.add(grid);

      const loader = new THREE.GLTFLoader();
      loader.load('/api/assets/character/talking.glb', function(gltf) {
        const model = gltf.scene;
        model.scale.set(1, 1, 1);
        model.position.set(0, 0, 0);
        model.rotation.set(0, 0, 0);

        model.traverse(function(child) {
          if (child.isMesh) {
            child.frustumCulled = false;
            if (child.material) {
              child.material.roughness = 0.55;
              child.material.metalness = 0.1;
              child.material.morphTargets = true;
              child.material.needsUpdate = true;
            }
            if (child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
              mouthMesh = child;
            } else if (child.geometry && child.geometry.morphAttributes && child.geometry.morphAttributes.position) {
              child.morphTargetInfluences = [0];
              mouthMesh = child;
            }
          }
        });

        document.getElementById('status').innerText = 'Đã tải xong Aoi 3D chuẩn tỉ lệ 1:1!';
        scene.add(model);

        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
        }

        controls.target.set(0, 1.25, 0);
        controls.update();
      }, function(xhr) {
        if (xhr.lengthComputable) {
          const p = Math.round((xhr.loaded / xhr.total) * 100);
          document.getElementById('status').innerText = 'Đang nạp: ' + p + '%';
        }
      }, function(err) {
        document.getElementById('status').innerText = 'Lỗi: ' + (err.message || 'Network');
      });

      window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
    }

    let mouthMesh = null;
    function animate() {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();
      if (mixer) mixer.update(delta);
      if (mouthMesh && mouthMesh.morphTargetInfluences) {
        const s1 = Math.sin(time * 16.0);
        const s2 = Math.cos(time * 8.5);
        const s3 = Math.sin(time * 24.0);
        const raw = s1 * 0.42 + s2 * 0.30 + s3 * 0.16 + 0.48;
        mouthMesh.morphTargetInfluences[0] = Math.max(0.0, Math.min(0.95, raw));
      }
      renderer.render(scene, camera);
    }

    init();
    animate();
  </script>
</body>
</html>"""
    return Response(html, mimetype="text/html")


@app.get("/api/character-view")
def api_character_view_embedded():
    """
    Endpoint phục vụ trực tiếp cho React Native WebView (nền trong suốt, đồng bộ postMessage, Auto-Scale).
    """
    html = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Aoi 3D</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #FAF8FC;
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
    }
    #canvas-container {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
    }
  </style>
  <!-- Nạp Three.js từ local server, fallback sang CDN -->
  <script src="/static/js/three.min.js"></script>
  <script src="/static/js/GLTFLoader.js"></script>
  <script>
    if (typeof THREE === 'undefined') {
      document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\\/script>');
    }
  </script>
  <script>
    if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader === 'undefined') {
      document.write('<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"><\\/script>');
    }
  </script>
</head>
<body>
  <div id="canvas-container"></div>
  <script>
    let scene, camera, renderer, mixer, action, clock, model;
    let isSpeaking = false;

    function reportToRN(data) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    // Bridge console logs lên React Native Metro
    ['log', 'info', 'warn', 'error'].forEach(function(level) {
      const orig = console[level];
      console[level] = function() {
        if (orig) orig.apply(console, arguments);
        try {
          const args = Array.prototype.slice.call(arguments);
          reportToRN({
            type: 'CONSOLE',
            level: level,
            text: args.map(function(a) {
              return typeof a === 'object' ? JSON.stringify(a) : String(a);
            }).join(' ')
          });
        } catch (e) {}
      };
    });

    window.onerror = function(msg, url, line) {
      reportToRN({ type: 'ERROR', message: 'JS Error: ' + msg + ' (line ' + line + ')' });
    };

    function init() {
      const container = document.getElementById('canvas-container');
      const width = container.clientWidth || window.innerWidth || 360;
      const height = container.clientHeight || window.innerHeight || 480;

      clock = new THREE.Clock();
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xFAF8FC);

      camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
      camera.position.set(0, 1.06, 2.60);
      camera.lookAt(0, 1.20, 0);

      // Khởi tạo WebGLRenderer với nền mờ đục chuẩn CoreAnimation
      const canvas = document.createElement('canvas');
      let gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        powerPreference: 'default'
      });
      if (!gl) {
        gl = canvas.getContext('webgl2', {
          alpha: false,
          antialias: false,
          powerPreference: 'default'
        });
      }

      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        context: gl,
        alpha: false,
        antialias: false
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      renderer.domElement.addEventListener('webglcontextlost', function(e) {
        e.preventDefault();
        reportToRN({ type: 'ERROR', message: 'WebGL Context Lost' });
      }, false);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xfffaed, 1.2);
      keyLight.position.set(1.8, 3.0, 2.0);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xe8f0fe, 0.8);
      fillLight.position.set(-1.8, 2.0, 1.8);
      scene.add(fillLight);

      const loader = new THREE.GLTFLoader();
      const glbUrl = '/api/assets/character/talking.glb?v=' + Date.now();
      reportToRN({ type: 'CONSOLE', level: 'info', text: '[3D] Bắt đầu nạp GLB: ' + glbUrl });

      loader.load(glbUrl, function(gltf) {
        reportToRN({ type: 'CONSOLE', level: 'info', text: '[3D] GLB tải thành công, áp dụng vật liệu tối ưu...' });
        model = gltf.scene;

        // Model gốc đã có kích thước chuẩn 1.60m với Armature 0.01 và xoay Y-up
        model.scale.set(1, 1, 1);
        model.position.set(0, 0, 0);
        model.rotation.set(0, 0, 0);

        model.traverse(function(child) {
          if (child.isMesh || child.isSkinnedMesh) {
            child.frustumCulled = false;
            if (child.material) {
              child.material.roughness = 0.55;
              child.material.metalness = 0.1;
              child.material.morphTargets = true;
              child.material.needsUpdate = true;
            }
            if (child.morphTargetInfluences && child.morphTargetInfluences.length > 0) {
              mouthMesh = child;
              reportToRN({ type: 'CONSOLE', level: 'info', text: '[3D] Đã kết nối miệng nhân vật (morphTarget: mouthOpen)' });
            } else if (child.geometry && child.geometry.morphAttributes && child.geometry.morphAttributes.position) {
              child.morphTargetInfluences = [0];
              mouthMesh = child;
              reportToRN({ type: 'CONSOLE', level: 'info', text: '[3D] Gán morphTargetInfluences từ morphAttributes' });
            }
          }
        });

        scene.add(model);

        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          action = mixer.clipAction(gltf.animations[0]);
          action.setLoop(THREE.LoopRepeat);
          action.play();
          action.timeScale = isSpeaking ? 1.0 : 0.05;
        }

        reportToRN({ type: 'LOADED' });
        reportToRN({ type: 'CONSOLE', level: 'info', text: '[3D] Hoàn tất hiển thị Aoi!' });
      }, function(xhr) {
        if (xhr.lengthComputable && xhr.total > 0) {
          const percent = Math.round((xhr.loaded / xhr.total) * 100);
          reportToRN({ type: 'PROGRESS', percent: percent });
        }
      }, function(err) {
        reportToRN({ type: 'ERROR', message: err.message || 'Lỗi tải mô hình GLB' });
      });

      // Cử chỉ chạm: 1 ngón vuốt xoay 360°, 2 ngón chụm phóng to/thu nhỏ (pinch-to-zoom)
      let isDragging = false;
      let prevX = 0;
      let initialPinchDist = 0;
      let initialCamZ = 2.60;

      function getDist(t1, t2) {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
      }

      window.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
          isDragging = true;
          prevX = e.touches[0].clientX;
        } else if (e.touches.length === 2) {
          isDragging = false;
          initialPinchDist = getDist(e.touches[0], e.touches[1]);
          initialCamZ = camera.position.z;
        }
      });
      window.addEventListener('touchmove', function(e) {
        if (isDragging && e.touches.length === 1 && model) {
          const deltaX = e.touches[0].clientX - prevX;
          prevX = e.touches[0].clientX;
          model.rotation.y += deltaX * 0.012;
        } else if (e.touches.length === 2) {
          const currentDist = getDist(e.touches[0], e.touches[1]);
          if (initialPinchDist > 0) {
            const zoomFactor = initialPinchDist / currentDist;
            const newZ = initialCamZ * zoomFactor;
            camera.position.z = Math.max(1.5, Math.min(3.8, newZ));
            camera.lookAt(0, 1.20, 0);
          }
        }
      });
      window.addEventListener('touchend', function() {
        isDragging = false;
        initialPinchDist = 0;
      });

      window.addEventListener('resize', function() {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      });
    }

    let mouthMesh = null;
    let mouthTargetWeight = 0;
    let mouthCurrentWeight = 0;

    function animate() {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      if (mixer) mixer.update(delta);

      // Cử động nhấp mở miệng theo nhịp điệu giọng nói tiếng Nhật
      if (mouthMesh && mouthMesh.morphTargetInfluences) {
        if (isSpeaking) {
          // Kết hợp các sóng điều chế tần số tự nhiên (âm tiết ~3Hz và ngữ điệu câu)
          const s1 = Math.sin(time * 17.0);
          const s2 = Math.cos(time * 9.0);
          const s3 = Math.sin(time * 25.0);
          const raw = s1 * 0.42 + s2 * 0.30 + s3 * 0.16 + 0.48;
          mouthTargetWeight = Math.max(0.0, Math.min(0.95, raw));
        } else {
          mouthTargetWeight = 0.0;
        }
        // Nội suy mượt mà (smooth lerp) tránh rung giật
        mouthCurrentWeight += (mouthTargetWeight - mouthCurrentWeight) * Math.min(1.0, delta * 24.0);
        mouthMesh.morphTargetInfluences[0] = mouthCurrentWeight;
      }

      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    }

    function handleMsg(event) {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'SET_SPEAKING') {
          isSpeaking = Boolean(data.isSpeaking);
          if (action) {
            action.timeScale = isSpeaking ? 1.0 : 0.05;
          }
        }
      } catch (e) {
        console.error('Lỗi parse message:', e);
      }
    }

    window.addEventListener('message', handleMsg);
    document.addEventListener('message', handleMsg);

    let isAppStarted = false;
    function startApp() {
      if (isAppStarted) return;
      if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') {
        isAppStarted = true;
        init();
        animate();
      } else {
        setTimeout(startApp, 50);
      }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      startApp();
    } else {
      window.addEventListener('DOMContentLoaded', startApp, { once: true });
      window.addEventListener('load', startApp, { once: true });
    }
  </script>
</body>
</html>"""
    response = Response(html, mimetype="text/html")
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response


@app.post("/api/chat/voice-stream")
def chat_voice_stream():
    """
    Endpoint SSE (Server-Sent Events) dành cho trò chuyện giọng nói.
    Payload JSON nhận vào:
      - messages: List[{role: "user" | "assistant", content: string}]
        HOẶC:
      - message: string (tin nhắn mới của user)
      - history: List[...] (lịch sử trò chuyện cũ)
      - summary: string (tùy chọn - bối cảnh nén từ các lượt đàm thoại trước)
      - model: string (tùy chọn - mặc định là nex-agi/nex-n2.5-pro:free)
    """
    data = request.get_json(silent=True) or {}
    
    messages = data.get("messages", [])
    if not messages:
        # Hỗ trợ format đơn giản { message: "...", history: [...] }
        user_message = data.get("message")
        history = data.get("history", [])
        if user_message:
            messages = list(history) + [{"role": "user", "content": user_message}]
            
    if not messages:
        return jsonify({"error": "No messages provided"}), 400

    summary = data.get("summary")
    model = data.get("model", "nex-agi/nex-n2.5-pro:free")
    api_key = data.get("api_key")  # Cho phép truyền key từ client nếu cần test
    level = data.get("level", "N4")
    topic = data.get("topic", "free_talk")
    language = data.get("language", "ja-JP")

    generator = stream_voice_chat(
        messages=messages,
        summary=summary,
        api_key=api_key,
        model=model,
        level=level,
        topic=topic,
        language=language
    )

    response = Response(stream_with_context(generator), mimetype="text/event-stream")
    # Headers cần thiết cho SSE và tránh proxy buffer dữ liệu
    response.headers["Cache-Control"] = "no-cache, no-transform"
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Connection"] = "keep-alive"
    return response


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(debug=os.getenv("FLASK_DEBUG") == "1", host="0.0.0.0", port=port)
