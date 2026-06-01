from pydantic import BaseModel, ConfigDict, Field

class ReviewCreate(BaseModel):
    content: str
    lat: float
    lng: float
    user_score: int = Field(ge=0, le=5)


class PublicSafetyZoneCreate(BaseModel):
    zone_id: int
    cctv_count: int = Field(default=0, ge=0)
    lamp_count: int = Field(default=0, ge=0)
    convenience_count: int = Field(default=0, ge=0)
    police_count: int = Field(default=0, ge=0)
    public_safety_score: float = Field(ge=0.0, le=5.0)


class SafetyScoreRequest(BaseModel):
    zone_id: int


class RoutePoint(BaseModel):
    lat: float
    lng: float


class RouteCandidate(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    path: list[RoutePoint]


class RouteSafetyRequest(BaseModel):
    routes: list[RouteCandidate]
