from pydantic import BaseModel, Field

class ReviewCreate(BaseModel):
    content: str
    lat: float
    lng: float
    user_score: int = Field(ge=0, le=5)


class PublicSafetyZoneCreate(BaseModel):
    zone_id: int
    cctv_count: int = Field(default=0, ge=0)
    lamp_count: int = Field(default=0, ge=0)
    public_safety_score: float = Field(ge=0.0, le=5.0)


class SafetyScoreRequest(BaseModel):
    zone_id: int
