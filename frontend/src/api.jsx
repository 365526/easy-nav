import { useEffect, useState } from "react";

// 서버(Render) 주소. 내 컴퓨터의 서버로 시험할 때는 frontend\.env.local 파일에
// VITE_API_URL=http://127.0.0.1:8000 한 줄을 적습니다.
export const API_URL = (import.meta.env.VITE_API_URL || "https://easy-nav-api.onrender.com").replace(/\/$/, "");

// 서버에서 JSON을 받아 옵니다. 주소나 입력값이 바뀌면 다시 받습니다.
// path에 null을 넣으면 아무것도 받지 않습니다. (예: 검색어를 아직 넣지 않았을 때)
export function useApi(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = path ? `${API_URL}${path}${query ? `?${query}` : ""}` : null;
  const [state, setState] = useState({ data: null, error: "", loading: Boolean(url), slow: false });

  useEffect(() => {
    if (!url) {
      setState({ data: null, error: "", loading: false, slow: false });
      return;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, error: "", loading: true, slow: false }));
    // 무료 서버는 잠들어 있으면 첫 응답까지 1분 정도 걸립니다. 4초가 넘으면 안내 문구를 보여 줍니다.
    const timer = setTimeout(() => setState((s) => ({ ...s, slow: true })), 4000);
    fetch(url, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`서버가 ${res.status} 오류를 돌려줬습니다.`);
        return res.json();
      })
      .then((data) => setState({ data, error: "", loading: false, slow: false }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        const message = err instanceof TypeError ? "서버에 연결하지 못했습니다." : err.message;
        setState({ data: null, error: message, loading: false, slow: false });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [url]);

  return state;
}

// 받아 오는 중이거나 실패했을 때 보여 줄 안내. slowText로 4초가 넘었을 때의 문구를 바꿀 수 있습니다.
export function LoadState({ loading, slow, error, slowText = "서버를 깨우는 중입니다. 처음 한 번은 1분 정도 걸릴 수 있습니다." }) {
  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-[#FF2E97]/60 bg-[#FF2E97]/10 px-4 py-3 text-[15px] leading-relaxed">
        {error}
        <br />
        잠시 뒤 새로고침해 주세요.
      </p>
    );
  }
  if (loading) {
    return (
      <p role="status" className="py-2 text-[15px] leading-relaxed text-[#A9A6D6]">
        자료를 불러오는 중입니다.
        {slow && (
          <>
            <br />
            {slowText}
          </>
        )}
      </p>
    );
  }
  return null;
}
