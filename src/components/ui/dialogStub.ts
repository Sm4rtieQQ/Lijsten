/**
 * Alleen voor specs: jsdom kent `showModal()`/`close()` van `<dialog>` niet.
 * De stub zet en verwijdert het `open`-attribuut zoals de browser, en
 * `close()` vuurt het `close`-event. Geeft een functie terug die opruimt.
 */
export function stubDialog(): () => void {
  const proto = HTMLDialogElement.prototype;
  const original = {
    showModal: proto.showModal,
    close: proto.close,
  };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  if (!("open" in proto)) {
    Object.defineProperty(proto, "open", {
      configurable: true,
      get(this: HTMLDialogElement) {
        return this.hasAttribute("open");
      },
    });
  }
  return () => {
    proto.showModal = original.showModal;
    proto.close = original.close;
  };
}
