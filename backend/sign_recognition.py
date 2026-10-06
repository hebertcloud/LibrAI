import base64
import binascii
from dataclasses import dataclass
from pathlib import Path
from urllib.request import urlretrieve

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_PATH = Path(__file__).parent / "models" / "hand_landmarker.task"


@dataclass
class RecognitionResult:
    sinal: str
    confianca: float
    landmarks: list[dict[str, float]]


class SignRecognizer:
    def __init__(self) -> None:
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not MODEL_PATH.exists():
            urlretrieve(MODEL_URL, MODEL_PATH)

        options = vision.HandLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(MODEL_PATH)),
            running_mode=vision.RunningMode.IMAGE,
            num_hands=1,
            min_hand_detection_confidence=0.45,
            min_hand_presence_confidence=0.45,
            min_tracking_confidence=0.45,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)

    def recognize_base64(self, image_data: str) -> RecognitionResult:
        encoded_image = image_data.split(",", 1)[-1]
        try:
            image_bytes = base64.b64decode(encoded_image, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError("Imagem Base64 invalida.") from error

        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Nao foi possivel decodificar a imagem da camera.")

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        result = self._landmarker.detect(mp_image)
        if not result.hand_landmarks:
            return RecognitionResult("nenhum sinal detectado", 0.0, [])

        hand = result.hand_landmarks[0]
        landmarks = [
            {"x": point.x, "y": point.y, "z": point.z}
            for point in hand
        ]
        sinal, confianca = self._classify_static_gesture(landmarks)
        return RecognitionResult(sinal, confianca, landmarks)

    @staticmethod
    def _classify_static_gesture(
        landmarks: list[dict[str, float]],
    ) -> tuple[str, float]:
        finger_tips = (8, 12, 16, 20)
        finger_pips = (6, 10, 14, 18)
        extended_fingers = sum(
            landmarks[tip]["y"] < landmarks[pip]["y"]
            for tip, pip in zip(finger_tips, finger_pips)
        )

        if extended_fingers == 0:
            return "punho fechado", 0.72
        if extended_fingers == 4:
            return "mao aberta", 0.72
        if extended_fingers == 1 and landmarks[8]["y"] < landmarks[6]["y"]:
            return "apontar", 0.66
        return "gesto nao classificado", 0.35


recognizer = SignRecognizer()
