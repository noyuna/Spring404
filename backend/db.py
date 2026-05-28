import logging
import math
import os
from contextlib import contextmanager

import pymysql

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger(__name__)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "safety_db"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

REVIEW_WEIGHT = float(os.getenv("REVIEW_WEIGHT", "0.6"))
PUBLIC_WEIGHT = float(os.getenv("PUBLIC_WEIGHT", "0.4"))
PUBLIC_SCORE_BOOST = float(os.getenv("PUBLIC_SCORE_BOOST", "2.5"))
PUBLIC_SCORE_OFFSET = float(os.getenv("PUBLIC_SCORE_OFFSET", "0.35"))

HONGDAE_CENTER_LAT = float(os.getenv("HONGDAE_CENTER_LAT", "37.5572"))
HONGDAE_CENTER_LNG = float(os.getenv("HONGDAE_CENTER_LNG", "126.9245"))
GRID_RADIUS_KM = float(os.getenv("GRID_RADIUS_KM", "1.0"))
GRID_LAT_SIZE = float(os.getenv("GRID_LAT_SIZE", "0.0009"))
GRID_LNG_SIZE = float(os.getenv("GRID_LNG_SIZE", "0.0011"))

MIN_LAT = HONGDAE_CENTER_LAT - (GRID_RADIUS_KM / 111.0)
MAX_LAT = HONGDAE_CENTER_LAT + (GRID_RADIUS_KM / 111.0)
MIN_LNG = HONGDAE_CENTER_LNG - (
    GRID_RADIUS_KM / (111.0 * math.cos(math.radians(HONGDAE_CENTER_LAT)))
)
MAX_LNG = HONGDAE_CENTER_LNG + (
    GRID_RADIUS_KM / (111.0 * math.cos(math.radians(HONGDAE_CENTER_LAT)))
)
TOTAL_ROWS = math.ceil((MAX_LAT - MIN_LAT) / GRID_LAT_SIZE)
TOTAL_COLS = math.ceil((MAX_LNG - MIN_LNG) / GRID_LNG_SIZE)


def normalize_public_safety_score(score):
    if score is None:
        return 0.0

    raw_score = float(score)

    if raw_score > 5.0 and raw_score <= 100.0:
        raw_score = raw_score / 20.0

    base_score = max(0.0, min(raw_score, 5.0))
    if base_score == 0.0:
        return 0.0

    adjusted_score = (base_score * PUBLIC_SCORE_BOOST) + PUBLIC_SCORE_OFFSET
    return round(max(0.0, min(adjusted_score, 5.0)), 2)


@contextmanager
def get_connection():
    conn = pymysql.connect(**DB_CONFIG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        logger.exception("Database transaction failed")
        raise
    finally:
        conn.close()


def calculate_zone_id(lat, lng):
    if lat < MIN_LAT or lat >= MAX_LAT or lng < MIN_LNG or lng >= MAX_LNG:
        return None

    row_index = int((lat - MIN_LAT) / GRID_LAT_SIZE)
    col_index = int((lng - MIN_LNG) / GRID_LNG_SIZE)
    return (row_index * TOTAL_COLS) + col_index + 1


def build_safety_zones():
    zones = []
    for row_index in range(TOTAL_ROWS):
        for col_index in range(TOTAL_COLS):
            zone_id = (row_index * TOTAL_COLS) + col_index + 1
            min_lat = MIN_LAT + (row_index * GRID_LAT_SIZE)
            max_lat = min(min_lat + GRID_LAT_SIZE, MAX_LAT)
            min_lng = MIN_LNG + (col_index * GRID_LNG_SIZE)
            max_lng = min(min_lng + GRID_LNG_SIZE, MAX_LNG)
            zones.append(
                {
                    "zone_id": zone_id,
                    "row_index": row_index,
                    "col_index": col_index,
                    "min_lat": min_lat,
                    "max_lat": max_lat,
                    "min_lng": min_lng,
                    "max_lng": max_lng,
                }
            )
    return zones


def init_tables():
    safety_zone_sql = """
    CREATE TABLE IF NOT EXISTS safety_zone (
        zone_id INT PRIMARY KEY,
        row_index INT NOT NULL,
        col_index INT NOT NULL,
        min_lat DOUBLE NOT NULL,
        max_lat DOUBLE NOT NULL,
        min_lng DOUBLE NOT NULL,
        max_lng DOUBLE NOT NULL
    )
    """
    review_sql = """
    CREATE TABLE IF NOT EXISTS review (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content TEXT NOT NULL,
        zone_id INT NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        user_score INT NOT NULL,
        ai_score FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_review_zone_id (zone_id)
    )
    """
    public_safety_zone_sql = """
    CREATE TABLE IF NOT EXISTS public_safety_zone (
        zone_id INT PRIMARY KEY,
        cctv_count INT DEFAULT 0,
        lamp_count INT DEFAULT 0,
        convenience_count INT DEFAULT 0,
        public_safety_score FLOAT NOT NULL
    )
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(safety_zone_sql)
            cursor.execute(review_sql)
            cursor.execute(public_safety_zone_sql)
            cursor.execute(
                """
                SELECT COUNT(*) AS column_count
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'review'
                  AND COLUMN_NAME = 'zone_id'
                """
            )
            has_zone_id = cursor.fetchone()["column_count"] > 0
            if not has_zone_id:
                cursor.execute(
                    "ALTER TABLE review ADD COLUMN zone_id INT NOT NULL DEFAULT 0 AFTER content"
                )
                cursor.execute("CREATE INDEX idx_review_zone_id ON review (zone_id)")

            cursor.execute(
                """
                SELECT COUNT(*) AS column_count
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'public_safety_zone'
                  AND COLUMN_NAME = 'convenience_count'
                """
            )
            has_convenience_count = cursor.fetchone()["column_count"] > 0
            if not has_convenience_count:
                cursor.execute(
                    """
                    ALTER TABLE public_safety_zone
                    ADD COLUMN convenience_count INT DEFAULT 0 AFTER lamp_count
                    """
                )

            zones = build_safety_zones()
            cursor.executemany(
                """
                INSERT INTO safety_zone (
                    zone_id,
                    row_index,
                    col_index,
                    min_lat,
                    max_lat,
                    min_lng,
                    max_lng
                )
                VALUES (
                    %(zone_id)s,
                    %(row_index)s,
                    %(col_index)s,
                    %(min_lat)s,
                    %(max_lat)s,
                    %(min_lng)s,
                    %(max_lng)s
                )
                ON DUPLICATE KEY UPDATE
                    row_index = VALUES(row_index),
                    col_index = VALUES(col_index),
                    min_lat = VALUES(min_lat),
                    max_lat = VALUES(max_lat),
                    min_lng = VALUES(min_lng),
                    max_lng = VALUES(max_lng)
                """,
                zones,
            )


def save_review(review, ai_score):
    zone_id = calculate_zone_id(review.lat, review.lng)
    if zone_id is None:
        raise ValueError("Review location is outside the Hongdae safety map area")

    sql = """
    INSERT INTO review (content, zone_id, lat, lng, user_score, ai_score)
    VALUES (%s, %s, %s, %s, %s, %s)
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                sql,
                (
                    review.content,
                    zone_id,
                    review.lat,
                    review.lng,
                    review.user_score,
                    ai_score,
                ),
            )
    return zone_id


def get_reviews():
    sql = "SELECT content, zone_id, lat, lng, user_score, ai_score FROM review"
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            return cursor.fetchall()


def upsert_public_safety_zone(zone):
    sql = """
    INSERT INTO public_safety_zone (
        zone_id,
        cctv_count,
        lamp_count,
        convenience_count,
        public_safety_score
    )
    VALUES (%s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        cctv_count = VALUES(cctv_count),
        lamp_count = VALUES(lamp_count),
        convenience_count = VALUES(convenience_count),
        public_safety_score = VALUES(public_safety_score)
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                sql,
                (
                    zone.zone_id,
                    zone.cctv_count,
                    zone.lamp_count,
                    zone.convenience_count,
                    zone.public_safety_score,
                ),
            )


def get_public_safety_zone(zone_id):
    sql = """
    SELECT zone_id, cctv_count, lamp_count, convenience_count, public_safety_score
    FROM public_safety_zone
    WHERE zone_id = %s
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, (zone_id,))
            row = cursor.fetchone()

    if row is not None:
        row["public_safety_score"] = normalize_public_safety_score(
            row["public_safety_score"]
        )

    return row


def get_public_safety_zones():
    sql = """
    SELECT zone_id, cctv_count, lamp_count, convenience_count, public_safety_score
    FROM public_safety_zone
    ORDER BY zone_id
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()

    for row in rows:
        row["public_safety_score"] = normalize_public_safety_score(
            row["public_safety_score"]
        )

    return rows


def get_review_score_average(zone_id):
    sql = """
    SELECT AVG((user_score + ai_score) / 2) AS review_safety_score
    FROM review
    WHERE zone_id = %s
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, (zone_id,))
            row = cursor.fetchone()
            return row["review_safety_score"] if row else None


def calculate_safety_score(zone_id):
    public_zone = get_public_safety_zone(zone_id)
    if public_zone is None:
        public_zone = {
            "zone_id": zone_id,
            "cctv_count": 0,
            "lamp_count": 0,
            "convenience_count": 0,
            "public_safety_score": 0.0,
        }

    review_score = get_review_score_average(zone_id)
    public_score = normalize_public_safety_score(public_zone["public_safety_score"])

    if review_score is None:
        final_score = public_score
    else:
        final_score = (float(review_score) * REVIEW_WEIGHT) + (
            float(public_score) * PUBLIC_WEIGHT
        )

    return {
        "zone_id": zone_id,
        "review_safety_score": review_score,
        "public_safety_score": public_score,
        "final_safety_score": round(final_score, 2),
        "cctv_count": public_zone["cctv_count"],
        "lamp_count": public_zone["lamp_count"],
        "convenience_count": public_zone["convenience_count"],
    }


def get_map_zones():
    sql = """
    SELECT
        sz.zone_id,
        sz.row_index,
        sz.col_index,
        sz.min_lat,
        sz.max_lat,
        sz.min_lng,
        sz.max_lng,
        COALESCE(psz.cctv_count, 0) AS cctv_count,
        COALESCE(psz.lamp_count, 0) AS lamp_count,
        COALESCE(psz.convenience_count, 0) AS convenience_count,
        COALESCE(psz.public_safety_score, 0) AS public_safety_score,
        AVG((r.user_score + r.ai_score) / 2) AS review_safety_score
    FROM safety_zone sz
    LEFT JOIN public_safety_zone psz ON sz.zone_id = psz.zone_id
    LEFT JOIN review r ON sz.zone_id = r.zone_id
    GROUP BY
        sz.zone_id,
        sz.row_index,
        sz.col_index,
        sz.min_lat,
        sz.max_lat,
        sz.min_lng,
        sz.max_lng,
        psz.cctv_count,
        psz.lamp_count,
        psz.convenience_count,
        psz.public_safety_score
    ORDER BY sz.zone_id
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            zones = cursor.fetchall()

    for zone in zones:
        review_score = zone["review_safety_score"]
        public_score = normalize_public_safety_score(zone["public_safety_score"])
        zone["public_safety_score"] = public_score
        if review_score is None:
            final_score = public_score
        else:
            final_score = (float(review_score) * REVIEW_WEIGHT) + (
                public_score * PUBLIC_WEIGHT
            )
        zone["final_safety_score"] = round(final_score, 2)

    return zones
