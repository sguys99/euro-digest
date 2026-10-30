"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import type { CompId } from "@/lib/schema/common";
import { cx } from "@/lib/cx";

import { COMPETITION_SELECTED_TAB } from "./competition";

/**
 * Tabs — 같은 페이지 안의 패널 전환(WAI-ARIA Tabs 패턴) (DESIGN.md §9.2 Tabs · 대회 탭, D0-12)
 *
 * 하단 탭·상단 내비는 페이지 이동이라 ARIA 탭이 아니다 → `nav-tabs.tsx`(링크 + `aria-current`). 이 컴포넌트는 (D1) 순위
 * 미니의 대회 탭처럼 패널을 바꾸는 곳에만 쓴다.
 *
 * ```tsx
 * <Tabs defaultValue="EPL">
 *   <TabsList aria-label="순위 대회">
 *     <TabsTrigger value="EPL" competition="EPL">EPL</TabsTrigger>
 *     <TabsTrigger value="LALIGA" competition="LALIGA">라리가</TabsTrigger>
 *   </TabsList>
 *   <TabsPanel value="EPL">…</TabsPanel>
 *   <TabsPanel value="LALIGA">…</TabsPanel>
 * </Tabs>
 * ```
 *
 * 키보드(APG Tabs): 탭 목록 안에서 한 탭만 Tab 순서에 든다(roving tabindex — 선택된 탭). ←/→는 이전·다음(끝에서 처음으로
 * 돈다), Home/End는 처음·끝, 비활성 탭은 건너뛴다. 활성화 방식:
 * - `automatic`(기본): 화살표로 옮기면 바로 선택한다. 패널이 미리 렌더된 정적 데이터라 지연이 없다(APG 권장 조건).
 * - `manual`: 화살표는 포커스만 옮기고 Enter·Space(버튼 클릭)로 선택한다. 패널을 바꾸는 데 시간이 걸리면 쓴다.
 * 선택이 없을 때(`value`·`defaultValue`가 null — 견본·초기 상태)는 모든 탭이 Tab 순서에 든다. 선택 값이 있는데 그 탭이
 * 없거나(제어 `value`가 목록에 없는 값) 비활성이면 활성인 첫 탭(문서 순서)을 Tab 순서에 넣는다 — 탭 목록에 키보드로 들어갈
 * 수 없게 되지 않도록(APG). 이 보정은 탭이 마운트된 뒤(effect) 정해지므로 서버 HTML에는 없다.
 *
 * 모양: 최소 44×56px, 1px --ink-2, 13px 800 --ink. hover = 테두리 --ink + 면 --paper-2. 선택 = 대회 색 면·테두리 +
 * 면 위 글자, 포커스 링 --ink(탭 밖 지면에 그려진다). 비활성 = 점선 --ink-disabled. 색 면 전환은 base(DESIGN §6.2).
 * `aria-controls`는 짝 패널이 실제로 있을 때만 단다(없는 id를 가리키지 않게 — 패널이 마운트되면 등록).
 */

type Activation = "automatic" | "manual";

interface TabsContextValue {
  baseId: string;
  value: string | null;
  select: (value: string) => void;
  activation: Activation;
  panels: ReadonlySet<string>;
  registerPanel: (value: string) => () => void;
  /** 탭 등록(값 → 비활성 여부·요소). 선택 탭이 없거나 비활성일 때 Tab 순서에 넣을 탭을 고르는 데 쓴다 */
  registerTrigger: (
    value: string,
    disabled: boolean,
    node: HTMLElement,
  ) => () => void;
  /** 선택 탭 대신 Tab 순서에 드는 탭(활성인 첫 탭). 선택 탭이 활성으로 있거나 선택이 없으면(null) null */
  fallback: string | null;
}

interface TriggerEntry {
  disabled: boolean;
  node: HTMLElement;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`${component}는 <Tabs> 안에서만 쓴다`);
  return ctx;
}

/** id에 쓸 수 없는 글자를 바꾼다(값은 보통 대회 ID라 그대로 남는다) */
function idPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function tabId(baseId: string, value: string): string {
  return `${baseId}-tab-${idPart(value)}`;
}

function panelId(baseId: string, value: string): string {
  return `${baseId}-panel-${idPart(value)}`;
}

export interface TabsProps extends Omit<ComponentProps<"div">, "defaultValue"> {
  /** 제어 모드 선택 값(없으면 비제어). null = 선택 없음 */
  value?: string | null;
  /** 비제어 모드 처음 선택 값 */
  defaultValue?: string | null;
  onValueChange?: (value: string) => void;
  /** 화살표 키로 옮길 때 바로 선택할지(기본 automatic) */
  activation?: Activation;
}

export function Tabs({
  value,
  defaultValue = null,
  onValueChange,
  activation = "automatic",
  children,
  ...props
}: TabsProps) {
  const baseId = useId();
  const [uncontrolled, setUncontrolled] = useState<string | null>(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : uncontrolled;

  const select = useCallback(
    (next: string) => {
      if (!controlled) setUncontrolled(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );

  const [panels, setPanels] = useState<ReadonlySet<string>>(() => new Set());
  const registerPanel = useCallback((panel: string) => {
    setPanels((prev) => new Set(prev).add(panel));
    return () =>
      setPanels((prev) => {
        const next = new Set(prev);
        next.delete(panel);
        return next;
      });
  }, []);

  const [triggers, setTriggers] = useState<ReadonlyMap<string, TriggerEntry>>(
    () => new Map(),
  );
  const registerTrigger = useCallback(
    (trigger: string, disabled: boolean, node: HTMLElement) => {
      setTriggers((prev) => {
        const entry = prev.get(trigger);
        return entry?.disabled === disabled && entry.node === node
          ? prev
          : new Map(prev).set(trigger, { disabled, node });
      });
      return () =>
        setTriggers((prev) => {
          if (prev.get(trigger)?.node !== node) return prev;
          const next = new Map(prev);
          next.delete(trigger);
          return next;
        });
    },
    [],
  );

  // 선택 탭이 없거나 비활성이면 활성인 첫 탭(문서 순서)을 Tab 순서에 넣는다(APG — 탭 목록에 들어갈 수 있게).
  // 탭은 마운트 뒤 effect에서 등록되므로 서버 렌더·첫 렌더에서는 비어 있다(그때는 DOM을 읽지 않는다).
  const fallback = useMemo(() => {
    if (current === null) return null;
    const selected = triggers.get(current);
    if (selected && !selected.disabled) return null;
    const enabled = [...triggers]
      .filter(([, t]) => !t.disabled && t.node.isConnected)
      .sort(([, a], [, b]) =>
        a.node.compareDocumentPosition(b.node) &
        Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
    return enabled[0]?.[0] ?? null;
  }, [current, triggers]);

  const ctx = useMemo<TabsContextValue>(
    () => ({
      baseId,
      value: current,
      select,
      activation,
      panels,
      registerPanel,
      registerTrigger,
      fallback,
    }),
    [
      baseId,
      current,
      select,
      activation,
      panels,
      registerPanel,
      registerTrigger,
      fallback,
    ],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div {...props}>{children}</div>
    </TabsContext.Provider>
  );
}

/**
 * 탭 모양 — `box`(기본, 대회 탭·상자형 — DESIGN §9.2) · `view`(D1 대회 화면 보기 탭 — 글자 15px 800 `--ink-2`, 선택 `--ink` + 아래 3px
 * `--brand-accent` 막대, 목록 아래 1px `--rule`, 간격 16px · 최소 46px — DESIGN §9.3 대회 화면 틀, M2-10) · `grid`(D1 홈 리그 순위 미니 —
 * `box`와 같은 상자를 3열 격자에 채운다: 목록 `repeat(3, minmax(0,1fr))` 간격 4px, 탭 최소 폭 없음 · 좌우 4px — DESIGN §9.3 순위 미니, M2-15)
 */
export type TabsVariant = "box" | "view" | "grid";

/** 탭 목록(`role="tablist"`) — 접근 이름(`aria-label` 또는 `aria-labelledby`)을 꼭 준다 */
export function TabsList({
  className,
  onKeyDown,
  variant = "box",
  ...props
}: ComponentProps<"div"> & { variant?: TabsVariant }) {
  const ctx = useTabs("TabsList");

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const list = event.currentTarget;
    const tabs = Array.from(
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    ).filter((tab) => tab.closest('[role="tablist"]') === list);
    const index = tabs.indexOf(
      list.ownerDocument.activeElement as HTMLButtonElement,
    );
    if (index < 0 || tabs.length === 0) return;

    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    target.focus();
    const targetValue = target.dataset.value;
    if (ctx.activation === "automatic" && targetValue !== undefined) {
      ctx.select(targetValue);
    }
  }

  return (
    <div
      role="tablist"
      className={cx(
        variant === "view"
          ? "flex gap-4 border-b border-rule"
          : variant === "grid"
            ? "grid grid-cols-3 gap-1"
            : "flex flex-wrap gap-1",
        className,
      )}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export interface TabsTriggerProps extends Omit<
  ComponentProps<"button">,
  "value" | "role"
> {
  value: string;
  /** 대회 탭이면 선택 면을 그 대회 색으로. 없으면 잉크 면 반전(`box`만) */
  competition?: CompId;
  /** 모양(`TabsList`의 `variant`와 같은 값을 준다) */
  variant?: TabsVariant;
}

/** 보기 탭(`view`) — 글자 탭 + 선택 막대(DESIGN §9.3 대회 화면 틀) */
const VIEW_TAB = [
  "relative inline-flex min-h-11.5 min-w-11 flex-none items-center justify-center border-0 bg-transparent px-1 text-[15px] font-extrabold text-ink-2",
  "transition-colors duration-fast ease-print hover:text-ink aria-selected:text-ink",
  "after:absolute after:inset-x-0 after:-bottom-px after:hidden after:h-0.75 after:bg-brand-accent after:content-[''] aria-selected:after:block",
].join(" ");

export function TabsTrigger({
  value,
  competition,
  variant = "box",
  className,
  onClick,
  type = "button",
  disabled = false,
  ...props
}: TabsTriggerProps) {
  const ctx = useTabs("TabsTrigger");
  const { registerTrigger, baseId } = ctx;
  useEffect(() => {
    const node = document.getElementById(tabId(baseId, value));
    return node ? registerTrigger(value, disabled, node) : undefined;
  }, [registerTrigger, baseId, value, disabled]);
  const selected = ctx.value === value;
  // roving tabindex: 선택 탭 하나 — 선택이 없으면(null) 모두, 선택 탭이 없거나 비활성이면 활성인 첫 탭(fallback)
  const tabbable =
    (selected && !disabled) || ctx.value === null || ctx.fallback === value;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (!event.defaultPrevented) ctx.select(value);
  }

  return (
    <button
      type={type}
      role="tab"
      id={tabId(ctx.baseId, value)}
      aria-selected={selected}
      aria-controls={
        ctx.panels.has(value) ? panelId(ctx.baseId, value) : undefined
      }
      tabIndex={tabbable ? 0 : -1}
      disabled={disabled}
      data-value={value}
      className={cx(
        variant === "view"
          ? VIEW_TAB
          : cx(
              "relative inline-flex min-h-11 items-center justify-center border border-ink-2 bg-transparent text-[13px] font-extrabold text-ink",
              // 상자 크기 — 격자(순위 미니)는 칸 폭을 격자가 정한다
              variant === "grid" ? "min-w-0 px-1" : "min-w-14 px-2.5",
              "transition-colors duration-base ease-print",
              "hover:border-ink hover:bg-paper-2",
              "disabled:border-dashed disabled:border-ink-disabled disabled:bg-transparent disabled:text-ink-disabled",
              // 선택 — 색 면 위 포커스 링은 --ink(DESIGN §9.1)
              "aria-selected:[--ring:var(--ink)]",
              competition
                ? COMPETITION_SELECTED_TAB[competition]
                : "aria-selected:border-ink aria-selected:bg-ink aria-selected:text-paper",
            ),
        className,
      )}
      onClick={handleClick}
      {...props}
    />
  );
}

export interface TabsPanelProps extends ComponentProps<"div"> {
  value: string;
}

/** 탭 패널(`role="tabpanel"`) — 선택되지 않으면 `hidden`. 패널 안에 포커스할 것이 없을 수 있어 `tabIndex=0`(APG) */
export function TabsPanel({ value, ...props }: TabsPanelProps) {
  const ctx = useTabs("TabsPanel");
  const { registerPanel } = ctx;
  useEffect(() => registerPanel(value), [registerPanel, value]);
  return (
    <div
      role="tabpanel"
      id={panelId(ctx.baseId, value)}
      aria-labelledby={tabId(ctx.baseId, value)}
      hidden={ctx.value !== value}
      tabIndex={0}
      {...props}
    />
  );
}
