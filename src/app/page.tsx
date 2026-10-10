import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// 임시 홈 — D0 디자인 시안 선택 전이므로 스타일 없이 시맨틱 마크업만 둔다.
export default function HomePage() {
  return (
    <main>
      <h1>{SITE_NAME}</h1>
      <p>{SITE_TAGLINE}</p>
      <p>준비 중입니다.</p>
    </main>
  );
}
