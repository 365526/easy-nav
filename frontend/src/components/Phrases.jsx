// 제목 줄바꿈: "가장 붐비는 순간은/이 정도입니다"처럼 "/"로 나눈 구절은 중간에서 끊기지 않고,
//  화면이 좁으면 "/" 자리에서만 줄이 바뀝니다.
export default function Phrases({ text }) {
  const parts = String(text).split("/");
  return parts.map((p, i) => (
    <span key={i}>
      <span className="inline-block">{p}</span>
      {i < parts.length - 1 && " "}
    </span>
  ));
}
