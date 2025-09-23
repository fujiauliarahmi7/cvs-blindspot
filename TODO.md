# TODO: Implement Object Detection System

## Tasks
- [x] Update script.js to correctly process YOLO model output
- [x] Adjust detection drawing for correct scaling on canvas
- [x] Add logging for model output shape and debugging
- [x] Test the system by running the server and verifying detection
- [x] Add different colors for each class: Mobil (blue), PengendaraMotor (red), pejalan kaki (purple)

## Details
- Assume YOLO output format: [1, num_boxes, 8] where 8 = [x, y, w, h, conf, class0, class1, class2]
- Coordinates are normalized 0-1 for 480x480 input
- Canvas is 480x320, so scale y-coordinates by 320/480
- Model loaded from best_web_model/model.json
- Detection triggered by "Start Detection" button
- Server running on http://localhost:3000
- Camera stream proxied at /api/camera-stream
- If model output shape differs, check console logs and adjust processYOLOOutput accordingly
- Bounding boxes and labels now use class-specific colors
