/**
 * EyeLeux AR Try-On Engine  (tryon-ar.js)
 * 
 * Full MediaPipe + Three.js AR try-on implementation.
 * Loaded lazily by tryon-init.js only when user clicks "Try-On".
 * 
 * CDN dependencies (loaded at runtime):
 *   - Three.js r168       https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js
 *   - GLTFLoader          https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/loaders/GLTFLoader.js
 *   - RoomEnvironment     https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/environments/RoomEnvironment.js
 *   - MediaPipe Vision    https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.js
 */

(function (global) {
  'use strict';

  // ─── CDN URLs ──────────────────────────────────────────────────────────────
  const CDN = {
    THREE: 'https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js',
    GLTF_LOADER: 'https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/loaders/GLTFLoader.js',
    ROOM_ENV: 'https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/environments/RoomEnvironment.js',
    MEDIAPIPE_VISION: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.js',
    MEDIAPIPE_WASM: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm',
    FACE_LANDMARKER_MODEL: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  };

  // ─── Face landmark indices ─────────────────────────────────────────────────
  const LM = {
    NOSE_BRIDGE_TOP:  168,
    NOSE_BRIDGE_MID:    6,
    LEFT_FACE_EDGE:   234,
    RIGHT_FACE_EDGE:  454,
    LEFT_EYE_CENTER:   33,
    RIGHT_EYE_CENTER: 263,
    FOREHEAD_CENTER:    9,
    CHIN:             152,
  };

  // ─── Module state ──────────────────────────────────────────────────────────
  let THREE = null;
  let GLTFLoader = null;
  let RoomEnvironment = null;
  let FaceLandmarker = null;
  let FilesetResolver = null;

  let scene, camera, renderer, ambientLight, dirLight1, dirLight2;
  let glassesModel = null;
  let faceLandmarker = null;
  let stream = null;
  let video = null;
  let cameraCanvas = null;
  let threeCanvas = null;
  let cameraCtx = null;
  let animationId = null;

  let calibrationFactor = 1.8;
  let isMirrored = true;
  let lastFaceDetectedTime = 0;
  let noFaceTimer = null;

  let callbacks = {
    onReady: null,
    onError: null,
    onFaceDetected: null,
    onNoFace: null,
  };

  // ─── Dynamic ES module import helper ──────────────────────────────────────
  // We use a script-tag + global approach because Shopify themes may not
  // support top-level await or native ES module imports in all contexts.
  // We load THREE as ESM via a dynamic import shim.
  
  let threePromise = null;
  let mediapipePromise = null;

  function loadESModule(url) {
    return new Promise((resolve, reject) => {
      // Use Function constructor to call dynamic import without triggering
      // Babel/bundler transforms (works in modern browsers natively).
      const fn = new Function('url', 'return import(url)');
      fn(url).then(resolve).catch(reject);
    });
  }

  async function loadThree() {
    if (threePromise) return threePromise;
    threePromise = (async () => {
      const threeModule = await loadESModule(CDN.THREE);
      THREE = threeModule;

      const gltfModule = await loadESModule(CDN.GLTF_LOADER);
      GLTFLoader = gltfModule.GLTFLoader;

      const envModule = await loadESModule(CDN.ROOM_ENV);
      RoomEnvironment = envModule.RoomEnvironment;
    })();
    return threePromise;
  }

  async function loadMediaPipe() {
    if (mediapipePromise) return mediapipePromise;
    mediapipePromise = new Promise((resolve, reject) => {
      if (global.FaceLandmarker && global.FilesetResolver) {
        FaceLandmarker = global.FaceLandmarker;
        FilesetResolver = global.FilesetResolver;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = CDN.MEDIAPIPE_VISION;
      script.onload = () => {
        // MediaPipe exposes globals after load
        // Access via the vision_bundle globals
        if (global.FaceLandmarker) {
          FaceLandmarker = global.FaceLandmarker;
          FilesetResolver = global.FilesetResolver;
          resolve();
        } else {
          // Try namespace
          const mp = global.mediapipe || global.mpVision;
          if (mp?.FaceLandmarker) {
            FaceLandmarker = mp.FaceLandmarker;
            FilesetResolver = mp.FilesetResolver;
            resolve();
          } else {
            reject(new Error('MediaPipe FaceLandmarker not found after script load'));
          }
        }
      };
      script.onerror = () => reject(new Error('Failed to load MediaPipe'));
      document.head.appendChild(script);
    });
    return mediapipePromise;
  }

  // ─── Camera setup ──────────────────────────────────────────────────────────
  async function setupCamera() {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: false,
    });

    video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    video.style.display = 'none';
    document.body.appendChild(video);

    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });
  }

  // ─── Three.js scene setup ───────────────────────────────────────────────────
  function setupThreeScene() {
    // Renderer with transparent background (overlaid on camera canvas)
    renderer = new THREE.WebGLRenderer({
      canvas: threeCanvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = false; // Disable for performance

    // Orthographic camera for 2D overlay mapping
    // We update this on resize to match the aspect ratio
    const W = threeCanvas.offsetWidth || window.innerWidth;
    const H = threeCanvas.offsetHeight || window.innerHeight;
    const aspect = W / H;

    camera = new THREE.OrthographicCamera(
      -aspect, aspect, 1, -1, 0.01, 100
    );
    camera.position.z = 10;

    scene = new THREE.Scene();

    // Lighting for PBR metallic materials
    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(0.5, 1, 1);
    scene.add(dirLight1);

    dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-0.5, -0.5, 0.5);
    scene.add(dirLight2);

    // Environment map for metallic reflections (PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment()).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    renderer.setSize(W, H);
  }

  // ─── Load GLB model ─────────────────────────────────────────────────────────
  function loadGlbModel(glbUrl) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();

      loader.load(
        glbUrl,
        (gltf) => {
          const glasses = gltf.scene;

          // Fix materials for PBR rendering
          glasses.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;

              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => fixMaterial(mat));
              } else if (child.material) {
                fixMaterial(child.material);
              }
            }
          });

          // Center the model at origin
          const box = new THREE.Box3().setFromObject(glasses);
          const center = box.getCenter(new THREE.Vector3());
          glasses.position.sub(center);

          scene.add(glasses);
          glassesModel = glasses;
          resolve(glasses);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  function fixMaterial(mat) {
    if (!mat) return;
    mat.envMapIntensity = 1.0;
    mat.needsUpdate = true;
    // Ensure transparency is handled correctly for lens materials
    if (mat.transparent) {
      mat.depthWrite = false;
    }
  }

  // ─── MediaPipe face landmarker setup ───────────────────────────────────────
  async function setupFaceLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(CDN.MEDIAPIPE_WASM);

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: CDN.FACE_LANDMARKER_MODEL,
        delegate: 'GPU',
      },
      outputFaceBlendshapes: false,
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  }

  // ─── Glasses transform update ───────────────────────────────────────────────
  function updateGlassesTransform(landmarks) {
    if (!glassesModel || !landmarks || !landmarks.length) return;

    const lm = landmarks;
    const noseBridge = lm[LM.NOSE_BRIDGE_TOP];
    const leftEdge   = lm[LM.LEFT_FACE_EDGE];
    const rightEdge  = lm[LM.RIGHT_FACE_EDGE];
    const leftEye    = lm[LM.LEFT_EYE_CENTER];
    const rightEye   = lm[LM.RIGHT_EYE_CENTER];

    // Face width in normalized units (0-1)
    const faceWidthNorm = Math.abs(rightEdge.x - leftEdge.x);

    // Midpoint between eyes for position
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeMidY = (leftEye.y + rightEye.y) / 2;

    // ── Convert to Three.js NDC coords ──────────────────────────────────────
    // MediaPipe coords: 0,0 = top-left, 1,1 = bottom-right
    // Three.js ortho coords: depends on camera left/right/top/bottom
    // We mirror X because video is flipped: posX = (1 - x) * 2 - 1  (range -1..1)

    const aspect = camera.right;  // camera.right = aspect in our setup

    const posX = isMirrored
      ? ((1 - eyeMidX) * 2 - 1) * aspect
      : (eyeMidX * 2 - 1) * aspect;

    const posY = -(eyeMidY * 2 - 1); // Flip Y

    // ── Scale from face width ────────────────────────────────────────────────
    // faceWidthNorm is 0..1, multiply by calibrationFactor and aspect
    const scale = faceWidthNorm * calibrationFactor * aspect * 1.4;

    // ── Head tilt from eye line ──────────────────────────────────────────────
    // angle = atan2(dy, dx) of the eye-to-eye vector
    // Mirror the dx because video is flipped
    const dx = isMirrored
      ? -(rightEye.x - leftEye.x)
      :  (rightEye.x - leftEye.x);
    const dy = rightEye.y - leftEye.y;
    const tiltAngle = Math.atan2(dy, dx);

    // ── Apply transforms ─────────────────────────────────────────────────────
    glassesModel.position.set(posX, posY, 0);
    glassesModel.rotation.set(0, 0, tiltAngle);
    glassesModel.scale.setScalar(scale);
  }

  // ─── Resize handler ─────────────────────────────────────────────────────────
  function handleResize() {
    const container = document.getElementById('eyeleux-tryon-modal');
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    const aspect = W / H;

    if (cameraCanvas) {
      cameraCanvas.width = W;
      cameraCanvas.height = H;
    }

    if (renderer && threeCanvas) {
      renderer.setSize(W, H, false);
    }

    if (camera) {
      camera.left   = -aspect;
      camera.right  =  aspect;
      camera.top    =  1;
      camera.bottom = -1;
      camera.updateProjectionMatrix();
    }
  }

  // ─── Animation loop ─────────────────────────────────────────────────────────
  let lastTimestamp = 0;
  const TARGET_FPS = 30;
  const FRAME_TIME = 1000 / TARGET_FPS;

  function animate(timestamp) {
    animationId = requestAnimationFrame(animate);

    // Throttle to ~30fps for performance
    if (timestamp - lastTimestamp < FRAME_TIME) return;
    lastTimestamp = timestamp;

    // ── Draw mirrored camera feed to camera canvas ──────────────────────────
    if (cameraCtx && video && video.readyState >= 2) {
      const cw = cameraCanvas.width;
      const ch = cameraCanvas.height;

      cameraCtx.save();
      if (isMirrored) {
        cameraCtx.translate(cw, 0);
        cameraCtx.scale(-1, 1);
      }
      cameraCtx.drawImage(video, 0, 0, cw, ch);
      cameraCtx.restore();
    }

    // ── Run face detection ──────────────────────────────────────────────────
    if (faceLandmarker && video && video.readyState >= 2) {
      try {
        const results = faceLandmarker.detectForVideo(video, performance.now());

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          lastFaceDetectedTime = Date.now();
          updateGlassesTransform(results.faceLandmarks[0]);

          if (glassesModel) glassesModel.visible = true;

          if (callbacks.onFaceDetected) callbacks.onFaceDetected();
        } else {
          if (glassesModel) glassesModel.visible = false;

          const secondsWithoutFace = (Date.now() - lastFaceDetectedTime) / 1000;
          if (callbacks.onNoFace) callbacks.onNoFace(secondsWithoutFace);
        }
      } catch (e) {
        // Suppress per-frame errors silently
      }
    }

    // ── Render Three.js scene ───────────────────────────────────────────────
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────
  function cleanup() {
    // Stop animation
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    // Stop camera stream
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    // Remove hidden video element
    if (video) {
      video.srcObject = null;
      video.remove();
      video = null;
    }

    // Dispose Three.js resources
    if (glassesModel) {
      glassesModel.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
      scene?.remove(glassesModel);
      glassesModel = null;
    }

    if (renderer) {
      renderer.dispose();
      renderer = null;
    }

    // Close faceLandmarker
    if (faceLandmarker) {
      faceLandmarker.close?.();
      faceLandmarker = null;
    }

    // Reset state
    scene = null;
    camera = null;
    cameraCanvas = null;
    threeCanvas = null;
    cameraCtx = null;
    lastFaceDetectedTime = 0;

    window.removeEventListener('resize', handleResize);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────
  const EyeleuxAR = {
    /**
     * Initialize the AR try-on experience.
     * @param {object} options
     * @param {string} options.glbUrl          - URL to the .glb model
     * @param {string} options.cameraCanvasId  - Canvas element ID for camera feed
     * @param {string} options.threeCanvasId   - Canvas element ID for Three.js
     * @param {number} [options.calibration]   - Scale calibration factor (default 1.8)
     * @param {function} [options.onReady]     - Called when AR is ready
     * @param {function} [options.onError]     - Called on fatal error (string message)
     * @param {function} [options.onFaceDetected] - Called each frame when face found
     * @param {function} [options.onNoFace]    - Called each frame when no face (seconds)
     */
    async init(options) {
      const {
        glbUrl,
        cameraCanvasId,
        threeCanvasId,
        calibration = 1.8,
        onReady,
        onError,
        onFaceDetected,
        onNoFace,
      } = options;

      callbacks = { onReady, onError, onFaceDetected, onNoFace };
      calibrationFactor = calibration;

      cameraCanvas = document.getElementById(cameraCanvasId);
      threeCanvas  = document.getElementById(threeCanvasId);

      if (!cameraCanvas || !threeCanvas) {
        const err = 'Canvas elements not found';
        if (onError) onError(err);
        throw new Error(err);
      }

      // Size canvases to their parent
      const parent = cameraCanvas.parentElement;
      const W = parent?.clientWidth  || window.innerWidth;
      const H = parent?.clientHeight || window.innerHeight;
      cameraCanvas.width  = W;
      cameraCanvas.height = H;
      threeCanvas.width   = W;
      threeCanvas.height  = H;

      cameraCtx = cameraCanvas.getContext('2d');

      try {
        // Load all modules in parallel
        const [, ,] = await Promise.all([
          setupCamera(),
          loadThree(),
          loadMediaPipe(),
        ]);

        // Setup Three.js scene (after THREE is loaded)
        setupThreeScene();
        handleResize(); // Initial size sync

        // Setup face landmarker (needs MediaPipe loaded)
        await setupFaceLandmarker();

        // Load GLB model (needs THREE + GLTFLoader loaded)
        try {
          await loadGlbModel(glbUrl);
        } catch (glbErr) {
          console.error('[EyeLeux] GLB load failed:', glbErr);
          if (onError) {
            onError('Failed to load 3D glasses model. Please check your internet connection and try again.');
          }
          cleanup();
          return;
        }

        // Register resize handler
        window.addEventListener('resize', handleResize);

        // Start animation loop
        lastFaceDetectedTime = Date.now();
        animate(0);

        if (onReady) onReady();

      } catch (err) {
        console.error('[EyeLeux] Init error:', err);
        cleanup();
        const msg = err.name === 'NotAllowedError'
          ? 'Camera access was denied. Please allow camera access and try again.'
          : err.message || 'Failed to initialize AR. Please try again.';
        if (onError) onError(msg);
        throw err;
      }
    },

    /** Update the calibration factor (called by the slider) */
    setCalibration(value) {
      calibrationFactor = parseFloat(value) || 1.8;
    },

    /** Toggle horizontal mirror */
    setMirror(value) {
      isMirrored = Boolean(value);
    },

    /** Cleanup all resources */
    cleanup,
  };

  // Expose globally
  global.EyeleuxAR = EyeleuxAR;

  // Also expose via __eyeleuxAR for the modal cleanup call
  global.__eyeleuxAR = EyeleuxAR;

})(window);
