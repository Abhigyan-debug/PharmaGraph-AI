import { useEffect, useRef, useState } from 'react';

// Jmol colours, the same scheme the viewer is told to use, so the key matches the model.
export const ATOM_COLORS = {
  C: '#909090',
  H: '#ffffff',
  O: '#ff0d0d',
  N: '#3050f8',
  S: '#ffff30',
  P: '#ff8000',
  F: '#90e050',
  Cl: '#1ff01f',
  Br: '#a62929',
  I: '#940094',
};

const STYLE = {
  stick: { radius: 0.14, colorscheme: 'Jmol' },
  sphere: { scale: 0.24, colorscheme: 'Jmol' },
};

// interactive=false for decorative models: 3Dmol would otherwise zoom on the wheel and swallow page scrolling.
function Molecule3D({ molblock, spin = false, label, interactive = true }) {
  const box = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = box.current;
    let viewer;
    let observer;
    let onVisibility;
    let cancelled = false;
    setFailed(false);

    // Loaded on demand so the 3D library is not part of the first page load.
    import('3dmol')
      .then((module) => {
        if (cancelled) return;
        const $3Dmol = module.createViewer ? module : module.default;
        viewer = $3Dmol.createViewer(element, { nomouse: !interactive });
        if (!viewer) throw new Error('WebGL unavailable');
        viewer.setBackgroundColor(0x000000, 0);
        viewer.addModel(molblock, 'sdf');
        viewer.setStyle({}, STYLE);
        viewer.zoomTo();
        viewer.render();
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!spin || reduceMotion) return;
        // 3Dmol re-measures the page on every spinning frame, so spin only while visible.
        let onScreen = false;
        const update = () => viewer.spin(onScreen && !document.hidden ? 'y' : false, 0.5);
        observer = new IntersectionObserver(([entry]) => {
          onScreen = entry.isIntersecting;
          update();
        });
        observer.observe(element);
        onVisibility = update;
        document.addEventListener('visibilitychange', onVisibility);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
      if (viewer) {
        viewer.spin(false);
        viewer.clear();
      }
      element.innerHTML = '';
    };
  }, [molblock, spin, interactive]);

  return (
    <div className="mol-3d" role="img" aria-label={label}>
      <div ref={box} className="mol-canvas" />
      {failed && <p className="hint mol-fallback">This browser can’t show the 3D model (WebGL is off).</p>}
    </div>
  );
}

export default Molecule3D;
