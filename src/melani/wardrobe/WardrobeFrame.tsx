import "./wardrobe-frame.css";

export function WardrobeFrame() {
  return (
    <section className="wardrobe-frame-shell" aria-label="Wardrobe">
      <iframe
        className="wardrobe-frame"
        src="/wardrobe/"
        title="Wardrobe"
        allow="clipboard-read; clipboard-write"
      />
    </section>
  );
}
