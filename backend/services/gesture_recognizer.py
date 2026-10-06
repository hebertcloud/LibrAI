import json
import math
import sqlite3
from pathlib import Path


DATABASE_PATH = Path(__file__).parents[1] / "lia.db"
LANDMARK_COUNT = 21
UNKNOWN_GLOSS = "GLOSA_DESCONHECIDA"


def _normalize(landmarks: list[dict[str, float]]) -> list[float]:
    if len(landmarks) != LANDMARK_COUNT:
        raise ValueError("O reconhecimento exige exatamente 21 landmarks.")

    wrist = landmarks[0]
    relative = [
        (
            float(point["x"]) - float(wrist["x"]),
            float(point["y"]) - float(wrist["y"]),
            float(point["z"]) - float(wrist["z"]),
        )
        for point in landmarks
    ]
    scale = math.sqrt(sum(value * value for value in relative[9]))
    if scale == 0:
        scale = 1.0
    return [coordinate / scale for point in relative for coordinate in point]


def _distance(first: list[float], second: list[float]) -> float:
    return math.sqrt(sum((left - right) ** 2 for left, right in zip(first, second)))


class GestureRecognizer:
    """Classifica landmarks comparando-os com exemplos rotulados do SQLite."""

    def __init__(self, database_path: Path = DATABASE_PATH) -> None:
        self.database_path = database_path

    def recognize(self, landmarks: list[dict[str, float]]) -> dict[str, object]:
        current = _normalize(landmarks)
        examples = self._load_examples()
        if not examples:
            return {"glosa": UNKNOWN_GLOSS, "confianca": 0.0, "distancia": None}

        closest_gloss, closest_distance = min(
            ((_gloss, _distance(current, vector)) for _gloss, vector in examples),
            key=lambda item: item[1],
        )
        confidence = max(0.0, min(1.0, 1.0 - closest_distance / 8.0))
        if confidence < 0.55:
            closest_gloss = UNKNOWN_GLOSS
        return {
            "glosa": closest_gloss,
            "confianca": round(confidence, 3),
            "distancia": round(closest_distance, 3),
        }

    def _load_examples(self) -> list[tuple[str, list[float]]]:
        if not self.database_path.exists():
            return []
        with sqlite3.connect(self.database_path) as connection:
            rows = connection.execute(
                """
                SELECT sinais.nome, exemplos_sinais.landmarks_json
                FROM exemplos_sinais
                JOIN sinais ON sinais.id = exemplos_sinais.sinal_id
                """
            ).fetchall()
        examples = []
        for name, serialized_landmarks in rows:
            try:
                examples.append((str(name).strip().upper(), _normalize(json.loads(serialized_landmarks))))
            except (TypeError, ValueError, KeyError, json.JSONDecodeError):
                continue
        return examples


recognizer = GestureRecognizer()
