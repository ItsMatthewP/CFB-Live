"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function Header() {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Dim the page when modal is open (CSS class toggles opacity on .container)
  useEffect(() => {
    const root = document.querySelector(".container");
    if (!root) return;
    if (open) {
      root.classList.add("dimmed");
    } else {
      root.classList.remove("dimmed");
    }
    return () => root.classList.remove("dimmed");
  }, [open]);

  // Close when clicking outside modal (i.e., on the overlay itself)
  const onOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) setOpen(false);
    },
    []
  );

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand-row">
            <h1 className="brand-title">CFB Live</h1>
            <span className="brand-sep">–</span>
            <a
              href="#"
              className="header-link"
              onClick={(e) => {
                e.preventDefault();
                setOpen(true);
              }}
              role="button"
            >
              By ItsMatthewP
            </a>
          </div>
        </div>
      </header>

      {open && (
        <div
          ref={overlayRef}
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
          onClick={onOverlayClick}
        >
          <div
            className="modal card"
            onClick={(e) => e.stopPropagation()} // clicks inside modal don't close it
          >
            <button
              className="x modal-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>

            <h2 id="about-title" className="game-title" style={{ marginBottom: 8 }}>
              CFB Live – About
            </h2>
            <p className="game-sub" style={{ fontWeight: 700 }}>
              {/* Intentionally left blank for now */}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
