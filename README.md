# easy-nav
정보영재교수학습프로그램개발 과제

지하철 혼잡도 기반 경로 추천 서비스

덜 붐비는 경로를 찾아 주는 웹 서비스입니다. 공공데이터의 지하철 혼잡도 정보를 활용해 경로를 추천합니다.

## 기술 구성

| 구분 | 사용 기술 |
| --- | --- |
| 화면 (frontend) | React, Vite |
| 서버 (backend) | Python, FastAPI |
| 데이터 | 공공데이터 API (확정 후 기재) |
| AI | LLM API (확정 후 기재) |
| 배포 | (확정 후 기재) |

## 폴더 구조

```
easy-nav/
├── backend/     # FastAPI 서버
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/    # React 화면
    ├── package.json
    └── src/
```

## 처음 시작하기

Git, Python, Node.js가 설치되어 있어야 합니다.

### 1. 저장소 받기

```bash
git clone https://github.com/365526/easy-nav.git
cd easy-nav
```

### 2. backend 실행

```bash
cd backend
python -m venv .venv
```

가상환경 켜기

- Windows: `.venv\Scripts\activate`
- Mac: `source .venv/bin/activate`

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

http://localhost:8000 에서 `{"status":"ok"}`가 보이면 정상입니다.

### 3. frontend 실행

새 터미널을 열고 실행합니다.

```bash
cd frontend
npm install
npm run dev
```

http://localhost:5173 에서 화면이 보이면 정상입니다.

### 4. API 키 설정

1. `backend/.env.example`을 복사해 같은 폴더에 `.env` 파일을 만듭니다.
2. 단체방에서 공유받은 키를 `.env`에 넣습니다.

`.env` 파일과 API 키는 절대 커밋하지 않습니다.

## 협업 규칙

### 작업 흐름

`main`에는 직접 push하지 않습니다. 항상 브랜치를 만들어 작업하고 PR로 병합합니다.

```bash
git switch main
git pull
git switch -c feature/기능명

# 작업 후
git add .
git commit -m "feat: 작업 내용"
git push -u origin feature/기능명
```

push한 뒤 GitHub에서 Pull Request를 만들고 병합합니다. 병합이 끝난 브랜치는 삭제합니다.

### 브랜치 이름

- `feature/기능명`: 새 기능 (예: `feature/route-search`)
- `fix/내용`: 오류 수정 (예: `fix/map-loading`)

### 커밋 메시지

| 머리말 | 용도 |
| --- | --- |
| `feat` | 새 기능 추가 |
| `fix` | 오류 수정 |
| `docs` | 문서 수정 |
| `style` | 화면 모양, 코드 형식 변경 |
| `chore` | 설정, 패키지 등 기타 작업 |

예: `feat: 경로 검색 화면 추가`

### 지켜야 할 것

- 작업을 시작하기 전에 `git pull`로 최신 내용을 받습니다.
- 담당 영역이 아닌 파일을 고칠 때는 단체방에 먼저 알립니다.
- 패키지를 새로 설치했다면 `requirements.txt` 또는 `package.json` 변경도 함께 커밋합니다.
- 큰 변경은 PR을 올린 뒤 단체방에 알리고 병합합니다.

## 역할 분담

| 이름 | 담당 | 주요 작업 |
| --- | --- | --- |
| (이름) | 개발 총괄 | 화면·서버 구현, LLM 연동, 배포, 저장소 관리 |
| (이름) | 기획·데이터 조사 | 서비스 기획, 공공데이터 API 조사 및 신청 |
| (이름) | 테스트 | 기능 점검, 오류 정리, 안내 문구 수정 |
| (이름) | 발표 | 발표 자료 제작, 시연 및 발표 |