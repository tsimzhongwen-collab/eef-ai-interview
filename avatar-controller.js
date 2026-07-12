import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

class AvatarController {
  constructor({
    mount,
    modelUrl = "/models/interviewer.glb"
  }) {
    this.mount = mount;
    this.modelUrl = modelUrl;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.clock = new THREE.Clock();
    this.mixer = null;
    this.model = null;
    this.resizeObserver = null;
    this.raf = null;
  }

  async init() {
    this.mount.dataset.avatarStatus = "Chargement du modèle...";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.mount.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.mount);

    console.info("[AvatarController] Loading GLB model:", this.modelUrl);
    const gltf = await new GLTFLoader().loadAsync(this.modelUrl);
    this.model = gltf.scene;
    this.scene.add(this.model);

    this.normalizeModel();
    this.frameChestUp();
    this.reportModelData(gltf);
    this.mount.classList.add("is-ready");
    this.mount.dataset.avatarStatus = "";
    this.start();
  }

  setupLighting() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd6c3ad, 2.2));

    const key = new THREE.DirectionalLight(0xffffff, 2.7);
    key.position.set(1.7, 3.2, 2.4);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xbfd6ff, 1.15);
    fill.position.set(-2.6, 2.0, 2.3);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xfff2dd, 1.25);
    rim.position.set(0.2, 2.4, -2.6);
    this.scene.add(rim);
  }

  normalizeModel() {
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = size.y || 1;
    const targetHeight = 2.15;
    const scale = targetHeight / height;

    this.model.scale.setScalar(scale);
    this.model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    this.model.rotation.y = 0;

    this.model.traverse((object) => {
      if (!object.isMesh) return;
      object.frustumCulled = false;
      if (object.material) {
        object.material.needsUpdate = true;
      }
    });
  }

  frameChestUp() {
    this.camera.position.set(0, 1.45, 2.55);
    this.camera.lookAt(0, 1.34, 0);
  }

  reportModelData(gltf) {
    const morphTargets = [];
    const skeletons = [];

    this.model.traverse((object) => {
      if (object.morphTargetDictionary) {
        morphTargets.push({
          object: object.name || "(unnamed mesh)",
          morphTargetDictionary: object.morphTargetDictionary
        });
      }

      if (object.isSkinnedMesh && object.skeleton) {
        skeletons.push({
          object: object.name || "(unnamed skinned mesh)",
          bones: object.skeleton.bones.map((bone) => bone.name || "(unnamed bone)")
        });
      }
    });

    const clips = (gltf.animations || []).map((clip) => ({
      name: clip.name || "(unnamed clip)",
      duration: clip.duration,
      tracks: clip.tracks.map((track) => track.name)
    }));

    const blendshapeNames = morphTargets.flatMap((entry) => Object.keys(entry.morphTargetDictionary || {}));
    const visemeNames = blendshapeNames.filter((name) => /viseme|mouth|jaw|aa|ee|ih|oh|ou|blink|eye/i.test(name));

    console.group("[AvatarController] /models/interviewer.glb inspection");
    console.log("morphTargetDictionary:", morphTargets);
    console.log("animation clips:", clips);
    console.log("skeleton:", skeletons);
    console.log("blendshape names:", blendshapeNames);
    console.log("possible viseme / face blendshape names:", visemeNames);
    console.groupEnd();
  }

  resize() {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  start() {
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (this.mixer) {
        this.mixer.update(this.clock.getDelta());
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
  }
}

const mount = document.getElementById("avatarMount");

if (mount) {
  const controller = new AvatarController({ mount });
  controller.init().catch((error) => {
    console.error("[AvatarController] Failed to load /models/interviewer.glb", error);
    mount.dataset.avatarStatus = "Impossible de charger le modèle 3D.";
    mount.classList.add("has-error");
  });
  window.avatarController = controller;
}

export { AvatarController };
