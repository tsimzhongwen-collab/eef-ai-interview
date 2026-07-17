import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

class AvatarController {
  constructor({
    mount,
    modelUrl = "/public/models/interviewer.glb"
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
    this.environmentGroup = new THREE.Group();
    this.poseBindings = null;
    this.faceControls = [];
    this.eyeControls = [];
    this.headBone = null;
    this.neckBone = null;
    this.targetSpeakingLevel = 0;
    this.speakingLevel = 0;
    this.avatarMode = "idle";
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
    this.applyNeutralInterviewPose();
    this.bindExpressionControls();
    this.buildInterviewSet();
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

    const deskSoft = new THREE.DirectionalLight(0xffffff, 1.45);
    deskSoft.position.set(0, 1.8, 2.4);
    this.scene.add(deskSoft);
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
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.01);

    const topY = box.max.y;
    const lowerFrameY = box.min.y + height * 0.38;
    const visibleHeight = (topY - lowerFrameY) / 0.9;
    const targetY = topY - visibleHeight * 0.4;
    const distance = (visibleHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5));

    this.camera.position.set(center.x, targetY + 0.03, box.max.z + distance * 1.18);
    this.camera.lookAt(center.x, targetY - 0.03, center.z);
    this.camera.updateProjectionMatrix();
  }

  buildInterviewSet() {
    this.scene.add(this.environmentGroup);

    const materials = {
      wall: new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.9, metalness: 0.02 }),
      sill: new THREE.MeshStandardMaterial({ color: 0xd7d0c3, roughness: 0.85 }),
      deskTop: new THREE.MeshStandardMaterial({ color: 0xc9bca9, roughness: 0.72 }),
      deskFront: new THREE.MeshStandardMaterial({ color: 0xb7aa98, roughness: 0.82 }),
      laptop: new THREE.MeshStandardMaterial({ color: 0xc9cdd0, roughness: 0.52, metalness: 0.25 }),
      laptopDark: new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.55, metalness: 0.2 }),
      paper: new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.86 }),
      plant: new THREE.MeshStandardMaterial({ color: 0x47694f, roughness: 0.78 }),
      pot: new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.8 })
    };

    const wall = this.boxMesh(5.8, 2.4, 0.06, materials.wall, [0, 1.15, -0.72]);
    const sill = this.boxMesh(3.3, 0.16, 0.18, materials.sill, [0, 1.72, -0.54]);
    const windowGlow = this.boxMesh(2.8, 1.05, 0.025, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 }), [0, 1.94, -0.575]);
    this.environmentGroup.add(wall, sill, windowGlow);

    [-0.85, 0.85].forEach((x) => {
      const pot = this.boxMesh(0.18, 0.24, 0.18, materials.pot, [x, 1.92, -0.42]);
      const plant = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), materials.plant);
      plant.position.set(x, 2.08, -0.42);
      plant.scale.set(1.1, 0.85, 1.0);
      this.environmentGroup.add(pot, plant);
    });

    const deskTop = this.boxMesh(5.8, 0.16, 1.05, materials.deskTop, [0, 0.62, 1.05]);
    const deskFront = this.boxMesh(5.8, 0.92, 0.14, materials.deskFront, [0, 0.14, 1.54]);
    const deskLip = this.boxMesh(5.8, 0.035, 0.12, materials.paper, [0, 0.72, 1.55]);
    this.environmentGroup.add(deskTop, deskFront, deskLip);

    const laptopBase = this.boxMesh(1.0, 0.055, 0.68, materials.laptopDark, [-0.72, 0.74, 0.74]);
    laptopBase.rotation.y = THREE.MathUtils.degToRad(-8);
    const laptopScreen = this.boxMesh(0.92, 0.62, 0.045, materials.laptop, [-0.78, 1.08, 0.45]);
    laptopScreen.rotation.x = THREE.MathUtils.degToRad(-11);
    laptopScreen.rotation.y = THREE.MathUtils.degToRad(-8);
    const screenInset = this.boxMesh(0.78, 0.48, 0.015, new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.5 }), [-0.78, 1.09, 0.421]);
    screenInset.rotation.copy(laptopScreen.rotation);
    this.environmentGroup.add(laptopBase, laptopScreen, screenInset);

    const document = this.boxMesh(0.72, 0.018, 0.42, materials.paper, [0.75, 0.73, 0.78]);
    document.rotation.y = THREE.MathUtils.degToRad(7);
    const badge = this.boxMesh(0.44, 0.025, 0.12, materials.paper, [0.1, 0.735, 0.78]);
    this.environmentGroup.add(document, badge);
  }

  boxMesh(width, height, depth, material, position) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  }

  bindExpressionControls() {
    this.faceControls = [];
    this.eyeControls = [];

    this.model.traverse((object) => {
      if (!object.isMesh || !object.morphTargetDictionary || !object.morphTargetInfluences) return;
      const entries = Object.entries(object.morphTargetDictionary);
      const indices = {
        mouthOpen: this.findMorphIndex(entries, ["mouthopen"]),
        jawOpen: this.findMorphIndex(entries, ["jawopen"]),
        visemeAa: this.findMorphIndex(entries, ["visemeaa", "visemea"]),
        visemeO: this.findMorphIndex(entries, ["visemeo"]),
        visemeE: this.findMorphIndex(entries, ["visemee"]),
        mouthClose: this.findMorphIndex(entries, ["mouthclose"])
      };

      if (Object.values(indices).some((index) => index !== null)) {
        this.faceControls.push({ mesh: object, indices });
      }

      const eyeIndices = {
        lookUpLeft: this.findMorphIndex(entries, ["eyelookupleft", "eyeslookup"]),
        lookUpRight: this.findMorphIndex(entries, ["eyelookupright", "eyeslookup"]),
        lookDownLeft: this.findMorphIndex(entries, ["eyelookdownleft", "eyeslookdown"]),
        lookDownRight: this.findMorphIndex(entries, ["eyelookdownright", "eyeslookdown"]),
        lookInLeft: this.findMorphIndex(entries, ["eyelookinleft"]),
        lookInRight: this.findMorphIndex(entries, ["eyelookinright"]),
        lookOutLeft: this.findMorphIndex(entries, ["eyelookoutleft"]),
        lookOutRight: this.findMorphIndex(entries, ["eyelookoutright"])
      };

      if (Object.values(eyeIndices).some((index) => index !== null)) {
        this.eyeControls.push({ mesh: object, indices: eyeIndices });
      }
    });

    const bones = this.getSkeletonBones();
    this.headBone = this.findBone(bones, ["head"], ["hand"]);
    this.neckBone = this.findBone(bones, ["neck"], []);

    [this.headBone, this.neckBone].forEach((bone) => {
      if (bone && !bone.userData.baseMotionQuaternion) {
        bone.userData.baseMotionQuaternion = bone.quaternion.clone();
      }
    });

    console.group("[AvatarController] expression controls");
    console.log("face morph meshes:", this.faceControls.map((control) => control.mesh.name || "(unnamed mesh)"));
    console.log("eye morph meshes:", this.eyeControls.map((control) => control.mesh.name || "(unnamed mesh)"));
    console.log("head bone:", this.headBone?.name || null);
    console.log("neck bone:", this.neckBone?.name || null);
    console.groupEnd();
  }

  findMorphIndex(entries, preferredNames) {
    const normalizedPreferred = preferredNames.map((name) => this.normalizeMorphName(name));
    const found = entries.find(([name]) => {
      const normalized = this.normalizeMorphName(name);
      return normalizedPreferred.some((preferred) => normalized.includes(preferred));
    });
    return found ? found[1] : null;
  }

  normalizeMorphName(name) {
    return String(name).toLowerCase().replace(/[_\-.:\s]/g, "");
  }

  setSpeakingLevel(level, mode = "idle") {
    this.targetSpeakingLevel = Math.max(0, Math.min(1, Number(level) || 0));
    this.avatarMode = mode;
  }

  updateExpression(delta) {
    const smoothing = Math.min(1, delta * 12);
    this.speakingLevel += (this.targetSpeakingLevel - this.speakingLevel) * smoothing;
    const proceduralSpeech = this.avatarMode === "assistant"
      ? 0.18 + Math.sin(this.clock.elapsedTime * 12.5) * 0.08 + Math.sin(this.clock.elapsedTime * 19.5) * 0.05
      : 0;
    const effectiveSpeech = Math.max(this.speakingLevel, proceduralSpeech);
    const mouthOpen = Math.min(1, Math.max(0, effectiveSpeech) * 1.15);
    const secondary = Math.max(0, mouthOpen - 0.18);

    this.faceControls.forEach(({ mesh, indices }) => {
      this.setMorphInfluence(mesh, indices.mouthOpen, mouthOpen);
      this.setMorphInfluence(mesh, indices.jawOpen, mouthOpen * 0.72);
      this.setMorphInfluence(mesh, indices.visemeAa, mouthOpen * 0.62);
      this.setMorphInfluence(mesh, indices.visemeO, secondary * 0.28);
      this.setMorphInfluence(mesh, indices.visemeE, secondary * 0.18);
      this.setMorphInfluence(mesh, indices.mouthClose, 0);
    });

    this.updateGaze();
    this.updateHeadMotion();
  }

  updateGaze() {
    this.eyeControls.forEach(({ mesh, indices }) => {
      this.setMorphInfluence(mesh, indices.lookUpLeft, 0);
      this.setMorphInfluence(mesh, indices.lookUpRight, 0);
      this.setMorphInfluence(mesh, indices.lookInLeft, 0.02);
      this.setMorphInfluence(mesh, indices.lookInRight, 0.02);
      this.setMorphInfluence(mesh, indices.lookOutLeft, 0);
      this.setMorphInfluence(mesh, indices.lookOutRight, 0);
      this.setMorphInfluence(mesh, indices.lookDownLeft, 0.16);
      this.setMorphInfluence(mesh, indices.lookDownRight, 0.16);
    });
  }

  setMorphInfluence(mesh, index, value) {
    if (index === null || index === undefined) return;
    mesh.morphTargetInfluences[index] = Math.max(0, Math.min(1, value));
  }

  updateHeadMotion() {
    const time = this.clock.elapsedTime;
    const speaking = this.avatarMode === "assistant" ? this.speakingLevel : 0;
    const thinking = this.avatarMode === "thinking" ? 0.35 : 0;
    const idle = this.avatarMode === "idle" ? 0.18 : 0;
    const intensity = Math.max(speaking, thinking, idle);
    const yaw = Math.sin(time * 1.05) * 0.018 * intensity;
    const pitch = Math.sin(time * 1.7 + 0.5) * 0.012 * intensity + speaking * 0.018;
    const roll = Math.sin(time * 0.8 + 1.2) * 0.01 * intensity;

    this.applyMotionOffset(this.headBone, pitch - 0.018, yaw, roll);
    this.applyMotionOffset(this.neckBone, pitch * 0.35 - 0.008, yaw * 0.35, roll * 0.25);
  }

  applyMotionOffset(bone, pitch, yaw, roll) {
    if (!bone) return;
    const baseQuaternion = bone.userData.baseMotionQuaternion || bone.quaternion.clone();
    const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "XYZ"));
    bone.quaternion.copy(baseQuaternion).multiply(offset);
  }

  applyNeutralInterviewPose() {
    const bones = this.getSkeletonBones();
    const bindings = this.bindInterviewPoseBones(bones);
    this.poseBindings = bindings;

    Object.values(bindings).forEach((bone) => {
      if (!bone || bone.userData.baseNeutralQuaternion) return;
      bone.userData.baseNeutralQuaternion = bone.quaternion.clone();
    });

    const upperArmOffsetDeg = 76;
    const forearmBendDeg = 18;
    const leftUpperOffset = this.pickBestLimbOffset(
      bindings.leftUpperArm,
      bindings.leftLowerArm,
      upperArmOffsetDeg,
      "leftUpperArm"
    );
    const rightUpperOffset = this.pickBestLimbOffset(
      bindings.rightUpperArm,
      bindings.rightLowerArm,
      upperArmOffsetDeg,
      "rightUpperArm"
    );

    this.applyBoneOffset(bindings.leftUpperArm, leftUpperOffset.quaternion);
    this.applyBoneOffset(bindings.rightUpperArm, rightUpperOffset.quaternion);
    this.model.updateMatrixWorld(true);

    const leftForearmOffset = this.pickBestLimbOffset(
      bindings.leftLowerArm,
      bindings.leftHand,
      forearmBendDeg,
      "leftLowerArm",
      0.45
    );
    const rightForearmOffset = this.pickBestLimbOffset(
      bindings.rightLowerArm,
      bindings.rightHand,
      forearmBendDeg,
      "rightLowerArm",
      0.45
    );

    this.applyBoneOffset(bindings.leftLowerArm, leftForearmOffset.quaternion);
    this.applyBoneOffset(bindings.rightLowerArm, rightForearmOffset.quaternion);
    this.applyDeskPose(bindings);

    if (bindings.spine && !bindings.spine.userData.baseNeutralQuaternion) {
      bindings.spine.userData.baseNeutralQuaternion = bindings.spine.quaternion.clone();
    }

    this.model.updateMatrixWorld(true);

    console.group("[AvatarController] neutral interview pose bindings");
    console.log("left upper arm:", bindings.leftUpperArm?.name || null);
    console.log("right upper arm:", bindings.rightUpperArm?.name || null);
    console.log("left forearm:", bindings.leftLowerArm?.name || null);
    console.log("right forearm:", bindings.rightLowerArm?.name || null);
    console.log("left hand:", bindings.leftHand?.name || null);
    console.log("right hand:", bindings.rightHand?.name || null);
    console.log("spine / chest:", bindings.spine?.name || null);
    console.log("rotation offsets:", {
      leftUpperArm: leftUpperOffset.label,
      rightUpperArm: rightUpperOffset.label,
      leftForeArm: leftForearmOffset.label,
      rightForeArm: rightForearmOffset.label,
      leftHand: "desk pose asymmetry, relaxed on table",
      rightHand: "desk pose asymmetry, relaxed on table"
    });
    console.groupEnd();
  }

  applyDeskPose(bindings) {
    const extraOffsets = [
      { bone: bindings.leftUpperArm, euler: new THREE.Euler(THREE.MathUtils.degToRad(5), THREE.MathUtils.degToRad(-7), THREE.MathUtils.degToRad(-4), "XYZ") },
      { bone: bindings.rightUpperArm, euler: new THREE.Euler(THREE.MathUtils.degToRad(-2), THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(6), "XYZ") },
      { bone: bindings.leftLowerArm, euler: new THREE.Euler(THREE.MathUtils.degToRad(-10), THREE.MathUtils.degToRad(6), THREE.MathUtils.degToRad(10), "XYZ") },
      { bone: bindings.rightLowerArm, euler: new THREE.Euler(THREE.MathUtils.degToRad(-4), THREE.MathUtils.degToRad(-8), THREE.MathUtils.degToRad(-7), "XYZ") }
    ];

    extraOffsets.forEach(({ bone, euler }) => this.multiplyBoneOffset(bone, euler));

    const offsets = [
      { bone: bindings.leftHand, euler: new THREE.Euler(THREE.MathUtils.degToRad(5), THREE.MathUtils.degToRad(-3), THREE.MathUtils.degToRad(-7), "XYZ") },
      { bone: bindings.rightHand, euler: new THREE.Euler(THREE.MathUtils.degToRad(-2), THREE.MathUtils.degToRad(4), THREE.MathUtils.degToRad(5), "XYZ") }
    ];

    offsets.forEach(({ bone, euler }) => this.multiplyBoneOffset(bone, euler));
    this.model.updateMatrixWorld(true);
  }

  multiplyBoneOffset(bone, euler) {
    if (!bone) return;
    const offset = new THREE.Quaternion().setFromEuler(euler);
    bone.quaternion.multiply(offset);
  }

  getSkeletonBones() {
    const boneMap = new Map();
    this.model.traverse((object) => {
      if (!object.isSkinnedMesh || !object.skeleton) return;
      object.skeleton.bones.forEach((bone) => {
        if (bone?.isBone && !boneMap.has(bone.uuid)) {
          boneMap.set(bone.uuid, bone);
        }
      });
    });
    return Array.from(boneMap.values());
  }

  bindInterviewPoseBones(bones) {
    return {
      leftUpperArm: this.findBone(bones, ["left", "arm"], ["fore", "lower", "hand", "leg"]),
      rightUpperArm: this.findBone(bones, ["right", "arm"], ["fore", "lower", "hand", "leg"]),
      leftLowerArm: this.findBone(bones, ["left"], ["hand", "leg"], ["forearm", "fore arm", "lowerarm", "lower arm"]),
      rightLowerArm: this.findBone(bones, ["right"], ["hand", "leg"], ["forearm", "fore arm", "lowerarm", "lower arm"]),
      leftHand: this.findBone(bones, ["left", "hand"], ["finger", "thumb"]),
      rightHand: this.findBone(bones, ["right", "hand"], ["finger", "thumb"]),
      spine: this.findBone(bones, [], ["neck", "head", "arm", "leg"], ["upperchest", "chest", "spine2", "spine1", "spine"])
    };
  }

  findBone(bones, requiredWords, rejectedWords = [], preferredPhrases = []) {
    const candidates = bones
      .map((bone) => ({
        bone,
        name: bone.name || "",
        normalizedName: this.normalizeBoneName(bone.name || "")
      }))
      .filter((entry) => requiredWords.every((word) => entry.normalizedName.includes(word)))
      .filter((entry) => rejectedWords.every((word) => !entry.normalizedName.includes(word)));

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const score = (entry) => preferredPhrases.reduce((total, phrase, index) => {
        const normalizedPhrase = this.normalizeBoneName(phrase);
        return total + (entry.normalizedName.includes(normalizedPhrase) ? 100 - index : 0);
      }, 0);
      return score(b) - score(a);
    });

    return candidates[0].bone;
  }

  normalizeBoneName(name) {
    return name
      .toLowerCase()
      .replace(/mixamorig|[_\-.:\s]/g, "")
      .replace("upperarm", "arm")
      .replace("lowerarm", "forearm")
      .replace("forearm", "forearm");
  }

  pickBestLimbOffset(bone, childBone, degrees, role, verticalWeight = 1) {
    if (!bone || !childBone) {
      return {
        quaternion: new THREE.Quaternion(),
        label: `${role}: none`
      };
    }

    const baseQuaternion = bone.userData.baseNeutralQuaternion || bone.quaternion.clone();
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    ];
    const axisNames = ["x", "y", "z"];
    const candidates = [];

    axes.forEach((axis, axisIndex) => {
      [-1, 1].forEach((direction) => {
        const radians = THREE.MathUtils.degToRad(degrees * direction);
        const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, radians);
        bone.quaternion.copy(baseQuaternion).multiply(quaternion);
        this.model.updateMatrixWorld(true);

        const start = new THREE.Vector3();
        const end = new THREE.Vector3();
        bone.getWorldPosition(start);
        childBone.getWorldPosition(end);
        const limbDirection = end.sub(start).normalize();
        const score = Math.abs(limbDirection.y + 0.82) * verticalWeight + Math.abs(limbDirection.z) * 0.15;

        candidates.push({
          quaternion,
          score,
          label: `${role}: local ${axisNames[axisIndex]} ${degrees * direction}deg`
        });
      });
    });

    bone.quaternion.copy(baseQuaternion);
    this.model.updateMatrixWorld(true);

    candidates.sort((a, b) => a.score - b.score);
    return candidates[0] || {
      quaternion: new THREE.Quaternion(),
      label: `${role}: none`
    };
  }

  applyBoneOffset(bone, offsetQuaternion) {
    if (!bone) return;
    const baseQuaternion = bone.userData.baseNeutralQuaternion || bone.quaternion.clone();
    bone.quaternion.copy(baseQuaternion).multiply(offsetQuaternion);
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
      const delta = this.clock.getDelta();
      if (this.mixer) {
        this.mixer.update(delta);
      }
      this.updateExpression(delta);
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
