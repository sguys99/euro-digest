/**
 * 아직 구현하지 않은 명령의 진입점 스텁이 쓰는 공용 헬퍼 (M0-04).
 *
 * 스텁은 "[TODO] <명령> — <구현 예정 작업 ID>에서 구현" 한 줄(+ 설명 한 줄)을 출력하고
 * 정상 종료(exit 0)한다. 작업 ID는 docs/plan.md의 체크리스트 ID를 그대로 쓴다.
 * 해당 작업에서 실제 구현으로 바꾸면 todo() 호출을 지운다.
 */

/** TODO 안내 문구를 만든다. 출력과 분리해 테스트할 수 있게 순수 함수로 둔다. */
export function formatTodo(
  command: string,
  plannedIn: string,
  note?: string,
): string {
  const head = `[TODO] ${command} — ${plannedIn}에서 구현`;
  return note ? `${head}\n       ${note}` : head;
}

/** TODO 안내 문구를 표준 출력에 남긴다. 프로세스는 종료하지 않는다(호출한 스텁이 자연 종료 → exit 0). */
export function todo(command: string, plannedIn: string, note?: string): void {
  console.log(formatTodo(command, plannedIn, note));
}
