import "./styles.css";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { preprocess, applyConstraints, transform } from "./arap.js";
import { Constraint } from "./constraint";
import { readOFFFile } from "./offLoader";
var cdt2d = require("cdt2d");

/* globle variable */

//for global usage
var renderer = null;
var scene = null;
var camera = null;
var controls = null;
var canvas = null;

//for editing constraints
var editFlag = false;
var editMode = 0;
var dragging = false;
var draggableSphere = null;
var draggingPlane = null;
const constraintsArray = [];

//for drawing 2d object
var drawFlag = false;
var drawing = false;
var linePoints = [];
var purePoints = [];
var edges = [];
var currentPoint;
var lineMesh = null;
var pointsMesh = [];
var drawMode = 0;

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

  const drawSwitch = document.getElementById("draw-switch");
  drawSwitch.addEventListener("change", () => {
    drawFlag = drawSwitch.checked;
  });

  const constraintModeSelect = document.getElementById(
    "constraint-mode-select"
  );
  constraintModeSelect.addEventListener("change", (event) => {
    editMode = event.target.selectedIndex;
  });

  const drawModeSelect = document.getElementById("draw-mode-select");
  drawModeSelect.addEventListener("change", (event) => {
    drawMode = event.target.selectedIndex;
  });

  const createButton = document.getElementById("createButton");
  createButton.addEventListener("click", handleCreate);

  const applyConstraintsButton = document.getElementById(
    "applyConstraintsButton"
  );
  applyConstraintsButton.addEventListener("click", handleApplyConstraints);

  const transformButton = document.getElementById("transformButton");
  transformButton.addEventListener("click", handleTransform);

  manualRadioButton([controlSwitch, constraintSwitch, drawSwitch]);

  const squareButton = document.getElementById("squareButton");
  squareButton.addEventListener("click", () => {
    handlePublicFile("square_21.off");
  });

  const armadilloButton = document.getElementById("armadilloButton");
  armadilloButton.addEventListener("click", () => {
    handlePublicFile("armadillo_1k.off");
  });

  const cactusButton = document.getElementById("cactusButton");
  cactusButton.addEventListener("click", () => {
    handlePublicFile("cactus_small.off");
  });
}

function setScene() {
  scene = new THREE.Scene();
  const ambientLight = new THREE.AmbientLight(0xffffff);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(0, 1, 0);
  scene.add(directionalLight);
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
  const fileExtension = file.name.split(".").pop().toLowerCase();
  if (fileExtension === "glb") {
    handleGlbFile(file);
  } else if (fileExtension === "off") {
    handleOffFile(file);
  } else {
  }
}

function handleOffFile(file) {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    const { positions, indices } = readOFFFile(reader.result);
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.MeshBasicMaterial({
      color: "#409ec7",
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geometry, material);

    scene.add(mesh);
    preprocess(mesh);
  });

  reader.readAsText(file);
}

function handleGlbFile(file) {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    const loader = new GLTFLoader();
    const data = reader.result;
    loader.parse(data, "", (gltf) => {
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          scene.add(child);
          preprocess(child);
        }
      });
    });
  });

  reader.readAsArrayBuffer(file);
}

/* preloaded files for those who do not have models to upload */
function handlePublicFile(fileName) {
  fetch(fileName)
    .then((response) => {
      if (response.ok) {
        return response.blob();
      } else {
        throw new Error("Failed to fetch .off file");
      }
    })
    .then((blob) => {
      handleOffFile(blob);
    })
    .catch((error) => {
      console.error(error);
    });
}

function handleMouseDown(event) {
  if (editFlag && editMode == 0) handleAddConstraint(event);
  if (editFlag && (editMode == 1 || editMode == 2))
    handleMoveConstraintStart(event);
  if (editFlag && editMode == 3) handleRemoveConstraint(event);
  if (drawFlag) handleDrawStart(event);
}

function handleMouseMove(event) {
  if (editFlag && (editMode == 1 || editMode == 2))
    handleMoveConstraintDragging(event);
  if (drawFlag) handleDrawing(event);
}
function handleMouseUp(event) {
  if (editFlag && (editMode == 1 || editMode == 2)) handleMoveConstraintStop();
  if (drawFlag) handleDrawStop();
}

function handleAddConstraint(event) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(getMousePosition(event), camera);
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
  if (constraintsArray.length <= 0) return;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(getMousePosition(event), camera);
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
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(getMousePosition(event), camera);
  var intersection = new THREE.Vector3();
  raycaster.ray.intersectPlane(draggingPlane, intersection);
  draggableSphere.position.copy(intersection);
}

function handleMoveConstraintStop(event) {
  dragging = false;
  draggableSphere = null;
  draggingPlane = null;
  if (editMode == 2) handleTransform();
}

function handleRemoveConstraint(event) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(getMousePosition(event), camera);
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

function handleDrawStart(event) {
  drawing = true;

  if (drawMode == 0) {
    currentPoint = getMousePosition(event);
    linePoints.push(getMousePosition(event));

    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    const geometry = new THREE.BufferGeometry();
    geometry.setFromPoints(linePoints);
    lineMesh = new THREE.Line(geometry, material);
    scene.add(lineMesh);
  } else if (drawMode == 1) {
    purePoints.push(getMousePosition(event));

    const geometry = new THREE.BufferGeometry();
    geometry.setFromPoints([getMousePosition(event)]);
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 5 });
    const point = new THREE.Points(geometry, material);
    scene.add(point);
    pointsMesh.push(point);
  }
}

function handleDrawing(event) {
  if (!drawing) return;
  if (drawMode == 0) {
    if (getMousePosition(event).distanceTo(currentPoint) > 0.05) {
      currentPoint = getMousePosition(event);
      linePoints.push(currentPoint);
      edges.push([linePoints.length - 1, linePoints.length - 2]);
      lineMesh.geometry.setFromPoints(linePoints);
      lineMesh.geometry.verticesNeedUpdate = true;
    }
  }
}

function handleDrawStop(event) {
  drawing = false;
  if (drawMode == 0) {
    edges.push([linePoints.length - 1, 0]);
    currentPoint = null;
    lineMesh.geometry.setFromPoints([...linePoints, linePoints[0]]);
    lineMesh.geometry.verticesNeedUpdate = true;
  }
}

function handleApplyConstraints() {
  for (const constraint of constraintsArray) {
    constraint.setReadyColor();
  }
  applyConstraints(constraintsArray);
}

function handleTransform() {
  try {
    transform(constraintsArray);
  } catch (error) {
    alert(error);
  }
}

function handleCreate() {
  /* delete origin line and points */
  scene.remove(lineMesh);
  for (var pointMesh of pointsMesh) {
    scene.remove(pointMesh);
  }

  lineMesh = null;
  pointMesh = [];

  /* create bufferGeometry */
  linePoints = linePoints.map((point) => point.toArray());
  purePoints = purePoints.map((point) => point.toArray());
  var triangles = cdt2d([...linePoints, ...purePoints], edges, {
    exterior: false,
  });

  var vertices = [];
  for (var point of [...linePoints, ...purePoints]) {
    vertices.push(...point);
  }
  var indices = [];
  for (var tri of triangles) {
    indices.push(...tri);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(vertices), 3)
  );

  const material = new THREE.MeshBasicMaterial({
    color: "#409ec7",
    wireframe: true,
  });
  const mesh = new THREE.Mesh(geometry, material);

  scene.add(mesh);
  preprocess(mesh);

  linePoints = [];
  purePoints = [];
  edges = [];
}

/* utils */

function manualRadioButton(checkboxes) {
  for (let checkbox_a of checkboxes) {
    checkbox_a.addEventListener("change", () => {
      if (checkbox_a.checked) {
        for (let checkbox_b of checkboxes) {
          if (checkbox_a !== checkbox_b) {
            checkbox_b.checked = false;
            checkbox_b.dispatchEvent(new Event("change"));
          }
        }
      }
    });
  }
}
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

function getMousePosition(event) {
  const mouseVec3 = new THREE.Vector3();
  mouseVec3.x = (event.clientX / canvas.width) * 2 - 1;
  mouseVec3.y = -(event.clientY / canvas.height) * 2 + 1;
  mouseVec3.z = -1;
  return mouseVec3;
}
