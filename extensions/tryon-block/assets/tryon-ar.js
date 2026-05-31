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
    MEDIAPIPE_VISION: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.mjs',
    MEDIAPIPE_WASM: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm',
    FACE_LANDMARKER_MODEL: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
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

  let callbacks = {
    onReady: null,
    onError: null,
    onFaceDetected: null,
    onNoFace: null,
  };

  // ─── Dynamic ES module import helper ──────────────────────────────────────
  let threePromise = null;
  let mediapipePromise = null;

  function loadESModule(url) {
    return new Promise((resolve, reject) => {
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
    mediapipePromise = (async () => {
      const mpVision = await loadESModule(CDN.MEDIAPIPE_VISION);
      FaceLandmarker = mpVision.FaceLandmarker;
      FilesetResolver = mpVision.FilesetResolver;
      if (!FaceLandmarker || !FilesetResolver) {
        throw new Error('MediaPipe modules not found in ES module export');
      }
    })();
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
    renderer.shadowMap.enabled = false;

    const W = threeCanvas.offsetWidth || window.innerWidth;
    const H = threeCanvas.offsetHeight || window.innerHeight;
    const aspect = W / H;

    // Orthographic camera: world units = screen pixels.
    // This gives pixel-perfect 2D positioning of the 3D glasses model
    // on top of the 2D video feed, with no perspective distortion.
    // Camera at z=10000 with very large near/far to prevent clipping:
    // the scaled 3D model extends hundreds of pixels in Z-depth.
    camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 20000);
    camera.position.z = 10000;

    scene = new THREE.Scene();

    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(0.5, 1, 1);
    scene.add(dirLight1);

    dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-0.5, -0.5, 0.5);
    scene.add(dirLight2);

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

          // This GLB's lenses face -Z (Blender export convention).
          // Rotate 180° around Y so lenses face +Z (toward camera).
          glasses.rotation.y = Math.PI;

          // CRITICAL: force-update the world matrix so Box3.setFromObject sees
          // the post-rotation extents, not the stale pre-rotation state.
          glasses.updateMatrixWorld(true);

          // Compute bounding box in post-rotation world space.
          // After rotation.y = PI:  box.max.z = lens surface (toward camera)
          //                         box.min.z = temple tips (into head)
          const box = new THREE.Box3().setFromObject(glasses);
          const center = box.getCenter(new THREE.Vector3());
          const naturalWidth = box.max.x - box.min.x;
          const naturalDepth = box.max.z - box.min.z;

          // ─── Respect the model's origin ───────────────────────────────────
          // The GLB origin has been set at the NOSE BRIDGE in Blender.
          // Do NOT re-center — keep glasses.position at (0,0,0) so the
          // wrapper origin = model origin = nose bridge pivot point.
          // Lenses extend forward (+Z after rotation), temples extend
          // backward (-Z) — exactly like real glasses on a face.
          // glasses.position stays at (0,0,0)

          // Wrap in a Group whose origin = model nose bridge
          const wrapper = new THREE.Group();
          wrapper.add(glasses);

          wrapper.userData.naturalWidth = naturalWidth;

          scene.add(wrapper);
          glassesModel = wrapper;
          resolve(wrapper);
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
      outputFacialTransformationMatrixes: false,  // Not needed with landmark approach
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  }

  // ─── Glasses transform update ───────────────────────────────────────────────
  //
  // APPROACH: Landmark-based rotation (no MediaPipe face matrix needed).
  //
  // We convert key face landmarks from MediaPipe's image-normalized coordinates
  // (Y-down, [0,1]) to Three.js world coordinates (Y-up), then build the face's
  // three orthonormal axes:
  //
  //   X axis  = left-eye → right-eye          (face horizontal)
  //   Y axis  = chin → forehead               (face vertical / "up")
  //   Z axis  = X × Y (cross product)         (face normal, toward camera)
  //
  // A rotation matrix built from these axes correctly orients the glasses to
  // sit on the face regardless of head pose (yaw, pitch, roll), with no
  // coordinate-system conversion ambiguity.
  // ──────────────────────────────────────────────────────────────────────────
  function updateGlassesTransform(landmarks) {
    if (!glassesModel || !landmarks || !landmarks.length) return;

    const lm = landmarks;

    // Visible world dimensions = camera frustum size (orthographic: 1 unit = 1 pixel)
    const visWidth  = camera.right - camera.left;
    const visHeight = camera.top - camera.bottom;

    // ── Convert MediaPipe landmark → Three.js world space ──────────────────
    // MediaPipe: x,y in [0,1] image-normalized (Y-down), z = depth (rough scale)
    // Three.js:  Y-up, camera at z=+2 looking in -Z direction
    // Mirroring: when isMirrored=true (selfie cam), flip X so real-world left
    //            stays on the left in the Three.js scene.
    const toW = (p) => new THREE.Vector3(
      ((isMirrored ? 1 - p.x : p.x) - 0.5) * visWidth,
      -(p.y - 0.5) * visHeight,
      -(p.z * visWidth)
    );

    // Key landmarks
    const leftEyeW  = toW(lm[33]);   // left eye outer corner  (for rotation axis)
    const rightEyeW = toW(lm[263]);  // right eye outer corner (for rotation axis)
    const chinW     = toW(lm[152]);  // chin
    const foreW     = toW(lm[9]);    // forehead

    // Iris/pupil centers — the most accurate landmarks for lens placement
    // lm[468] = left iris center, lm[473] = right iris center (MediaPipe 478-pt model)
    const leftIrisW  = toW(lm[468]);
    const rightIrisW = toW(lm[473]);

    // Nose bridge landmarks:
    // lm[168] = between inner eye corners (top of nose bridge)
    // lm[6]   = lower nose bridge, where glasses nose pads actually rest
    const nosePadW = toW(lm[6]);

    // ── Scale ────────────────────────────────────────────────────────────────
    // Frame width ≈ 2.1 × interpupillary distance (IPD-based).
    const pupilDist = leftIrisW.distanceTo(rightIrisW);
    let S = 1;
    if (glassesModel.userData.naturalWidth > 0) {
      S = (pupilDist * 2.1) / glassesModel.userData.naturalWidth;
      glassesModel.scale.setScalar(S);
    }

    // ── Rotation ─────────────────────────────────────────────────────────────
    // Build face-aligned orthonormal basis from landmark world positions.

    // X: left→right eye direction (face horizontal axis)
    const xAxis = rightEyeW.clone().sub(leftEyeW).normalize();

    // Raw Y: chin→forehead (face vertical axis, approximate)
    const yRaw  = foreW.clone().sub(chinW).normalize();

    // Z: face normal toward camera = X cross rawY
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yRaw).normalize();

    // Re-orthogonalize Y so it is exactly perpendicular to X and Z
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

    // Build and apply the rotation matrix
    const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    glassesModel.setRotationFromMatrix(rotMat);

    // ── Position ────────────────────────────────────────────────────────────
    // The model origin IS the nose bridge (set in Blender).
    //
    // X: pupil midpoint (horizontal centering)
    // Y: lm[6] — the lower nose bridge where pads actually rest, NOT lm[168]
    //    which is too high (between inner eye corners)
    // Z: 0 — flat on the 2D video plane. The face is a flat image at z=0;
    //    using landmark Z pushes glasses forward due to MediaPipe's relative
    //    depth values, causing the "floating" gap. Z=0 eliminates this.
    const pupilMidW = leftIrisW.clone().add(rightIrisW).multiplyScalar(0.5);
    glassesModel.position.set(pupilMidW.x, nosePadW.y, 0);
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
      camera.left   = -W / 2;
      camera.right  =  W / 2;
      camera.top    =  H / 2;
      camera.bottom = -H / 2;
      camera.updateProjectionMatrix();
    }
  }

  // ─── Animation loop ─────────────────────────────────────────────────────────
  let lastTimestamp = 0;
  const TARGET_FPS = 30;
  const FRAME_TIME = 1000 / TARGET_FPS;

  function animate(timestamp) {
    animationId = requestAnimationFrame(animate);

    if (timestamp - lastTimestamp < FRAME_TIME) return;
    lastTimestamp = timestamp;

    // Draw mirrored camera feed
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

    // Run face detection
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
        // Suppress per-frame errors
      }
    }

    // Render Three.js scene
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────
  function cleanup() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    if (video) {
      video.srcObject = null;
      video.remove();
      video = null;
    }

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

    if (faceLandmarker) {
      faceLandmarker.close?.();
      faceLandmarker = null;
    }

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

      const parent = cameraCanvas.parentElement;
      const W = parent?.clientWidth  || window.innerWidth;
      const H = parent?.clientHeight || window.innerHeight;
      cameraCanvas.width  = W;
      cameraCanvas.height = H;
      threeCanvas.width   = W;
      threeCanvas.height  = H;

      cameraCtx = cameraCanvas.getContext('2d');

      try {
        await Promise.all([
          setupCamera(),
          loadThree(),
          loadMediaPipe(),
        ]);

        setupThreeScene();
        handleResize();

        await setupFaceLandmarker();

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

        window.addEventListener('resize', handleResize);

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

    setCalibration(value) {
      calibrationFactor = parseFloat(value) || 1.8;
    },

    setMirror(value) {
      isMirrored = Boolean(value);
    },

    cleanup,
  };

  global.EyeleuxAR = EyeleuxAR;
  global.__eyeleuxAR = EyeleuxAR;

})(window);
