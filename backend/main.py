import logging
import os

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from db import (
    calculate_safety_score,
    calculate_zone_id,
    get_map_zones,
    get_public_safety_zone,
    get_public_safety_zones,
    get_reviews,
    init_tables,
    save_review,
    upsert_public_safety_zone,
)
from schemas import PublicSafetyZoneCreate, ReviewCreate

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

AI_URL = os.getenv("AI_URL", "http://localhost:8001/analyze")

app = FastAPI(title="HereJi Safety Map API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_tables()


@app.get("/health")
def health_check():
    return {"status": "ok"}


def call_ai(text):
    try:
        res = requests.post(AI_URL, json={"review": text}, timeout=3)
        res.raise_for_status()
        data = res.json()
        danger_score = float(data.get("danger_score") or 0)
        danger_score = max(0.0, min(danger_score, 5.0))
        return 5.0 - danger_score
    except Exception as e:
        logger.exception("AI review analysis failed: %s", e)
        return 0


@app.post("/review")
def create_review(review: ReviewCreate):
    ai_score = call_ai(review.content)

    try:
        zone_id = save_review(review, ai_score)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Failed to save review: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save review")

    return {
        "message": "saved",
        "data": {
            "content": review.content,
            "zone_id": zone_id,
            "lat": review.lat,
            "lng": review.lng,
            "user_score": review.user_score,
            "ai_score": ai_score,
        },
    }


@app.get("/reviews")
def read_reviews():
    try:
        return get_reviews()
    except Exception as e:
        logger.exception("Failed to read reviews: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read reviews")


@app.get("/zones/by-location")
def read_zone_by_location(lat: float, lng: float):
    zone_id = calculate_zone_id(lat, lng)
    if zone_id is None:
        raise HTTPException(status_code=404, detail="Location is outside the map area")
    return {"zone_id": zone_id, "lat": lat, "lng": lng}


@app.post("/public-safety-zones")
def save_public_safety_zone(zone: PublicSafetyZoneCreate):
    try:
        upsert_public_safety_zone(zone)
    except Exception as e:
        logger.exception("Failed to save public safety zone: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save public safety zone")

    return {"message": "saved", "data": zone}


@app.get("/public-safety-zones")
def read_public_safety_zones():
    try:
        return get_public_safety_zones()
    except Exception as e:
        logger.exception("Failed to read public safety zones: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read public safety zones")


@app.get("/public-safety-zones/{zone_id}")
def read_public_safety_zone(zone_id: int):
    try:
        zone = get_public_safety_zone(zone_id)
    except Exception as e:
        logger.exception("Failed to read public safety zone: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read public safety zone")

    if zone is None:
        raise HTTPException(status_code=404, detail="Public safety zone not found")

    return zone


@app.get("/map/zones")
def read_map_zones():
    try:
        return get_map_zones()
    except Exception as e:
        logger.exception("Failed to read map zones: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read map zones")


@app.get("/safety-score/{zone_id}")
def read_safety_score(zone_id: int):
    try:
        score = calculate_safety_score(zone_id)
    except Exception as e:
        logger.exception("Failed to calculate safety score: %s", e)
        raise HTTPException(status_code=500, detail="Failed to calculate safety score")

    if score is None:
        raise HTTPException(status_code=404, detail="Public safety zone not found")

    return score
