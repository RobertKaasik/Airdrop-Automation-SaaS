import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const SPARK_COUNT = 8;

function AmbientLayers() {
  return (
    <div className="ax-ambient" aria-hidden="true">
      <div className="ax-ambient__grid" />
      <div className="ax-ambient__aurora ax-ambient__aurora--one" />
      <div className="ax-ambient__aurora ax-ambient__aurora--two" />
      <div className="ax-ambient__stars" />
      <div className="ax-ambient__noise" />
    </div>
  );
}

function ClickSparks() {
  const [bursts, setBursts] = useState([]);

  useEffect(() => {
    let sequence = 0;
    const createBurst = event => {
      if (event.button !== 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const id = ++sequence;
      setBursts(current => [...current.slice(-4), { id, x: event.clientX, y: event.clientY }]);
      window.setTimeout(() => {
        setBursts(current => current.filter(burst => burst.id !== id));
      }, 620);
    };
    window.addEventListener('pointerdown', createBurst, { passive: true });
    return () => window.removeEventListener('pointerdown', createBurst);
  }, []);

  return (
    <div className="ax-click-sparks" aria-hidden="true">
      {bursts.map(burst => (
        <span className="ax-click-sparks__burst" key={burst.id} style={{ left: burst.x, top: burst.y }}>
          {Array.from({ length: SPARK_COUNT }, (_, index) => (
            <i key={index} style={{ '--spark-angle': `${index * (360 / SPARK_COUNT)}deg` }} />
          ))}
        </span>
      ))}
    </div>
  );
}

function CursorLight() {
  useEffect(() => {
    let frame = 0;
    const update = event => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--cursor-x', `${event.clientX}px`);
        document.documentElement.style.setProperty('--cursor-y', `${event.clientY}px`);
        frame = 0;
      });
    };
    window.addEventListener('pointermove', update, { passive: true });
    return () => {
      window.removeEventListener('pointermove', update);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div className="ax-cursor-light" aria-hidden="true" />;
}

function AmbientUI() {
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    document.documentElement.classList.add('react-motion-ready');
    return () => document.documentElement.classList.remove('react-motion-ready');
  }, []);

  return (
    <>
      <AmbientLayers />
      {!reducedMotion && <CursorLight />}
      {!reducedMotion && <ClickSparks />}
    </>
  );
}

const rootNode = document.getElementById('react-ambient-root');
if (rootNode) createRoot(rootNode).render(<AmbientUI />);
