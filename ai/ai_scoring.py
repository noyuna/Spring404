import os
import json
from fastapi import FastAPI, BaseModel
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv

# 1. 환경 변수 및 OpenAI 초기화
load_dotenv()
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

app = FastAPI(title="HereJi AI Scoring API")

# 아림님 서버가 유나님 AI 서버에 접속할 수 있도록 CORS 개방
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================================
# 2. 아림님의 call_ai()가 쏘는 데이터 포맷 매핑 ({"review": text})
# =========================================================================
class ArimReviewInput(BaseModel):
    review: str


# =========================================================================
# 3. 유나님의 핵심 AI 분석 및 위험도 역산 알고리즘
# =========================================================================
def analyze_review_with_ai(review_text: str) -> float:
    system_instruction = (
        "당신은 CPTED(범죄예방환경설계) 전문가입니다. "
        "제공된 사용자 리뷰 텍스트의 문맥을 분석하여 해당 지역의 안전 점수를 산출하세요.\n\n"
        "점수 산출 기준 (1~5점 척도):\n"
        "- 5점: 매우 안전함 (가로등 밝음, 유동 인구 적당함, 시야 확보 원활 등)\n"
        "- 3점: 보통 (평범한 골목길, 특이사항 없음)\n"
        "- 1점: 매우 위험함 (조도 부족, 막다른 길, 우범 지역 징후 등)\n\n"
        "주의 사항:\n"
        "1. 사용자의 주관적인 감정 표현보다는 물리적 환경 단서에 집중하세요.\n"
        "2. 출력은 반드시 아래의 JSON 포맷으로만 답변하세요. 다른 설명은 일절 금지합니다.\n\n"
        'Output Format: {"ai_score": 3.5}'
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": f"리뷰 텍스트: '{review_text}'"}
            ],
            temperature=0.2
        )
        result = json.loads(response.choices[0].message.content)
        return float(result.get("ai_score", 3.0))
    except Exception:
        return 3.0


def apply_deterministic_penalties(review_text: str, ai_score: float) -> float:
    # 💡 아림님은 '위험도(danger_score)'를 원하므로 페널티 키워드가 등장하면 점수가 "올라가야" 합니다.
    penalty_keywords = {
        "취객": 0.5, "싸움": 0.5, "폭행": 1.0, "범죄": 1.0,
        "칼부림": 1.5, "바바리맨": 1.0, "스토킹": 1.0
    }
    
    # 5점 만점에서 안전 점수가 낮을수록 -> 기본 위험도가 높음
    base_danger_score = 5.0 - ai_score
    
    for keyword, penalty in penalty_keywords.items():
        if keyword in review_text:
            base_danger_score += penalty  # 위험 키워드가 있으면 위험도 증가!
            
    return max(0.0, min(base_danger_score, 5.0))


# =========================================================================
# 4. 아림님 서버와 찐으로 연결되는 앤드포인트 (/analyze)
# =========================================================================
@app.post("/analyze")
async def analyze_endpoint(payload: ArimReviewInput):
    print(f"📥 아림님 서버로부터 리뷰 수집 완료: '{payload.review[:20]}...'")
    
    # 1) 유나님 AI 모델 가동 (문맥 기반 안전 점수 산출)
    safety_score = analyze_review_with_ai(payload.review)
    
    # 2) 아림님 맞춤형 '위험도 점수(danger_score)'로 변환 및 키워드 가중치 적용
    final_danger_score = apply_deterministic_penalties(payload.review, safety_score)
    
    print(f"📤 연동 완료! 계산된 위험 점수(danger_score): {final_danger_score}")
    
    # 아림님이 기다리는 최종 JSON 구조 리턴
    return {"danger_score": final_danger_score}
