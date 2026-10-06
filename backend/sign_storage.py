import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "lia.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS sinais (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL UNIQUE,
                categoria TEXT NOT NULL,
                criado_em TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS exemplos_sinais (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sinal_id INTEGER NOT NULL,
                landmarks_json TEXT NOT NULL,
                criado_em TEXT NOT NULL,
                FOREIGN KEY (sinal_id) REFERENCES sinais(id) ON DELETE CASCADE
            );
            """
        )


def create_sign(nome: str, categoria: str) -> dict[str, object]:
    now = datetime.now(timezone.utc).isoformat()
    try:
        with get_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO sinais (nome, categoria, criado_em) VALUES (?, ?, ?)",
                (nome.strip(), categoria.strip(), now),
            )
            return {"id": cursor.lastrowid, "nome": nome.strip(), "categoria": categoria.strip(), "exemplos": 0}
    except sqlite3.IntegrityError as error:
        raise ValueError("Ja existe um sinal com esse nome.") from error


def list_signs() -> list[dict[str, object]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT sinais.id, sinais.nome, sinais.categoria, COUNT(exemplos_sinais.id) AS exemplos
            FROM sinais LEFT JOIN exemplos_sinais ON exemplos_sinais.sinal_id = sinais.id
            GROUP BY sinais.id ORDER BY sinais.nome
            """
        ).fetchall()
        return [dict(row) for row in rows]


def add_example(sinal_id: int, landmarks: list[dict[str, float]]) -> int:
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as connection:
        sign = connection.execute("SELECT id FROM sinais WHERE id = ?", (sinal_id,)).fetchone()
        if sign is None:
            raise ValueError("Sinal nao encontrado.")
        cursor = connection.execute(
            "INSERT INTO exemplos_sinais (sinal_id, landmarks_json, criado_em) VALUES (?, ?, ?)",
            (sinal_id, json.dumps(landmarks), now),
        )
        return int(cursor.lastrowid)


initialize_database()
