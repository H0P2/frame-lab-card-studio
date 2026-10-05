# Reproduce the real checks

The public package contains the exact editor source, actual reports, the first implementation with the observed long-text defect, and synthetic test fixtures without location metadata.

1. Unzip the source package. Run `python verification/make-gps-fixture.py` to make the synthetic GPS test input locally.
2. Run `node verification/serve-review.mjs` from the unzipped package. Open `http://127.0.0.1:8882/review/checks.html`.
3. Run the six check buttons one at a time and wait for each JSON result. Actual artifacts are saved to `verification/results/` and are also available as download links.

Use a fresh browser profile for the initial template test. The localhost test interface uses a separate IndexedDB database from normal editing. No simulated results are substituted for browser measurements.

For the original long-text defect, open `/review/before.html` and run the same long-text button. The first source is preserved under `verification/before/`.

The GPS fixture contains an intentionally synthetic location. It is generated only on the local machine and excluded from the public files. The normalized JPEG and final PNG are inspected separately in `evidence/metadata-check.json`.

Studio 검사는 같은 서버의 /review/studio-checks.html에서 실행합니다. 검사 버튼으로 실제 브라우저의 편집기·Canvas·IndexedDB와 영상 인코딩을 실행하고, 결과 링크를 내려받습니다. 새 기능은 localhost 전용 별도 검사 DB를 사용합니다. 새 편집 기능을 다시 확인하려면 새 편집·효과 검사 버튼을 누르세요. 색상은 Canvas 내부 상태가 아닌 실제 문구 영역의 RGB 픽셀로 검사합니다.
