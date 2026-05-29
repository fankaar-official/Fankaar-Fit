/**
 * EyeLeux Try-On Init Script
 * Lazy-loads heavy dependencies and orchestrates 3D View / Try-On modals.
 * 
 * Loaded via: {{ 'tryon-init.js' | asset_url | script_tag }}
 */

(function () {
  'use strict';

  // ─── State ─────────────────────────────────────────────────────────────────
  let modelViewerLoaded = false;
  let currentGlbUrl = null;
  let currentVariantTitle = null;

  // ─── Get container & current data ──────────────────────────────────────────
  function getContainer() {
    return document.getElementById('eyeleux-tryon-container');
  }

  function getCurrentGlbUrl() {
    return getContainer()?.dataset.glbUrl || '';
  }

  function getCurrentVariantTitle() {
    return getContainer()?.dataset.variantTitle || '';
  }

  function getProductTitle() {
    return window.__eyeleux?.productTitle || getContainer()?.dataset.productTitle || '';
  }

  // ─── Update buttons visibility based on GLB availability ───────────────────
  function updateButtonsVisibility(glbUrl) {
    const buttonsDiv = document.getElementById('eyeleux-buttons');
    const container = getContainer();
    if (!buttonsDiv || !container) return;

    const enabled = window.__eyeleux?.tryonEnabled === true;
    const hasGlb = Boolean(glbUrl && glbUrl.trim());

    if (enabled && hasGlb) {
      buttonsDiv.style.display = 'flex';
      document.getElementById('eyeleux-3d-btn').style.display = 'flex';
      document.getElementById('eyeleux-tryon-btn').style.display = 'flex';
    } else {
      buttonsDiv.style.display = 'none';
    }
  }

  // ─── Variant change handler ─────────────────────────────────────────────────
  function handleVariantChange(event) {
    const container = getContainer();
    if (!container) return;

    // Shopify fires "variant:change" with event.detail.variant
    const variant = event.detail?.variant;
    if (!variant) return;

    const variantId = String(variant.id);
    const glbUrl = window.__eyeleux?.variantGlbUrls?.[variantId] || '';

    // Update data attributes
    container.dataset.variantId = variantId;
    container.dataset.variantTitle = variant.title || '';
    container.dataset.glbUrl = glbUrl;

    updateButtonsVisibility(glbUrl);
  }

  // ─── Lazy load model-viewer ─────────────────────────────────────────────────
  function loadModelViewer() {
    return new Promise((resolve) => {
      if (modelViewerLoaded || customElements.get('model-viewer')) {
        modelViewerLoaded = true;
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
      script.onload = () => { modelViewerLoaded = true; resolve(); };
      script.onerror = () => resolve(); // Fail silently, model-viewer might still work
      document.head.appendChild(script);
    });
  }

  // ─── 3D View Modal ──────────────────────────────────────────────────────────
  async function open3DModal(glbUrl, productTitle, variantTitle) {
    await loadModelViewer();

    const modal = document.createElement('div');
    modal.id = 'eyeleux-3d-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `3D View – ${productTitle}`);
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(0, 0, 0, 0.95);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: eyeleuxFadeIn 0.2s ease;
    `;

    modal.innerHTML = `
      <style>
        @keyframes eyeleuxFadeIn { from { opacity: 0; } to { opacity: 1; } }
        #eyeleux-3d-modal model-viewer { width: 100%; height: 100%; }
      </style>

      <!-- Header -->
      <div style="
        position: absolute;
        top: 0; left: 0; right: 0;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
        z-index: 10;
      ">
        <div>
          <div style="color:#fff;font-weight:700;font-size:16px;">${escapeHtml(productTitle)}</div>
          <div style="color:rgba(255,255,255,0.7);font-size:13px;">${escapeHtml(variantTitle)}</div>
        </div>
        <button
          id="eyeleux-3d-close"
          aria-label="Close 3D view"
          style="
            background: rgba(255,255,255,0.15);
            border: none;
            color: #fff;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
            transition: background 0.2s;
          "
        >✕</button>
      </div>

      <!-- Model viewer -->
      <model-viewer
        id="eyeleux-mv"
        src="${escapeHtml(glbUrl)}"
        alt="3D view of ${escapeHtml(productTitle)} – ${escapeHtml(variantTitle)}"
        auto-rotate
        camera-controls
        shadow-intensity="1"
        environment-image="neutral"
        exposure="1"
        ar
        ar-modes="webxr scene-viewer quick-look"
        style="
          width: 100vw;
          height: 100vh;
          background: transparent;
        "
      ></model-viewer>

      <!-- AR button for mobile -->
      <button slot="ar-button" style="
        position: absolute;
        bottom: 24px;
        right: 24px;
        padding: 10px 18px;
        background: rgba(255,255,255,0.9);
        border: none;
        border-radius: 24px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
      ">📱 View in your space</button>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Close handlers
    const close = () => {
      modal.remove();
      document.body.style.overflow = '';
    };

    document.getElementById('eyeleux-3d-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    // ESC key
    const handleKey = (e) => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handleKey); }
    };
    document.addEventListener('keydown', handleKey);
  }

  // ─── Try-On Modal ───────────────────────────────────────────────────────────
  async function openTryOnModal(glbUrl, productTitle, variantTitle) {
    // Show loading modal immediately
    const modal = document.createElement('div');
    modal.id = 'eyeleux-tryon-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `Virtual Try-On – ${productTitle}`);
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: eyeleuxFadeIn 0.2s ease;
    `;

    modal.innerHTML = `
      <style>
        @keyframes eyeleuxFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes eyeleuxSpin { to { transform: rotate(360deg); } }
        #eyeleux-tryon-modal * { box-sizing: border-box; }
        #eyeleux-camera-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        #eyeleux-three-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        #eyeleux-loading-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.8);
          z-index: 20;
          gap: 16px;
        }
        #eyeleux-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: eyeleuxSpin 0.8s linear infinite;
        }
        #eyeleux-status-text {
          color: #fff;
          font-size: 14px;
          text-align: center;
          max-width: 260px;
        }
        #eyeleux-header {
          position: absolute;
          top: 0; left: 0; right: 0;
          padding: 16px 20px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          background: linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);
          z-index: 30;
          pointer-events: none;
        }
        #eyeleux-header button { pointer-events: all; }
        #eyeleux-footer {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
          z-index: 30;
        }
        #eyeleux-instruction {
          color: rgba(255,255,255,0.9);
          font-size: 14px;
          background: rgba(0,0,0,0.4);
          padding: 8px 16px;
          border-radius: 20px;
          text-align: center;
          transition: opacity 0.5s;
        }
        #eyeleux-tryon-close {
          background: rgba(255,255,255,0.15);
          border: none;
          color: #fff;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }
        #eyeleux-mirror-btn {
          background: rgba(255,255,255,0.15);
          border: 1px solid rgba(255,255,255,0.3);
          color: #fff;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 13px;
          cursor: pointer;
          backdrop-filter: blur(4px);
        }
        #eyeleux-error-overlay {
          position: absolute;
          inset: 0;
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.9);
          z-index: 40;
          gap: 16px;
          padding: 24px;
        }
        #eyeleux-error-overlay.visible { display: flex; }
        #eyeleux-error-msg {
          color: #fff;
          font-size: 15px;
          text-align: center;
          max-width: 300px;
        }
        #eyeleux-retry-btn {
          background: #fff;
          color: #000;
          border: none;
          padding: 10px 24px;
          border-radius: 24px;
          font-weight: 600;
          cursor: pointer;
        }
        /* Dev calibration slider */
        #eyeleux-calibration {
          position: absolute;
          bottom: 80px;
          left: 16px;
          z-index: 35;
          background: rgba(0,0,0,0.6);
          padding: 8px 12px;
          border-radius: 8px;
          display: none;
          gap: 8px;
          align-items: center;
        }
        #eyeleux-calibration.visible { display: flex; }
        #eyeleux-calibration label { color: #fff; font-size: 12px; }
        #eyeleux-calibration input { width: 100px; }
      </style>

      <!-- Camera canvas (video background) -->
      <canvas id="eyeleux-camera-canvas"></canvas>

      <!-- Three.js canvas (transparent overlay) -->
      <canvas id="eyeleux-three-canvas"></canvas>

      <!-- Loading overlay -->
      <div id="eyeleux-loading-overlay">
        <div id="eyeleux-spinner"></div>
        <div id="eyeleux-status-text">Initializing camera…</div>
      </div>

      <!-- Error overlay -->
      <div id="eyeleux-error-overlay">
        <div style="font-size:48px">⚠️</div>
        <div id="eyeleux-error-msg"></div>
        <button id="eyeleux-retry-btn">Try Again</button>
        <button id="eyeleux-close-error" style="color:rgba(255,255,255,0.6);background:none;border:none;cursor:pointer;font-size:13px;">Close</button>
      </div>

      <!-- Header -->
      <div id="eyeleux-header">
        <div>
          <div style="color:#fff;font-weight:700;font-size:15px;">${escapeHtml(productTitle)}</div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px;">${escapeHtml(variantTitle)}</div>
        </div>
        <button id="eyeleux-tryon-close" aria-label="Close try-on">✕</button>
      </div>

      <!-- Footer -->
      <div id="eyeleux-footer">
        <div id="eyeleux-instruction">📍 Position glasses on your face</div>
        <button id="eyeleux-mirror-btn">🔄 Mirror</button>
      </div>

      <!-- Dev calibration panel (toggle with triple-tap or "C" key) -->
      <div id="eyeleux-calibration">
        <label>Scale: <span id="eyeleux-cal-val">1.8</span></label>
        <input type="range" id="eyeleux-cal-slider" min="0.5" max="4.0" step="0.05" value="1.8">
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // ── Close handler ──────────────────────────────────────────────────────
    const closeModal = () => {
      if (window.__eyeleuxAR?.cleanup) window.__eyeleuxAR.cleanup();
      modal.remove();
      document.body.style.overflow = '';
    };

    document.getElementById('eyeleux-tryon-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    const handleEsc = (e) => {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleEsc); }
    };
    document.addEventListener('keydown', handleEsc);

    document.getElementById('eyeleux-close-error').addEventListener('click', closeModal);
    document.getElementById('eyeleux-retry-btn').addEventListener('click', () => {
      hideError();
      initAR();
    });

    // ── Mirror toggle ──────────────────────────────────────────────────────
    let mirrored = true;
    document.getElementById('eyeleux-mirror-btn').addEventListener('click', () => {
      mirrored = !mirrored;
      if (window.__eyeleuxAR?.setMirror) window.__eyeleuxAR.setMirror(mirrored);
    });

    // ── Calibration slider ─────────────────────────────────────────────────
    const calSlider = document.getElementById('eyeleux-cal-slider');
    const calVal = document.getElementById('eyeleux-cal-val');
    const savedCal = parseFloat(localStorage.getItem('eyeleux_cal') || '1.8');
    calSlider.value = savedCal;
    calVal.textContent = savedCal.toFixed(2);

    calSlider.addEventListener('input', () => {
      const v = parseFloat(calSlider.value);
      calVal.textContent = v.toFixed(2);
      localStorage.setItem('eyeleux_cal', String(v));
      if (window.__eyeleuxAR?.setCalibration) window.__eyeleuxAR.setCalibration(v);
    });

    // Toggle calibration panel: press "C" or triple-tap
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') {
        const panel = document.getElementById('eyeleux-calibration');
        if (panel) panel.classList.toggle('visible');
      }
    });

    // ── Status/error helpers ───────────────────────────────────────────────
    function setStatus(text) {
      const el = document.getElementById('eyeleux-status-text');
      if (el) el.textContent = text;
    }

    function showLoading(text) {
      const overlay = document.getElementById('eyeleux-loading-overlay');
      if (overlay) { overlay.style.display = 'flex'; setStatus(text || ''); }
    }

    function hideLoading() {
      const overlay = document.getElementById('eyeleux-loading-overlay');
      if (overlay) overlay.style.display = 'none';
    }

    function showError(msg) {
      hideLoading();
      const overlay = document.getElementById('eyeleux-error-overlay');
      const msgEl = document.getElementById('eyeleux-error-msg');
      if (overlay) overlay.classList.add('visible');
      if (msgEl) msgEl.textContent = msg;
    }

    function hideError() {
      const overlay = document.getElementById('eyeleux-error-overlay');
      if (overlay) overlay.classList.remove('visible');
    }

    // ── Load AR script ─────────────────────────────────────────────────────
    async function loadArScript() {
      if (window.EyeleuxAR) return;

      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Use the Shopify asset URL – this is injected by the liquid block context
        // The asset URL is set globally by the liquid template
        const arScriptUrl = document.querySelector('[data-eyeleux-ar-url]')?.dataset?.eyeleuxArUrl
          || window.__eyeleux?.arScriptUrl
          || (document.currentScript?.src || '').replace('tryon-init.js', 'tryon-ar.js');
        
        script.src = arScriptUrl;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load AR module'));
        document.head.appendChild(script);
      });
    }

    // ── Initialize AR ──────────────────────────────────────────────────────
    async function initAR() {
      showLoading('Initializing camera…');

      try {
        // Check camera permission first
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera not supported on this device or browser.');
        }

        showLoading('Loading AR modules…');
        await loadArScript();

        showLoading('Starting face tracking…');
        await window.EyeleuxAR.init({
          glbUrl,
          cameraCanvasId: 'eyeleux-camera-canvas',
          threeCanvasId: 'eyeleux-three-canvas',
          calibration: parseFloat(localStorage.getItem('eyeleux_cal') || '1.8'),
          onReady: () => {
            hideLoading();
            // Show instruction briefly
            const instruction = document.getElementById('eyeleux-instruction');
            if (instruction) {
              instruction.style.opacity = '1';
              // Hide after 4 seconds once face is detected (handled in AR module)
            }
          },
          onError: (err) => {
            showError(err);
          },
          onFaceDetected: () => {
            const instruction = document.getElementById('eyeleux-instruction');
            if (instruction) {
              // Fade out after 3 seconds
              setTimeout(() => { instruction.style.opacity = '0'; }, 3000);
            }
          },
          onNoFace: (secondsWithoutFace) => {
            const instruction = document.getElementById('eyeleux-instruction');
            if (instruction && secondsWithoutFace > 5) {
              instruction.textContent = '📍 Point camera at your face';
              instruction.style.opacity = '1';
            }
          },
        });
      } catch (err) {
        console.error('[EyeLeux] AR init error:', err);
        if (err.name === 'NotAllowedError' || err.message.includes('permission')) {
          showError('Camera access denied. Please allow camera access in your browser settings and try again.');
        } else if (err.name === 'NotFoundError') {
          showError('No camera found on this device.');
        } else {
          showError(err.message || 'Failed to start try-on. Please try again.');
        }
      }
    }

    // Start AR
    initAR();
  }

  // ─── Main init ──────────────────────────────────────────────────────────────
  function init() {
    const container = getContainer();
    if (!container) return;

    // Set up variant change listener
    document.addEventListener('variant:change', handleVariantChange);

    // Also listen to Shopify's section:rerender event
    document.addEventListener('section:rerender', () => {
      const glbUrl = getCurrentGlbUrl();
      updateButtonsVisibility(glbUrl);
    });

    // Bind button clicks
    const btn3D = document.getElementById('eyeleux-3d-btn');
    const btnTryOn = document.getElementById('eyeleux-tryon-btn');

    if (btn3D) {
      btn3D.addEventListener('click', () => {
        const glbUrl = getCurrentGlbUrl();
        if (!glbUrl) return;
        open3DModal(glbUrl, getProductTitle(), getCurrentVariantTitle());
      });
    }

    if (btnTryOn) {
      btnTryOn.addEventListener('click', () => {
        const glbUrl = getCurrentGlbUrl();
        if (!glbUrl) return;
        openTryOnModal(glbUrl, getProductTitle(), getCurrentVariantTitle());
      });
    }

    // Also handle Shopify's native variant selector change
    // Some themes dispatch 'change' on the variant select element
    const variantSelects = document.querySelectorAll('[name="id"]');
    variantSelects.forEach((select) => {
      select.addEventListener('change', () => {
        const variantId = String(select.value);
        const glbUrl = window.__eyeleux?.variantGlbUrls?.[variantId] || '';
        const cont = getContainer();
        if (cont) {
          cont.dataset.glbUrl = glbUrl;
          cont.dataset.variantId = variantId;
        }
        updateButtonsVisibility(glbUrl);
      });
    });
  }

  // ─── Utility ────────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Bootstrap ──────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
