# 얼굴 탐지 도구

- MediaPipe Tasks Vision: `@mediapipe/tasks-vision` 버전 `0.10.32`.
- 배포처: https://registry.npmjs.org/@mediapipe/tasks-vision/0.10.32
- npm 배포 정보의 SHA-512 값과 내려받은 압축 파일을 대조한 후 필요한 실행 파일만 풀었다.
- 얼굴 탐지 모델: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
- 사용법: https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js
- 라이선스: Apache-2.0. 배포물의 저작권 표기와 `mediapipe/README.md`를 유지한다.
- 실행 중에는 위 배포처에 연결하지 않는다. 도구와 모델은 PC 내부 서버에서 읽으며, 서버의 연결 정책도 외부 요청을 차단한다.
