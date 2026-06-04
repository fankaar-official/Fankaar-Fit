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

  // ─── Get variants with GLB files ───────────────────────────────────────────
  function getVariantsWithGlb() {
    const variants = window.__eyeleux?.variants || [];
    return variants.filter(function(v) { return v.glbUrl && v.glbUrl.trim(); });
  }

  // ─── Update buttons visibility based on GLB availability ───────────────────
  function updateButtonsVisibility(glbUrl) {
    var buttonsDiv = document.getElementById('eyeleux-buttons');
    var container = getContainer();
    if (!buttonsDiv || !container) return;

    var enabled = String(window.__eyeleux?.tryonEnabled) === 'true';
    var hasGlb = Boolean(glbUrl && glbUrl.trim());

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
    var container = getContainer();
    if (!container) return;

    // Shopify fires "variant:change" with event.detail.variant
    var variant = event.detail?.variant;
    if (!variant) return;

    var variantId = String(variant.id);
    var glbUrl = window.__eyeleux?.variantGlbUrls?.[variantId] || '';

    // Update data attributes
    container.dataset.variantId = variantId;
    container.dataset.variantTitle = variant.title || '';
    container.dataset.glbUrl = glbUrl;

    updateButtonsVisibility(glbUrl);
  }

  // ─── Lazy load model-viewer ─────────────────────────────────────────────────
  function loadModelViewer() {
    return new Promise(function(resolve) {
      if (modelViewerLoaded || customElements.get('model-viewer')) {
        modelViewerLoaded = true;
        resolve();
        return;
      }
      var script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
      script.onload = function() { modelViewerLoaded = true; resolve(); };
      script.onerror = function() { resolve(); }; // Fail silently
      document.head.appendChild(script);
    });
  }

  // ─── Build variant carousel HTML ───────────────────────────────────────────
  function buildVariantCarouselHTML(activeGlbUrl) {
    var variants = getVariantsWithGlb();
    if (variants.length <= 1) return '';

    var items = '';
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var isActive = (v.glbUrl === activeGlbUrl);
      items += '<button class="eyeleux-carousel-item' + (isActive ? ' active' : '') + '" '
        + 'data-glb-url="' + escapeHtml(v.glbUrl) + '" '
        + 'data-variant-title="' + escapeHtml(v.title) + '" '
        + 'data-variant-id="' + escapeHtml(v.id) + '" '
        + 'aria-label="Switch to ' + escapeHtml(v.title) + '"'
        + '>'
        + '<img src="' + escapeHtml(v.image) + '" style="width:100%;height:100%;object-fit:cover;border-radius:10px;pointer-events:none;" alt="' + escapeHtml(v.title) + '">'
        + '<span class="eyeleux-carousel-label">' + escapeHtml(v.title) + '</span>'
        + '</button>';
    }

    return '<div class="eyeleux-carousel-wrapper">'
      + '<div class="eyeleux-carousel-track">'
      + items
      + '</div>'
      + '</div>';
  }

  // ─── Carousel CSS ──────────────────────────────────────────────────────────
  function getCarouselCSS() {
    return ''
      + '.eyeleux-carousel-wrapper {'
      + '  position: absolute;'
      + '  bottom: 0; left: 0; right: 0;'
      + '  z-index: 25;'
      + '  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%);'
      + '  padding: 24px 80px 32px 80px;'
      + '}'
      + '.eyeleux-carousel-track {'
      + '  display: flex;'
      + '  gap: 10px;'
      + '  overflow-x: auto;'
      + '  scroll-behavior: smooth;'
      + '  -webkit-overflow-scrolling: touch;'
      + '  scrollbar-width: none;'
      + '  justify-content: center;'
      + '  padding: 4px 0;'
      + '}'
      + '.eyeleux-carousel-track::-webkit-scrollbar { display: none; }'
      + '.eyeleux-carousel-item {'
      + '  flex: 0 0 auto;'
      + '  width: 72px;'
      + '  height: 72px;'
      + '  border-radius: 12px;'
      + '  border: 2px solid rgba(255,255,255,0.2);'
      + '  background: rgba(255,255,255,0.08);'
      + '  cursor: pointer;'
      + '  position: relative;'
      + '  overflow: hidden;'
      + '  transition: all 0.2s ease;'
      + '  padding: 0;'
      + '  display: flex;'
      + '  flex-direction: column;'
      + '  align-items: center;'
      + '}'
      + '.eyeleux-carousel-item:hover {'
      + '  border-color: rgba(255,255,255,0.5);'
      + '  background: rgba(255,255,255,0.15);'
      + '  transform: translateY(-2px);'
      + '}'
      + '.eyeleux-carousel-item.active {'
      + '  border-color: #fff;'
      + '  background: rgba(255,255,255,0.18);'
      + '  box-shadow: 0 0 12px rgba(255,255,255,0.25);'
      + '}'
      + '.eyeleux-carousel-label {'
      + '  position: absolute;'
      + '  bottom: 2px;'
      + '  left: 2px; right: 2px;'
      + '  font-size: 9px;'
      + '  color: rgba(255,255,255,0.85);'
      + '  text-align: center;'
      + '  white-space: nowrap;'
      + '  overflow: hidden;'
      + '  text-overflow: ellipsis;'
      + '  background: rgba(0,0,0,0.5);'
      + '  border-radius: 0 0 10px 10px;'
      + '  padding: 1px 4px;'
      + '  line-height: 1.3;'
      + '}';
  }

  // ─── 3D View Modal ──────────────────────────────────────────────────────────
  async function open3DModal(glbUrl, productTitle, variantTitle) {
    await loadModelViewer();

    var carouselHTML = buildVariantCarouselHTML(glbUrl);

    var modal = document.createElement('div');
    modal.id = 'eyeleux-3d-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '3D View \u2013 ' + productTitle);
    modal.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;animation:eyeleuxFadeIn 0.2s ease;';

    modal.innerHTML = ''
      + '<style>'
      + '@keyframes eyeleuxFadeIn { from { opacity: 0; } to { opacity: 1; } }'
      + '@keyframes eyeleuxSpin { 100% { transform: rotate(360deg); } }'
      + '#eyeleux-3d-modal model-viewer#eyeleux-mv { width: 100%; height: 100%; }'
      + '#eyeleux-3d-modal .hide { display: none !important; }'
      + getCarouselCSS()
      + '</style>'

      // Header
      + '<div style="position:absolute;top:0;left:0;right:0;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.8),transparent);z-index:10;">'
      + '<div>'
      + '<div style="color:#fff;font-weight:700;font-size:16px;">' + escapeHtml(productTitle) + '</div>'
      + '<div id="eyeleux-3d-variant-label" style="color:rgba(255,255,255,0.7);font-size:13px;">' + escapeHtml(variantTitle) + '</div>'
      + '</div>'
      + '<button id="eyeleux-3d-close" aria-label="Close 3D view" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:40px;height:40px;min-width:40px;min-height:40px;padding:0;margin:0;box-sizing:border-box;line-height:1;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:background 0.2s;">✕</button>'
      + '</div>'

      // Model viewer
      + '<model-viewer id="eyeleux-mv" src="' + escapeHtml(glbUrl) + '" alt="3D view of ' + escapeHtml(productTitle) + '" orientation="180deg 0 0" camera-orbit="180deg 75deg 105%" auto-rotate camera-controls shadow-intensity="1" environment-image="neutral" exposure="1" ar ar-modes="webxr scene-viewer quick-look" style="width:100vw;height:100vh;background:transparent;">'
      + '  <div slot="progress-bar" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-weight:600;font-size:14px;background:rgba(0,0,0,0.6);padding:10px 20px;border-radius:20px;display:flex;align-items:center;gap:10px;backdrop-filter:blur(4px);">'
      + '    <svg style="width:18px;height:18px;animation:eyeleuxSpin 1s linear infinite;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"></circle></svg>'
      + '    Loading Model...'
      + '  </div>'
      + '</model-viewer>'

      // Footer text
      + '<div style="position:absolute;bottom:8px;left:0;right:0;text-align:center;color:rgba(255,255,255,0.4);font-size:11px;pointer-events:none;font-weight:500;z-index:30;">Developed by Fankaar Studio</div>'

      // Variant carousel
      + carouselHTML;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Hide loader when model finishes loading
    var mv = document.getElementById('eyeleux-mv');
    if (mv) {
      mv.addEventListener('load', function() {
        var progress = this.querySelector('[slot="progress-bar"]');
        if (progress) progress.style.display = 'none';
      });
    }

    // Close handlers
    var close = function() {
      modal.remove();
      document.body.style.overflow = '';
    };

    document.getElementById('eyeleux-3d-close').addEventListener('click', close);
    modal.addEventListener('click', function(e) {
      if (e.target === modal) close();
    });

    // ESC key
    var handleKey = function(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', handleKey); }
    };
    document.addEventListener('keydown', handleKey);

    // Variant carousel click handler
    var carouselItems = modal.querySelectorAll('.eyeleux-carousel-item');
    carouselItems.forEach(function(item) {
      item.addEventListener('click', function() {
        var newGlbUrl = this.dataset.glbUrl;
        var newTitle = this.dataset.variantTitle;
        if (!newGlbUrl) return;

        // Update model viewer source
        var mv = document.getElementById('eyeleux-mv');
        if (mv) {
          var progress = mv.querySelector('[slot="progress-bar"]');
          if (progress) progress.style.display = 'flex';
          mv.setAttribute('src', newGlbUrl);
        }

        // Update variant label
        var label = document.getElementById('eyeleux-3d-variant-label');
        if (label) label.textContent = newTitle;

        // Update active state
        carouselItems.forEach(function(ci) { ci.classList.remove('active'); });
        this.classList.add('active');
      });
    });
  }

  // ─── Try-On Modal ───────────────────────────────────────────────────────────
  async function openTryOnModal(glbUrl, productTitle, variantTitle) {
    var carouselHTML = buildVariantCarouselHTML(glbUrl);

    // Show loading modal immediately
    var modal = document.createElement('div');
    modal.id = 'eyeleux-tryon-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Virtual Try-On \u2013 ' + productTitle);
    modal.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;animation:eyeleuxFadeIn 0.2s ease;';

    modal.innerHTML = ''
      + '<style>'
      + '@keyframes eyeleuxFadeIn { from { opacity: 0; } to { opacity: 1; } }'
      + '@keyframes eyeleuxSpin { to { transform: rotate(360deg); } }'
      + '#eyeleux-tryon-modal * { box-sizing: border-box; }'
      + '#eyeleux-camera-canvas { position:absolute;inset:0;width:100%;height:100%;object-fit:cover; }'
      + '#eyeleux-three-canvas { position:absolute;inset:0;width:100%;height:100%; }'
      + '#eyeleux-loading-overlay { position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);z-index:20;gap:16px; }'
      + '#eyeleux-spinner { width:48px;height:48px;border:4px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:eyeleuxSpin 0.8s linear infinite; }'
      + '#eyeleux-status-text { color:#fff;font-size:14px;text-align:center;max-width:260px; }'
      + '#eyeleux-header { position:absolute;top:0;left:0;right:0;padding:16px 20px;display:flex;align-items:flex-start;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.7),transparent);z-index:30;pointer-events:none; }'
      + '#eyeleux-header button { pointer-events:all; }'
      + '#eyeleux-footer { position:absolute;bottom:' + (carouselHTML ? '135' : '20') + 'px;left:0;right:0;padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;z-index:30; }'
      + '#eyeleux-instruction { color:rgba(255,255,255,0.9);font-size:14px;background:rgba(0,0,0,0.4);padding:8px 16px;border-radius:20px;text-align:center;transition:opacity 0.5s; }'
      + '#eyeleux-tryon-close { background:rgba(255,255,255,0.15);border:none;color:#fff;width:40px;height:40px;min-width:40px;min-height:40px;padding:0;margin:0;box-sizing:border-box;line-height:1;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px); }'
      + '#eyeleux-mirror-btn { background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;cursor:pointer;backdrop-filter:blur(4px); }'
      + '#eyeleux-error-overlay { position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.9);z-index:40;gap:16px;padding:24px; }'
      + '#eyeleux-error-overlay.visible { display:flex; }'
      + '#eyeleux-error-msg { color:#fff;font-size:15px;text-align:center;max-width:300px; }'
      + '#eyeleux-retry-btn { background:#fff;color:#000;border:none;padding:10px 24px;border-radius:24px;font-weight:600;cursor:pointer; }'
      + '#eyeleux-calibration { position:absolute;bottom:' + (carouselHTML ? '185' : '80') + 'px;left:16px;z-index:35;background:rgba(0,0,0,0.6);padding:8px 12px;border-radius:8px;display:none;gap:8px;align-items:center; }'
      + '#eyeleux-calibration.visible { display:flex; }'
      + '#eyeleux-calibration label { color:#fff;font-size:12px; }'
      + '#eyeleux-calibration input { width:100px; }'
      + getCarouselCSS()
      + '</style>'

      // Camera canvas (video background)
      + '<canvas id="eyeleux-camera-canvas"></canvas>'

      // Three.js canvas (transparent overlay)
      + '<canvas id="eyeleux-three-canvas"></canvas>'

      // Face detection targeting box (centered)
      + '<div id="eyeleux-face-box" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:25;opacity:0;transition:opacity 0.3s;">'
      + '<div style="width:280px;height:340px;border:2px dashed rgba(255,255,255,0.7);border-radius:24px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.15);">'
      + '<div style="color:#fff;font-size:15px;font-weight:600;text-align:center;padding:20px;text-shadow:0 2px 4px rgba(0,0,0,0.8);letter-spacing:0.02em;">Please position your face<br>in the center</div>'
      + '</div>'
      + '</div>'

      // Loading overlay
      + '<div id="eyeleux-loading-overlay">'
      + '<div id="eyeleux-spinner"></div>'
      + '<div id="eyeleux-status-text">Initializing camera\u2026</div>'
      + '</div>'

      // Error overlay
      + '<div id="eyeleux-error-overlay">'
      + '<div style="font-size:48px">⚠️</div>'
      + '<div id="eyeleux-error-msg"></div>'
      + '<button id="eyeleux-retry-btn">Try Again</button>'
      + '<button id="eyeleux-close-error" style="color:rgba(255,255,255,0.6);background:none;border:none;cursor:pointer;font-size:13px;">Close</button>'
      + '</div>'

      // Header
      + '<div id="eyeleux-header">'
      + '<div>'
      + '<div style="color:#fff;font-weight:700;font-size:15px;">' + escapeHtml(productTitle) + '</div>'
      + '<div id="eyeleux-tryon-variant-label" style="color:rgba(255,255,255,0.7);font-size:12px;">' + escapeHtml(variantTitle) + '</div>'
      + '</div>'
      + '<button id="eyeleux-tryon-close" aria-label="Close try-on">✕</button>'
      + '</div>'

      // Footer
      + '<div id="eyeleux-footer">'
      + '<div id="eyeleux-instruction">📍 Position glasses on your face</div>'
      + '<button id="eyeleux-mirror-btn">🔄 Mirror</button>'
      + '</div>'

      // Dev calibration panel
      + '<div id="eyeleux-calibration">'
      + '<label>Scale: <span id="eyeleux-cal-val">1.8</span></label>'
      + '<input type="range" id="eyeleux-cal-slider" min="0.5" max="4.0" step="0.05" value="1.8">'
      + '</div>'

      // Variant carousel
      + carouselHTML;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // ── Close handler ──────────────────────────────────────────────────────
    var closeModal = function() {
      if (window.__eyeleuxAR?.cleanup) window.__eyeleuxAR.cleanup();
      modal.remove();
      document.body.style.overflow = '';
    };

    document.getElementById('eyeleux-tryon-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });

    var handleEsc = function(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleEsc); }
    };
    document.addEventListener('keydown', handleEsc);

    document.getElementById('eyeleux-close-error').addEventListener('click', closeModal);
    document.getElementById('eyeleux-retry-btn').addEventListener('click', function() {
      hideError();
      initAR();
    });

    // ── Mirror toggle ──────────────────────────────────────────────────────
    var mirrored = true;
    document.getElementById('eyeleux-mirror-btn').addEventListener('click', function() {
      mirrored = !mirrored;
      if (window.__eyeleuxAR?.setMirror) window.__eyeleuxAR.setMirror(mirrored);
    });

    // ── Calibration slider ─────────────────────────────────────────────────
    var calSlider = document.getElementById('eyeleux-cal-slider');
    var calVal = document.getElementById('eyeleux-cal-val');
    var savedCal = parseFloat(localStorage.getItem('eyeleux_cal') || '1.08');
    calSlider.value = savedCal;
    calVal.textContent = savedCal.toFixed(2);

    calSlider.addEventListener('input', function() {
      var v = parseFloat(calSlider.value);
      calVal.textContent = v.toFixed(2);
      localStorage.setItem('eyeleux_cal', String(v));
      if (window.__eyeleuxAR?.setCalibration) window.__eyeleuxAR.setCalibration(v);
    });

    // Toggle calibration panel: press "C"
    document.addEventListener('keydown', function(e) {
      if (e.key === 'c' || e.key === 'C') {
        var panel = document.getElementById('eyeleux-calibration');
        if (panel) panel.classList.toggle('visible');
      }
    });

    // ── Variant carousel click handler ──────────────────────────────────────
    var carouselItems = modal.querySelectorAll('.eyeleux-carousel-item');
    carouselItems.forEach(function(item) {
      item.addEventListener('click', function() {
        var newGlbUrl = this.dataset.glbUrl;
        var newTitle = this.dataset.variantTitle;
        if (!newGlbUrl || newGlbUrl === glbUrl) return;

        // Update active state
        carouselItems.forEach(function(ci) { ci.classList.remove('active'); });
        this.classList.add('active');

        // Update variant label
        var label = document.getElementById('eyeleux-tryon-variant-label');
        if (label) label.textContent = newTitle;

        // Restart AR with new model
        glbUrl = newGlbUrl;
        if (window.__eyeleuxAR?.cleanup) window.__eyeleuxAR.cleanup();
        initAR();
      });
    });

    // ── Status/error helpers ───────────────────────────────────────────────
    function setStatus(text) {
      var el = document.getElementById('eyeleux-status-text');
      if (el) el.textContent = text;
    }

    function showLoading(text) {
      var overlay = document.getElementById('eyeleux-loading-overlay');
      if (overlay) { overlay.style.display = 'flex'; setStatus(text || ''); }
    }

    function hideLoading() {
      var overlay = document.getElementById('eyeleux-loading-overlay');
      if (overlay) overlay.style.display = 'none';
    }

    function showError(msg) {
      hideLoading();
      var overlay = document.getElementById('eyeleux-error-overlay');
      var msgEl = document.getElementById('eyeleux-error-msg');
      if (overlay) overlay.classList.add('visible');
      if (msgEl) msgEl.textContent = msg;
    }

    function hideError() {
      var overlay = document.getElementById('eyeleux-error-overlay');
      if (overlay) overlay.classList.remove('visible');
    }

    // ── Load AR script ─────────────────────────────────────────────────────
    async function loadArScript() {
      if (window.EyeleuxAR) return;

      return new Promise(function(resolve, reject) {
        var script = document.createElement('script');
        var arScriptUrl = document.querySelector('[data-eyeleux-ar-url]')?.dataset?.eyeleuxArUrl
          || window.__eyeleux?.arScriptUrl
          || (document.currentScript?.src || '').replace('tryon-init.js', 'tryon-ar.js');
        
        script.src = arScriptUrl;
        script.onload = resolve;
        script.onerror = function() { reject(new Error('Failed to load AR module')); };
        document.head.appendChild(script);
      });
    }

    // ── Initialize AR ──────────────────────────────────────────────────────
    async function initAR() {
      showLoading('Initializing camera\u2026');

      try {
        // Check camera permission first
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera not supported on this device or browser.');
        }

        showLoading('Loading AR modules\u2026');
        await loadArScript();

        showLoading('Starting face tracking\u2026');
        await window.EyeleuxAR.init({
          glbUrl: glbUrl,
          cameraCanvasId: 'eyeleux-camera-canvas',
          threeCanvasId: 'eyeleux-three-canvas',
          calibration: parseFloat(localStorage.getItem('eyeleux_cal') || '1.08'),
          onReady: function() {
            hideLoading();
            var instruction = document.getElementById('eyeleux-instruction');
            if (instruction) {
              instruction.style.opacity = '1';
            }
          },
          onError: function(err) {
            showError(err);
          },
          onFaceDetected: function() {
            var instruction = document.getElementById('eyeleux-instruction');
            if (instruction) {
              setTimeout(function() { instruction.style.opacity = '0'; }, 3000);
            }
            var box = document.getElementById('eyeleux-face-box');
            if (box) box.style.opacity = '0';
          },
          onNoFace: function(secondsWithoutFace) {
            var box = document.getElementById('eyeleux-face-box');
            // Show the targeting box after 1 second to avoid flashing on quick movements
            if (box && secondsWithoutFace > 1.0) {
              box.style.opacity = '1';
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
    var container = getContainer();
    if (!container) return;

    // Set up variant change listener
    document.addEventListener('variant:change', handleVariantChange);

    // Also listen to Shopify's section:rerender event
    document.addEventListener('section:rerender', function() {
      var glbUrl = getCurrentGlbUrl();
      updateButtonsVisibility(glbUrl);
    });

    // Bind button clicks
    var btn3D = document.getElementById('eyeleux-3d-btn');
    var btnTryOn = document.getElementById('eyeleux-tryon-btn');

    if (btn3D) {
      btn3D.addEventListener('click', function() {
        var glbUrl = getCurrentGlbUrl();
        if (!glbUrl) return;
        open3DModal(glbUrl, getProductTitle(), getCurrentVariantTitle());
      });
    }

    if (btnTryOn) {
      btnTryOn.addEventListener('click', function() {
        var glbUrl = getCurrentGlbUrl();
        if (!glbUrl) return;
        openTryOnModal(glbUrl, getProductTitle(), getCurrentVariantTitle());
      });
    }

    // Bulletproof polling for variant changes
    var lastVariantId = null;
    setInterval(function() {
      var params = new URLSearchParams(window.location.search);
      var currentVariantId = params.get('variant');
      
      // Also try to find a selected hidden input if URL has no variant
      if (!currentVariantId) {
        var inputSelect = document.querySelector('form[action^="/cart/add"] [name="id"], input[name="id"]');
        if (inputSelect) {
          currentVariantId = inputSelect.value;
        }
      }

      if (currentVariantId && currentVariantId !== lastVariantId) {
        lastVariantId = currentVariantId;
        var glbUrl = window.__eyeleux?.variantGlbUrls?.[currentVariantId] || '';
        var cont = getContainer();
        if (cont) {
          cont.dataset.glbUrl = glbUrl;
          cont.dataset.variantId = currentVariantId;
          // Get the title from our array if possible
          var vObj = window.__eyeleux?.variants?.find(v => String(v.id) === String(currentVariantId));
          if (vObj) cont.dataset.variantTitle = vObj.title;
        }
        updateButtonsVisibility(glbUrl);
      }
    }, 250);
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
