import "./styles.css";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { preprocess, applyConstraints } from "./arap.js";
import { Constraint } from "./Constraint";
import { readOFFFile } from "./offLoader";

/* globle variable */
var renderer = null;
var scene = null;
var camera = null;
var controls = null;
var canvas = null;
var editFlag = false;
var mode = 0;
var dragging = false;
var draggableSphere = null;
var draggingPlane = null;
var updating = false;
var lastUpdateTime = Date.now(); //ms
const constraintsArray = [];

window.addEventListener("DOMContentLoaded", init);
function init() {
  linkEvent();
  setScene();
  animate();
}

function linkEvent() {
  const fileInput = document.getElementById("file-upload");
  fileInput.addEventListener("change", handleFileUpload);

  const canvas = document.getElementById("myCanvas");
  canvas.addEventListener("mousedown", handleMouseDown, false);
  canvas.addEventListener("mousemove", handleMouseMove, false);
  canvas.addEventListener("mouseup", handleMouseUp, false);

  const controlSwitch = document.getElementById("control-switch");
  controlSwitch.addEventListener("change", () => {
    controls.enabled = controlSwitch.checked;
  });

  const constraintSwitch = document.getElementById("constraint-switch");
  constraintSwitch.addEventListener("change", () => {
    editFlag = constraintSwitch.checked;
  });

  const constraintModeSelect = document.getElementById(
    "constraint-mode-select"
  );
  constraintModeSelect.addEventListener("change", (event) => {
    mode = event.target.selectedIndex;
  });
}

function setScene() {
  scene = new THREE.Scene();
  const ambientLight = new THREE.AmbientLight(0xffffff);
  scene.add(ambientLight);
  camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 20);
  canvas = document.getElementById("myCanvas");
  renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  controls = new TrackballControls(camera, canvas);
  controls.rotateSpeed = 1.5;
  controls.zoomSpeed = 1;
  controls.panSpeed = 1.5;
  controls.enabled = false;
}

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !scene || !camera || !controls) return;
  controls.update();
  renderer.render(scene, camera);
}

/* handle functions */

function handleFileUpload(event) {
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    const { positions, indices } = readOFFFile(reader.result);
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.MeshBasicMaterial({
      color: 0x990000,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geometry, material);

    scene.add(mesh);

    preprocess(mesh);
  });

  reader.readAsText(file);
}

function handleAddConstraint(event) {
  const raycaster = raycasterFromMouseEvent(event);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (intersects.length == 0) return;

  const firstIntersect = intersects[0];
  const positionAttribute =
    firstIntersect.object.geometry.getAttribute("position");

  const v1 = new THREE.Vector3().fromBufferAttribute(
    positionAttribute,
    firstIntersect.face.a
  );
  const v2 = new THREE.Vector3().fromBufferAttribute(
    positionAttribute,
    firstIntersect.face.b
  );
  const v3 = new THREE.Vector3().fromBufferAttribute(
    positionAttribute,
    firstIntersect.face.c
  );

  const localPos = calClosestPosToRayCaster([v1, v2, v3], raycaster);
  const worldPos = new THREE.Vector3()
    .copy(localPos)
    .applyMatrix4(firstIntersect.object.matrixWorld);
  const vertexID =
    localPos == v1
      ? firstIntersect.face.a
      : localPos == v2
      ? firstIntersect.face.b
      : firstIntersect.face.c;

  const r = Math.sqrt(
    calTriangleArea(
      v1.clone().sub(v2),
      v2.clone().sub(v3),
      v3.clone().sub(v1)
    ) / 3.14
  );
  const geometry = new THREE.SphereGeometry(r);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.copy(worldPos);
  scene.add(sphere);

  const constraint = new Constraint(firstIntersect.object, vertexID, sphere);
  constraintsArray.push(constraint);
}

function handleMoveConstraintStart(event) {
  const raycaster = raycasterFromMouseEvent(event);
  constraintsArray.sort((c_a, c_b) => {
    const c_a_pos = new THREE.Vector3(...c_a.getWorldPos());
    const c_b_pos = new THREE.Vector3(...c_b.getWorldPos());
    const pos = calClosestPosToRayCaster([c_a_pos, c_b_pos], raycaster);
    return pos == c_a_pos ? -1 : 1;
  });
  const closestConstraint = constraintsArray[0];
  dragging = true;
  draggableSphere = closestConstraint.represent_mesh;
  draggingPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    raycaster.ray.direction,
    new THREE.Vector3(...closestConstraint.getWorldPos())
  );
}

function handleMoveConstraintDragging(event) {
  if (!dragging || !draggableSphere || !draggingPlane) return;
  const raycaster = raycasterFromMouseEvent(event);
  var intersection = new THREE.Vector3();
  raycaster.ray.intersectPlane(draggingPlane, intersection);
  draggableSphere.position.copy(intersection);
}

function handleMoveConstraintStop(event) {
  dragging = false;
  draggableSphere = null;
  draggingPlane = null;

  console.log("constraintsArray");
  console.log(constraintsArray);
  applyConstraints(constraintsArray);
}

function handleRemoveConstraint(event) {
  const raycaster = raycasterFromMouseEvent(event);
  constraintsArray.sort((c_a, c_b) => {
    const c_a_pos = new THREE.Vector3(...c_a.getWorldPos());
    const c_b_pos = new THREE.Vector3(...c_b.getWorldPos());
    const pos = calClosestPosToRayCaster([c_a_pos, c_b_pos], raycaster);
    return pos == c_a_pos ? -1 : 1;
  });
  const closestConstraint = constraintsArray[0];
  constraintsArray.splice(0, 1);
  scene.remove(closestConstraint.represent_mesh);
}

function handleMouseDown(event) {
  if (editFlag && mode == 0) handleAddConstraint(event);
  else if (editFlag && mode == 1) handleMoveConstraintStart(event);
  else if (editFlag && mode == 2) handleRemoveConstraint(event);
}

function handleMouseMove(event) {
  if (editFlag && mode == 1) handleMoveConstraintDragging(event);
}
function handleMouseUp(event) {
  if (editFlag && mode == 1) handleMoveConstraintStop();
}

/* utils */
function calClosestPosToRayCaster(v_array, raycaster) {
  var closestVertex;
  var closestDistance = 1000000000;
  for (var i = 0; i < v_array.length; i++) {
    if (raycaster.ray.distanceSqToPoint(v_array[i]) < closestDistance) {
      closestDistance = raycaster.ray.distanceSqToPoint(v_array[i]);
      closestVertex = v_array[i];
    }
  }
  return closestVertex;
}

function calTriangleArea(v1, v2, v3) {
  const a = v1.length();
  const b = v2.length();
  const c = v3.length();
  const s = (a + b + c) / 2;
  return Math.sqrt(s * (s - a) * (s - b) * (s - c));
}

function raycasterFromMouseEvent(event) {
  const mouseVec3 = new THREE.Vector3();
  mouseVec3.x = (event.clientX / canvas.width) * 2 - 1;
  mouseVec3.y = -(event.clientY / canvas.height) * 2 + 1;
  mouseVec3.z = -1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouseVec3, camera);
  return raycaster;
}
