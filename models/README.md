# models/

## pose_landmarker_full.task

Used only by **Grade my video** (`backend/grade.py`, `POST /api/grade`) to find the ankles, heels and toes of
the dancer in a phone video. The base game does not need it.

| | |
|---|---|
| Model | MediaPipe Pose Landmarker, **full** variant (float16): a pose detector plus a 33-point pose landmark model |
| Author | Google LLC (MediaPipe) |
| Licence | **Apache License 2.0**, full text in [`LICENSE-APACHE-2.0.txt`](LICENSE-APACHE-2.0.txt) |
| Source | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task |
| Model card | https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker (BlazePose GHUM 3D) |
| File | 9,398,198 bytes; SHA-256 `4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad` |
| Contents | a zip of `pose_detector.tflite` (2,959,046 bytes) and `pose_landmarks_detector.tflite` (6,438,874 bytes) |

It is redistributed here unmodified, as the Apache 2.0 licence allows, so the grader works offline straight
after `pip install -r requirements-video.txt`. Copyright for the model stays with Google LLC; this project's own
code is not covered by that licence.

## Privacy

Pose detection runs on this computer. Uploaded videos are written to a private temporary folder, read by the
grader, and deleted when grading ends (success or error); their names, frames and landmarks are never logged or
saved, and no AI model sees them. Per the MediaPipe Tasks privacy notice, MediaPipe does not send input images or
video to Google, but it may send anonymous performance and usage metrics about the API itself.
