import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DRAG_START_DISTANCE,
  SUPPRESS_CLICK_MS,
  dropSide,
  useDragReorder,
} from "./useDragReorder";

/** jsdom kent geen `PointerEvent`; een MouseEvent met `pointerId` volstaat. */
function pointer(
  type: string,
  x: number,
  y: number,
  pointerId = 1,
  button = 0,
): PointerEvent {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button,
    cancelable: true,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event as PointerEvent;
}

/** Een rij op (0, 0) van 200 px breed. */
const row = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 200 }),
} as unknown as HTMLElement;

function setup(target: string | null = "c") {
  const onReorder = vi.fn();
  const drag = useDragReorder({
    ids: () => ["a", "b", "c", "d"],
    onReorder,
    idAtPoint: () => target,
  });
  return { drag, onReorder };
}

describe("dropSide", () => {
  it("naar beneden → na het doel, naar boven → ervoor", () => {
    expect(dropSide(["a", "b", "c"], "a", "c")).toBe("after");
    expect(dropSide(["a", "b", "c"], "c", "a")).toBe("before");
  });
});

describe("useDragReorder (AGENTS.md §8.15)", () => {
  let current: ReturnType<typeof setup> | undefined;
  afterEach(async () => {
    current?.drag.dispose();
    // Laat het inslik-venster van een vorige sleep verlopen (test-isolatie).
    await new Promise((resolve) => setTimeout(resolve, SUPPRESS_CLICK_MS + 10));
  });

  it("slepen toont een kopie die de pointer volgt en herschikt bij loslaten", () => {
    current = setup("c");
    const { drag, onReorder } = current;
    const down = pointer("pointerdown", 20, 10);
    drag.onHandlePointerDown("a", down, row);
    expect(down.defaultPrevented).toBe(true);

    window.dispatchEvent(
      pointer("pointermove", 20, 10 + DRAG_START_DISTANCE - 1),
    );
    expect(drag.draggingId.value).toBeNull(); // nog onder de drempel

    window.dispatchEvent(pointer("pointermove", 25, 110));
    expect(drag.draggingId.value).toBe("a");
    expect(drag.ghost.value).toEqual({ left: 5, top: 100, width: 200 });
    expect(drag.overId.value).toBe("c");
    expect(drag.side.value).toBe("after");

    window.dispatchEvent(pointer("pointerup", 25, 110));
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a", "d"]);
    expect(drag.draggingId.value).toBeNull();
    expect(drag.ghost.value).toBeNull();
  });

  it("alleen tikken op het handvat herschikt niets en slikt geen klik in", () => {
    current = setup("c");
    const { drag, onReorder } = current;
    drag.onHandlePointerDown("a", pointer("pointerdown", 0, 0), row);
    window.dispatchEvent(pointer("pointerup", 0, 0));
    expect(onReorder).not.toHaveBeenCalled();

    const onClick = vi.fn();
    document.body.addEventListener("click", onClick);
    document.body.click();
    expect(onClick).toHaveBeenCalledOnce();
    document.body.removeEventListener("click", onClick);
  });

  it("slikt na een echte sleep de eerstvolgende klik in (geen lijst openen)", () => {
    current = setup("c");
    const { drag } = current;
    drag.onHandlePointerDown("a", pointer("pointerdown", 0, 0), row);
    window.dispatchEvent(pointer("pointermove", 0, 100));
    window.dispatchEvent(pointer("pointerup", 0, 100));

    const onClick = vi.fn();
    document.body.addEventListener("click", onClick);
    document.body.click();
    expect(onClick).not.toHaveBeenCalled();
    document.body.click();
    expect(onClick).toHaveBeenCalledOnce();
    document.body.removeEventListener("click", onClick);
  });

  it("ESC en pointercancel breken af zonder wijziging", () => {
    current = setup("c");
    const { drag, onReorder } = current;
    for (const abort of [
      () =>
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
      () => window.dispatchEvent(pointer("pointercancel", 0, 100)),
    ]) {
      drag.onHandlePointerDown("a", pointer("pointerdown", 0, 0), row);
      window.dispatchEvent(pointer("pointermove", 0, 100));
      expect(drag.ghost.value).not.toBeNull();
      abort();
      expect(drag.ghost.value).toBeNull();
      window.dispatchEvent(pointer("pointerup", 0, 100));
    }
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("geen doel, of boven zichzelf → geen herschikking", () => {
    current = setup("a");
    const { drag, onReorder } = current;
    drag.onHandlePointerDown("a", pointer("pointerdown", 0, 0), row);
    window.dispatchEvent(pointer("pointermove", 0, 100));
    expect(drag.overId.value).toBeNull();
    window.dispatchEvent(pointer("pointerup", 0, 100));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("negeert andere pointers en de rechtermuisknop", () => {
    current = setup("c");
    const { drag, onReorder } = current;
    drag.onHandlePointerDown("a", pointer("pointerdown", 0, 0, 1, 2), row);
    window.dispatchEvent(pointer("pointermove", 0, 100));
    expect(drag.draggingId.value).toBeNull();

    drag.onHandlePointerDown("a", pointer("pointerdown", 0, 0, 1), row);
    window.dispatchEvent(pointer("pointermove", 0, 100, 2)); // tweede vinger
    expect(drag.draggingId.value).toBeNull();
    window.dispatchEvent(pointer("pointerup", 0, 100, 2));
    expect(onReorder).not.toHaveBeenCalled();
  });
});
