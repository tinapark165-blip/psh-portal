// Browser smoke check: initialize the real local model against a blank canvas.
// This page never requests camera access.
import { createForestServer } from './server.mjs';
const server = createForestServer();
const serve = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', (request, response) => {
  if (request.url !== '/browser-check') { serve(request, response); return; }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; object-src 'none'"
  });
  response.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>달빛 숲 · 브라우저 확인</title>
    <style>body{margin:0;background:#061416;color:#d9e9de;font:13px sans-serif}iframe{border:0;width:100vw;height:calc(100vh - 40px)}p{margin:0;height:40px;display:grid;place-items:center}</style>
    <iframe src="/" title="달빛 숲 화면"></iframe><p id="result" role="status">얼굴 탐지 도구 확인 중… 웹캠은 사용하지 않습니다.</p>
    <script type="module">
      const result = document.getElementById('result');
      try {
        const { FaceDetector, FilesetResolver } = await import('/vendor/mediapipe/vision_bundle.mjs');
        const files = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
        const detector = await FaceDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/vendor/mediapipe/blaze_face_short_range.tflite', delegate: 'CPU' },
          runningMode: 'VIDEO', minDetectionConfidence: .6
        });
        const image = document.createElement('canvas'); image.width = 640; image.height = 480;
        image.getContext('2d').fillRect(0, 0, 640, 480);
        const faces = detector.detectForVideo(image, performance.now()).detections;
        if (faces.length !== 0) throw new Error('Unexpected detection on blank image');
        detector.close();
        result.textContent = 'PASS · 로컬 얼굴 탐지 도구 실행 성공 · 실제 카메라 사용 없음';
      } catch(error) { result.textContent = 'FAIL · ' + error.message; console.error(error); }
    </script></html>`);
});
server.listen(4188, '127.0.0.1', () => console.log('Browser check: http://127.0.0.1:4188/browser-check'));
