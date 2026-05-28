import json
import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

app = FastAPI(title="HereJi AI Scoring API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReviewInput(BaseModel):
    review: str


class RoutePoint(BaseModel):
    lat: float
    lng: float


class RouteInput(BaseModel):
    id: str
    path: list[RoutePoint]


class ZoneInput(BaseModel):
    zone_id: int
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float
    final_safety_score: float


class RouteRankInput(BaseModel):
    routes: list[RouteInput]
    zones: list[ZoneInput]


def clamp_score(score: float) -> float:
    return max(0.0, min(float(score), 5.0))


def analyze_review_with_ai(review_text: str) -> float:
    system_instruction = (
        "You are a CPTED safety expert. Analyze the user's place review and "
        "return only JSON. Score physical safety from 1 to 5, where 5 is very "
        'safe and 1 is very unsafe. Output format: {"ai_score": 3.5}'
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": review_text},
            ],
            temperature=0.2,
        )
        result = json.loads(response.choices[0].message.content)
        return clamp_score(result.get("ai_score", 3.0))
    except Exception as e:
        print(f"OpenAI review analysis failed, using default score 3.0: {e}")
        return 3.0


def apply_keyword_penalties(review_text: str, ai_score: float) -> float:
    danger_score = 5.0 - clamp_score(ai_score)
    penalty_keywords = {
        "취객": 0.5,
        "술취": 0.5,
        "폭행": 1.0,
        "범죄": 1.0,
        "칼부림": 1.5,
        "바바리맨": 1.0,
        "스토킹": 1.0,
        "어두": 0.5,
        "무서": 0.5,
    }

    for keyword, penalty in penalty_keywords.items():
        if keyword in review_text:
            danger_score += penalty

    return clamp_score(danger_score)


@app.post("/analyze")
async def analyze_endpoint(payload: ReviewInput):
    ai_score = analyze_review_with_ai(payload.review)
    danger_score = apply_keyword_penalties(payload.review, ai_score)
    return {"ai_score": round(5.0 - danger_score, 2), "danger_score": round(danger_score, 2)}


def find_zone_id_for_point(point: RoutePoint, zones: list[ZoneInput]) -> int | None:
    for zone in zones:
        if (
            zone.min_lat <= point.lat < zone.max_lat
            and zone.min_lng <= point.lng < zone.max_lng
        ):
            return zone.zone_id

    return None


@app.post("/rank-routes")
async def rank_routes(payload: RouteRankInput):
    zone_scores = {
        zone.zone_id: clamp_score(zone.final_safety_score)
        for zone in payload.zones
    }
    ranked_routes = []

    for route in payload.routes:
        zone_ids = []
        seen_zone_ids = set()

        for point in route.path:
            zone_id = find_zone_id_for_point(point, payload.zones)
            if zone_id is not None and zone_id not in seen_zone_ids:
                seen_zone_ids.add(zone_id)
                zone_ids.append(zone_id)

        total_score = sum(zone_scores.get(zone_id, 0.0) for zone_id in zone_ids)
        average_score = total_score / len(zone_ids) if zone_ids else 0.0

        ranked_routes.append(
            {
                "id": route.id,
                "zoneIds": zone_ids,
                "totalSafetyScore": round(total_score, 2),
                "safetyScore": round(average_score, 2),
            }
        )

    ranked_routes.sort(
        key=lambda route: (route["safetyScore"], route["totalSafetyScore"]),
        reverse=True,
    )
    return {"routes": ranked_routes}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
