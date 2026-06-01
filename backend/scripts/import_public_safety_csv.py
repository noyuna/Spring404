import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from db import calculate_zone_id, get_connection, init_tables


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import safety facility CSV data into public_safety_zone."
    )
    parser.add_argument("--type", choices=["cctv", "lamp", "convenience", "police"])
    parser.add_argument("--file", required=True)
    parser.add_argument("--type-column", default="type")
    parser.add_argument("--lat-column", required=True)
    parser.add_argument("--lng-column", required=True)
    parser.add_argument("--encoding", default="utf-8-sig")
    parser.add_argument("--sheet")
    args = parser.parse_args()
    if not args.type and not args.type_column:
        parser.error("--type or --type-column is required")
    return args


def calculate_public_safety_score(
    cctv_count, lamp_count, convenience_count, police_count
):
    return min(
        5.0,
        (cctv_count * 0.25)
        + (lamp_count * 0.08)
        + (convenience_count * 0.12)
        + (police_count * 1.5),
    )


def normalize_type(value):
    normalized = (value or "").strip().lower()
    aliases = {
        "cctv": "cctv",
        "camera": "cctv",
        "lamp": "lamp",
        "light": "lamp",
        "streetlight": "lamp",
        "security_light": "lamp",
        "보안등": "lamp",
        "가로등": "lamp",
        "convenience": "convenience",
        "convenience_store": "convenience",
        "store": "convenience",
        "편의점": "convenience",
        "police": "police",
        "police_station": "police",
        "station": "police",
        "경찰서": "police",
        "파출소": "police",
        "지구대": "police",
    }
    return aliases.get(normalized)


def read_rows(file_path, encoding, sheet_name):
    path = Path(file_path)
    if path.suffix.lower() in {".xlsx", ".xlsm"}:
        try:
            import openpyxl
        except ImportError as exc:
            raise RuntimeError(
                "openpyxl is required to import Excel files. "
                "Install backend requirements first."
            ) from exc

        workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            worksheet = workbook[sheet_name] if sheet_name else workbook.active
            rows = worksheet.iter_rows(values_only=True)
            headers = next(rows, None)
            if not headers:
                return []

            normalized_headers = [str(header).strip() for header in headers]
            return [
                dict(zip(normalized_headers, row))
                for row in rows
                if any(value is not None for value in row)
            ]
        finally:
            workbook.close()

    with path.open(newline="", encoding=encoding) as csv_file:
        return list(csv.DictReader(csv_file))


def read_zone_counts(
    file_path,
    default_type,
    type_column,
    lat_column,
    lng_column,
    encoding,
    sheet_name,
):
    zone_counts_by_type = {
        "cctv": defaultdict(int),
        "lamp": defaultdict(int),
        "convenience": defaultdict(int),
        "police": defaultdict(int),
    }
    skipped_count = 0

    for row in read_rows(file_path, encoding, sheet_name):
        facility_type = default_type or normalize_type(row.get(type_column))
        if facility_type not in zone_counts_by_type:
            skipped_count += 1
            continue

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

        zone_counts_by_type[facility_type][zone_id] += 1

    return zone_counts_by_type, skipped_count


def load_existing_public_safety_zones():
    sql = """
    SELECT zone_id, cctv_count, lamp_count, convenience_count, police_count
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
            "convenience_count": row["convenience_count"],
            "police_count": row["police_count"],
        }
        for row in rows
    }


def upsert_counts(zone_counts_by_type):
    existing_rows = load_existing_public_safety_zones()
    changed_zone_ids = set(existing_rows.keys())
    for zone_counts in zone_counts_by_type.values():
        changed_zone_ids |= set(zone_counts.keys())

    rows = []
    for zone_id in sorted(changed_zone_ids):
        cctv_count = zone_counts_by_type["cctv"].get(zone_id)
        lamp_count = zone_counts_by_type["lamp"].get(zone_id)
        convenience_count = zone_counts_by_type["convenience"].get(zone_id)
        police_count = zone_counts_by_type["police"].get(zone_id)

        if (
            cctv_count is None
            or lamp_count is None
            or convenience_count is None
            or police_count is None
        ):
            existing = existing_rows.get(
                zone_id,
                {
                    "cctv_count": 0,
                    "lamp_count": 0,
                    "convenience_count": 0,
                    "police_count": 0,
                },
            )
            if cctv_count is None:
                cctv_count = existing["cctv_count"]
            if lamp_count is None:
                lamp_count = existing["lamp_count"]
            if convenience_count is None:
                convenience_count = existing["convenience_count"]
            if police_count is None:
                police_count = existing["police_count"]

        rows.append(
            {
                "zone_id": zone_id,
                "cctv_count": cctv_count,
                "lamp_count": lamp_count,
                "convenience_count": convenience_count,
                "police_count": police_count,
                "public_safety_score": calculate_public_safety_score(
                    cctv_count, lamp_count, convenience_count, police_count
                ),
            }
        )

    sql = """
    INSERT INTO public_safety_zone (
        zone_id,
        cctv_count,
        lamp_count,
        convenience_count,
        police_count,
        public_safety_score
    )
    VALUES (
        %(zone_id)s,
        %(cctv_count)s,
        %(lamp_count)s,
        %(convenience_count)s,
        %(police_count)s,
        %(public_safety_score)s
    )
    ON DUPLICATE KEY UPDATE
        cctv_count = VALUES(cctv_count),
        lamp_count = VALUES(lamp_count),
        convenience_count = VALUES(convenience_count),
        police_count = VALUES(police_count),
        public_safety_score = VALUES(public_safety_score)
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(sql, rows)

    return len(rows)


def main():
    args = parse_args()
    init_tables()
    zone_counts_by_type, skipped_count = read_zone_counts(
        args.file,
        args.type,
        args.type_column,
        args.lat_column,
        args.lng_column,
        args.encoding,
        args.sheet,
    )
    upserted_count = upsert_counts(zone_counts_by_type)

    print(f"loaded_cctv_zones={len(zone_counts_by_type['cctv'])}")
    print(f"loaded_lamp_zones={len(zone_counts_by_type['lamp'])}")
    print(f"loaded_convenience_zones={len(zone_counts_by_type['convenience'])}")
    print(f"loaded_police_zones={len(zone_counts_by_type['police'])}")
    print(f"upserted_zones={upserted_count}")
    print(f"skipped_rows={skipped_count}")


if __name__ == "__main__":
    main()
