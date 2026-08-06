"use client";

import { useEffect, useRef, useState } from "react";

// Disparador del fade-in de scroll de la landing (ver .reveal en
// globals.css). IntersectionObserver, no window.addEventListener("scroll",
// ...) — no corre en cada frame de scroll. once:true implícito: se
// desconecta en cuanto entra a vista, nunca vuelve a animar al hacer
// scroll de ida y vuelta (ver apple-design: la animación decorativa no
// debe repetirse en algo que el usuario ve varias veces).
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -80px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView } as const;
}
