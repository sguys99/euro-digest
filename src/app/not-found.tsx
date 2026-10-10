import Link from "next/link";

import { routes } from "@/lib/paths";

// 404 페이지 — 정적 export 시 out/404.html로 생성된다. 스타일은 D0 이후에 적용.
export default function NotFound() {
  return (
    <main>
      <h1>페이지를 찾을 수 없습니다</h1>
      <p>주소가 바뀌었거나 삭제된 페이지입니다.</p>
      <p>
        <Link href={routes.home()}>홈으로 돌아가기</Link>
      </p>
    </main>
  );
}
