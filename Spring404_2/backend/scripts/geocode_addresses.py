import argparse
import csv
import os
import time
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


KAKAO_GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert address CSV data to lat/lng CSV data using Kakao geocoding."
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--address-column", required=True)
    parser.add_argument("--fallback-address-column")
    parser.add_argument("--encoding", default="utf-8-sig")
    parser.add_argument("--sleep", type=float, default=0.15)
    return parser.parse_args()


def geocode_address(address, api_key):
    headers = {"Authorization": f"KakaoAK {api_key}"}
    response = requests.get(
        KAKAO_GEOCODE_URL,
        headers=headers,
        params={"query": address},
        timeout=5,
    )
    response.raise_for_status()
    documents = response.json().get("documents", [])
    if not documents:
        return None

    first = documents[0]
    return {
        "lat": first["y"],
        "lng": first["x"],
        "matched_address": first.get("address_name", ""),
    }


def main():
    args = parse_args()
    api_key = os.getenv("KAKAO_REST_API_KEY")
    if not api_key:
        raise RuntimeError("KAKAO_REST_API_KEY is required")

    success_count = 0
    failed_count = 0

    with Path(args.input).open(newline="", encoding=args.encoding) as input_file:
        reader = csv.DictReader(input_file)
        fieldnames = list(reader.fieldnames or [])
        output_fieldnames = fieldnames + ["lat", "lng", "matched_address"]

        with Path(args.output).open("w", newline="", encoding="utf-8-sig") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=output_fieldnames)
            writer.writeheader()

            for row in reader:
                addresses = [(row.get(args.address_column) or "").strip()]
                if args.fallback_address_column:
                    addresses.append(
                        (row.get(args.fallback_address_column) or "").strip()
                    )
                addresses = [address for address in addresses if address]
                if not addresses:
                    failed_count += 1
                    continue

                result = None
                for address in addresses:
                    try:
                        result = geocode_address(address, api_key)
                    except requests.RequestException:
                        result = None

                    if result is not None:
                        break

                if result is None:
                    failed_count += 1
                    continue

                row.update(result)
                writer.writerow(row)
                success_count += 1
                time.sleep(args.sleep)

    print(f"success_count={success_count}")
    print(f"failed_count={failed_count}")


if __name__ == "__main__":
    main()
