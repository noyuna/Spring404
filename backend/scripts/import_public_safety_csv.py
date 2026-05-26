import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from db import calculate_zone_id, get_connection, init_tables


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import CCTV or lamp CSV data into public_safety_zone."
    )
    parser.add_argument("--type", choices=["cctv", "lamp"], required=True)
    parser.add_argument("--file", required=True)
    parser.add_argument("--lat-column", required=True)
    parser.add_argument("--lng-column", required=True)
    parser.add_argument("--encoding", default="utf-8-sig")
    return parser.parse_args()


def calculate_public_safety_score(cctv_count, lamp_count):
    return min(5.0, (cctv_count * 0.25) + (lamp_count * 0.08))


def read_zone_counts(file_path, lat_column, lng_column, encoding):
    zone_counts = defaultdict(int)
    skipped_count = 0

    with Path(file_path).open(newline="", encoding=encoding) as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            try:
                lat = float(row[lat_column])
                lng = float(row[lng_column])
            except (KeyError, TypeError, ValueError):
                skipped_count += 1
                continue

            zone_id = calculate_zone_id(lat, lng)
            if zone_id is None:
                skipped_count += 1
                continue

            zone_counts[zone_id] += 1

    return zone_counts, skipped_count


def load_existing_public_safety_zones():
    sql = """
    SELECT zone_id, cctv_count, lamp_count
    FROM public_safety_zone
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()

    return {
        row["zone_id"]: {
            "cctv_count": row["cctv_count"],
            "lamp_count": row["lamp_count"],
        }
        for row in rows
    }


def upsert_counts(data_type, zone_counts):
    existing_rows = load_existing_public_safety_zones()
    changed_zone_ids = set(existing_rows.keys()) | set(zone_counts.keys())

    rows = []
    for zone_id in sorted(changed_zone_ids):
        existing = existing_rows.get(zone_id, {"cctv_count": 0, "lamp_count": 0})
        cctv_count = existing["cctv_count"]
        lamp_count = existing["lamp_count"]

        if data_type == "cctv":
            cctv_count = zone_counts.get(zone_id, 0)
        else:
            lamp_count = zone_counts.get(zone_id, 0)

        rows.append(
            {
                "zone_id": zone_id,
                "cctv_count": cctv_count,
                "lamp_count": lamp_count,
                "public_safety_score": calculate_public_safety_score(
                    cctv_count, lamp_count
                ),
            }
        )

    sql = """
    INSERT INTO public_safety_zone (
        zone_id,
        cctv_count,
        lamp_count,
        public_safety_score
    )
    VALUES (
        %(zone_id)s,
        %(cctv_count)s,
        %(lamp_count)s,
        %(public_safety_score)s
    )
    ON DUPLICATE KEY UPDATE
        cctv_count = VALUES(cctv_count),
        lamp_count = VALUES(lamp_count),
        public_safety_score = VALUES(public_safety_score)
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(sql, rows)

    return len(rows)


def main():
    args = parse_args()
    init_tables()
    zone_counts, skipped_count = read_zone_counts(
        args.file,
        args.lat_column,
        args.lng_column,
        args.encoding,
    )
    upserted_count = upsert_counts(args.type, zone_counts)

    print(f"loaded_zones={len(zone_counts)}")
    print(f"upserted_zones={upserted_count}")
    print(f"skipped_rows={skipped_count}")


if __name__ == "__main__":
    main()
