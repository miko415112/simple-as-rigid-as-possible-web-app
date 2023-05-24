import "./styles.css";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { preprocess, applyConstraints } from "./arap.js";
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
const geometry_constraint_map = new Map();
var lastUpdateTime = Date.now(); //ms

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

  reader.addEventListener("load", function () {
    const gltfLoader = new GLTFLoader();
    const glbData = reader.result;

    gltfLoader.parse(glbData, "", function (gltf) {
      gltf.scene.traverse((node) => {
        if (node.isMesh) {
          scene.add(node);
          preprocess(node.geometry);
        }
      });
    });
  });

  reader.readAsArrayBuffer(file);
}

function handleAddConstraint(event) {
  const raycaster = raycasterFromMouseEvent(event);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (intersects.length == 0) return;

  const firstIntersect = intersects[0];
  const target_geometry = firstIntersect.object.geometry;
  const vertexIndex1 = firstIntersect.face.a;
  const vertexIndex2 = firstIntersect.face.b;
  const vertexIndex3 = firstIntersect.face.c;

  const positionAttribute = target_geometry.getAttribute("position");
  const vertex1 = new THREE.Vector3();
  vertex1.fromBufferAttribute(positionAttribute, vertexIndex1);
  const vertex2 = new THREE.Vector3();
  vertex2.fromBufferAttribute(positionAttribute, vertexIndex2);
  const vertex3 = new THREE.Vector3();
  vertex3.fromBufferAttribute(positionAttribute, vertexIndex3);

  const localPos = vertex1;
  const worldPos = new THREE.Vector3()
    .copy(localPos)
    .applyMatrix4(firstIntersect.object.matrixWorld);

  const r = Math.sqrt(calTriangleArea(vertex1, vertex2, vertex3) / 3.14 / 10);
  const geometry = new THREE.SphereGeometry(r);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.copy(worldPos);
  scene.add(sphere);

  const payload = {
    vertexIndex: vertexIndex1,
    sphere,
  };
  var old_data = geometry_constraint_map.get(target_geometry);
  const new_data = !old_data ? [payload] : [...old_data, payload];
  geometry_constraint_map.set(target_geometry, new_data);
}

function handleMoveConstraintStart(event) {
  const raycaster = raycasterFromMouseEvent(event);

  var closestConstraintGeometry = null;
  var closestDistance = 10000000000000;
  var closestSphere = null;
  var closestIndex = -1;
  var closestPos = null;
  geometry_constraint_map.forEach((constraintArray, geometry) => {
    for (var i = 0; i < constraintArray.length; i++) {
      const { vertexIndex, sphere } = constraintArray[i];
      const distance = raycaster.ray.distanceSqToPoint(sphere.position);
      if (distance < closestDistance) {
        closestConstraintGeometry = geometry;
        closestDistance = distance;
        closestSphere = sphere;
        closestIndex = i;
        closestPos = sphere.position;
      }
    }
  });

  if (closestIndex == -1) return;
  dragging = true;
  draggableSphere = closestSphere;
  draggingPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    raycaster.ray.direction,
    closestPos
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

  if (!updating) applyConstraints(geometry_constraint_map);
  updating = true;
}

function handleRemoveConstraint(event) {
  const raycaster = raycasterFromMouseEvent(event);

  var closestConstraintGeometry = null;
  var closestDistance = 10000000000000;
  var closestSphere = null;
  var closestIndex = -1;
  geometry_constraint_map.forEach((constraintArray, geometry) => {
    for (var i = 0; i < constraintArray.length; i++) {
      const { vertexIndex, sphere } = constraintArray[i];
      const distance = raycaster.ray.distanceSqToPoint(sphere.position);
      if (distance < closestDistance) {
        closestConstraintGeometry = geometry;
        closestDistance = distance;
        closestSphere = sphere;
        closestIndex = i;
      }
    }
  });
  if (closestIndex == -1) return;
  const removed_geometry_constraints = geometry_constraint_map.get(
    closestConstraintGeometry
  );
  removed_geometry_constraints.splice(closestIndex, -1);
  geometry_constraint_map.set(
    closestConstraintGeometry,
    removed_geometry_constraints
  );
  scene.remove(closestSphere);
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
