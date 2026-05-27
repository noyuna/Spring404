import os
import json
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv

# 환경변수(.env) 자동 로드 및 OpenAI 클라이언트 초기화
load_dotenv()
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# FastAPI 애플리케이션 객체 생성
app = FastAPI(title="HereJi AI Scoring API")

# [CORS 설정] 아림님 서버 및 프론트엔드 통신 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================================
# GPT-4o-mini 문맥 분석 함수 (기존 유나님 핵심 로직)
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
    except Exception as e:
        print(f"🔗 OpenAI API 호출 에러 (기본값 3.0 반환): {e}")
        return 3.0


# =========================================================================
# "/analyze" 주소로 POST 요청이 오면 실행되는 핵심 연동 라우터
# =========================================================================
@app.post("/analyze")
async def analyze_review(request: Request):
    try:
        # 1. 아림님이 보낸 JSON 데이터 읽기 ({"review": text})
        data = await request.json()
        user_review = data.get("review") 
        
        print(f"📥 아림님 서버로부터 수신된 리뷰: {user_review}")

        if not user_review:
            return {"danger_score": 0.0}

        # 2. 1단계: OpenAI GPT 모델을 돌려서 문맥 기반 안전 점수(1~5점) 획득
        ai_safety_score = analyze_review_with_ai(user_review)
        print(f"🤖 GPT가 분석한 1차 안전 점수: {ai_safety_score}")

        # 3. 2단계: 아림님이 원하는 '위험도(Danger Score)'로 역산 기준 세우기
        # (안전 점수가 5점 만점에 1점이면 -> 기본 위험도는 4점이 됨)
        calculated_danger_score = 5.0 - ai_safety_score

        # 4. 3단계: 확정적 패널티 키워드 감지 (위험도가 올라가야 하므로 여기서는 + 플러스 처리)
        penalty_keywords = {
            "취객": 0.5, "싸움": 0.5, "폭행": 1.0, 
            "범죄": 1.0, "칼부림": 1.5, "바바리맨": 1.0, "스토킹": 1.0
        }

        for word, penalty in penalty_keywords.items():
            if word in user_review:
                # 위험 단어 발견 시 위험도 점수를 가산
                calculated_danger_score = min(5.0, calculated_danger_score + penalty)
                print(f"🚨 감지된 위험 단어: {word} -> 현재 위험 점수: {calculated_danger_score}")

        # 5. 아림님 서버가 기다리는 포맷으로 최종 위험도 점수 반환
        print(f"📤 아림님 백엔드로 전송할 최종 danger_score: {calculated_danger_score}")
        return {"danger_score": calculated_danger_score}

    except Exception as e:
        print(f"에러 발생: {e}")
        return {"danger_score": 0.0}


# 이 파일이 메인으로 실행될 때 서버 가동
if __name__ == "__main__":
    # 아림님 소스코드에 하드코딩된 포트 8001번으로 서버 구동
    uvicorn.run(app, host="0.0.0.0", port=8001)
