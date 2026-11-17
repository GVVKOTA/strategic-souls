"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
export default function ScrollTabs({
  label,
  options,
  active,
  onChange,
}: {
  label: string;
  options: string[];
  active: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [bounds, setBounds] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setBounds({
        left: el.scrollLeft > 2,
        right: el.scrollWidth - el.clientWidth - el.scrollLeft > 2,
      });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update);
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);
  return (
    <div className="x2-scroll-tabs">
      <button
        aria-label="Previous tabs"
        disabled={!bounds.left}
        onClick={() =>
          ref.current?.scrollBy({ left: -160, behavior: "smooth" })
        }
      >
        <ChevronLeft size={16} />
      </button>
      <div ref={ref} className="x1-subnav" aria-label={label}>
        {options.map((value) => (
          <button
            key={value}
            aria-current={value === active ? "page" : undefined}
            onClick={(e) => {
              onChange(value);
              e.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            }}
          >
            {value === "Market Explorer" ? "Explorer" : value}
          </button>
        ))}
      </div>
      <button
        aria-label="More tabs"
        disabled={!bounds.right}
        onClick={() => ref.current?.scrollBy({ left: 160, behavior: "smooth" })}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
